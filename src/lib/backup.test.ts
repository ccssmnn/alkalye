import { describe, it, expect } from "vitest"
import {
	computeDocLocations,
	transformContentForBackup,
	computeExpectedStructure,
	type BackupDoc,
} from "./backup-sync"

// =============================================================================
// Test Helpers
// =============================================================================

function createBackupDoc(
	overrides: Partial<BackupDoc> & { id: string },
): BackupDoc {
	return {
		title: "Test Doc",
		content: "# Test\n\nContent",
		path: null,
		assets: [],
		...overrides,
	}
}

function createBlob(type = "image/png"): Blob {
	return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type })
}

// =============================================================================
// Document Location Computation
// =============================================================================

describe("computeDocLocations", () => {
	describe("docs without assets", () => {
		it("places doc at root with no path", () => {
			let docs = [createBackupDoc({ id: "doc1", title: "My Doc" })]
			let locations = computeDocLocations(docs)

			expect(locations.get("doc1")).toEqual({
				dirPath: "",
				filename: "My Doc.md",
				hasOwnFolder: false,
				assetFiles: new Map(),
			})
		})

		it("places doc in path directory", () => {
			let docs = [
				createBackupDoc({ id: "doc1", title: "My Doc", path: "work/notes" }),
			]
			let locations = computeDocLocations(docs)

			expect(locations.get("doc1")).toEqual({
				dirPath: "work/notes",
				filename: "My Doc.md",
				hasOwnFolder: false,
				assetFiles: new Map(),
			})
		})
	})

	describe("docs with assets", () => {
		it("creates own folder at root", () => {
			let docs = [
				createBackupDoc({
					id: "doc1",
					title: "My Doc",
					assets: [{ id: "asset1", name: "image", blob: createBlob() }],
				}),
			]
			let locations = computeDocLocations(docs)

			let loc = locations.get("doc1")!
			expect(loc.dirPath).toBe("My Doc")
			expect(loc.filename).toBe("My Doc.md")
			expect(loc.hasOwnFolder).toBe(true)
			expect(loc.assetFiles.get("asset1")).toBe("image.png")
		})

		it("creates own folder within path", () => {
			let docs = [
				createBackupDoc({
					id: "doc1",
					title: "My Doc",
					path: "work/notes",
					assets: [{ id: "asset1", name: "image", blob: createBlob() }],
				}),
			]
			let locations = computeDocLocations(docs)

			let loc = locations.get("doc1")!
			expect(loc.dirPath).toBe("work/notes/My Doc")
			expect(loc.filename).toBe("My Doc.md")
			expect(loc.hasOwnFolder).toBe(true)
		})
	})

	describe("name conflict handling", () => {
		it("adds short id suffix for duplicate names at same level", () => {
			let docs = [
				createBackupDoc({ id: "doc1_abcd1234", title: "Notes" }),
				createBackupDoc({ id: "doc2_efgh5678", title: "Notes" }),
			]
			let locations = computeDocLocations(docs)

			expect(locations.get("doc1_abcd1234")?.filename).toBe("Notes.md")
			expect(locations.get("doc2_efgh5678")?.filename).toBe(
				"Notes (efgh5678).md",
			)
		})

		it("allows same name in different paths", () => {
			let docs = [
				createBackupDoc({ id: "doc1", title: "Notes", path: "work" }),
				createBackupDoc({ id: "doc2", title: "Notes", path: "personal" }),
			]
			let locations = computeDocLocations(docs)

			expect(locations.get("doc1")?.filename).toBe("Notes.md")
			expect(locations.get("doc2")?.filename).toBe("Notes.md")
		})

		it("handles case-insensitive conflicts", () => {
			let docs = [
				createBackupDoc({ id: "doc1_aaaaaaaa", title: "Notes" }),
				createBackupDoc({ id: "doc2_bbbbbbbb", title: "NOTES" }),
			]
			let locations = computeDocLocations(docs)

			expect(locations.get("doc1_aaaaaaaa")?.filename).toBe("Notes.md")
			expect(locations.get("doc2_bbbbbbbb")?.filename).toBe(
				"NOTES (bbbbbbbb).md",
			)
		})
	})

	describe("asset filename handling", () => {
		it("uses correct extension from blob type", () => {
			let docs = [
				createBackupDoc({
					id: "doc1",
					title: "Doc",
					assets: [
						{ id: "a1", name: "photo", blob: createBlob("image/jpeg") },
						{ id: "a2", name: "icon", blob: createBlob("image/svg+xml") },
						{ id: "a3", name: "pic", blob: createBlob("image/webp") },
					],
				}),
			]
			let locations = computeDocLocations(docs)

			let loc = locations.get("doc1")!
			expect(loc.assetFiles.get("a1")).toBe("photo.jpg")
			expect(loc.assetFiles.get("a2")).toBe("icon.svg")
			expect(loc.assetFiles.get("a3")).toBe("pic.webp")
		})

		it("handles duplicate asset names with counters", () => {
			let docs = [
				createBackupDoc({
					id: "doc1",
					title: "Doc",
					assets: [
						{ id: "a1", name: "image", blob: createBlob() },
						{ id: "a2", name: "image", blob: createBlob() },
						{ id: "a3", name: "image", blob: createBlob() },
					],
				}),
			]
			let locations = computeDocLocations(docs)

			let loc = locations.get("doc1")!
			expect(loc.assetFiles.get("a1")).toBe("image.png")
			expect(loc.assetFiles.get("a2")).toBe("image-1.png")
			expect(loc.assetFiles.get("a3")).toBe("image-2.png")
		})

		it("sanitizes asset filenames", () => {
			let docs = [
				createBackupDoc({
					id: "doc1",
					title: "Doc",
					assets: [
						{ id: "a1", name: "my:file/name", blob: createBlob() },
						{ id: "a2", name: "", blob: createBlob() },
					],
				}),
			]
			let locations = computeDocLocations(docs)

			let loc = locations.get("doc1")!
			expect(loc.assetFiles.get("a1")).toBe("my_file_name.png")
			// Empty name gets sanitized to "untitled" by sanitizeFilename
			expect(loc.assetFiles.get("a2")).toBe("untitled.png")
		})
	})

	describe("title sanitization", () => {
		it("sanitizes filesystem-unsafe characters", () => {
			let docs = [
				createBackupDoc({
					id: "doc1",
					title: 'What: "A Title?" <test>',
				}),
			]
			let locations = computeDocLocations(docs)

			expect(locations.get("doc1")?.filename).toBe("What_ _A Title__ _test_.md")
		})

		it("handles empty title", () => {
			let docs = [createBackupDoc({ id: "doc1", title: "" })]
			let locations = computeDocLocations(docs)

			expect(locations.get("doc1")?.filename).toBe("untitled.md")
		})
	})
})

