import { describe, it, expect } from "vitest"
import {
	computeDocLocations,
	transformContentForBackup,
	computeExpectedStructure,
	scanBackupFolder,
	transformContentForImport,
	readManifest,
	writeManifest,
	type BackupManifest,
	type BackupDoc,
} from "./backup-sync"
import {
	MockDirectoryHandle,
	createMockBlob,
	createMockFile,
} from "./backup-test-helpers"

// =============================================================================
// Compute Doc Locations
// =============================================================================

describe("computeDocLocations", () => {
	function createDoc(input: {
		id: string
		title: string
		path: string | null
		assets?: { id: string; name: string; blob: Blob }[]
	}): BackupDoc {
		return {
			id: input.id,
			title: input.title,
			content: "# Content",
			path: input.path,
			updatedAtMs: 0,
			assets: input.assets ?? [],
		}
	}

	it("uses title.md for root docs without assets", () => {
		let docs = [createDoc({ id: "d1", title: "Hello World", path: null })]
		let locations = computeDocLocations(docs)
		let loc = locations.get("d1")

		expect(loc?.dirPath).toBe("")
		expect(loc?.filename).toBe("Hello World.md")
		expect(loc?.hasOwnFolder).toBe(false)
	})

	it("creates doc folder for docs with assets", () => {
		let docs = [
			createDoc({
				id: "d1",
				title: "Project Note",
				path: null,
				assets: [{ id: "a1", name: "Image", blob: createMockBlob("img") }],
			}),
		]
		let locations = computeDocLocations(docs)
		let loc = locations.get("d1")

		expect(loc?.dirPath).toBe("Project Note")
		expect(loc?.filename).toBe("Project Note.md")
		expect(loc?.hasOwnFolder).toBe(true)
	})

	it("disambiguates title collisions in same folder", () => {
		let docs = [
			createDoc({ id: "doc-11111111", title: "Same", path: "work" }),
			createDoc({ id: "doc-22222222", title: "Same", path: "work" }),
		]
		let locations = computeDocLocations(docs)
		let first = locations.get("doc-11111111")
		let second = locations.get("doc-22222222")

		expect(first?.filename).toBe("Same.md")
		expect(second?.filename).toContain("Same")
		expect(second?.filename).toContain("22222222")
	})

	it("does not disambiguate same title in different folders", () => {
		let docs = [
			createDoc({ id: "d1", title: "Same", path: "work" }),
			createDoc({ id: "d2", title: "Same", path: "personal" }),
		]
		let locations = computeDocLocations(docs)

		expect(locations.get("d1")?.filename).toBe("Same.md")
		expect(locations.get("d2")?.filename).toBe("Same.md")
	})

	it("disambiguates duplicate asset filenames", () => {
		let docs = [
			createDoc({
				id: "d1",
				title: "Assets",
				path: null,
				assets: [
					{ id: "a1", name: "shot", blob: createMockBlob("one") },
					{ id: "a2", name: "shot", blob: createMockBlob("two") },
				],
			}),
		]
		let locations = computeDocLocations(docs)
		let loc = locations.get("d1")

		expect(loc?.assetFiles.get("a1")).toBeDefined()
		expect(loc?.assetFiles.get("a2")).toBeDefined()
		expect(loc?.assetFiles.get("a1")).not.toBe(loc?.assetFiles.get("a2"))
	})

	it("assigns stable duplicate asset filenames regardless of asset order", () => {
		let docForward = createDoc({
			id: "d1",
			title: "Assets",
			path: null,
			assets: [
				{ id: "a1", name: "shot", blob: createMockBlob("one") },
				{ id: "a2", name: "shot", blob: createMockBlob("two") },
			],
		})
		let docReverse = createDoc({
			id: "d1",
			title: "Assets",
			path: null,
			assets: [
				{ id: "a2", name: "shot", blob: createMockBlob("two") },
				{ id: "a1", name: "shot", blob: createMockBlob("one") },
			],
		})

		let forwardLoc = computeDocLocations([docForward]).get("d1")
		let reverseLoc = computeDocLocations([docReverse]).get("d1")

		expect(forwardLoc?.assetFiles.get("a1")).toBe(
			reverseLoc?.assetFiles.get("a1"),
		)
		expect(forwardLoc?.assetFiles.get("a2")).toBe(
			reverseLoc?.assetFiles.get("a2"),
		)
	})

	it("assigns stable collision filenames regardless of input order", () => {
		let first: BackupDoc = {
			id: "doc-aaaa1111",
			title: "Same",
			content: "x",
			path: "work",
			updatedAtMs: 0,
			assets: [],
		}
		let second: BackupDoc = {
			id: "doc-bbbb2222",
			title: "Same",
			content: "x",
			path: "work",
			updatedAtMs: 0,
			assets: [],
		}

		let forward = computeDocLocations([first, second])
		let reverse = computeDocLocations([second, first])

		expect(forward.get(first.id)?.filename).toBe(
			reverse.get(first.id)?.filename,
		)
		expect(forward.get(second.id)?.filename).toBe(
			reverse.get(second.id)?.filename,
		)
	})
})

