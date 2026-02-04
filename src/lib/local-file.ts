import { create } from "zustand"
import { persist, type PersistStorage } from "zustand/middleware"
import { get, set, del } from "idb-keyval"
import { toast } from "sonner"
import { tryCatch } from "@/lib/utils"
import { z } from "zod"

export {
	useLocalFileStore,
	openLocalFile,
	saveLocalFile,
	saveLocalFileAs,
	readFileFromHandle,
	consumeLaunchQueue,
	isFileSystemAccessSupported,
	type LocalFileState,
	type LocalFileEntry,
	closeLocalFile,
	switchToLocalFile,
	getHandleFromDB,
}

declare global {
	interface Window {
		launchQueue?: LaunchQueue
		showOpenFilePicker?: (
			options?: OpenFilePickerOptions,
		) => Promise<FileSystemFileHandle[]>
		showSaveFilePicker?: (
			options?: SaveFilePickerOptions,
		) => Promise<FileSystemFileHandle>
	}

	interface LaunchQueue {
		setConsumer(consumer: (params: LaunchParams) => void): void
	}

	interface LaunchParams {
		files: readonly FileSystemFileHandle[]
	}

	interface OpenFilePickerOptions {
		multiple?: boolean
		excludeAcceptAllOption?: boolean
		types?: FilePickerAcceptType[]
	}

	interface SaveFilePickerOptions {
		suggestedName?: string
		excludeAcceptAllOption?: boolean
		types?: FilePickerAcceptType[]
	}

	interface FilePickerAcceptType {
		description?: string
		accept: Record<string, string[]>
	}

	interface FileSystemFileHandle {
		getFile(): Promise<File>
		createWritable(): Promise<FileSystemWritableFileStream>
		queryPermission?(options: {
			mode: "read" | "readwrite"
		}): Promise<"granted" | "denied" | "prompt">
		requestPermission?(options: {
			mode: "read" | "readwrite"
		}): Promise<"granted" | "denied" | "prompt">
	}

	interface FileSystemWritableFileStream extends WritableStream {
		write(data: string | Blob | ArrayBuffer): Promise<void>
		close(): Promise<void>
	}
}

interface LocalFileEntry {
	id: string
	filename: string
	lastOpened: number
	content: string
	lastSavedContent: string
	hasUnsavedChanges: boolean
	isActive: boolean
}

interface LocalFileState {
	files: LocalFileEntry[]
	activeFileId: string | null
	saveStatus: "idle" | "saving" | "saved" | "error"
	errorMessage: string | null

	setFiles: (files: LocalFileEntry[]) => void
	setActiveFileId: (id: string | null) => void
	setSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void
	setErrorMessage: (message: string | null) => void
	setFileContent: (id: string, content: string) => void
	setFileSavedContent: (id: string, content: string) => void
	addFile: (entry: LocalFileEntry) => void
	removeFile: (id: string) => void
	markFileActive: (id: string) => void
	reset: () => void

	getActiveFile: () => LocalFileEntry | null
	getFileById: (id: string) => LocalFileEntry | null
}

const STORE_NAME = "local-files-storage"
const HANDLES_KEY = "local-file-handles"

let handleCache = new Map<string, FileSystemFileHandle>()

let persistedStateSchema = z.object({
	files: z.array(
		z.object({
			id: z.string(),
			filename: z.string(),
			lastOpened: z.number(),
			content: z.string(),
			lastSavedContent: z.string(),
			hasUnsavedChanges: z.boolean(),
			isActive: z.boolean(),
		}),
	),
	activeFileId: z.string().nullable(),
	saveStatus: z.enum(["idle", "saving", "saved", "error"]),
	errorMessage: z.string().nullable(),
})

type PersistedState = z.infer<typeof persistedStateSchema>

let initialPersistedState: PersistedState = {
	files: [],
	activeFileId: null,
	saveStatus: "idle",
	errorMessage: null,
}