// =============================================================================
// Content Transformation
// =============================================================================

describe("transformContentForBackup", () => {
	it("transforms asset: references to local paths", () => {
		let assetFiles = new Map([
			["asset123", "screenshot.png"],
			["asset456", "diagram.jpg"],
		])
		let content = `# My Doc

Here's an image: ![Screenshot](asset:asset123)

And another: ![Diagram](asset:asset456)
`
		let result = transformContentForBackup(content, assetFiles)

		expect(result).toBe(`# My Doc

Here's an image: ![Screenshot](assets/screenshot.png)

And another: ![Diagram](assets/diagram.jpg)
`)
	})

	it("preserves non-asset references", () => {
		let content = `![External](https://example.com/img.png)
![Local](./local/image.png)
![Asset](asset:abc123)
`
		let assetFiles = new Map([["abc123", "image.png"]])
		let result = transformContentForBackup(content, assetFiles)

		expect(result).toContain("https://example.com/img.png")
		expect(result).toContain("./local/image.png")
		expect(result).toContain("assets/image.png")
	})

	it("leaves unknown asset references unchanged", () => {
		let content = "![Unknown](asset:unknown123)"
		let assetFiles = new Map<string, string>()
		let result = transformContentForBackup(content, assetFiles)

		expect(result).toBe("![Unknown](asset:unknown123)")
	})

	it("handles multiple references to same asset", () => {
		let content = `![First](asset:abc)
![Second](asset:abc)
`
		let assetFiles = new Map([["abc", "image.png"]])
		let result = transformContentForBackup(content, assetFiles)

		expect(result).toBe(`![First](assets/image.png)
![Second](assets/image.png)
`)
	})
})

// =============================================================================
// Expected Structure Computation
// =============================================================================