// =============================================================================
// Transform Content for Backup
// =============================================================================

describe("transformContentForBackup", () => {
	it("transforms asset: references to assets paths", () => {
		let assetFiles = new Map([
			["asset1", "photo.png"],
			["asset2", "clip.jpg"],
		])
		let content = "![A](asset:asset1)\n![B](asset:asset2)"

		let result = transformContentForBackup(content, assetFiles)

		expect(result).toContain("![A](assets/photo.png)")
		expect(result).toContain("![B](assets/clip.jpg)")
	})

	it("keeps unmatched asset references unchanged", () => {
		let assetFiles = new Map([["asset1", "photo.png"]])
		let content = "![A](asset:missing)"

		let result = transformContentForBackup(content, assetFiles)

		expect(result).toBe("![A](asset:missing)")
	})
})

// =============================================================================
// Compute Expected Structure
// =============================================================================

describe("computeExpectedStructure", () => {
	it("includes parent directories and markdown files", () => {
		let docs: BackupDoc[] = [
			{
				id: "d1",
				title: "Note",
				content: "x",
				path: "work/notes",
				updatedAtMs: 0,
				assets: [],
			},
		]
		let locations = computeDocLocations(docs)
		let expected = computeExpectedStructure(docs, locations)

		expect(expected.expectedPaths.has("work")).toBe(true)
		expect(expected.expectedPaths.has("work/notes")).toBe(true)
		expect(expected.expectedFiles.get("work/notes")?.has("Note.md")).toBe(true)
	})

	it("includes assets folder for docs with assets", () => {
		let docs: BackupDoc[] = [
			{
				id: "d1",
				title: "Note",
				content: "x",
				path: "work",
				updatedAtMs: 0,
				assets: [{ id: "a1", name: "image", blob: createMockBlob("img") }],
			},
		]
		let locations = computeDocLocations(docs)
		let expected = computeExpectedStructure(docs, locations)

		expect(expected.expectedPaths.has("work/Note")).toBe(true)
		expect(expected.expectedPaths.has("work/Note/assets")).toBe(true)
	})
})

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

		root.addFile(".alkalye-manifest.json", JSON.stringify(manifest))

		let result = await readManifest(root)

		expect(result).not.toBeNull()
		expect(result!.version).toBe(1)
		expect(result!.entries).toHaveLength(1)
		expect(result!.entries[0].docId).toBe("doc1")
	})

	it("returns null for invalid version", async () => {
		let root = new MockDirectoryHandle("root")
		let invalidManifest = { version: 2, entries: [] }

		root.addFile(".alkalye-manifest.json", JSON.stringify(invalidManifest))

		let result = await readManifest(root)

		expect(result).toBeNull()
	})

	it("returns null for invalid entries shape", async () => {
		let root = new MockDirectoryHandle("root")
		let invalidManifest = {
			version: 1,
			entries: [{ docId: "d1" }],
			lastSyncAt: new Date().toISOString(),
		}

		root.addFile(".alkalye-manifest.json", JSON.stringify(invalidManifest))

		let result = await readManifest(root)

		expect(result).toBeNull()
	})

	it("returns null for malformed JSON", async () => {
		let root = new MockDirectoryHandle("root")
		root.addFile(".alkalye-manifest.json", "{invalid")

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

	it("returns files in stable lexicographic order", async () => {
		let root = new MockDirectoryHandle("root")
		root.addFile("z-last.md", createMockFile("# z"))
		root.addFile("a-first.md", createMockFile("# a"))

		let files = await scanBackupFolder(root)

		expect(files.map(file => file.relativePath)).toEqual([
			"a-first.md",
			"z-last.md",
		])
	})

	it("scans markdown extension case-insensitively", async () => {
		let root = new MockDirectoryHandle("root")
		root.addFile("UPPER.MD", createMockFile("# Upper"))

		let files = await scanBackupFolder(root)

		expect(files).toHaveLength(1)
		expect(files[0].name).toBe("UPPER")
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
		assetsDir.addFile("photo.png", "image data")

		let files = await scanBackupFolder(root)

		expect(files).toHaveLength(1)
		expect(files[0].assets).toHaveLength(1)
		expect(files[0].assets[0].name).toBe("photo.png")
	})

	it("loads only referenced assets for each markdown file", async () => {
		let root = new MockDirectoryHandle("root")
		root.addFile("Doc One.md", createMockFile("![One](assets/one.png)"))
		root.addFile("Doc Two.md", createMockFile("No assets here"))

		let assetsDir = new MockDirectoryHandle("assets")
		assetsDir.addFile("one.png", "1")
		assetsDir.addFile("two.png", "2")
		root.addDirectory("assets", assetsDir)

		let files = await scanBackupFolder(root)
		let byName = new Map(files.map(file => [file.name, file]))

		expect(byName.get("Doc One")?.assets.map(asset => asset.name)).toEqual([
			"one.png",
		])
		expect(byName.get("Doc Two")?.assets).toHaveLength(0)
	})

	it("does not import markdown files inside assets directories", async () => {
		let root = new MockDirectoryHandle("root")
		let docDir = new MockDirectoryHandle("Doc")
		let assetsDir = new MockDirectoryHandle("assets")
		docDir.addDirectory("assets", assetsDir)
		root.addDirectory("Doc", docDir)
		docDir.addFile("Doc.md", createMockFile("# Doc"))
		assetsDir.addFile("notes.md", createMockFile("# Should stay asset"))

		let files = await scanBackupFolder(root)

		expect(files.map(file => file.relativePath)).toEqual(["Doc/Doc.md"])
	})

	it("scans docs inside top-level assets folder when it is a normal directory", async () => {
		let root = new MockDirectoryHandle("root")
		let assetsDir = new MockDirectoryHandle("assets")
		root.addDirectory("assets", assetsDir)
		assetsDir.addFile("Roadmap.md", createMockFile("# Roadmap"))

		let files = await scanBackupFolder(root)

		expect(files.map(file => file.relativePath)).toEqual(["assets/Roadmap.md"])
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
		root.addFile(".alkalye-manifest.json", '{"version":1}')
		root.addFile("Test.md", createMockFile("# Test"))

		let files = await scanBackupFolder(root)

		expect(files).toHaveLength(1)
		expect(files[0].name).toBe("Test")
	})

	it("skips hidden markdown files", async () => {
		let root = new MockDirectoryHandle("root")
		root.addFile(".hidden.md", createMockFile("# Hidden"))
		root.addFile("Visible.md", createMockFile("# Visible"))

		let files = await scanBackupFolder(root)

		expect(files.map(file => file.relativePath)).toEqual(["Visible.md"])
	})

	it("captures lastModified timestamp", async () => {
		let root = new MockDirectoryHandle("root")
		let timestamp = 1234567890000
		root.addFile("Test.md", createMockFile("# Test"), timestamp)

		let files = await scanBackupFolder(root)

		expect(files[0].lastModified).toBe(timestamp)
	})
})
