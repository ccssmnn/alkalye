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
import { getPath } from "@/editor/frontmatter"
import { Button } from "@/components/ui/button"
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval"
import {
	computeDocLocations,
	transformContentForBackup,
	computeExpectedStructure,
	scanBackupFolder,
	readManifest,
	transformContentForImport,
	type BackupDoc,
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
	syncFromBackup,
	type ScannedFile,
}

// File System Access API type augmentation
declare global {
	interface Window {
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

let BACKUP_DEBOUNCE_MS = 5000
let _BACKUP_PULL_INTERVAL_MS = 20000

function supportsFileSystemWatch(): boolean {
	if (typeof FileSystemDirectoryHandle === "undefined") return false
	let proto = Object.getPrototypeOf(FileSystemDirectoryHandle.prototype)
	return "watch" in proto
}

let HANDLE_STORAGE_KEY = "backup-directory-handle"

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
		setLastBackupAt,
		setLastPullAt,
		setLastError,
		setEnabled,
		setDirectoryName,
	} = useBackupStore()
	let me = useAccount(UserAccount, { resolve: backupQuery })
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let lastContentHashRef = useRef<string>("")
	let pullIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
				await syncBackup(handle, backupDocs)

				setLastBackupAt(new Date().toISOString())
				setLastError(null)
			} catch (e) {
				setLastError(e instanceof Error ? e.message : "Backup failed")
			}
		}, BACKUP_DEBOUNCE_MS)

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [enabled, me, setLastBackupAt, setLastError, setEnabled, setDirectoryName])

	// Pull from filesystem (import changes)
	useEffect(() => {
		if (!enabled || !bidirectional || !me.$isLoaded) return

		let docs = me.root?.documents
		if (!docs?.$isLoaded) return

		async function doPull() {
			try {
				let handle = await getBackupHandle()
				if (!handle) return

				if (!docs.$isLoaded) return
				let result = await syncFromBackup(handle, docs as DocumentList, true)
				if (result.errors.length > 0) {
					console.warn("Backup pull errors:", result.errors)
				}

				setLastPullAt(new Date().toISOString())
			} catch (e) {
				console.error("Backup pull failed:", e)
			}
		}

		// Pull on mount and visibility change
		doPull()

		let handleVisibility = () => {
			if (document.visibilityState === "visible") {
				doPull()
			}
		}

		document.addEventListener("visibilitychange", handleVisibility)

		// Use FileSystemDirectoryHandle.watch() if available (Chrome 110+), fallback to polling
		let watchAborted = false

		async function setupWatch() {
			let handle = await getBackupHandle()
			if (!handle || watchAborted) return

			if (supportsFileSystemWatch()) {
				try {
					let watcher = (
						handle as unknown as {
							watch(options: { recursive: boolean }): {
								addEventListener(event: string, callback: () => void): void
							}
						}
					).watch({
						recursive: true,
					})
					watcher.addEventListener("change", () => {
						if (!watchAborted) doPull()
					})
				} catch (e) {
					console.warn("FileSystem watch not supported, using polling:", e)
					pullIntervalRef.current = setInterval(
						doPull,
						_BACKUP_PULL_INTERVAL_MS,
					)
				}
			} else {
				pullIntervalRef.current = setInterval(doPull, _BACKUP_PULL_INTERVAL_MS)
			}
		}

		setupWatch()

		return () => {
			watchAborted = true
			document.removeEventListener("visibilitychange", handleVisibility)
			if (pullIntervalRef.current) clearInterval(pullIntervalRef.current)
		}
	}, [enabled, bidirectional, me, setLastPullAt])

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
							<label className="flex cursor-pointer items-center gap-2">
								<input
									type="checkbox"
									checked={bidirectional}
									onChange={e => setBidirectional(e.target.checked)}
									className="size-4 rounded border-gray-300"
								/>
								<span className="text-sm">Sync changes from folder</span>
							</label>
							<p className="text-muted-foreground mt-1 text-xs">
								When enabled, changes made in the backup folder will be imported
								into Alkalye.
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
		let parsed = JSON.parse(stored) as SpaceBackupState
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

// =============================================================================
// Helper functions (used by exported functions above)
// =============================================================================

// Space backup subscriber - handles backup sync for a single space

let SPACE_BACKUP_DEBOUNCE_MS = 5000

interface SpaceBackupSubscriberProps {
	spaceId: string
}

function SpaceBackupSubscriber({ spaceId }: SpaceBackupSubscriberProps) {
	let { directoryName, setDirectoryName } = useSpaceBackupPath(spaceId)
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let lastContentHashRef = useRef<string>("")
	let pullIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	// Load space with documents
	let space = useCoState(Space, spaceId as Parameters<typeof useCoState>[1], {
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
				await syncBackup(handle, backupDocs)
			} catch (e) {
				console.error(`Space backup failed for ${spaceId}:`, e)
			}
		}, SPACE_BACKUP_DEBOUNCE_MS)

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [directoryName, space, spaceId, setDirectoryName])

	// Pull from filesystem (import changes) - always enabled for space backups
	useEffect(() => {
		// Skip if no backup folder configured
		if (!directoryName) return
		// Skip if space not loaded
		if (!space?.$isLoaded || !space.documents?.$isLoaded) return

		let docs = space.documents

		// Check permissions for writing
		let spaceGroup =
			space.$jazz.owner instanceof Group ? space.$jazz.owner : null
		let canWrite =
			spaceGroup?.myRole() === "admin" || spaceGroup?.myRole() === "writer"

		async function doPull() {
			try {
				let handle = await getSpaceBackupHandle(spaceId)
				if (!handle) return

				if (!docs.$isLoaded) return
				let result = await syncFromBackup(
					handle,
					docs as DocumentList,
					canWrite,
				)
				if (result.errors.length > 0) {
					console.warn(`Space ${spaceId} pull errors:`, result.errors)
				}
			} catch (e) {
				console.error(`Space backup pull failed for ${spaceId}:`, e)
			}
		}

		// Pull on mount and visibility change
		doPull()

		let handleVisibility = () => {
			if (document.visibilityState === "visible") {
				doPull()
			}
		}

		document.addEventListener("visibilitychange", handleVisibility)

		// Set up interval for periodic pull
		pullIntervalRef.current = setInterval(doPull, _BACKUP_PULL_INTERVAL_MS)

		return () => {
			document.removeEventListener("visibilitychange", handleVisibility)
			if (pullIntervalRef.current) clearInterval(pullIntervalRef.current)
		}
	}, [directoryName, space, spaceId])

	return null
}