describe("computeExpectedStructure", () => {
	it("returns empty for docs at root without assets", () => {
		let docs = [createBackupDoc({ id: "doc1", title: "Doc" })]
		let locations = computeDocLocations(docs)
		let structure = computeExpectedStructure(docs, locations)

		expect(structure.expectedPaths.size).toBe(0)
		expect(structure.expectedFiles.get("")?.has("Doc.md")).toBe(true)
	})

	it("includes path directories for nested docs", () => {
		let docs = [
			createBackupDoc({ id: "doc1", title: "Doc", path: "work/notes" }),
		]
		let locations = computeDocLocations(docs)
		let structure = computeExpectedStructure(docs, locations)

		expect(structure.expectedPaths.has("work")).toBe(true)
		expect(structure.expectedPaths.has("work/notes")).toBe(true)
		expect(structure.expectedFiles.get("work/notes")?.has("Doc.md")).toBe(true)
	})

	it("includes doc folder and assets for docs with assets", () => {
		let docs = [
			createBackupDoc({
				id: "doc1",
				title: "Doc",
				assets: [{ id: "a1", name: "img", blob: createBlob() }],
			}),
		]
		let locations = computeDocLocations(docs)
		let structure = computeExpectedStructure(docs, locations)

		expect(structure.expectedPaths.has("Doc")).toBe(true)
		expect(structure.expectedPaths.has("Doc/assets")).toBe(true)
		expect(structure.expectedFiles.get("Doc")?.has("Doc.md")).toBe(true)
	})

	it("handles mixed structure correctly", () => {
		let docs = [
			createBackupDoc({ id: "doc1", title: "Simple" }),
			createBackupDoc({
				id: "doc2",
				title: "With Assets",
				assets: [{ id: "a1", name: "img", blob: createBlob() }],
			}),
			createBackupDoc({ id: "doc3", title: "Nested", path: "work" }),
			createBackupDoc({
				id: "doc4",
				title: "Nested Assets",
				path: "work",
				assets: [{ id: "a2", name: "img", blob: createBlob() }],
			}),
		]
		let locations = computeDocLocations(docs)
		let structure = computeExpectedStructure(docs, locations)

		// Root level
		expect(structure.expectedFiles.get("")?.has("Simple.md")).toBe(true)
		expect(structure.expectedPaths.has("With Assets")).toBe(true)
		expect(structure.expectedPaths.has("With Assets/assets")).toBe(true)

		// Work path
		expect(structure.expectedPaths.has("work")).toBe(true)
		expect(structure.expectedFiles.get("work")?.has("Nested.md")).toBe(true)
		expect(structure.expectedPaths.has("work/Nested Assets")).toBe(true)
		expect(structure.expectedPaths.has("work/Nested Assets/assets")).toBe(true)
	})
})

// =============================================================================
// Integration-style tests for backup structure
// =============================================================================

describe("backup structure", () => {
	it("produces correct structure for typical backup", () => {
		let docs = [
			createBackupDoc({
				id: "doc1",
				title: "Meeting Notes",
				path: "work",
				content: "# Meeting Notes\n\nTook some notes",
			}),
			createBackupDoc({
				id: "doc2",
				title: "Project Plan",
				path: "work",
				content: "# Project\n\n![Diagram](asset:diag1)",
				assets: [{ id: "diag1", name: "diagram", blob: createBlob() }],
			}),
			createBackupDoc({
				id: "doc3",
				title: "Personal Journal",
				content: "# Journal\n\nToday was good",
			}),
		]

		let locations = computeDocLocations(docs)
		let structure = computeExpectedStructure(docs, locations)

		// Check locations
		expect(locations.get("doc1")).toMatchObject({
			dirPath: "work",
			filename: "Meeting Notes.md",
			hasOwnFolder: false,
		})
		expect(locations.get("doc2")).toMatchObject({
			dirPath: "work/Project Plan",
			filename: "Project Plan.md",
			hasOwnFolder: true,
		})
		expect(locations.get("doc3")).toMatchObject({
			dirPath: "",
			filename: "Personal Journal.md",
			hasOwnFolder: false,
		})

		// Check structure
		expect(structure.expectedPaths.has("work")).toBe(true)
		expect(structure.expectedPaths.has("work/Project Plan")).toBe(true)
		expect(structure.expectedPaths.has("work/Project Plan/assets")).toBe(true)
		expect(structure.expectedFiles.get("")?.has("Personal Journal.md")).toBe(
			true,
		)
		expect(structure.expectedFiles.get("work")?.has("Meeting Notes.md")).toBe(
			true,
		)
		expect(
			structure.expectedFiles.get("work/Project Plan")?.has("Project Plan.md"),
		).toBe(true)

		// Check content transformation
		let doc2Loc = locations.get("doc2")!
		let transformed = transformContentForBackup(
			docs[1].content,
			doc2Loc.assetFiles,
		)
		expect(transformed).toContain("![Diagram](assets/diagram.png)")
	})
})
