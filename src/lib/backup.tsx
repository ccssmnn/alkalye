import { useState, useEffect, useRef } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { useAccount } from "jazz-tools/react"
import { co, type ResolveQuery } from "jazz-tools"
import { FolderOpen, AlertCircle } from "lucide-react"
import { UserAccount, Document } from "@/schema"
import { getDocumentTitle } from "@/lib/document-utils"
import { getPath } from "@/editor/frontmatter"
import { Button } from "@/components/ui/button"
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval"
import {
	computeDocLocations,
	transformContentForBackup,
	computeExpectedStructure,
	type BackupDoc,
} from "@/lib/backup-sync"

export { BackupSubscriber, BackupSettings }

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
		}): Promise<PermissionState>
		requestPermission(options: {
			mode: "read" | "readwrite"
		}): Promise<PermissionState>
	}
}

let BACKUP_DEBOUNCE_MS = 5000
let HANDLE_STORAGE_KEY = "backup-directory-handle"

function isBackupSupported(): boolean {
	return "showDirectoryPicker" in window
}

interface BackupState {
	enabled: boolean
	directoryName: string | null
	lastBackupAt: string | null
	lastError: string | null
	setEnabled: (enabled: boolean) => void
	setDirectoryName: (name: string | null) => void
	setLastBackupAt: (date: string | null) => void
	setLastError: (error: string | null) => void
	reset: () => void
}

let useBackupStore = create<BackupState>()(
	persist(
		set => ({
			enabled: false,
			directoryName: null,
			lastBackupAt: null,
			lastError: null,
			setEnabled: enabled => set({ enabled }),
			setDirectoryName: directoryName => set({ directoryName }),
			setLastBackupAt: lastBackupAt => set({ lastBackupAt }),
			setLastError: lastError => set({ lastError }),
			reset: () =>
				set({
					enabled: false,
					directoryName: null,
					lastBackupAt: null,
					lastError: null,
				}),
		}),
		{ name: "backup-settings" },
	),
)

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

type LoadedDocument = co.loaded<
	typeof Document,
	{ content: true; assets: { $each: { image: true } } }
>

async function prepareBackupDoc(doc: LoadedDocument): Promise<BackupDoc> {
	let content = doc.content?.toString() ?? ""
	let title = getDocumentTitle(doc)
	let path = getPath(content)

	let assets: BackupDoc["assets"] = []
	if (doc.assets?.$isLoaded) {
		for (let asset of [...doc.assets]) {
			if (!asset?.$isLoaded || !asset.image?.$isLoaded) continue
			let original = asset.image.original
			if (!original?.$isLoaded) continue
			let blob = original.toBlob()
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

let backupQuery = {
	root: {
		documents: {
			$each: { content: true, assets: { $each: { image: true } } },
			$onError: "catch",
		},
	},
} as const satisfies ResolveQuery<typeof UserAccount>

function BackupSubscriber() {
	let { enabled, setLastBackupAt, setLastError, setEnabled, setDirectoryName } =
		useBackupStore()
	let me = useAccount(UserAccount, { resolve: backupQuery })
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let lastContentHashRef = useRef<string>("")

	useEffect(() => {
		if (!enabled || !me.$isLoaded) return

		let docs = me.root?.documents
		if (!docs?.$isLoaded) return

		// Compute content hash to detect changes
		let activeDocs = [...docs].filter(
			d => d?.$isLoaded && !d.deletedAt && !d.permanentlyDeletedAt,
		)
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

	return null
}

// Export for settings UI
export async function enableBackup(): Promise<{
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

export async function disableBackup(): Promise<void> {
	await clearHandle()
	useBackupStore.getState().reset()
}

export async function changeBackupDirectory(): Promise<{
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

export async function checkBackupPermission(): Promise<boolean> {
	let handle = await getBackupHandle()
	return handle !== null
}

// Settings UI component

function BackupSettings() {
	let { enabled, directoryName, lastBackupAt, lastError } = useBackupStore()
	let [isLoading, setIsLoading] = useState(false)

	if (!isBackupSupported()) return null

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
							<span className="text-sm font-medium">Backing up to folder</span>
						</div>
						<p className="text-muted-foreground mb-1 text-sm">
							Folder: <span className="font-medium">{directoryName}</span>
						</p>
						{formattedLastBackup && (
							<p className="text-muted-foreground mb-3 text-xs">
								Last backup: {formattedLastBackup}
							</p>
						)}
						{lastError && (
							<div className="text-destructive mb-3 flex items-center gap-1.5 text-sm">
								<AlertCircle className="size-4" />
								{lastError}
							</div>
						)}
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
