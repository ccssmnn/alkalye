import { useState, useEffect, useRef } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useAccount, useCoState } from "jazz-tools/react"
import { co, type ResolveQuery, Group, FileStream } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { FolderOpen, AlertCircle } from "lucide-react"
import {
	UserAccount,
	Document,
	Space,
	Asset,
	ImageAsset,
	VideoAsset,
} from "@/schema"
import { getDocumentTitle } from "@/lib/document-utils"
import { getPath, parseFrontmatter } from "@/editor/frontmatter"
import { Button } from "@/components/ui/button"
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval"
import {
	computeDocLocations,
	transformContentForBackup,
	computeExpectedStructure,
	scanBackupFolder,
	readManifest,
	writeManifest,
	transformContentForImport,
	type BackupDoc,
	type ManifestEntry,
	type ScannedFile,
} from "@/lib/backup-sync"

export {
	BackupSubscriber,
	SpacesBackupSubscriber,
	BackupSettings,
	SpaceBackupSettings,
	useSpaceBackupPath,
	getSpaceBackupPath,
	setSpaceBackupPath,
	clearSpaceBackupPath,
	enableBackup,
	disableBackup,
	changeBackupDirectory,
	checkBackupPermission,
	// Exported for testing
	hashContent,
	syncBackup,
	syncFromBackup,
	type ScannedFile,
}

// File System Access API type augmentation
declare global {
	interface FileSystemObserver {
		observe(
			handle: FileSystemDirectoryHandle,
			options?: { recursive?: boolean },
		): Promise<void>
		disconnect(): void
	}

	interface Window {
		FileSystemObserver?: {
			new (
				onChange: (records: unknown[], observer: FileSystemObserver) => void,
			): FileSystemObserver
		}
		showDirectoryPicker(options?: {
			mode?: "read" | "readwrite"
		}): Promise<FileSystemDirectoryHandle>
	}
	interface FileSystemDirectoryHandle {
		entries(): AsyncIterableIterator<[string, FileSystemHandle]>
		queryPermission(options: {
			mode: "read" | "readwrite"
		}): Promise<"granted" | "denied" | "prompt">
		requestPermission(options: {
			mode: "read" | "readwrite"
		}): Promise<"granted" | "denied" | "prompt">
	}
}

let BACKUP_DEBOUNCE_MS = 1200

let HANDLE_STORAGE_KEY = "backup-directory-handle"
let preferredRelativePathByDocId = new Map<string, string>()
let recentImportedRelativePaths = new Map<string, number>()
let RECENT_IMPORT_WINDOW_MS = 30_000
let spaceLastPullAtById = new Map<string, number>()

interface BackupState {
	enabled: boolean
	bidirectional: boolean
	directoryName: string | null
	lastBackupAt: string | null
	lastPullAt: string | null
	lastError: string | null
	setEnabled: (enabled: boolean) => void
	setBidirectional: (bidirectional: boolean) => void
	setDirectoryName: (name: string | null) => void
	setLastBackupAt: (date: string | null) => void
	setLastPullAt: (date: string | null) => void
	setLastError: (error: string | null) => void
	reset: () => void
}

let useBackupStore = create<BackupState>()(
	persist(
		set => ({
			enabled: false,
			bidirectional: true,
			directoryName: null,
			lastBackupAt: null,
			lastPullAt: null,
			lastError: null,
			setEnabled: enabled => set({ enabled }),
			setBidirectional: bidirectional => set({ bidirectional }),
			setDirectoryName: directoryName => set({ directoryName }),
			setLastBackupAt: lastBackupAt => set({ lastBackupAt }),
			setLastPullAt: lastPullAt => set({ lastPullAt }),
			setLastError: lastError => set({ lastError }),
			reset: () =>
				set({
					enabled: false,
					bidirectional: true,
					directoryName: null,
					lastBackupAt: null,
					lastPullAt: null,
					lastError: null,
				}),
		}),
		{ name: "backup-settings" },
	),
)

type LoadedDocument = co.loaded<
	typeof Document,
	{ content: true; assets: { $each: { image: true; video: true } } }
>

type DocumentList = co.loaded<ReturnType<typeof co.list<typeof Document>>>
type Account = co.loaded<typeof UserAccount>

interface SyncFromBackupResult {
	created: number
	updated: number
	deleted: number
	errors: string[]
}

let backupQuery = {
	root: {
		documents: {
			$each: { content: true, assets: { $each: { image: true, video: true } } },
			$onError: "catch",
		},
	},
} as const satisfies ResolveQuery<typeof UserAccount>

