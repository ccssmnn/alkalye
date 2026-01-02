import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import {
	importMarkdownFiles,
	importFolderFiles,
	type FileWithPath,
} from "./import"

// =============================================================================
// Helper functions
// =============================================================================

function createFile(name: string, content: string): File {
	return new File([content], name, { type: "text/markdown" })
}

function createImageFile(name: string): File {
	// Create a minimal PNG (1x1 transparent pixel)
	let png = new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
		0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
		0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
	])
	return new File([png], name, { type: "image/png" })
}

async function createZip(
	files: { path: string; content: string | Uint8Array }[],
): Promise<File> {
	let zip = new JSZip()
	for (let { path, content } of files) {
		zip.file(path, content)
	}
	let arrayBuffer = await zip.generateAsync({ type: "arraybuffer" })
	return new File([arrayBuffer], "test.zip", { type: "application/zip" })
}

// =============================================================================
// Import Tests - Simple markdown files
// =============================================================================

describe("importMarkdownFiles - simple files", () => {
	it("imports single markdown file", async () => {
		let file = createFile("test.md", "# Hello\n\nWorld")
		let results = await importMarkdownFiles([file])

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("test")
		expect(results[0].content).toBe("# Hello\n\nWorld")
		expect(results[0].assets).toHaveLength(0)
		expect(results[0].path).toBeNull()
	})

	it("imports multiple markdown files", async () => {
		let files = [
			createFile("one.md", "# One"),
			createFile("two.md", "# Two"),
			createFile("three.txt", "# Three"),
		]
		let results = await importMarkdownFiles(files)

		expect(results).toHaveLength(3)
		expect(results.map(r => r.name)).toEqual(["one", "two", "three"])
	})

	it("strips file extensions from name", async () => {
		let files = [
			createFile("doc.md", "content"),
			createFile("doc.markdown", "content"),
			createFile("doc.txt", "content"),
		]
		let results = await importMarkdownFiles(files)

		expect(results.map(r => r.name)).toEqual(["doc", "doc", "doc"])
	})
})

// =============================================================================
// Import Tests - Zip files with folder structure
// Note: Zip tests are skipped in vitest/node because JSZip.loadAsync(File)
// doesn't work the same as in browsers. The folder import tests below
// cover the same path/asset detection logic.
// =============================================================================

describe.skip("importMarkdownFiles - zip files", () => {
	it("imports simple zip with markdown at root", async () => {
		let zip = await createZip([{ path: "doc.md", content: "# Hello" }])
		let results = await importMarkdownFiles([zip])

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("doc")
		expect(results[0].content).toBe("# Hello")
		expect(results[0].path).toBeNull()
	})

	it("imports zip with path structure", async () => {
		let zip = await createZip([
			{ path: "some/path/doc.md", content: "# Nested" },
		])
		let results = await importMarkdownFiles([zip])

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("doc")
		expect(results[0].path).toBe("some/path")
	})

	it("detects doc-with-assets folder structure (folder name matches doc name)", async () => {
		// Structure: My Doc/My Doc.md + My Doc/assets/image.png
		let zip = await createZip([
			{
				path: "My Doc/My Doc.md",
				content: "# Title\n\n![img](assets/image.png)",
			},
			{
				path: "My Doc/assets/image.png",
				content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
			},
		])
		let results = await importMarkdownFiles([zip])

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("My Doc")
		expect(results[0].path).toBeNull() // folder stripped, not treated as path
		expect(results[0].assets.length).toBeGreaterThan(0)
	})

	it("detects nested doc-with-assets folder structure", async () => {
		// Structure: some/path/My Doc/My Doc.md
		let zip = await createZip([
			{
				path: "some/path/My Doc/My Doc.md",
				content: "# Title\n\n![img](assets/image.png)",
			},
			{
				path: "some/path/My Doc/assets/image.png",
				content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
			},
		])
		let results = await importMarkdownFiles([zip])

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("My Doc")
		expect(results[0].path).toBe("some/path") // doc folder stripped
	})

	it("preserves path when folder name does not match doc name", async () => {
		// Structure: folder/doc.md (folder != doc)
		let zip = await createZip([{ path: "folder/doc.md", content: "# Hello" }])
		let results = await importMarkdownFiles([zip])

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("doc")
		expect(results[0].path).toBe("folder")
	})

	it("imports referenced assets", async () => {
		let zip = await createZip([
			{ path: "doc.md", content: "![alt](assets/img.png)" },
			{
				path: "assets/img.png",
				content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
			},
		])
		let results = await importMarkdownFiles([zip])

		expect(results).toHaveLength(1)
		expect(results[0].assets).toHaveLength(1)
		expect(results[0].assets[0].refName).toBe("assets/img.png")
	})

	it("imports unreferenced assets in same directory tree", async () => {
		let zip = await createZip([
			{ path: "doc/doc.md", content: "# No images here" },
			{
				path: "doc/assets/unused.png",
				content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
			},
		])
		let results = await importMarkdownFiles([zip])

		expect(results).toHaveLength(1)
		// Unreferenced assets in doc folder should still be imported
		expect(results[0].assets).toHaveLength(1)
		expect(results[0].assets[0].refName).toBe("") // not referenced
	})
})