let useLocalFileStore = create<LocalFileState>()(
	persist(
		(set): LocalFileState => ({
			files: [] as LocalFileEntry[],
			activeFileId: null,
			saveStatus: "idle",
			errorMessage: null,

			setFiles: files => set({ files }),
			setActiveFileId: id => set({ activeFileId: id }),
			setSaveStatus: status => set({ saveStatus: status }),
			setErrorMessage: message => set({ errorMessage: message }),

			setFileContent: (id, content) =>
				set(state => ({
					files: state.files.map(f =>
						f.id === id
							? {
									...f,
									content,
									hasUnsavedChanges: content !== f.lastSavedContent,
								}
							: f,
					),
				})),

			setFileSavedContent: (id, content) =>
				set(state => ({
					files: state.files.map(f =>
						f.id === id
							? {
									...f,
									lastSavedContent: content,
									hasUnsavedChanges: false,
								}
							: f,
					),
				})),

			addFile: entry =>
				set(state => {
					let existing = state.files.find(f => f.id === entry.id)
					if (existing) {
						return {
							files: state.files.map(f =>
								f.id === entry.id
									? { ...entry, lastOpened: Date.now(), isActive: true }
									: { ...f, isActive: false },
							),
							activeFileId: entry.id,
						}
					}
					return {
						files: [
							...state.files.map(f => ({ ...f, isActive: false })),
							{ ...entry, isActive: true },
						],
						activeFileId: entry.id,
					}
				}),

			removeFile: id =>
				set(state => {
					let newFiles = state.files.filter(f => f.id !== id)
					let newActiveId =
						state.activeFileId === id
							? newFiles.length > 0
								? newFiles[0].id
								: null
							: state.activeFileId
					return {
						files: newFiles,
						activeFileId: newActiveId,
					}
				}),

			markFileActive: id =>
				set(state => ({
					files: state.files.map(f => ({
						...f,
						isActive: f.id === id,
						lastOpened: f.id === id ? Date.now() : f.lastOpened,
					})),
					activeFileId: id,
				})),

			reset: () =>
				set({
					files: [],
					activeFileId: null,
					saveStatus: "idle",
					errorMessage: null,
				}),

			getActiveFile: () => {
				let state = useLocalFileStore.getState()
				return state.files.find(f => f.id === state.activeFileId) || null
			},

			getFileById: (id: string) => {
				let state = useLocalFileStore.getState()
				return state.files.find(f => f.id === id) || null
			},
		}),
		{
			name: STORE_NAME,
			storage: createIdbStorage(persistedStateSchema, initialPersistedState),
			partialize: (state): PersistedState => ({
				files: state.files,
				activeFileId: state.activeFileId,
				saveStatus: state.saveStatus,
				errorMessage: state.errorMessage,
			}),
		},
	),
)

async function getHandleFromDB(
	id: string,
): Promise<FileSystemFileHandle | null> {
	if (handleCache.has(id)) return handleCache.get(id)!

	let map = await getHandleMap()
	let handle = map[id]
	if (handle) handleCache.set(id, handle)
	return handle || null
}

async function closeLocalFile(id: string): Promise<void> {
	await removeHandleFromDB(id)
	useLocalFileStore.getState().removeFile(id)
}

async function switchToLocalFile(
	id: string,
	handle: FileSystemFileHandle,
): Promise<void> {
	let fileResult = await readFileFromHandle(handle)
	if (!fileResult) return

	let existingFile = useLocalFileStore.getState().getFileById(id)
	if (existingFile) {
		useLocalFileStore.getState().markFileActive(id)
		await saveHandleToDB(id, handle)
	} else {
		useLocalFileStore.getState().addFile({
			id,
			filename: fileResult.filename,
			lastOpened: Date.now(),
			content: fileResult.content,
			lastSavedContent: fileResult.content,
			hasUnsavedChanges: false,
			isActive: true,
		})
		await saveHandleToDB(id, handle)
	}
}

function isFileSystemAccessSupported(): boolean {
	return "showOpenFilePicker" in window
}