function BackupSubscriber() {
	let {
		enabled,
		bidirectional,
		lastPullAt,
		setLastBackupAt,
		setLastPullAt,
		setLastError,
		setEnabled,
		setDirectoryName,
	} = useBackupStore()
	let me = useAccount(UserAccount, { resolve: backupQuery })
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let lastContentHashRef = useRef<string>("")
	let isPushingRef = useRef(false)
	let isPullingRef = useRef(false)

	// Push to filesystem (backup)
	useEffect(() => {
		if (!enabled || !me.$isLoaded) return

		let docs = me.root?.documents
		if (!docs?.$isLoaded) return

		// Compute content hash to detect changes
		let activeDocs = [...docs].filter(d => d?.$isLoaded && !d.deletedAt)
		let contentHash = activeDocs
			.map(d => `${d.$jazz.id}:${d.updatedAt?.getTime()}`)
			.sort()
			.join("|")

		if (contentHash === lastContentHashRef.current) return
		lastContentHashRef.current = contentHash

		// Debounce backup
		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(async () => {
			try {
				let handle = await getBackupHandle()
				if (!handle) {
					setEnabled(false)
					setDirectoryName(null)
					setLastError("Permission lost - please re-enable backup")
					return
				}

				let loadedDocs = activeDocs.filter(
					(d): d is LoadedDocument => d?.$isLoaded === true,
				)
				let backupDocs = await Promise.all(loadedDocs.map(prepareBackupDoc))
				isPushingRef.current = true
				await syncBackup(handle, backupDocs)

				setLastBackupAt(new Date().toISOString())
				setLastError(null)
			} catch (e) {
				setLastError(e instanceof Error ? e.message : "Backup failed")
			} finally {
				isPushingRef.current = false
			}
		}, BACKUP_DEBOUNCE_MS)

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [enabled, me, setLastBackupAt, setLastError, setEnabled, setDirectoryName])

	// Pull from filesystem (import changes) - only supported with FileSystemObserver
	useEffect(() => {
		if (!enabled || !bidirectional || !me.$isLoaded) return
		if (!supportsFileSystemWatch()) return

		let docs = me.root?.documents
		if (!docs?.$isLoaded) return

		async function doPull() {
			try {
				if (isPushingRef.current) return
				if (isPullingRef.current) return
				isPullingRef.current = true
				let handle = await getBackupHandle()
				if (!handle) return

				if (!docs.$isLoaded || !isDocumentList(docs)) return
				let result = await syncFromBackup(
					handle,
					docs,
					true,
					toTimestamp(lastPullAt),
				)
				if (result.errors.length > 0) {
					console.warn("Backup pull errors:", result.errors)
				}

				setLastPullAt(new Date().toISOString())
			} catch (e) {
				console.error("Backup pull failed:", e)
			} finally {
				isPullingRef.current = false
			}
		}

		// Set up observer for real-time file change detection
		let watchAborted = false
		let stopWatching: (() => void) | null = null

		async function setupWatch() {
			let handle = await getBackupHandle()
			if (!handle) return

			let stop = await observeDirectoryChanges(handle, () => {
				if (!watchAborted) doPull()
			})
			if (watchAborted) {
				stop?.()
				return
			}
			stopWatching = stop
		}

		setupWatch()

		return () => {
			watchAborted = true
			stopWatching?.()
		}
	}, [enabled, bidirectional, me, setLastPullAt, lastPullAt])

	return null
}

// Export for settings UI
async function enableBackup(): Promise<{
	success: boolean
	directoryName?: string
	error?: string
}> {
	let handle = await requestBackupDirectory()
	if (!handle) return { success: false, error: "Cancelled" }

	useBackupStore.getState().setEnabled(true)
	useBackupStore.getState().setDirectoryName(handle.name)
	useBackupStore.getState().setLastError(null)

	return { success: true, directoryName: handle.name }
}

async function disableBackup(): Promise<void> {
	await clearHandle()
	useBackupStore.getState().reset()
}

async function changeBackupDirectory(): Promise<{
	success: boolean
	directoryName?: string
	error?: string
}> {
	let handle = await requestBackupDirectory()
	if (!handle) return { success: false, error: "Cancelled" }

	useBackupStore.getState().setDirectoryName(handle.name)
	useBackupStore.getState().setLastError(null)
	// Trigger immediate backup by clearing the hash
	return { success: true, directoryName: handle.name }
}

async function checkBackupPermission(): Promise<boolean> {
	let handle = await getBackupHandle()
	return handle !== null
}

// Settings UI component

function BackupSettings() {
	let {
		enabled,
		bidirectional,
		directoryName,
		lastBackupAt,
		lastPullAt,
		lastError,
		setBidirectional,
	} = useBackupStore()
	let [isLoading, setIsLoading] = useState(false)

	if (!isBackupSupported()) {
		return (
			<section>
				<h2 className="text-muted-foreground mb-3 text-sm font-medium">
					Local Backup
				</h2>
				<div className="bg-muted/30 rounded-lg p-4">
					<div className="flex items-start gap-2">
						<AlertCircle className="text-muted-foreground mt-0.5 size-4" />
						<div>
							<p className="text-muted-foreground text-sm">
								Local backup requires a Chromium-based browser (Chrome, Edge,
								Brave, or Opera).
							</p>
							<p className="text-muted-foreground mt-1 text-xs">
								Safari and Firefox do not support the File System Access API
								needed for this feature.
							</p>
						</div>
					</div>
				</div>
			</section>
		)
	}

	async function handleEnable() {
		setIsLoading(true)
		await enableBackup()
		setIsLoading(false)
	}

	async function handleDisable() {
		setIsLoading(true)
		await disableBackup()
		setIsLoading(false)
	}

	async function handleChangeDirectory() {
		setIsLoading(true)
		await changeBackupDirectory()
		setIsLoading(false)
	}

	let lastBackupDate = lastBackupAt ? new Date(lastBackupAt) : null
	let formattedLastBackup = lastBackupDate
		? lastBackupDate.toLocaleString()
		: null

	let lastPullDate = lastPullAt ? new Date(lastPullAt) : null
	let formattedLastPull = lastPullDate ? lastPullDate.toLocaleString() : null

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Local Backup
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				{enabled ? (
					<>
						<div className="mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
							<FolderOpen className="size-4" />
							<span className="text-sm font-medium">
								{bidirectional ? "Syncing" : "Backing up"} to folder
							</span>
						</div>
						<p className="text-muted-foreground mb-1 text-sm">
							Folder: <span className="font-medium">{directoryName}</span>
						</p>
						{formattedLastBackup && (
							<p className="text-muted-foreground mb-1 text-xs">
								Last backup: {formattedLastBackup}
							</p>
						)}
						{bidirectional && formattedLastPull && (
							<p className="text-muted-foreground mb-3 text-xs">
								Last sync: {formattedLastPull}
							</p>
						)}
						{lastError && (
							<div className="text-destructive mb-3 flex items-center gap-1.5 text-sm">
								<AlertCircle className="size-4" />
								{lastError}
							</div>
						)}
						<div className="border-border/50 mb-3 border-t pt-3">
							<label
								className={
									!supportsFileSystemWatch()
										? "flex cursor-not-allowed items-center gap-2 opacity-50"
										: "flex cursor-pointer items-center gap-2"
								}
							>
								<input
									type="checkbox"
									checked={bidirectional}
									onChange={e => setBidirectional(e.target.checked)}
									disabled={!supportsFileSystemWatch()}
									className="size-4 rounded border-gray-300"
								/>
								<span className="text-sm">Sync changes from folder</span>
							</label>
							<p className="text-muted-foreground mt-1 text-xs">
								{supportsFileSystemWatch()
									? "When enabled, changes made in the backup folder will be imported into Alkalye."
									: "Requires a Chromium-based browser with File System Observer support."}
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={handleChangeDirectory}
								variant="outline"
								size="sm"
								disabled={isLoading}
							>
								Change folder
							</Button>
							<Button
								onClick={handleDisable}
								variant="ghost"
								size="sm"
								disabled={isLoading}
							>
								Disable
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="text-foreground mb-2 text-sm font-medium">
							Automatic backup disabled
						</div>
						<p className="text-muted-foreground mb-4 text-sm">
							Automatically back up your documents to a folder on this device.
						</p>
						<Button
							onClick={handleEnable}
							variant="outline"
							size="sm"
							disabled={isLoading}
						>
							<FolderOpen className="mr-1.5 size-3.5" />
							Choose backup folder
						</Button>
					</>
				)}
			</div>
		</section>
	)
}

