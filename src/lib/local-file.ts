import { create } from "zustand"

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

// File System Access API type augmentation
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
	if (!window.showOpenFilePicker) {
		return null
	}

	try {
		let [handle] = await window.showOpenFilePicker({
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
		})

		let file = await handle.getFile()
		let content = await file.text()

		return {
			handle,
			content,
			filename: file.name,
		}
	} catch (e) {
		if (e instanceof Error && e.name === "AbortError") {
			return null
		}
		throw e
	}
}

async function readFileFromHandle(
	handle: FileSystemFileHandle,
): Promise<{ content: string; filename: string }> {
	let file = await handle.getFile()
	let content = await file.text()
	return { content, filename: file.name }
}

async function saveLocalFile(
	handle: FileSystemFileHandle,
	content: string,
): Promise<boolean> {
	try {
		// Check/request permission
		if (handle.queryPermission) {
			let permission = await handle.queryPermission({ mode: "readwrite" })
			if (permission !== "granted" && handle.requestPermission) {
				permission = await handle.requestPermission({ mode: "readwrite" })
				if (permission !== "granted") {
					return false
				}
			}
		}

		let writable = await handle.createWritable()
		await writable.write(content)
		await writable.close()
		return true
	} catch (e) {
		console.error("Failed to save file:", e)
		return false
	}
}

async function saveLocalFileAs(
	content: string,
	suggestedName?: string,
): Promise<FileSystemFileHandle | null> {
	if (!window.showSaveFilePicker) {
		// Fallback: download
		downloadFile(content, suggestedName ?? "document.md")
		return null
	}

	try {
		let handle = await window.showSaveFilePicker({
			suggestedName: suggestedName ?? "document.md",
			types: [
				{
					description: "Markdown file",
					accept: { "text/markdown": [".md"] },
				},
			],
		})

		let writable = await handle.createWritable()
		await writable.write(content)
		await writable.close()

		return handle
	} catch (e) {
		if (e instanceof Error && e.name === "AbortError") {
			return null
		}
		throw e
	}
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
			try {
				let file = await handle.getFile()
				let content = await file.text()
				resolve({ handle, content, filename: file.name })
			} catch (e) {
				console.error("Failed to read launched file:", e)
				resolve(null)
			}
		})

		// If no file is launched within a short time, resolve null
		setTimeout(() => {
			if (!consumed) {
				consumed = true
				resolve(null)
			}
		}, 100)
	})
}

// =============================================================================
// Helpers
// =============================================================================

function downloadFile(content: string, filename: string): void {
	let blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
	let url = URL.createObjectURL(blob)
	let a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}