async function openLocalFile(): Promise<{
	handle: FileSystemFileHandle
	content: string
	filename: string
	id: string
} | null> {
	if (!isFileSystemAccessSupported()) {
		return null
	}

	let result = await tryCatch(
		window.showOpenFilePicker!({
			multiple: false,
			types: [
				{
					description: "Markdown files",
					accept: {
						"text/markdown": [".md", ".markdown"],
						"text/plain": [".txt"],
					},
				},
			],
		}),
	)

	if (!result.ok) {
		if (result.error.name === "AbortError") {
			return null
		}
		toast.error("Failed to open file. Please try again.")
		throw result.error
	}

	let [handle] = result.value

	let fileResult = await tryCatch(handle.getFile())
	if (!fileResult.ok) {
		toast.error("Failed to read file. The file may have been moved or deleted.")
		throw fileResult.error
	}

	let contentResult = await tryCatch(fileResult.value.text())
	if (!contentResult.ok) {
		toast.error("Failed to read file content. The file may be corrupted.")
		throw contentResult.error
	}

	let id = crypto.randomUUID()
	await saveHandleToDB(id, handle)

	return {
		handle,
		content: contentResult.value,
		filename: fileResult.value.name,
		id,
	}
}

async function readFileFromHandle(
	handle: FileSystemFileHandle,
): Promise<{ content: string; filename: string } | null> {
	if (handle.queryPermission) {
		let queryResult = await tryCatch(handle.queryPermission({ mode: "read" }))
		if (!queryResult.ok) {
			toast.error("Cannot access file. Permission check failed.")
			return null
		}
		let permission = queryResult.value
		if (permission !== "granted" && handle.requestPermission) {
			let requestResult = await tryCatch(
				handle.requestPermission({ mode: "read" }),
			)
			if (!requestResult.ok) {
				toast.error("Cannot access file. Permission request failed.")
				return null
			}
			if (requestResult.value !== "granted") {
				toast.error("File access denied. Please re-open the file.")
				return null
			}
		}
		if (permission !== "granted" && !handle.requestPermission) {
			toast.error("File access denied. Please re-open the file.")
			return null
		}
	}

	let fileResult = await tryCatch(handle.getFile())
	if (!fileResult.ok) {
		toast.error("Failed to read file. The file may have been moved or deleted.")
		return null
	}

	let contentResult = await tryCatch(fileResult.value.text())
	if (!contentResult.ok) {
		toast.error("Failed to read file content. The file may be corrupted.")
		return null
	}

	return { content: contentResult.value, filename: fileResult.value.name }
}

async function saveLocalFile(id: string, content: string): Promise<boolean> {
	let handle = await getHandleFromDB(id)
	if (!handle) {
		toast.error("File handle not found")
		return false
	}

	if (handle.queryPermission) {
		let queryResult = await tryCatch(
			handle.queryPermission({ mode: "readwrite" }),
		)
		if (!queryResult.ok) {
			toast.error("Cannot check file permissions. Please re-open the file.")
			return false
		}
		let permission = queryResult.value
		if (permission !== "granted" && handle.requestPermission) {
			let requestResult = await tryCatch(
				handle.requestPermission({ mode: "readwrite" }),
			)
			if (!requestResult.ok) {
				toast.error("Cannot request file permissions. Please re-open the file.")
				return false
			}
			if (requestResult.value !== "granted") {
				toast.error("File permissions denied. Please grant access to save.")
				return false
			}
		}
		if (permission !== "granted" && !handle.requestPermission) {
			toast.error("File permissions denied. Please grant access to save.")
			return false
		}
	}

	let writableResult = await tryCatch(handle.createWritable())
	if (!writableResult.ok) {
		toast.error(
			"Cannot write to file. The file may be in use by another application.",
		)
		return false
	}

	let writeResult = await tryCatch(writableResult.value.write(content))
	if (!writeResult.ok) {
		toast.error("Failed to save changes. Please try again.")
		await writableResult.value.close().catch(() => {})
		return false
	}

	let closeResult = await tryCatch(writableResult.value.close())
	if (!closeResult.ok) {
		toast.error("Failed to finalize save. Please try again.")
		return false
	}

	return true
}