// Space-specific backup path settings stored in localStorage

let SPACE_BACKUP_KEY_PREFIX = "backup-settings-space-"

interface SpaceBackupState {
	directoryName: string | null
}

function getSpaceBackupPath(spaceId: string): string | null {
	try {
		let key = getSpaceBackupStorageKey(spaceId)
		let stored = localStorage.getItem(key)
		if (!stored) return null
		let parsed = JSON.parse(stored)
		if (!isSpaceBackupState(parsed)) return null
		return parsed.directoryName
	} catch {
		return null
	}
}

function setSpaceBackupPath(spaceId: string, directoryName: string): void {
	let key = getSpaceBackupStorageKey(spaceId)
	let state: SpaceBackupState = { directoryName }
	localStorage.setItem(key, JSON.stringify(state))
}

function clearSpaceBackupPath(spaceId: string): void {
	let key = getSpaceBackupStorageKey(spaceId)
	localStorage.removeItem(key)
}

function useSpaceBackupPath(spaceId: string): {
	directoryName: string | null
	setDirectoryName: (name: string | null) => void
} {
	let [directoryName, setDirectoryNameState] = useState<string | null>(() =>
		getSpaceBackupPath(spaceId),
	)

	function setDirectoryName(name: string | null) {
		if (name) {
			setSpaceBackupPath(spaceId, name)
		} else {
			clearSpaceBackupPath(spaceId)
		}
		setDirectoryNameState(name)
	}

	return { directoryName, setDirectoryName }
}

interface SpaceBackupSettingsProps {
	spaceId: string
	isAdmin: boolean
}

