import { describe, it, expect } from "vitest"
import {
	scanBackupFolder,
	transformContentForImport,
	readManifest,
	writeManifest,
	type BackupManifest,
} from "./backup-sync"

// =============================================================================
// Test Helpers
// =============================================================================

function createMockFile(content: string, lastModified = Date.now()): File {
	return new File([content], "test.md", { lastModified })
}

function createMockBlob(content: string, type = "image/png"): Blob {
	return new Blob([content], { type })
}

// Mock FileSystemDirectoryHandle for testing
class MockDirectoryHandle implements FileSystemDirectoryHandle {
	kind = "directory" as const
	name: string
	private children = new Map<
		string,
		FileSystemFileHandle | FileSystemDirectoryHandle
	>()

	constructor(name: string) {
		this.name = name
	}

	private fileContents = new Map<string, string>()

	addFile(name: string, file: File) {
		let self = this
		let mockHandle: FileSystemFileHandle = {
			kind: "file",
			name,
			async getFile() {
				// Check if there's saved content from writeManifest
				let content = self.fileContents.get(name)
				if (content !== undefined) {
					return new File([content], name)
				}
				return file
			},
			async createWritable() {
				return {
					async write(data: string | Blob) {
						let content = typeof data === "string" ? data : await data.text()
						self.fileContents.set(name, content)
					},
					async close() {},
				}
			},
		} as unknown as FileSystemFileHandle
		this.children.set(name, mockHandle)
	}

	addDirectory(name: string, dir: FileSystemDirectoryHandle) {
		this.children.set(name, dir)
	}

	entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
		let iter = this.children.entries()
		return {
			async next() {
				let result = iter.next()
				return result.done
					? { done: true, value: undefined }
					: { done: false, value: result.value }
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
		let self = this
		let handle = this.children.get(name)
		if (!handle || handle.kind !== "file") {
			if (options?.create) {
				let mockHandle: FileSystemFileHandle = {
					kind: "file",
					name,
					async getFile() {
						let content = self.fileContents.get(name)
						return new File([content ?? ""], name)
					},
					async createWritable() {
						return {
							async write(data: string | Blob) {
								let content =
									typeof data === "string" ? data : await data.text()
								self.fileContents.set(name, content)
							},
							async close() {},
						}
					},
				} as unknown as FileSystemFileHandle
				this.children.set(name, mockHandle)
				return mockHandle
			}
			throw new Error(`File not found: ${name}`)
		}
		return handle as FileSystemFileHandle
	}

	async getDirectoryHandle(
		name: string,
		options?: { create?: boolean },
	): Promise<FileSystemDirectoryHandle> {
		let handle = this.children.get(name)
		if (!handle || handle.kind !== "directory") {
			if (options?.create) {
				let newDir = new MockDirectoryHandle(name)
				this.children.set(name, newDir)
				return newDir
			}
			throw new Error(`Directory not found: ${name}`)
		}
		return handle as FileSystemDirectoryHandle
	}

	removeEntry(): Promise<void> {
		return Promise.resolve()
	}

	resolve(): Promise<string[] | null> {
		return Promise.resolve([this.name])
	}

	isSameEntry(other: FileSystemHandle): Promise<boolean> {
		return Promise.resolve(this.name === other.name)
	}

	queryPermission(): Promise<"granted"> {
		return Promise.resolve("granted")
	}

	requestPermission(): Promise<"granted"> {
		return Promise.resolve("granted")
	}

	get [Symbol.toStringTag](): string {
		return "FileSystemDirectoryHandle"
	}
}

// =============================================================================
// Transform Content for Import
// =============================================================================

describe("transformContentForImport", () => {
	it("transforms asset paths to asset: references", () => {
		let assetFiles = new Map([
			["asset1", "image.png"],
			["asset2", "photo.jpg"],
		])

		let content = `# Test

![Screenshot](assets/image.png)
![Photo](assets/photo.jpg)
`

		let result = transformContentForImport(content, assetFiles)

		expect(result).toContain("![Screenshot](asset:asset1)")
		expect(result).toContain("![Photo](asset:asset2)")
	})

	it("preserves non-asset references", () => {
		let assetFiles = new Map([["asset1", "image.png"]])

		let content = `# Test

![External](https://example.com/img.png)
![Local](./local/image.png)
![Asset](assets/image.png)
`

		let result = transformContentForImport(content, assetFiles)

		expect(result).toContain("https://example.com/img.png")
		expect(result).toContain("./local/image.png")
		expect(result).toContain("asset:asset1")
	})

	it("keeps unknown asset paths unchanged", () => {
		let assetFiles = new Map([["asset1", "image.png"]])

		let content = `![Unknown](assets/unknown.jpg)`

		let result = transformContentForImport(content, assetFiles)

		expect(result).toBe(`![Unknown](assets/unknown.jpg)`)
	})
})

// =============================================================================
// Manifest Read/Write
// =============================================================================

describe("readManifest", () => {
	it("returns null when manifest file does not exist", async () => {
		let root = new MockDirectoryHandle("root")

		let result = await readManifest(root)

		expect(result).toBeNull()
	})

	it("reads and parses valid manifest", async () => {
		let root = new MockDirectoryHandle("root")
		let manifest: BackupManifest = {
			version: 1,
			entries: [
				{
					docId: "doc1",
					relativePath: "Test.md",
					contentHash: "abc123",
					lastSyncedAt: new Date().toISOString(),
					assets: [],
				},
			],
			lastSyncAt: new Date().toISOString(),
		}

		root.addFile(
			".alkalye-manifest.json",
			new File([JSON.stringify(manifest)], ".alkalye-manifest.json"),
		)

		let result = await readManifest(root)

		expect(result).not.toBeNull()
		expect(result!.version).toBe(1)
		expect(result!.entries).toHaveLength(1)
		expect(result!.entries[0].docId).toBe("doc1")
	})

	it("returns null for invalid version", async () => {
		let root = new MockDirectoryHandle("root")
		let invalidManifest = { version: 2, entries: [] }

		root.addFile(
			".alkalye-manifest.json",
			new File([JSON.stringify(invalidManifest)], ".alkalye-manifest.json"),
		)

		let result = await readManifest(root)

		expect(result).toBeNull()
	})
})

describe("writeManifest", () => {
	it("writes manifest to directory", async () => {
		let root = new MockDirectoryHandle("root")
		let manifest: BackupManifest = {
			version: 1,
			entries: [
				{
					docId: "doc1",
					relativePath: "Test.md",
					contentHash: "abc123",
					lastSyncedAt: "2024-01-01T00:00:00Z",
					assets: [],
				},
			],
			lastSyncAt: "2024-01-01T00:00:00Z",
		}

		await writeManifest(root, manifest)

		let written = await readManifest(root)
		expect(written).not.toBeNull()
		expect(written!.entries[0].docId).toBe("doc1")
	})
})

// =============================================================================
// Scan Backup Folder
// =============================================================================

describe("scanBackupFolder", () => {
	it("scans markdown files at root level", async () => {
		let root = new MockDirectoryHandle("root")
		root.addFile("Test.md", createMockFile("# Test Content"))
		root.addFile("Another.md", createMockFile("# Another"))

		let files = await scanBackupFolder(root)

		expect(files).toHaveLength(2)
		let names = files.map(f => f.name).sort()
		expect(names).toEqual(["Another", "Test"])
	})

	it("recursively scans nested directories", async () => {
		let root = new MockDirectoryHandle("root")
		let workDir = new MockDirectoryHandle("work")
		let notesDir = new MockDirectoryHandle("notes")

		workDir.addDirectory("notes", notesDir)
		root.addDirectory("work", workDir)

		root.addFile("Root.md", createMockFile("# Root"))
		workDir.addFile("Work.md", createMockFile("# Work"))
		notesDir.addFile("Notes.md", createMockFile("# Notes"))

		let files = await scanBackupFolder(root)

		let paths = files.map(f => f.relativePath).sort()
		expect(paths).toEqual(["Root.md", "work/Work.md", "work/notes/Notes.md"])
	})

	it("collects assets from assets folders", async () => {
		let root = new MockDirectoryHandle("root")
		let docDir = new MockDirectoryHandle("My Doc")

		root.addDirectory("My Doc", docDir)
		let assetsDir = new MockDirectoryHandle("assets")
		docDir.addDirectory("assets", assetsDir)

		docDir.addFile(
			"My Doc.md",
			createMockFile("# My Doc\n\n![Image](assets/photo.png)"),
		)
		assetsDir.addFile(
			"photo.png",
			new File([createMockBlob("image data")], "photo.png"),
		)

		let files = await scanBackupFolder(root)

		expect(files).toHaveLength(1)
		expect(files[0].assets).toHaveLength(1)
		expect(files[0].assets[0].name).toBe("photo.png")
	})

	it("skips dot directories", async () => {
		let root = new MockDirectoryHandle("root")
		let hiddenDir = new MockDirectoryHandle(".hidden")

		root.addDirectory(".hidden", hiddenDir)
		hiddenDir.addFile("Hidden.md", createMockFile("# Hidden"))
		root.addFile("Visible.md", createMockFile("# Visible"))

		let files = await scanBackupFolder(root)

		expect(files).toHaveLength(1)
		expect(files[0].name).toBe("Visible")
	})

	it("skips manifest file", async () => {
		let root = new MockDirectoryHandle("root")
		root.addFile(
			".alkalye-manifest.json",
			new File(['{"version":1}'], ".alkalye-manifest.json"),
		)
		root.addFile("Test.md", createMockFile("# Test"))

		let files = await scanBackupFolder(root)

		expect(files).toHaveLength(1)
		expect(files[0].name).toBe("Test")
	})

	it("captures lastModified timestamp", async () => {
		let root = new MockDirectoryHandle("root")
		let timestamp = 1234567890000
		root.addFile("Test.md", createMockFile("# Test", timestamp))

		let files = await scanBackupFolder(root)

		expect(files[0].lastModified).toBe(timestamp)
	})
})