async function saveLocalFileAs(
	content: string,
	suggestedName?: string,
): Promise<{ handle: FileSystemFileHandle; id: string } | null> {
	if (!isFileSystemAccessSupported() || !window.showSaveFilePicker) {
		downloadFile(content, suggestedName ?? "document.md")
		return null
	}

	let result = await tryCatch(
		window.showSaveFilePicker!({
			suggestedName: suggestedName ?? "document.md",
			types: [
				{
					description: "Markdown file",
					accept: { "text/markdown": [".md"] },
				},
			],
		}),
	)

	if (!result.ok) {
		if (result.error.name === "AbortError") {
			return null
		}
		toast.error("Failed to save file. Please try again.")
		throw result.error
	}

	let handle = result.value

	let writableResult = await tryCatch(handle.createWritable())
	if (!writableResult.ok) {
		toast.error(
			"Cannot write to file. The file may be in use by another application.",
		)
		throw writableResult.error
	}

	let writeResult = await tryCatch(writableResult.value.write(content))
	if (!writeResult.ok) {
		toast.error("Failed to save changes. Please try again.")
		await writableResult.value.close().catch(() => {})
		throw writeResult.error
	}

	let closeResult = await tryCatch(writableResult.value.close())
	if (!closeResult.ok) {
		toast.error("Failed to finalize save. Please try again.")
		throw closeResult.error
	}

	let id = crypto.randomUUID()
	await saveHandleToDB(id, handle)

	return { handle, id }
}

async function consumeLaunchQueue(): Promise<{
	handle: FileSystemFileHandle
	content: string
	filename: string
	id: string
} | null> {
	return new Promise(resolve => {
		if (!window.launchQueue) {
			resolve(null)
			return
		}

		let consumed = false

		window.launchQueue.setConsumer(async launchParams => {
			if (consumed) return
			consumed = true

			if (launchParams.files.length === 0) {
				resolve(null)
				return
			}

			let handle = launchParams.files[0]

			let fileResult = await tryCatch(handle.getFile())
			if (!fileResult.ok) {
				toast.error(
					"Failed to read launched file. Please try opening it manually.",
				)
				resolve(null)
				return
			}

			let contentResult = await tryCatch(fileResult.value.text())
			if (!contentResult.ok) {
				toast.error(
					"Failed to read launched file content. The file may be corrupted.",
				)
				resolve(null)
				return
			}

			let id = crypto.randomUUID()
			await saveHandleToDB(id, handle)

			resolve({
				handle,
				content: contentResult.value,
				filename: fileResult.value.name,
				id,
			})
		})

		setTimeout(() => {
			if (!consumed) {
				consumed = true
				resolve(null)
			}
		}, 100)
	})
}

type StorageValue<T> = {
	state: T
	version: number
}

function createIdbStorage<T>(
	schema: z.ZodType<T>,
	initialState: T,
	version: number = 1,
): PersistStorage<T> {
	return {
		getItem: async function (name): Promise<StorageValue<T> | null> {
			try {
				let item = await get(name)
				if (!item) return null

				let check = z
					.object({ state: schema, version: z.number() })
					.safeParse(item)

				if (!check.success) {
					console.warn("Invalid store data, using initial state", check.error)
					return { state: initialState, version }
				}

				return {
					state: check.data.state,
					version: check.data.version,
				}
			} catch (error) {
				console.error("Failed to get store from idb", error)
				return { state: initialState, version }
			}
		},
		setItem: async function (name, value) {
			try {
				await set(name, value)
			} catch (error) {
				console.error("Failed to persist store to idb", error)
			}
		},
		removeItem: async function (name) {
			try {
				await del(name)
			} catch (error) {
				console.error("Failed to remove store from idb", error)
			}
		},
	}
}

async function getHandleMap(): Promise<Record<string, FileSystemFileHandle>> {
	let result = await get(HANDLES_KEY)
	return result || {}
}

async function saveHandleToDB(
	id: string,
	handle: FileSystemFileHandle,
): Promise<void> {
	let existing = await getHandleMap()
	existing[id] = handle
	await set(HANDLES_KEY, existing)
	handleCache.set(id, handle)
}

async function removeHandleFromDB(id: string): Promise<void> {
	handleCache.delete(id)
	let existing = await getHandleMap()
	delete existing[id]
	await set(HANDLES_KEY, existing)
}

function downloadFile(content: string, filename: string): void {
	let blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
	let url = URL.createObjectURL(blob)
	let a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}