function SpaceBackupSettings({ spaceId, isAdmin }: SpaceBackupSettingsProps) {
	let { directoryName, setDirectoryName } = useSpaceBackupPath(spaceId)
	let [isLoading, setIsLoading] = useState(false)

	if (!isBackupSupported()) {
		return (
			<section>
				<h2 className="text-muted-foreground mb-3 text-sm font-medium">
					Local Backup
				</h2>
				<div className="bg-muted/30 rounded-lg p-4">
					<div className="flex items-start gap-2">
						<AlertCircle className="text-muted-foreground mt-0.5 size-4" />
						<div>
							<p className="text-muted-foreground text-sm">
								Local backup requires a Chromium-based browser (Chrome, Edge,
								Brave, or Opera).
							</p>
							<p className="text-muted-foreground mt-1 text-xs">
								Safari and Firefox do not support the File System Access API
								needed for this feature.
							</p>
						</div>
					</div>
				</div>
			</section>
		)
	}

	async function handleChooseFolder() {
		setIsLoading(true)
		try {
			let handle = await window.showDirectoryPicker({ mode: "readwrite" })
			// Store handle in IndexedDB with space-specific key
			await idbSet(`${HANDLE_STORAGE_KEY}-space-${spaceId}`, handle)
			setDirectoryName(handle.name)
		} catch (e) {
			if (!(e instanceof Error && e.name === "AbortError")) {
				console.error("Failed to select folder:", e)
			}
		} finally {
			setIsLoading(false)
		}
	}

	async function handleChangeFolder() {
		await handleChooseFolder()
	}

	async function handleClear() {
		setIsLoading(true)
		try {
			await idbDel(`${HANDLE_STORAGE_KEY}-space-${spaceId}`)
			setDirectoryName(null)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Local Backup
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				{directoryName ? (
					<>
						<div className="mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
							<FolderOpen className="size-4" />
							<span className="text-sm font-medium">Backup folder set</span>
						</div>
						<p className="text-muted-foreground mb-3 text-sm">
							Folder: <span className="font-medium">{directoryName}</span>
						</p>
						<div className="flex gap-2">
							<Button
								onClick={handleChangeFolder}
								variant="outline"
								size="sm"
								disabled={isLoading || !isAdmin}
							>
								Change folder
							</Button>
							<Button
								onClick={handleClear}
								variant="ghost"
								size="sm"
								disabled={isLoading || !isAdmin}
							>
								Clear
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="text-foreground mb-2 text-sm font-medium">
							No backup folder set
						</div>
						<p className="text-muted-foreground mb-4 text-sm">
							Set a backup folder for this space&apos;s documents.
						</p>
						<Button
							onClick={handleChooseFolder}
							variant="outline"
							size="sm"
							disabled={isLoading || !isAdmin}
						>
							<FolderOpen className="mr-1.5 size-3.5" />
							Choose backup folder
						</Button>
					</>
				)}
			</div>
		</section>
	)
}

// Component that subscribes to all spaces and renders backup subscribers for each

function SpacesBackupSubscriber() {
	let me = useAccount(UserAccount, { resolve: spacesBackupQuery })
	let [storageVersion, setStorageVersion] = useState(0)

	// Re-render on storage changes (for when user sets backup path in settings)
	useEffect(() => {
		function handleStorageChange(e: StorageEvent) {
			if (e.key?.startsWith(SPACE_BACKUP_KEY_PREFIX)) {
				setStorageVersion(v => v + 1)
			}
		}

		window.addEventListener("storage", handleStorageChange)
		return () => window.removeEventListener("storage", handleStorageChange)
	}, [])

	// Compute spaces with backup paths - recomputed when me changes or storage changes
	let spacesWithBackup = getSpacesWithBackup(me, storageVersion)

	return (
		<>
			{spacesWithBackup.map(spaceId => (
				<SpaceBackupSubscriber key={spaceId} spaceId={spaceId} />
			))}
		</>
	)
}

// Exported for testing
async function hashContent(content: string): Promise<string> {
	// Simple hash using built-in crypto
	let encoder = new TextEncoder()
	let data = encoder.encode(content)
	let hashBuffer = await crypto.subtle.digest("SHA-256", data)
	let hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray
		.map(b => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16)
}

async function syncBackup(
	handle: FileSystemDirectoryHandle,
	docs: BackupDoc[],
): Promise<void> {
	await performSyncBackup(handle, docs)
}

async function syncFromBackup(
	handle: FileSystemDirectoryHandle,
	targetDocs: DocumentList,
	canWrite: boolean,
	lastPullAtMs: number | null = null,
): Promise<SyncFromBackupResult> {
	let result: SyncFromBackupResult = {
		created: 0,
		updated: 0,
		deleted: 0,
		errors: [],
	}

	let manifest = await readManifest(handle)
	let scannedFiles = await scanBackupFolder(handle)
	let listOwner = targetDocs.$jazz.owner

	// Build maps for lookup
	let manifestByPath = new Map(
		manifest?.entries.map(e => [e.relativePath, e]) ?? [],
	)
	let scannedByPath = new Map(scannedFiles.map(f => [f.relativePath, f]))
	let matchedManifestDocIds = new Set<string>()

	// Process new and updated files
	for (let file of scannedFiles) {
		try {
			let contentHash = await hashContent(file.content)
			let manifestEntry = manifestByPath.get(file.relativePath)
			if (manifestEntry) {
				matchedManifestDocIds.add(manifestEntry.docId)
				if (lastPullAtMs !== null && file.lastModified <= lastPullAtMs) {
					continue
				}
			}

			if (!manifestEntry) {
				let movedEntry = findMovedManifestEntry(
					manifest,
					scannedByPath,
					matchedManifestDocIds,
					file,
					contentHash,
				)
				if (movedEntry) {
					manifestEntry = movedEntry
					matchedManifestDocIds.add(movedEntry.docId)
				}
			}

			if (!manifestEntry) {
				// New file - create document
				if (!canWrite) {
					result.errors.push(`Cannot create ${file.name}: no write permission`)
					continue
				}
				if (wasRecentlyImported(file.relativePath)) continue
				let newDocId = await createDocFromFile(file, targetDocs, listOwner)
				preferredRelativePathByDocId.set(newDocId, file.relativePath)
				markRecentlyImported(file.relativePath)
				result.created++
			} else if (
				manifestEntry.contentHash !== contentHash ||
				manifestEntry.relativePath !== file.relativePath
			) {
				preferredRelativePathByDocId.set(manifestEntry.docId, file.relativePath)
				// File changed or moved - update document
				if (!canWrite) {
					result.errors.push(`Cannot update ${file.name}: no write permission`)
					continue
				}
				let didUpdate = await updateDocFromFile(
					file,
					manifestEntry.docId,
					manifestEntry,
					targetDocs,
				)
				if (didUpdate) {
					result.updated++
				} else {
					result.errors.push(
						`Skipped update for ${file.relativePath}: target document not loaded`,
					)
				}
			}
		} catch (err) {
			result.errors.push(
				`Failed to process ${file.relativePath}: ${err instanceof Error ? err.message : "Unknown error"}`,
			)
		}
	}

	// Handle deletions (files in manifest but not on disk)
	if (manifest && canWrite) {
		for (let entry of manifest.entries) {
			if (matchedManifestDocIds.has(entry.docId)) continue
			if (!scannedByPath.has(entry.relativePath)) {
				try {
					let doc = targetDocs.find(d => d?.$jazz.id === entry.docId)
					if (doc?.$isLoaded && !doc.deletedAt) {
						// Soft delete
						doc.$jazz.set("deletedAt", new Date())
						doc.$jazz.set("updatedAt", new Date())
						result.deleted++
					}
				} catch (err) {
					result.errors.push(
						`Failed to delete ${entry.relativePath}: ${err instanceof Error ? err.message : "Unknown error"}`,
					)
				}
			}
		}
	}

	return result
}

// =============================================================================
// Helper functions (used by exported functions above)
// =============================================================================

// Space backup subscriber - handles backup sync for a single space

let SPACE_BACKUP_DEBOUNCE_MS = 1200

interface SpaceBackupSubscriberProps {
	spaceId: string
}

function SpaceBackupSubscriber({ spaceId }: SpaceBackupSubscriberProps) {
	let { directoryName, setDirectoryName } = useSpaceBackupPath(spaceId)
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let lastContentHashRef = useRef<string>("")
	let isPushingRef = useRef(false)
	let isPullingRef = useRef(false)

	// Load space with documents
	let space = useCoState(Space, spaceId, {
		resolve: {
			documents: {
				$each: { content: true, assets: { $each: { image: true } } },
				$onError: "catch",
			},
		},
	})

	// Push to filesystem (backup)
	useEffect(() => {
		// Skip if no backup folder configured
		if (!directoryName) return
		// Skip if space not loaded
		if (!space?.$isLoaded || !space.documents?.$isLoaded) return

		let docs = space.documents
		let activeDocs = [...docs].filter(d => d?.$isLoaded && !d.deletedAt)

		// Compute content hash to detect changes
		let contentHash = activeDocs
			.map(d => `${d.$jazz.id}:${d.updatedAt?.getTime()}`)
			.sort()
			.join("|")

		if (contentHash === lastContentHashRef.current) return
		lastContentHashRef.current = contentHash

		// Debounce backup
		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(async () => {
			try {
				let handle = await getSpaceBackupHandle(spaceId)
				if (!handle) {
					// Permission lost, clear the setting
					setDirectoryName(null)
					return
				}

				let loadedDocs = activeDocs.filter(
					(d): d is LoadedDocument => d?.$isLoaded === true,
				)
				let backupDocs = await Promise.all(loadedDocs.map(prepareBackupDoc))
				isPushingRef.current = true
				await syncBackup(handle, backupDocs)
			} catch (e) {
				console.error(`Space backup failed for ${spaceId}:`, e)
			} finally {
				isPushingRef.current = false
			}
		}, SPACE_BACKUP_DEBOUNCE_MS)

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [directoryName, space, spaceId, setDirectoryName])

	// Pull from filesystem (import changes) - only supported with FileSystemObserver
	useEffect(() => {
		// Skip if no backup folder configured
		if (!directoryName) return
		// Skip if space not loaded
		if (!space?.$isLoaded || !space.documents?.$isLoaded) return
		if (!supportsFileSystemWatch()) return

		let docs = space.documents

		// Check permissions for writing
		let spaceGroup =
			space.$jazz.owner instanceof Group ? space.$jazz.owner : null
		let canWrite =
			spaceGroup?.myRole() === "admin" || spaceGroup?.myRole() === "writer"

		async function doPull() {
			try {
				if (isPushingRef.current) return
				if (isPullingRef.current) return
				isPullingRef.current = true
				let handle = await getSpaceBackupHandle(spaceId)
				if (!handle) return

				if (!docs.$isLoaded || !isDocumentList(docs)) return
				let result = await syncFromBackup(
					handle,
					docs,
					canWrite,
					spaceLastPullAtById.get(spaceId) ?? null,
				)
				if (result.errors.length > 0) {
					console.warn(`Space ${spaceId} pull errors:`, result.errors)
				}
				spaceLastPullAtById.set(spaceId, Date.now())
			} catch (e) {
				console.error(`Space backup pull failed for ${spaceId}:`, e)
			} finally {
				isPullingRef.current = false
			}
		}

		// Set up observer for real-time file change detection
		let watchAborted = false
		let stopWatching: (() => void) | null = null

		async function setupWatch() {
			let handle = await getSpaceBackupHandle(spaceId)
			if (!handle) return

			let stop = await observeDirectoryChanges(handle, () => {
				if (!watchAborted) doPull()
			})
			if (watchAborted) {
				stop?.()
				return
			}
			stopWatching = stop
		}

		setupWatch()

		return () => {
			watchAborted = true
			stopWatching?.()
		}
	}, [directoryName, space, spaceId])

	return null
}

let spacesBackupQuery = {
	root: {
		spaces: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

async function getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
	try {
		let handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_STORAGE_KEY)
		return handle ?? null
	} catch {
		return null
	}
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
	await idbSet(HANDLE_STORAGE_KEY, handle)
}

async function clearHandle(): Promise<void> {
	await idbDel(HANDLE_STORAGE_KEY)
}

async function verifyPermission(
	handle: FileSystemDirectoryHandle,
): Promise<boolean> {
	let opts: { mode: "readwrite" } = { mode: "readwrite" }
	if ((await handle.queryPermission(opts)) === "granted") return true
	if ((await handle.requestPermission(opts)) === "granted") return true
	return false
}

async function requestBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
	try {
		let handle = await window.showDirectoryPicker({ mode: "readwrite" })
		await storeHandle(handle)
		return handle
	} catch (e) {
		if (e instanceof Error && e.name === "AbortError") return null
		throw e
	}
}

async function getBackupHandle(): Promise<FileSystemDirectoryHandle | null> {
	let handle = await getStoredHandle()
	if (!handle) return null
	let hasPermission = await verifyPermission(handle)
	if (!hasPermission) return null
	return handle
}

async function prepareBackupDoc(doc: LoadedDocument): Promise<BackupDoc> {
	let content = doc.content?.toString() ?? ""
	let title = getDocumentTitle(doc)
	let path = getPath(content)
	let updatedAtMs = doc.updatedAt?.getTime() ?? 0

	let assets: BackupDoc["assets"] = []
	if (doc.assets?.$isLoaded) {
		for (let asset of [...doc.assets]) {
			if (!asset?.$isLoaded) continue

			let blob: Blob | undefined
			if (asset.type === "image" && asset.image?.$isLoaded) {
				let original = asset.image.original
				if (original?.$isLoaded) {
					blob = original.toBlob()
				}
			} else if (asset.type === "video" && asset.video?.$isLoaded) {
				blob = await asset.video.toBlob()
			}

			if (blob) {
				assets.push({ id: asset.$jazz.id, name: asset.name, blob })
			}
		}
	}

	return { id: doc.$jazz.id, title, content, path, updatedAtMs, assets }
}

async function getOrCreateDirectory(
	parent: FileSystemDirectoryHandle,
	path: string,
): Promise<FileSystemDirectoryHandle> {
	let parts = path.split("/").filter(Boolean)
	let current = parent
	for (let part of parts) {
		current = await current.getDirectoryHandle(part, { create: true })
	}
	return current
}

async function writeFile(
	dir: FileSystemDirectoryHandle,
	name: string,
	content: string | Blob,
): Promise<void> {
	let file = await dir.getFileHandle(name, { create: true })
	let writable = await file.createWritable()
	await writable.write(content)
	await writable.close()
}

async function deleteFile(
	dir: FileSystemDirectoryHandle,
	name: string,
): Promise<void> {
	try {
		await dir.removeEntry(name)
	} catch {
		// File doesn't exist, ignore
	}
}

async function listFiles(dir: FileSystemDirectoryHandle): Promise<string[]> {
	let files: string[] = []
	for await (let [name, handle] of dir.entries()) {
		if (handle.kind === "file") files.push(name)
	}
	return files
}

async function listDirectories(
	dir: FileSystemDirectoryHandle,
): Promise<string[]> {
	let dirs: string[] = []
	for await (let [name, handle] of dir.entries()) {
		if (handle.kind === "directory") dirs.push(name)
	}
	return dirs
}

async function performSyncBackup(
	handle: FileSystemDirectoryHandle,
	docs: BackupDoc[],
): Promise<void> {
	let docLocations = computeDocLocations(docs)
	let existingManifest = await readManifest(handle)
	let existingEntriesByDocId = new Map(
		existingManifest?.entries.map(entry => [entry.docId, entry]) ?? [],
	)
	let manifestEntries: {
		docId: string
		relativePath: string
		locationKey: string
		contentHash: string
		lastSyncedAt: string
		assets: { id: string; name: string; hash: string }[]
	}[] = []
	let hasFilesystemChanges = false
	let nowIso = new Date().toISOString()

	// Write only changed documents and assets
	for (let doc of docs) {
		let loc = docLocations.get(doc.id)!
		let locationKey = getDocLocationKey(doc)
		let computedRelativePath = loc.dirPath
			? `${loc.dirPath}/${loc.filename}`
			: loc.filename
		let existingEntry = existingEntriesByDocId.get(doc.id)
		let preferredRelativePath = preferredRelativePathByDocId.get(doc.id)
		let finalRelativePath = computedRelativePath
		if (existingEntry) {
			if (existingEntry.locationKey === locationKey) {
				finalRelativePath = existingEntry.relativePath
			}
		}
		if (preferredRelativePath) {
			finalRelativePath = preferredRelativePath
		}
		let finalLocation = buildLocationFromRelativePath(loc, finalRelativePath)
		docLocations.set(doc.id, finalLocation)
		loc = finalLocation

		let dir = loc.dirPath
			? await getOrCreateDirectory(handle, loc.dirPath)
			: handle

		let exportedContent = transformContentForBackup(doc.content, loc.assetFiles)
		let contentHash = await hashContent(exportedContent)
		let relativePath = finalRelativePath
		let assets: { id: string; name: string; hash: string }[] = []
		for (let asset of doc.assets) {
			let filename = loc.assetFiles.get(asset.id)!
			assets.push({
				id: asset.id,
				name: filename,
				hash: await hashBlob(asset.blob),
			})
		}

		let shouldWriteDoc =
			!existingEntry ||
			existingEntry.relativePath !== relativePath ||
			existingEntry.contentHash !== contentHash ||
			!areManifestAssetsEqual(existingEntry.assets, assets)

		if (shouldWriteDoc) {
			hasFilesystemChanges = true
			await writeFile(dir, loc.filename, exportedContent)

			// Write assets if any
			if (doc.assets.length > 0) {
				let assetsDir = await dir.getDirectoryHandle("assets", { create: true })
				for (let asset of doc.assets) {
					let filename = loc.assetFiles.get(asset.id)!
					await writeFile(assetsDir, filename, asset.blob)
				}
			}
		}

		manifestEntries.push({
			docId: doc.id,
			relativePath,
			locationKey,
			contentHash,
			lastSyncedAt: shouldWriteDoc
				? nowIso
				: (existingEntry?.lastSyncedAt ?? nowIso),
			assets,
		})
	}

	let docsChanged =
		existingEntriesByDocId.size !== manifestEntries.length ||
		hasFilesystemChanges

	if (docsChanged) {
		// Clean up orphaned files and directories
		await cleanupOrphanedFiles(handle, docs, docLocations)

		await writeManifest(handle, {
			version: 1,
			entries: manifestEntries,
			lastSyncAt: nowIso,
		})

		for (let entry of manifestEntries) {
			recentImportedRelativePaths.delete(entry.relativePath)
		}
	}

	for (let doc of docs) {
		preferredRelativePathByDocId.delete(doc.id)
	}
}

async function cleanupOrphanedFiles(
	handle: FileSystemDirectoryHandle,
	docs: BackupDoc[],
	docLocations: Map<
		string,
		ReturnType<typeof computeDocLocations> extends Map<string, infer V>
			? V
			: never
	>,
): Promise<void> {
	let { expectedPaths, expectedFiles } = computeExpectedStructure(
		docs,
		docLocations,
	)

	async function cleanDir(
		dir: FileSystemDirectoryHandle,
		path: string,
	): Promise<boolean> {
		let subdirs = await listDirectories(dir)
		let hasContent = false

		for (let subdir of subdirs) {
			let subPath = path ? `${path}/${subdir}` : subdir

			// Skip assets folders that belong to a doc
			if (subdir === "assets" && expectedPaths.has(subPath)) {
				hasContent = true
				continue
			}

			if (expectedPaths.has(subPath)) {
				let subHandle = await dir.getDirectoryHandle(subdir)
				let subHasContent = await cleanDir(subHandle, subPath)
				if (subHasContent) hasContent = true
			} else {
				// Directory not expected, remove it
				try {
					await dir.removeEntry(subdir, { recursive: true })
				} catch {
					// Ignore errors
				}
			}
		}

		// Clean files in this directory
		let expected = expectedFiles.get(path) ?? new Set()
		let files = await listFiles(dir)
		for (let file of files) {
			if (file.endsWith(".md")) {
				if (expected.has(file)) {
					hasContent = true
				} else {
					await deleteFile(dir, file)
				}
			}
		}

		return hasContent
	}

	await cleanDir(handle, "")
}

async function createDocFromFile(
	file: ScannedFile,
	targetDocs: DocumentList,
	listOwner: Group | Account,
): Promise<string> {
	// Create doc-specific group with list owner as parent
	let docGroup = Group.create()
	if (listOwner instanceof Group) {
		docGroup.addMember(listOwner)
	}

	let now = new Date()

	// Create assets
	let docAssets: co.loaded<typeof Asset>[] = []
	let assetFilesById = new Map<string, string>()
	for (let assetFile of file.assets) {
		let isVideo = assetFile.blob.type.startsWith("video/")

		if (isVideo) {
			let video = await FileStream.createFromBlob(assetFile.blob, {
				owner: docGroup,
			})
			let asset = VideoAsset.create(
				{
					type: "video",
					name: assetFile.name.replace(/\.[^.]+$/, ""),
					video,
					mimeType: "video/mp4",
					createdAt: now,
				},
				docGroup,
			)
			docAssets.push(asset)
			assetFilesById.set(asset.$jazz.id, assetFile.name)
		} else {
			let image = await createImage(assetFile.blob, {
				owner: docGroup,
				maxSize: 2048,
			})
			let asset = ImageAsset.create(
				{
					type: "image",
					name: assetFile.name.replace(/\.[^.]+$/, ""),
					image,
					createdAt: now,
				},
				docGroup,
			)
			docAssets.push(asset)
			assetFilesById.set(asset.$jazz.id, assetFile.name)
		}
	}

	let transformedContent = transformContentForImport(
		file.content,
		assetFilesById,
	)
	let content = applyPathFromRelativePath(
		transformedContent,
		file.relativePath,
		file.assets.length > 0,
	)

	let newDoc = Document.create(
		{
			version: 1,
			content: co.plainText().create(content, docGroup),
			assets:
				docAssets.length > 0
					? co.list(Asset).create(docAssets, docGroup)
					: undefined,
			createdAt: now,
			updatedAt: now,
		},
		docGroup,
	)

	targetDocs.$jazz.push(newDoc)
	return newDoc.$jazz.id
}

async function updateDocFromFile(
	file: ScannedFile,
	docId: string,
	manifestEntry: ManifestEntry,
	targetDocs: DocumentList,
): Promise<boolean> {
	let doc = targetDocs.find(
		(d): d is LoadedDocument => d?.$isLoaded === true && d.$jazz.id === docId,
	)
	if (!doc || !doc.content?.$isLoaded) {
		return false
	}

	// Update content
	let assetFilesById = getAssetFilesByIdFromManifest(manifestEntry)
	let content = applyPathFromRelativePath(
		transformContentForImport(file.content, assetFilesById),
		file.relativePath,
		file.assets.length > 0,
	)

	doc.content.$jazz.applyDiff(content)
	doc.$jazz.set("updatedAt", new Date())

	// TODO: Handle asset updates (add/remove/replace assets)
	// For now, we just update the content. Asset changes require more complex logic.
	return true
}

function isDocumentList(value: unknown): value is DocumentList {
	if (typeof value !== "object" || value === null) return false
	return "$jazz" in value && "find" in value
}

function isSpaceBackupState(value: unknown): value is SpaceBackupState {
	if (typeof value !== "object" || value === null) return false
	if (!("directoryName" in value)) return false
	return value.directoryName === null || typeof value.directoryName === "string"
}

function findMovedManifestEntry(
	manifest: Awaited<ReturnType<typeof readManifest>>,
	scannedByPath: Map<string, ScannedFile>,
	matchedManifestDocIds: Set<string>,
	file: ScannedFile,
	contentHash: string,
) {
	if (!manifest) return null
	let candidates = manifest.entries.filter(entry => {
		if (matchedManifestDocIds.has(entry.docId)) return false
		if (scannedByPath.has(entry.relativePath)) return false
		if (entry.contentHash !== contentHash) return false
		return true
	})
	if (candidates.length === 0) return null
	if (candidates.length === 1) return candidates[0]

	let matchingBasename = candidates.filter(entry => {
		return getFilename(entry.relativePath) === getFilename(file.relativePath)
	})
	if (matchingBasename.length === 1) {
		return matchingBasename[0]
	}

	return null
}

function getFilename(relativePath: string): string {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length === 0) return relativePath
	return parts[parts.length - 1]
}

