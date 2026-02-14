import { beforeEach, describe, expect, it } from "vitest"
import { co, Group } from "jazz-tools"
import { createJazzTestAccount, setupJazzTestSync } from "jazz-tools/testing"
import { UserAccount, Document } from "@/schema"
import { getPath } from "@/editor/frontmatter"
import { getDocumentTitle } from "@/lib/document-utils"
import type { BackupDoc } from "./backup-sync"
import { readManifest } from "./backup-sync"
import { syncBackup, syncFromBackup } from "./backup"

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
			this.saveContent(new TextDecoder().decode(new Uint8Array(data)))
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
					this.saveContent(new TextDecoder().decode(new Uint8Array(nestedData)))
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
	private getContent: () => string
	private setContent: (content: string) => void
	private getLastModified: () => number
	private setLastModified: (lastModified: number) => void

	constructor(
		name: string,
		getContent: () => string,
		setContent: (content: string) => void,
		getLastModified: () => number,
		setLastModified: (lastModified: number) => void,
	) {
		this.name = name
		this.getContent = getContent
		this.setContent = setContent
		this.getLastModified = getLastModified
		this.setLastModified = setLastModified
	}

	async getFile(): Promise<File> {
		return new File([this.getContent()], this.name, {
			lastModified: this.getLastModified(),
		})
	}

	async createWritable(): Promise<FileSystemWritableFileStream> {
		return new MockWritableFileStream(content => {
			this.setContent(content)
			this.setLastModified(Date.now())
		})
	}

	isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return Promise.resolve(other.kind === "file" && other.name === this.name)
	}

	get [Symbol.toStringTag](): string {
		return "FileSystemFileHandle"
	}
}

interface StoredFile {
	content: string
	lastModified: number
}

function isDirectoryHandle(
	handle: FileSystemHandle | undefined,
): handle is MockDirectoryHandle {
	return handle?.kind === "directory"
}

function isFileHandle(
	handle: FileSystemHandle | undefined,
): handle is MockFileHandle {
	return handle?.kind === "file"
}

class MockDirectoryHandle implements FileSystemDirectoryHandle {
	kind = "directory" as const
	name: string
	private children = new Map<string, FileSystemHandle>()
	private files = new Map<string, StoredFile>()

	constructor(name: string) {
		this.name = name
	}

