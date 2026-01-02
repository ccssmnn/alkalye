import JSZip from "jszip"

export {
	importMarkdownFiles,
	importFolderFiles,
	readFolderEntries,
	type ImportedFile,
	type ImportedAsset,
	type FileWithPath,
}

interface ImportedFile {
	name: string
	content: string
	assets: ImportedAsset[]
	path: string | null
}

interface ImportedAsset {
	name: string
	file: File
	refName: string
}

interface FileWithPath {
	file: File
	path: string
}

async function importMarkdownFiles(
	files: FileList | File[],
): Promise<ImportedFile[]> {
	let results: ImportedFile[] = []
	let fileArray = Array.from(files)

	for (let file of fileArray) {
		if (file.name.endsWith(".zip")) {
			let zipResults = await importZipFile(file)
			results.push(...zipResults)
		} else if (
			file.name.endsWith(".md") ||
			file.name.endsWith(".markdown") ||
			file.name.endsWith(".txt")
		) {
			let content = await file.text()
			let name = file.name.replace(/\.(md|markdown|txt)$/, "")
			results.push({ name, content, assets: [], path: null })
		}
	}

	return results
}

async function importZipFile(file: File): Promise<ImportedFile[]> {
	let zip = await JSZip.loadAsync(file)
	let results: ImportedFile[] = []

	let mdFiles: { path: string; name: string }[] = []
	let assetFiles: { path: string; file: JSZip.JSZipObject }[] = []

	zip.forEach((relativePath, zipEntry) => {
		if (zipEntry.dir) return

		let fileName = relativePath.split("/").pop() || ""
		if (fileName.startsWith(".")) return

		if (
			relativePath.endsWith(".md") ||
			relativePath.endsWith(".markdown") ||
			relativePath.endsWith(".txt")
		) {
			mdFiles.push({ path: relativePath, name: fileName })
		} else if (isImageFile(fileName)) {
			assetFiles.push({ path: relativePath, file: zipEntry })
		}
	})

	for (let mdFile of mdFiles) {
		let content = await zip.file(mdFile.path)!.async("string")
		let name = mdFile.name.replace(/\.(md|markdown|txt)$/, "")

		let docDir = mdFile.path.includes("/")
			? mdFile.path.substring(0, mdFile.path.lastIndexOf("/") + 1)
			: ""

		let assets: ImportedAsset[] = []
		let usedAssetPaths = new Set<string>()
		let assetRefRegex = /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g
		let match

		while ((match = assetRefRegex.exec(content)) !== null) {
			let refPath = match[2]
			if (refPath.startsWith("asset:")) continue

			let normalizedRef = refPath.startsWith("./") ? refPath.slice(2) : refPath
			let fullPath = docDir + normalizedRef

			let assetEntry = assetFiles.find(
				a =>
					a.path === fullPath ||
					a.path === normalizedRef ||
					a.path.endsWith("/" + normalizedRef) ||
					a.path.endsWith(normalizedRef),
			)

			if (assetEntry) {
				usedAssetPaths.add(assetEntry.path)
				let blob = await assetEntry.file.async("blob")
				let fileName = assetEntry.path.split("/").pop() || "image"
				let assetFile = new File([blob], fileName, {
					type: getMimeType(fileName),
				})

				assets.push({
					name: fileName.replace(/\.[^.]+$/, ""),
					file: assetFile,
					refName: match[2],
				})
			}
		}

		// Import all assets in the same directory tree (e.g. assets/ folder)
		for (let assetFile of assetFiles) {
			if (usedAssetPaths.has(assetFile.path)) continue
			if (docDir && assetFile.path.startsWith(docDir)) {
				let blob = await assetFile.file.async("blob")
				let fileName = assetFile.path.split("/").pop() || "image"
				let file = new File([blob], fileName, {
					type: getMimeType(fileName),
				})
				assets.push({
					name: fileName.replace(/\.[^.]+$/, ""),
					file,
					refName: "",
				})
			}
		}

		// Determine path, accounting for doc-with-assets folder structure
		// If md file is in a folder with same name as the file, that's a doc folder not a path
		// e.g. "My Doc/My Doc.md" -> path: null, "some/path/My Doc/My Doc.md" -> path: "some/path"
		let path: string | null = null
		if (mdFile.path.includes("/")) {
			let dir = mdFile.path.substring(0, mdFile.path.lastIndexOf("/"))
			let parentFolderName = dir.split("/").pop() ?? ""
			// Check if parent folder name matches the doc name (doc-with-assets structure)
			if (parentFolderName.toLowerCase() === name.toLowerCase()) {
				// Strip the doc folder from path
				let parentDir = dir.includes("/")
					? dir.substring(0, dir.lastIndexOf("/"))
					: ""
				path = parentDir || null
			} else {
				path = dir || null
			}
		}

		results.push({ name, content, assets, path })
	}

	return results
}