// =============================================================================
// Import Tests - Folder drag-drop (importFolderFiles)
// =============================================================================

describe("importFolderFiles - folder structure", () => {
	it("imports simple markdown file from folder", async () => {
		let files: FileWithPath[] = [
			{ file: createFile("doc.md", "# Hello"), path: "doc.md" },
		]
		let results = await importFolderFiles(files)

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("doc")
		expect(results[0].path).toBeNull()
	})

	it("imports file with path", async () => {
		let files: FileWithPath[] = [
			{ file: createFile("doc.md", "# Hello"), path: "some/path/doc.md" },
		]
		let results = await importFolderFiles(files)

		expect(results).toHaveLength(1)
		expect(results[0].path).toBe("some/path")
	})

	it("detects doc-with-assets folder structure", async () => {
		let files: FileWithPath[] = [
			{
				file: createFile("My Doc.md", "# Title\n\n![img](assets/image.png)"),
				path: "My Doc/My Doc.md",
			},
			{
				file: createImageFile("image.png"),
				path: "My Doc/assets/image.png",
			},
		]
		let results = await importFolderFiles(files)

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("My Doc")
		expect(results[0].path).toBeNull() // folder stripped
		expect(results[0].assets.length).toBeGreaterThan(0)
	})

	it("detects nested doc-with-assets folder structure", async () => {
		let files: FileWithPath[] = [
			{
				file: createFile("My Doc.md", "# Title"),
				path: "some/path/My Doc/My Doc.md",
			},
			{
				file: createImageFile("image.png"),
				path: "some/path/My Doc/assets/image.png",
			},
		]
		let results = await importFolderFiles(files)

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("My Doc")
		expect(results[0].path).toBe("some/path")
	})

	it("preserves path when folder name does not match doc name", async () => {
		let files: FileWithPath[] = [
			{ file: createFile("doc.md", "# Hello"), path: "folder/doc.md" },
		]
		let results = await importFolderFiles(files)

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("doc")
		expect(results[0].path).toBe("folder")
	})

	it("handles case-insensitive folder name matching", async () => {
		let files: FileWithPath[] = [
			{
				file: createFile("my doc.md", "# Title"),
				path: "My Doc/my doc.md",
			},
		]
		let results = await importFolderFiles(files)

		expect(results).toHaveLength(1)
		expect(results[0].path).toBeNull() // folder stripped despite case difference
	})

	it("imports multiple docs from backup-like structure", async () => {
		let files: FileWithPath[] = [
			// Doc without assets at root
			{ file: createFile("Simple.md", "# Simple"), path: "Simple.md" },
			// Doc with assets at root
			{
				file: createFile("With Assets.md", "![img](assets/a.png)"),
				path: "With Assets/With Assets.md",
			},
			{
				file: createImageFile("a.png"),
				path: "With Assets/assets/a.png",
			},
			// Doc without assets in path (not in any doc's folder tree)
			{
				file: createFile("Nested.md", "# Nested"),
				path: "other/path/Nested.md",
			},
			// Doc with assets in path
			{
				file: createFile("Nested Assets.md", "![img](assets/b.png)"),
				path: "some/path/Nested Assets/Nested Assets.md",
			},
			{
				file: createImageFile("b.png"),
				path: "some/path/Nested Assets/assets/b.png",
			},
		]
		let results = await importFolderFiles(files)

		expect(results).toHaveLength(4)

		let simple = results.find(r => r.name === "Simple")
		expect(simple?.path).toBeNull()
		expect(simple?.assets).toHaveLength(0)

		let withAssets = results.find(r => r.name === "With Assets")
		expect(withAssets?.path).toBeNull()
		expect(withAssets?.assets.length).toBeGreaterThan(0)

		let nested = results.find(r => r.name === "Nested")
		expect(nested?.path).toBe("other/path")
		expect(nested?.assets).toHaveLength(0)

		let nestedAssets = results.find(r => r.name === "Nested Assets")
		expect(nestedAssets?.path).toBe("some/path")
		expect(nestedAssets?.assets.length).toBeGreaterThan(0)
	})
})