function getAssetFilesByIdFromManifest(
	manifestEntry: ManifestEntry,
): Map<string, string> {
	let filesById = new Map<string, string>()
	for (let asset of manifestEntry.assets) {
		if (!asset.id) continue
		filesById.set(asset.id, asset.name)
	}
	return filesById
}

function applyPathFromRelativePath(
	content: string,
	relativePath: string,
	hasAssets: boolean,
): string {
	let diskPath = derivePathFromRelativePath(relativePath, hasAssets)
	let { frontmatter } = parseFrontmatter(content)
	let currentPath = getPath(content)

	if (!frontmatter) {
		if (!diskPath) return content
		return `---\npath: ${diskPath}\n---\n\n${content}`
	}

	if (currentPath === diskPath) return content

	if (currentPath && !diskPath) {
		return content.replace(
			/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*\r?\n([\s\S]*?---)/,
			"$1$2",
		)
	}

	if (currentPath && diskPath) {
		return content.replace(
			/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*/,
			`$1path: ${diskPath}`,
		)
	}

	if (!currentPath && diskPath) {
		return content.replace(/^(---\r?\n)/, `$1path: ${diskPath}\n`)
	}

	return content
}

function derivePathFromRelativePath(
	relativePath: string,
	hasAssets: boolean,
): string | null {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length <= 1) return null

	let directoryParts = parts.slice(0, -1)
	if (!hasAssets) {
		let path = directoryParts.join("/")
		return path || null
	}

	let parentParts = directoryParts.slice(0, -1)
	let path = parentParts.join("/")
	return path || null
}

