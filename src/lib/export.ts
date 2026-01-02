import JSZip from "jszip"

export {
	exportDocument,
	saveDocumentAs,
	exportDocumentsAsZip,
	getExtensionFromBlob,
	sanitizeFilename,
	type ExportAsset,
	type ExportDoc,
}

interface ExportAsset {
	id: string
	name: string
	blob: Blob
}

interface ExportDoc {
	title: string
	content: string
	assets?: ExportAsset[]
	path?: string | null
}

async function exportDocument(
	content: string,
	filename: string,
	assets?: ExportAsset[],
) {
	let safeName = sanitizeFilename(filename)

	if (!assets || assets.length === 0) {
		// No assets - just download the .md file
		let blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
		let url = URL.createObjectURL(blob)
		let a = document.createElement("a")
		a.href = url
		a.download = `${safeName}.md`
		a.click()
		URL.revokeObjectURL(url)
		return
	}

	// Has assets - create folder structure: {title}/{title}.md + {title}/assets/
	let zip = new JSZip()
	let docFolder = zip.folder(safeName)!
	let assetsFolder = docFolder.folder("assets")!
	let assetNameMap = new Map<string, string>()
	let usedAssetNames = new Set<string>()

	for (let asset of assets) {
		let ext = getExtensionFromBlob(asset.blob)
		let baseName = asset.name.replace(/[^a-zA-Z0-9-_\s]/g, "").trim() || "image"
		let fileName = baseName + ext
		let counter = 1

		while (usedAssetNames.has(fileName)) {
			fileName = `${baseName}-${counter++}${ext}`
		}
		usedAssetNames.add(fileName)

		assetsFolder.file(fileName, asset.blob)
		assetNameMap.set(asset.id, `assets/${fileName}`)
	}

	let exportedContent = content.replace(
		/!\[([^\]]*)\]\(asset:([^)]+)\)/g,
		(match, alt, assetId) => {
			let newPath = assetNameMap.get(assetId)
			if (newPath) {
				return `![${alt}](${newPath})`
			}
			return match
		},
	)

	docFolder.file(`${safeName}.md`, exportedContent)

	let blob = await zip.generateAsync({ type: "blob" })
	let url = URL.createObjectURL(blob)
	let a = document.createElement("a")
	a.href = url
	a.download = `${safeName}.zip`
	a.click()
	URL.revokeObjectURL(url)
}

async function saveDocumentAs(content: string, suggestedName: string) {
	let safeName = sanitizeFilename(suggestedName)

	let w = window as Window &
		typeof globalThis & {
			showSaveFilePicker?: (options: {
				suggestedName: string
				types: { description: string; accept: Record<string, string[]> }[]
			}) => Promise<FileSystemFileHandle>
		}

	if (w.showSaveFilePicker) {
		try {
			let handle = await w.showSaveFilePicker({
				suggestedName: `${safeName}.md`,
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
			return
		} catch (e) {
			if (e instanceof Error && e.name === "AbortError") return
			throw e
		}
	}

	// Fallback for browsers without File System Access API
	let blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
	let url = URL.createObjectURL(blob)
	let a = document.createElement("a")
	a.href = url
	a.download = `${safeName}.md`
	a.click()
	URL.revokeObjectURL(url)
}

function sanitizeFilename(name: string): string {
	// Remove filesystem-unsafe characters: < > : " / \ | ? * and control chars
	return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "untitled"
}

function getExtensionFromBlob(blob: Blob): string {
	let mimeToExt: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
		"image/svg+xml": ".svg",
		"image/bmp": ".bmp",
	}
	return mimeToExt[blob.type] || ".png"
}

// Structure:
// - No assets, no path: {title}.md at root
// - Has assets, no path: {title}/{title}.md + {title}/assets/
// - No assets, has path: {path}/{title}.md
// - Has assets, has path: {path}/{title}/{title}.md + {path}/{title}/assets/

async function exportDocumentsAsZip(docs: ExportDoc[]) {
	let zip = new JSZip()
	let usedNames = new Map<string, Set<string>>() // parentPath -> used names

	for (let doc of docs) {
		let baseName = sanitizeFilename(doc.title)
		let hasAssets = doc.assets && doc.assets.length > 0
		let parentPath = doc.path ?? ""

		// Track used names at parent level for conflict detection
		if (!usedNames.has(parentPath)) usedNames.set(parentPath, new Set())
		let used = usedNames.get(parentPath)!

		let docName = baseName
		let counter = 1
		while (used.has(docName.toLowerCase())) {
			docName = `${baseName}-${counter++}`
		}
		used.add(docName.toLowerCase())

		// Build asset name map for this doc
		let assetNameMap = new Map<string, string>()
		if (hasAssets) {
			let usedAssetNames = new Set<string>()
			for (let asset of doc.assets!) {
				let ext = getExtensionFromBlob(asset.blob)
				let assetBaseName =
					asset.name.replace(/[^a-zA-Z0-9-_\s]/g, "").trim() || "image"
				let fileName = assetBaseName + ext
				let assetCounter = 1
				while (usedAssetNames.has(fileName.toLowerCase())) {
					fileName = `${assetBaseName}-${assetCounter++}${ext}`
				}
				usedAssetNames.add(fileName.toLowerCase())
				assetNameMap.set(asset.id, fileName)
			}
		}

		// Transform asset references in content
		let exportedContent = doc.content.replace(
			/!\[([^\]]*)\]\(asset:([^)]+)\)/g,
			(match, alt, assetId) => {
				let assetFilename = assetNameMap.get(assetId)
				if (assetFilename) {
					return `![${alt}](assets/${assetFilename})`
				}
				return match
			},
		)

		if (hasAssets) {
			// Doc with assets: {parentPath}/{docName}/{docName}.md + assets/
			let docFolderPath = parentPath ? `${parentPath}/${docName}` : docName
			let docFolder = zip.folder(docFolderPath)!
			docFolder.file(`${docName}.md`, exportedContent)

			let assetsFolder = docFolder.folder("assets")!
			for (let asset of doc.assets!) {
				let fileName = assetNameMap.get(asset.id)!
				assetsFolder.file(fileName, asset.blob)
			}
		} else {
			// Doc without assets: {parentPath}/{docName}.md
			let filePath = parentPath
				? `${parentPath}/${docName}.md`
				: `${docName}.md`
			zip.file(filePath, exportedContent)
		}
	}

	let blob = await zip.generateAsync({ type: "blob" })
	let url = URL.createObjectURL(blob)
	let a = document.createElement("a")
	a.href = url
	a.download = "documents.zip"
	a.click()
	URL.revokeObjectURL(url)
}