async function readFolderEntries(
	dataTransfer: DataTransfer,
): Promise<FileWithPath[]> {
	let files: FileWithPath[] = []

	async function readAllEntries(
		reader: FileSystemDirectoryReader,
	): Promise<FileSystemEntry[]> {
		let allEntries: FileSystemEntry[] = []
		let readBatch = (): Promise<FileSystemEntry[]> =>
			new Promise((resolve, reject) => reader.readEntries(resolve, reject))

		let batch = await readBatch()
		while (batch.length > 0) {
			allEntries.push(...batch)
			batch = await readBatch()
		}
		return allEntries
	}

	async function readEntry(
		entry: FileSystemEntry,
		path: string,
	): Promise<void> {
		if (entry.isFile) {
			let fileEntry = entry as FileSystemFileEntry
			let file = await new Promise<File>((resolve, reject) => {
				fileEntry.file(resolve, reject)
			})
			files.push({ file, path: path + file.name })
		} else if (entry.isDirectory) {
			let dirEntry = entry as FileSystemDirectoryEntry
			let reader = dirEntry.createReader()
			let entries = await readAllEntries(reader)
			for (let childEntry of entries) {
				await readEntry(childEntry, path + entry.name + "/")
			}
		}
	}

	let items = dataTransfer.items
	for (let i = 0; i < items.length; i++) {
		let entry = items[i].webkitGetAsEntry?.()
		if (entry) {
			await readEntry(entry, "")
		}
	}

	return files
}

async function importFolderFiles(
	filesWithPaths: FileWithPath[],
): Promise<ImportedFile[]> {
	let results: ImportedFile[] = []

	let mdFiles: { path: string; file: File }[] = []
	let assetFiles: { path: string; file: File }[] = []

	for (let { file, path } of filesWithPaths) {
		let fileName = file.name
		if (fileName.startsWith(".")) continue

		if (
			fileName.endsWith(".md") ||
			fileName.endsWith(".markdown") ||
			fileName.endsWith(".txt")
		) {
			mdFiles.push({ path, file })
		} else if (isImageFile(fileName)) {
			assetFiles.push({ path, file })
		}
	}

	for (let mdFile of mdFiles) {
		let content = await mdFile.file.text()
		let name = mdFile.file.name.replace(/\.(md|markdown|txt)$/, "")

		let docDir = mdFile.path.includes("/")
			? mdFile.path.substring(0, mdFile.path.lastIndexOf("/") + 1)
			: ""

		let assets: ImportedAsset[] = []
		let usedAssetPaths = new Set<string>()

		// Find referenced assets and update refs in content
		let assetRefRegex = /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g
		let match

		while ((match = assetRefRegex.exec(content)) !== null) {
			let refPath = match[2]
			if (refPath.startsWith("asset:")) continue

			let normalizedRef = refPath.startsWith("./") ? refPath.slice(2) : refPath
			let fullPath = docDir + normalizedRef

			let assetEntry = assetFiles.find(
				a =>
					a.path === fullPath ||
					a.path === normalizedRef ||
					a.path.endsWith("/" + normalizedRef) ||
					a.path.endsWith(normalizedRef),
			)

			if (assetEntry) {
				usedAssetPaths.add(assetEntry.path)
				assets.push({
					name: assetEntry.file.name.replace(/\.[^.]+$/, ""),
					file: assetEntry.file,
					refName: match[2],
				})
			}
		}

		// Import all assets in the same directory tree (e.g. assets/ folder)
		for (let assetFile of assetFiles) {
			if (usedAssetPaths.has(assetFile.path)) continue
			// Check if asset is in same folder tree as the markdown
			if (docDir && assetFile.path.startsWith(docDir)) {
				assets.push({
					name: assetFile.file.name.replace(/\.[^.]+$/, ""),
					file: assetFile.file,
					refName: "", // Not referenced in content
				})
			}
		}

		// Determine path, accounting for doc-with-assets folder structure
		// If md file is in a folder with same name as the file, that's a doc folder not a path
		// e.g. "My Doc/My Doc.md" -> path: null, "some/path/My Doc/My Doc.md" -> path: "some/path"
		let path: string | null = null
		if (mdFile.path.includes("/")) {
			let dir = mdFile.path.substring(0, mdFile.path.lastIndexOf("/"))
			let parentFolderName = dir.split("/").pop() ?? ""
			// Check if parent folder name matches the doc name (doc-with-assets structure)
			if (parentFolderName.toLowerCase() === name.toLowerCase()) {
				// Strip the doc folder from path
				let parentDir = dir.includes("/")
					? dir.substring(0, dir.lastIndexOf("/"))
					: ""
				path = parentDir || null
			} else {
				path = dir || null
			}
		}

		results.push({ name, content, assets, path })
	}

	return results
}

function isImageFile(filename: string): boolean {
	let ext = filename.toLowerCase().split(".").pop()
	return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext || "")
}

function getMimeType(filename: string): string {
	let ext = filename.toLowerCase().split(".").pop()
	let mimeTypes: Record<string, string> = {
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		bmp: "image/bmp",
	}
	return mimeTypes[ext || ""] || "image/png"
}