function buildLocationFromRelativePath(
	baseLocation: ReturnType<typeof computeDocLocations> extends Map<
		string,
		infer V
	>
		? V
		: never,
	relativePath: string,
) {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length === 0) return baseLocation

	return {
		...baseLocation,
		dirPath: parts.slice(0, -1).join("/"),
		filename: parts[parts.length - 1],
	}
}

function supportsFileSystemWatch(): boolean {
	return typeof window.FileSystemObserver === "function"
}

function isBackupSupported(): boolean {
	return "showDirectoryPicker" in window
}

function getSpaceBackupStorageKey(spaceId: string): string {
	return `${SPACE_BACKUP_KEY_PREFIX}${spaceId}`
}

function getSpacesWithBackup(
	me: ReturnType<
		typeof useAccount<typeof UserAccount, typeof spacesBackupQuery>
	>,
	_storageVersion: number,
): string[] {
	if (!me.$isLoaded || !me.root?.spaces?.$isLoaded) return []

	let spaceIds: string[] = []
	for (let space of Array.from(me.root.spaces)) {
		if (!space?.$isLoaded) continue
		let backupPath = getSpaceBackupPath(space.$jazz.id)
		if (backupPath) {
			spaceIds.push(space.$jazz.id)
		}
	}
	return spaceIds
}

