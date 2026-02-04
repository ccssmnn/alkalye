import { create } from "zustand"
import { toast } from "sonner"
import { tryCatch } from "@/lib/utils"

export {
	useLocalFileStore,
	openLocalFile,
	saveLocalFile,
	saveLocalFileAs,
	readFileFromHandle,
	consumeLaunchQueue,
	isFileSystemAccessSupported,
	type LocalFileState,
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

interface LocalFileState {
	fileHandle: FileSystemFileHandle | null
	filename: string | null
	content: string
	lastSavedContent: string
	saveStatus: "idle" | "saving" | "saved" | "error"
	errorMessage: string | null

	setFileHandle: (handle: FileSystemFileHandle | null) => void
	setFilename: (name: string | null) => void
	setContent: (content: string) => void
	setLastSavedContent: (content: string) => void
	setSaveStatus: (status: "idle" | "saving" | "saved" | "error") => void
	setErrorMessage: (message: string | null) => void
	reset: () => void
}

let useLocalFileStore = create<LocalFileState>(set => ({
	fileHandle: null,
	filename: null,
	content: "",
	lastSavedContent: "",
	saveStatus: "idle",
	errorMessage: null,

	setFileHandle: handle => set({ fileHandle: handle }),
	setFilename: name => set({ filename: name }),
	setContent: content => set({ content }),
	setLastSavedContent: content => set({ lastSavedContent: content }),
	setSaveStatus: status => set({ saveStatus: status }),
	setErrorMessage: message => set({ errorMessage: message }),
	reset: () =>
		set({
			fileHandle: null,
			filename: null,
			content: "",
			lastSavedContent: "",
			saveStatus: "idle",
			errorMessage: null,
		}),
}))

function isFileSystemAccessSupported(): boolean {
	return "showOpenFilePicker" in window
}

async function openLocalFile(): Promise<{
	handle: FileSystemFileHandle
	content: string
	filename: string
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
		toast.error("Failed to open file: " + result.error.message)
		throw result.error
	}

	let [handle] = result.value

	let fileResult = await tryCatch(handle.getFile())
	if (!fileResult.ok) {
		toast.error("Failed to read file: " + fileResult.error.message)
		throw fileResult.error
	}

	let contentResult = await tryCatch(fileResult.value.text())
	if (!contentResult.ok) {
		toast.error("Failed to read file content: " + contentResult.error.message)
		throw contentResult.error
	}

	return {
		handle,
		content: contentResult.value,
		filename: fileResult.value.name,
	}
}

async function readFileFromHandle(
	handle: FileSystemFileHandle,
): Promise<{ content: string; filename: string } | null> {
	let fileResult = await tryCatch(handle.getFile())
	if (!fileResult.ok) {
		toast.error("Failed to read file: " + fileResult.error.message)
		return null
	}

	let contentResult = await tryCatch(fileResult.value.text())
	if (!contentResult.ok) {
		toast.error("Failed to read file content: " + contentResult.error.message)
		return null
	}

	return { content: contentResult.value, filename: fileResult.value.name }
}

async function saveLocalFile(
	handle: FileSystemFileHandle,
	content: string,
): Promise<boolean> {
	if (handle.queryPermission) {
		let queryResult = await tryCatch(
			handle.queryPermission({ mode: "readwrite" }),
		)
		if (!queryResult.ok) {
			toast.error(
				"Failed to check file permissions: " + queryResult.error.message,
			)
			return false
		}
		let permission = queryResult.value
		if (permission !== "granted" && handle.requestPermission) {
			let requestResult = await tryCatch(
				handle.requestPermission({ mode: "readwrite" }),
			)
			if (!requestResult.ok) {
				toast.error(
					"Failed to request file permissions: " + requestResult.error.message,
				)
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
		toast.error("Failed to create file writer: " + writableResult.error.message)
		return false
	}

	let writeResult = await tryCatch(writableResult.value.write(content))
	if (!writeResult.ok) {
		toast.error("Failed to write file: " + writeResult.error.message)
		await writableResult.value.close().catch(() => {})
		return false
	}

	let closeResult = await tryCatch(writableResult.value.close())
	if (!closeResult.ok) {
		toast.error("Failed to close file: " + closeResult.error.message)
		return false
	}

	return true
}

async function saveLocalFileAs(
	content: string,
	suggestedName?: string,
): Promise<FileSystemFileHandle | null> {
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
		toast.error("Failed to save file: " + result.error.message)
		throw result.error
	}

	let handle = result.value

	let writableResult = await tryCatch(handle.createWritable())
	if (!writableResult.ok) {
		toast.error("Failed to create file writer: " + writableResult.error.message)
		throw writableResult.error
	}

	let writeResult = await tryCatch(writableResult.value.write(content))
	if (!writeResult.ok) {
		toast.error("Failed to write file: " + writeResult.error.message)
		await writableResult.value.close().catch(() => {})
		throw writeResult.error
	}

	let closeResult = await tryCatch(writableResult.value.close())
	if (!closeResult.ok) {
		toast.error("Failed to close file: " + closeResult.error.message)
		throw closeResult.error
	}

	return handle
}

async function consumeLaunchQueue(): Promise<{
	handle: FileSystemFileHandle
	content: string
	filename: string
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
				toast.error("Failed to read launched file: " + fileResult.error.message)
				resolve(null)
				return
			}

			let contentResult = await tryCatch(fileResult.value.text())
			if (!contentResult.ok) {
				toast.error(
					"Failed to read launched file content: " +
						contentResult.error.message,
				)
				resolve(null)
				return
			}

			resolve({
				handle,
				content: contentResult.value,
				filename: fileResult.value.name,
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

function downloadFile(content: string, filename: string): void {
	let blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
	let url = URL.createObjectURL(blob)
	let a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}