	addFile(name: string, content: string, lastModified = Date.now()) {
		this.files.set(name, { content, lastModified })
		let fileHandle = new MockFileHandle(
			name,
			() => this.files.get(name)?.content ?? "",
			updatedContent => {
				let entry = this.files.get(name)
				this.files.set(name, {
					content: updatedContent,
					lastModified: entry?.lastModified ?? Date.now(),
				})
			},
			() => this.files.get(name)?.lastModified ?? Date.now(),
			lastModifiedValue => {
				let entry = this.files.get(name)
				this.files.set(name, {
					content: entry?.content ?? "",
					lastModified: lastModifiedValue,
				})
			},
		)
		this.children.set(name, fileHandle)
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

type LoadedAccount = co.loaded<typeof UserAccount>
type LoadedDoc = co.loaded<typeof Document>

describe("backup scenarios", () => {
	let account: LoadedAccount
	let docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>
	let root: MockDirectoryHandle

	beforeEach(async () => {
		await setupJazzTestSync()
		account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let loaded = await account.$jazz.ensureLoaded({
			resolve: {
				root: {
					documents: {
						$each: {
							content: true,
							assets: { $each: { image: true, video: true } },
						},
					},
				},
			},
		})

		docs = loaded.root.documents
		root = new MockDirectoryHandle("root")
	})

	it("new doc in alkalye", async () => {
		let doc = await createDoc(docs, "# New Doc\n\nHello")
		await pushToBackup(root, docs)

		let manifest = await readManifest(root)
		expect(manifest?.entries.some(entry => entry.docId === doc.$jazz.id)).toBe(
			true,
		)
		expect(await hasFile(root, "New Doc.md")).toBe(true)
	})

	it("new doc locally", async () => {
		let initialCount = getLoadedDocs(docs).length
		root.addFile("Local Note.md", "# Local Note\n\nFrom filesystem", 2_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.created).toBe(1)

		let loadedDocs = getLoadedDocs(docs)
		expect(loadedDocs).toHaveLength(initialCount + 1)
		let imported = loadedDocs.find(d => getDocumentTitle(d) === "Local Note")
		expect(imported).toBeDefined()
	})

	it("renamed in alkalye", async () => {
		let doc = await createDoc(docs, "# Hello World")
		await pushToBackup(root, docs)
		expect(await hasFile(root, "Hello World.md")).toBe(true)

		if (!doc.content?.$isLoaded) throw new Error("Doc content not loaded")
		doc.content.$jazz.applyDiff("# Another Title")
		doc.$jazz.set("updatedAt", new Date(Date.now() + 2_000))
		await pushToBackup(root, docs)

		expect(await hasFile(root, "Another Title.md")).toBe(true)
		expect(await hasFile(root, "Hello World.md")).toBe(false)
	})

	it("renamed locally", async () => {
		let doc = await createDoc(docs, "# Hello")
		await pushToBackup(root, docs)
		let countBeforePull = getLoadedDocs(docs).length

		let oldFile = await readFile(root, "Hello.md")
		await removeFile(root, "Hello.md")
		root.addFile("Renamed Locally.md", oldFile, 5_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.created).toBe(0)

		let loadedDocs = getLoadedDocs(docs)
		expect(loadedDocs).toHaveLength(countBeforePull)
		expect(loadedDocs.some(d => d.$jazz.id === doc.$jazz.id)).toBe(true)
	})

	it("renamed folder locally updates path in alkalye", async () => {
		await createDoc(docs, "---\npath: work\n---\n\n# Folder Move")
		await pushToBackup(root, docs)

		let source = await readFile(root, "work/Folder Move.md")
		await removeFile(root, "work/Folder Move.md")
		root.addFile("archive/Folder Move.md", source, 8_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.updated).toBe(1)

		let loaded = getLoadedDocs(docs).find(
			d => getDocumentTitle(d) === "Folder Move",
		)
		expect(loaded).toBeDefined()
		expect(getPath(loaded?.content?.toString() ?? "")).toBe("archive")
	})

	it("changed path in alkalye", async () => {
		let doc = await createDoc(docs, "# Path Doc")
		await pushToBackup(root, docs)

		if (!doc.content?.$isLoaded) throw new Error("Doc content not loaded")
		doc.content.$jazz.applyDiff("---\npath: work/notes\n---\n\n# Path Doc")
		doc.$jazz.set("updatedAt", new Date(Date.now() + 3_000))
		await pushToBackup(root, docs)

		expect(await hasFile(root, "work/notes/Path Doc.md")).toBe(true)
		expect(await hasFile(root, "Path Doc.md")).toBe(false)
	})

	it("changed path locally is normalized to filesystem location", async () => {
		await createDoc(docs, "---\npath: work\n---\n\n# Local Path")
		await pushToBackup(root, docs)

		let source = "---\npath: notes\n---\n\n# Local Path"
		root.addFile("work/Local Path.md", source, 7_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.updated).toBeGreaterThanOrEqual(0)

		let loaded = getLoadedDocs(docs).find(
			d => getDocumentTitle(d) === "Local Path",
		)
		expect(loaded).toBeDefined()
		expect(getPath(loaded?.content?.toString() ?? "")).toBe("work")
	})

	it("deleted in alkalye", async () => {
		let doc = await createDoc(docs, "# Delete Me")
		await pushToBackup(root, docs)
		expect(await hasFile(root, "Delete Me.md")).toBe(true)

		doc.$jazz.set("deletedAt", new Date())
		doc.$jazz.set("updatedAt", new Date(Date.now() + 4_000))
		await pushToBackup(root, docs)

		expect(await hasFile(root, "Delete Me.md")).toBe(false)
		let manifest = await readManifest(root)
		expect(manifest?.entries.some(entry => entry.docId === doc.$jazz.id)).toBe(
			false,
		)
	})

	it("deleted locally", async () => {
		let doc = await createDoc(docs, "# Remove Local")
		await pushToBackup(root, docs)
		await removeFile(root, "Remove Local.md")

		let result = await syncFromBackup(root, docs, true)
		expect(result.deleted).toBe(1)

		let target = getLoadedDocs(docs).find(d => d.$jazz.id === doc.$jazz.id)
		expect(target?.deletedAt).toBeTruthy()
	})

	it("edited both locally and in alkalye keeps document accessible and stable", async () => {
		let doc = await createDoc(docs, "# Conflict\n\nbase")
		await pushToBackup(root, docs)

		if (!doc.content?.$isLoaded) throw new Error("Doc content not loaded")
		doc.content.$jazz.applyDiff("# Conflict\n\nbase\nfrom-alkalye")
		doc.$jazz.set("updatedAt", new Date(Date.now() + 5_000))

		let existing = await readFile(root, "Conflict.md")
		root.addFile("Conflict.md", `${existing}\nfrom-local`, 9_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.errors).toHaveLength(0)

		let loaded = getLoadedDocs(docs).find(d => d.$jazz.id === doc.$jazz.id)
		expect(loaded).toBeDefined()
		expect(loaded?.deletedAt).toBeFalsy()
		expect(loaded?.content?.toString()).toContain("Conflict")
	})
})

function getLoadedDocs(
	docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>,
): LoadedDoc[] {
	let result: LoadedDoc[] = []
	for (let doc of docs) {
		if (doc?.$isLoaded) result.push(doc)
	}
	return result
}

async function createDoc(
	docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>,
	content: string,
): Promise<LoadedDoc> {
	let group = Group.create()
	let now = new Date()
	let doc = Document.create(
		{
			version: 1,
			content: co.plainText().create(content, group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)
	docs.$jazz.push(doc)
	return doc
}

async function pushToBackup(
	handle: FileSystemDirectoryHandle,
	docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>,
): Promise<void> {
	let backupDocs: BackupDoc[] = []

	for (let doc of docs) {
		if (!doc?.$isLoaded || doc.deletedAt) continue
		let content = doc.content?.toString() ?? ""
		backupDocs.push({
			id: doc.$jazz.id,
			title: getDocumentTitle(doc),
			content,
			path: getPath(content),
			updatedAtMs: doc.updatedAt?.getTime() ?? 0,
			assets: [],
		})
	}

	await syncBackup(handle, backupDocs)
}

async function hasFile(
	root: MockDirectoryHandle,
	relativePath: string,
): Promise<boolean> {
	try {
		await readFile(root, relativePath)
		return true
	} catch {
		return false
	}
}

async function readFile(
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

async function removeFile(
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
