export {
	MockDirectoryHandle,
	createMockBlob,
	createMockFile,
	readFileAtPath,
	removeFileAtPath,
	writeFileAtPath,
	basename,
}

interface StoredFile {
	content: string | null
	source: File | null
	lastModified: number
	type: string
}

function createMockFile(content: string, lastModified = Date.now()): File {
	return new File([content], "test.md", { lastModified })
}

function createMockBlob(content: string, type = "image/png"): Blob {
	return new Blob([content], { type })
}

class MockWritableFileStream implements FileSystemWritableFileStream {
	private stream = new WritableStream<unknown>()
	private saveContent: (content: string) => void

	constructor(saveContent: (content: string) => void) {
		this.saveContent = saveContent
	}

	get locked(): boolean {
		return this.stream.locked
	}

	abort(reason?: unknown): Promise<void> {
		return this.stream.abort(reason)
	}

	close(): Promise<void> {
		return Promise.resolve()
	}

	getWriter(): WritableStreamDefaultWriter<unknown> {
		return this.stream.getWriter()
	}

	seek(_position: number): Promise<void> {
		return Promise.resolve()
	}

	truncate(_size: number): Promise<void> {
		return Promise.resolve()
	}

	write(data: string | Blob | ArrayBuffer): Promise<void>
	write(data: ArrayBufferView): Promise<void>
	write(data: {
		type: "write"
		data: string | Blob | ArrayBuffer | ArrayBufferView | null
	}): Promise<void>
	write(data: { type: "seek"; position: number }): Promise<void>
	write(data: { type: "truncate"; size: number }): Promise<void>
	async write(data: unknown): Promise<void> {
		if (typeof data === "string") {
			this.saveContent(data)
			return
		}

		if (data instanceof Blob) {
			this.saveContent(await data.text())
			return
		}

		if (data instanceof ArrayBuffer) {
			let bytes = new Uint8Array(data)
			this.saveContent(new TextDecoder().decode(bytes))
			return
		}

		if (ArrayBuffer.isView(data)) {
			let bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
			this.saveContent(new TextDecoder().decode(bytes))
			return
		}

		if (typeof data === "object" && data !== null && "type" in data) {
			if (
				data.type === "write" &&
				"data" in data &&
				data.data !== undefined &&
				data.data !== null
			) {
				let nestedData = data.data
				if (typeof nestedData === "string") {
					this.saveContent(nestedData)
					return
				}
				if (nestedData instanceof Blob) {
					this.saveContent(await nestedData.text())
					return
				}
				if (nestedData instanceof ArrayBuffer) {
					let bytes = new Uint8Array(nestedData)
					this.saveContent(new TextDecoder().decode(bytes))
					return
				}
				if (ArrayBuffer.isView(nestedData)) {
					let bytes = new Uint8Array(
						nestedData.buffer,
						nestedData.byteOffset,
						nestedData.byteLength,
					)
					this.saveContent(new TextDecoder().decode(bytes))
				}
			}
		}
	}

	get [Symbol.toStringTag](): string {
		return "FileSystemWritableFileStream"
	}
}

class MockFileHandle implements FileSystemFileHandle {
	kind = "file" as const
	name: string
	private getStoredFile: () => StoredFile | undefined
	private setStoredFile: (file: StoredFile) => void

	constructor(
		name: string,
		getStoredFile: () => StoredFile | undefined,
		setStoredFile: (file: StoredFile) => void,
	) {
		this.name = name
		this.getStoredFile = getStoredFile
		this.setStoredFile = setStoredFile
	}

	async getFile(): Promise<File> {
		let file = this.getStoredFile()
		if (!file) {
			return new File([""], this.name)
		}
		if (file.content === null && file.source) {
			return file.source
		}
		return new File([file.content ?? ""], this.name, {
			lastModified: file.lastModified,
			type: file.type,
		})
	}

	async createWritable(): Promise<FileSystemWritableFileStream> {
		return new MockWritableFileStream(content => {
			let current = this.getStoredFile()
			this.setStoredFile({
				content,
				source: null,
				lastModified: Date.now(),
				type: current?.type ?? inferMimeType(this.name),
			})
		})
	}

	isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return Promise.resolve(other.kind === "file" && other.name === this.name)
	}

	get [Symbol.toStringTag](): string {
		return "FileSystemFileHandle"
	}
}

function isFileHandle(
	handle: FileSystemHandle | undefined,
): handle is FileSystemFileHandle {
	return handle?.kind === "file"
}

function isDirectoryHandle(
	handle: FileSystemHandle | undefined,
): handle is FileSystemDirectoryHandle {
	return handle?.kind === "directory"
}

class MockDirectoryHandle implements FileSystemDirectoryHandle {
	kind = "directory" as const
	name: string
	private children = new Map<string, FileSystemHandle>()
	private files = new Map<string, StoredFile>()