// =============================================================================
// Asset reference handling
// =============================================================================

describe("asset reference handling", () => {
	it("matches assets with relative path ./assets/", async () => {
		let files: FileWithPath[] = [
			{
				file: createFile("doc.md", "![alt](./assets/image.png)"),
				path: "doc/doc.md",
			},
			{ file: createImageFile("image.png"), path: "doc/assets/image.png" },
		]
		let results = await importFolderFiles(files)

		expect(results[0].assets).toHaveLength(1)
		expect(results[0].assets[0].refName).toBe("./assets/image.png")
	})

	it("matches assets with plain relative path assets/", async () => {
		let files: FileWithPath[] = [
			{
				file: createFile("doc.md", "![alt](assets/image.png)"),
				path: "doc/doc.md",
			},
			{ file: createImageFile("image.png"), path: "doc/assets/image.png" },
		]
		let results = await importFolderFiles(files)

		expect(results[0].assets).toHaveLength(1)
		expect(results[0].assets[0].refName).toBe("assets/image.png")
	})

	it("ignores http/https URLs", async () => {
		let file = createFile(
			"doc.md",
			"![alt](https://example.com/image.png)\n![alt2](http://example.com/img.jpg)",
		)
		let results = await importMarkdownFiles([file])

		expect(results[0].assets).toHaveLength(0)
	})

	it("ignores asset: protocol (already imported)", async () => {
		let file = createFile("doc.md", "![alt](asset:co_abc123)")
		let results = await importMarkdownFiles([file])

		expect(results[0].assets).toHaveLength(0)
	})
})

// =============================================================================
// Edge cases
// =============================================================================

describe("edge cases", () => {
	it("skips hidden files (starting with .)", async () => {
		let files: FileWithPath[] = [
			{ file: createFile(".hidden.md", "# Hidden"), path: ".hidden.md" },
			{ file: createFile("visible.md", "# Visible"), path: "visible.md" },
		]
		let results = await importFolderFiles(files)

		expect(results).toHaveLength(1)
		expect(results[0].name).toBe("visible")
	})

	it("handles empty markdown file", async () => {
		let file = createFile("empty.md", "")
		let results = await importMarkdownFiles([file])

		expect(results).toHaveLength(1)
		expect(results[0].content).toBe("")
	})

	it("handles deeply nested paths", async () => {
		let files: FileWithPath[] = [
			{
				file: createFile("doc.md", "# Deep"),
				path: "a/b/c/d/e/doc.md",
			},
		]
		let results = await importFolderFiles(files)

		expect(results[0].path).toBe("a/b/c/d/e")
	})

	it("handles deeply nested doc-with-assets", async () => {
		let files: FileWithPath[] = [
			{
				file: createFile("doc.md", "# Deep"),
				path: "a/b/c/d/e/doc/doc.md",
			},
		]
		let results = await importFolderFiles(files)

		expect(results[0].path).toBe("a/b/c/d/e") // doc folder stripped
	})
})