async function observeDirectoryChanges(
	handle: FileSystemDirectoryHandle,
	onChange: () => void,
): Promise<(() => void) | null> {
	let Observer = window.FileSystemObserver
	if (!Observer) return null

	let observer = new Observer(() => {
		onChange()
	})
	await observer.observe(handle, { recursive: true })
	return () => observer.disconnect()
}

async function hashBlob(blob: Blob): Promise<string> {
	let buffer = await blob.arrayBuffer()
	let hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
	let hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray
		.map(b => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16)
}

function areManifestAssetsEqual(
	a: { id?: string; name: string; hash: string }[],
	b: { id?: string; name: string; hash: string }[],
): boolean {
	if (a.length !== b.length) return false

	let sortedA = [...a].sort((left, right) =>
		left.name.localeCompare(right.name),
	)
	let sortedB = [...b].sort((left, right) =>
		left.name.localeCompare(right.name),
	)

	for (let i = 0; i < sortedA.length; i++) {
		if ((sortedA[i].id ?? null) !== (sortedB[i].id ?? null)) return false
		if (sortedA[i].name !== sortedB[i].name) return false
		if (sortedA[i].hash !== sortedB[i].hash) return false
	}

	return true
}

function wasRecentlyImported(relativePath: string): boolean {
	let importedAt = recentImportedRelativePaths.get(relativePath)
	if (!importedAt) return false
	if (Date.now() - importedAt > RECENT_IMPORT_WINDOW_MS) {
		recentImportedRelativePaths.delete(relativePath)
		return false
	}
	return true
}

function markRecentlyImported(relativePath: string): void {
	recentImportedRelativePaths.set(relativePath, Date.now())
}

function toTimestamp(value: string | null): number | null {
	if (!value) return null
	let ms = Date.parse(value)
	return Number.isNaN(ms) ? null : ms
}

function getDocLocationKey(doc: BackupDoc): string {
	let path = doc.path ?? ""
	let hasAssets = doc.assets.length > 0 ? "assets" : "no-assets"
	return `${doc.title}|${path}|${hasAssets}`
}

async function getSpaceBackupHandle(
	spaceId: string,
): Promise<FileSystemDirectoryHandle | null> {
	try {
		let handle = await idbGet<FileSystemDirectoryHandle>(
			`${HANDLE_STORAGE_KEY}-space-${spaceId}`,
		)
		if (!handle) return null
		let hasPermission = await verifyPermission(handle)
		if (!hasPermission) return null
		return handle
	} catch {
		return null
	}
}