	constructor(name: string) {
		this.name = name
	}

	addFile(
		name: string,
		fileOrContent: File | string,
		lastModified = Date.now(),
	) {
		let file =
			typeof fileOrContent === "string"
				? {
						content: fileOrContent,
						source: null,
						lastModified,
						type: inferMimeType(name),
					}
				: {
						content: null,
						source: fileOrContent,
						lastModified: fileOrContent.lastModified || lastModified,
						type: fileOrContent.type || inferMimeType(name),
					}

		this.files.set(name, file)
		this.children.set(
			name,
			new MockFileHandle(
				name,
				() => this.files.get(name),
				updated => this.files.set(name, updated),
			),
		)
	}

	addDirectory(name: string, directory: MockDirectoryHandle) {
		this.children.set(name, directory)
	}

	entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
		let iter = this.children.entries()
		return {
			async next() {
				let result = iter.next()
				if (result.done) return { done: true, value: undefined }
				return { done: false, value: result.value }
			},
			[Symbol.asyncIterator]() {
				return this
			},
		}
	}

	async getFileHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<FileSystemFileHandle> {
		let handle = this.children.get(name)
		if (!isFileHandle(handle)) {
			if (options?.create) {
				this.addFile(name, "")
				let created = this.children.get(name)
				if (!isFileHandle(created)) throw new Error("Failed creating file")
				return created
			}
			throw new Error(`File not found: ${name}`)
		}
		return handle
	}

	async getDirectoryHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<FileSystemDirectoryHandle> {
		let handle = this.children.get(name)
		if (!isDirectoryHandle(handle)) {
			if (options?.create) {
				let created = new MockDirectoryHandle(name)
				this.children.set(name, created)
				return created
			}
			throw new Error(`Directory not found: ${name}`)
		}
		return handle
	}

	async removeEntry(
		name: string,
		options?: { recursive?: boolean },
	): Promise<void> {
		let handle = this.children.get(name)
		if (!handle) return

		if (handle.kind === "directory" && !options?.recursive) {
			throw new Error("Directory removal requires recursive flag")
		}

		this.children.delete(name)
		this.files.delete(name)
	}

	resolve(): Promise<string[] | null> {
		return Promise.resolve([this.name])
	}

	queryPermission(): Promise<"granted"> {
		return Promise.resolve("granted")
	}

	requestPermission(): Promise<"granted"> {
		return Promise.resolve("granted")
	}

	isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return Promise.resolve(
			other.kind === "directory" && other.name === this.name,
		)
	}

	get [Symbol.toStringTag](): string {
		return "FileSystemDirectoryHandle"
	}
}

async function readFileAtPath(
	root: MockDirectoryHandle,
	relativePath: string,
): Promise<string> {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length === 0) throw new Error("Empty path")

	let dir: FileSystemDirectoryHandle = root
	for (let i = 0; i < parts.length - 1; i++) {
		dir = await dir.getDirectoryHandle(parts[i])
	}

	let fileHandle = await dir.getFileHandle(parts[parts.length - 1])
	let file = await fileHandle.getFile()
	return file.text()
}

async function removeFileAtPath(
	root: MockDirectoryHandle,
	relativePath: string,
): Promise<void> {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length === 0) throw new Error("Empty path")

	let dir: FileSystemDirectoryHandle = root
	for (let i = 0; i < parts.length - 1; i++) {
		dir = await dir.getDirectoryHandle(parts[i])
	}

	await dir.removeEntry(parts[parts.length - 1])
}

async function writeFileAtPath(
	root: MockDirectoryHandle,
	relativePath: string,
	content: string,
): Promise<void> {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length === 0) throw new Error("Empty path")

	let dir: FileSystemDirectoryHandle = root
	for (let i = 0; i < parts.length - 1; i++) {
		dir = await dir.getDirectoryHandle(parts[i], { create: true })
	}

	let fileHandle = await dir.getFileHandle(parts[parts.length - 1], {
		create: true,
	})
	let writable = await fileHandle.createWritable()
	await writable.write(content)
	await writable.close()
}

function basename(relativePath: string): string {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length === 0) return relativePath
	return parts[parts.length - 1]
}

function inferMimeType(filename: string): string {
	let lowered = filename.toLowerCase()
	if (lowered.endsWith(".mp4")) return "video/mp4"
	if (lowered.endsWith(".webm")) return "video/webm"
	if (lowered.endsWith(".png")) return "image/png"
	if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg"
	if (lowered.endsWith(".gif")) return "image/gif"
	if (lowered.endsWith(".webp")) return "image/webp"
	if (lowered.endsWith(".svg")) return "image/svg+xml"
	if (lowered.endsWith(".md")) return "text/markdown"
	return "application/octet-stream"
}