let spacesBackupQuery = {
	root: {
		spaces: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

function isBackupSupported(): boolean {
	return "showDirectoryPicker" in window
}

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
	let opts = { mode: "readwrite" } as const
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

	return { id: doc.$jazz.id, title, content, path, assets }
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

async function syncBackup(
	handle: FileSystemDirectoryHandle,
	docs: BackupDoc[],
): Promise<void> {
	let docLocations = computeDocLocations(docs)

	// Write all documents and their assets
	for (let doc of docs) {
		let loc = docLocations.get(doc.id)!
		let dir = loc.dirPath
			? await getOrCreateDirectory(handle, loc.dirPath)
			: handle

		let exportedContent = transformContentForBackup(doc.content, loc.assetFiles)
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

	// Clean up orphaned files and directories
	await cleanupOrphanedFiles(handle, docs, docLocations)
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

function getSpaceBackupStorageKey(spaceId: string): string {
	return `${SPACE_BACKUP_KEY_PREFIX}${spaceId}`
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

// =============================================================================
// Bidirectional Sync - Pull from filesystem
// =============================================================================

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

async function syncFromBackup(
	handle: FileSystemDirectoryHandle,
	targetDocs: DocumentList,
	canWrite: boolean,
): Promise<{
	created: number
	updated: number
	deleted: number
	errors: string[]
}> {
	let result = { created: 0, updated: 0, deleted: 0, errors: [] as string[] }

	let manifest = await readManifest(handle)
	let scannedFiles = await scanBackupFolder(handle)
	let listOwner = targetDocs.$jazz.owner

	// Build maps for lookup
	let manifestByPath = new Map(
		manifest?.entries.map(e => [e.relativePath, e]) ?? [],
	)
	let scannedByPath = new Map(scannedFiles.map(f => [f.relativePath, f]))

	// Process new and updated files
	for (let file of scannedFiles) {
		try {
			let contentHash = await hashContent(file.content)
			let manifestEntry = manifestByPath.get(file.relativePath)

			if (!manifestEntry) {
				// New file - create document
				if (!canWrite) {
					result.errors.push(`Cannot create ${file.name}: no write permission`)
					continue
				}
				await createDocFromFile(file, targetDocs, listOwner)
				result.created++
			} else if (manifestEntry.contentHash !== contentHash) {
				// File changed - update document
				if (!canWrite) {
					result.errors.push(`Cannot update ${file.name}: no write permission`)
					continue
				}
				await updateDocFromFile(
					file,
					manifestEntry.docId,
					targetDocs,
					listOwner,
				)
				result.updated++
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

async function createDocFromFile(
	file: ScannedFile,
	targetDocs: DocumentList,
	listOwner: Group | Account,
): Promise<void> {
	// Transform asset references back to asset: format
	let assetFiles = new Map<string, string>()
	for (let asset of file.assets) {
		let id = crypto.randomUUID()
		assetFiles.set(id, asset.name)
	}
	let content = transformContentForImport(file.content, assetFiles)

	// Create doc-specific group with list owner as parent
	let docGroup = Group.create()
	if (listOwner instanceof Group) {
		docGroup.addMember(listOwner)
	}

	let now = new Date()

	// Create assets
	let docAssets: co.loaded<typeof Asset>[] = []
	for (let assetFile of file.assets) {
		let isVideo = assetFile.blob.type.startsWith("video/")
		let id = [...assetFiles.entries()].find(
			([, name]) => name === assetFile.name,
		)?.[0]
		if (!id) continue

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
		}
	}

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
}

async function updateDocFromFile(
	file: ScannedFile,
	docId: string,
	targetDocs: DocumentList,
	listOwner: Group | Account,
): Promise<void> {
	let doc = targetDocs.find(
		(d): d is LoadedDocument => d?.$isLoaded === true && d.$jazz.id === docId,
	)
	if (!doc || !doc.content?.$isLoaded) {
		// Doc doesn't exist or content not loaded, treat as create
		await createDocFromFile(file, targetDocs, listOwner)
		return
	}

	// Update content
	let assetFiles = new Map<string, string>()
	for (let asset of file.assets) {
		let id = crypto.randomUUID()
		assetFiles.set(id, asset.name)
	}
	let content = transformContentForImport(file.content, assetFiles)

	doc.content.$jazz.applyDiff(content)
	doc.$jazz.set("updatedAt", new Date())

	// TODO: Handle asset updates (add/remove/replace assets)
	// For now, we just update the content. Asset changes require more complex logic.
}
