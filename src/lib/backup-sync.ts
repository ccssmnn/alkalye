import { getExtensionFromBlob, sanitizeFilename } from "@/lib/export"
import { z } from "zod"

export {
	computeDocLocations,
	transformContentForBackup,
	computeExpectedStructure,
	transformContentForImport,
	scanBackupFolder,
	readManifest,
	writeManifest,
	type BackupDoc,
	type DocLocation,
	type ExpectedStructure,
	type BackupManifest,
	type ManifestEntry,
	type ScannedFile,
}

interface BackupDoc {
	id: string
	title: string
	content: string
	path: string | null
	updatedAtMs: number
	assets: { id: string; name: string; blob: Blob }[]
}

interface DocLocation {
	dirPath: string
	filename: string
	hasOwnFolder: boolean
	assetFiles: Map<string, string>
}

interface ExpectedStructure {
	expectedPaths: Set<string>
	expectedFiles: Map<string, Set<string>>
}

interface ManifestEntry {
	docId: string
	relativePath: string
	locationKey?: string
	contentHash: string
	lastSyncedAt: string
	assets: { name: string; hash: string }[]
}

interface BackupManifest {
	version: 1
	entries: ManifestEntry[]
	lastSyncAt: string
}

interface ScannedFile {
	relativePath: string
	name: string
	content: string
	assets: { name: string; blob: Blob }[]
	lastModified: number
}

let manifestAssetSchema = z.object({
	name: z.string(),
	hash: z.string(),
})

let manifestEntrySchema = z.object({
	docId: z.string(),
	relativePath: z.string(),
	locationKey: z.string().optional(),
	contentHash: z.string(),
	lastSyncedAt: z.string(),
	assets: z.array(manifestAssetSchema),
})

let backupManifestSchema = z.object({
	version: z.literal(1),
	entries: z.array(manifestEntrySchema),
	lastSyncAt: z.string(),
})

function computeDocLocations(docs: BackupDoc[]): Map<string, DocLocation> {
	let docLocations = new Map<string, DocLocation>()
	let usedNames = new Map<string, Set<string>>() // parentPath -> used names (lowercase)

	for (let doc of docs) {
		let baseName = sanitizeFilename(doc.title)
		let hasAssets = doc.assets.length > 0
		let parentPath = doc.path ?? ""

		// Track used names at parent level for conflict detection
		if (!usedNames.has(parentPath)) usedNames.set(parentPath, new Set())
		let used = usedNames.get(parentPath)!

		let docName = baseName
		if (used.has(docName.toLowerCase())) {
			let shortId = doc.id.slice(-8)
			docName = `${baseName} (${shortId})`
		}
		used.add(docName.toLowerCase())

		let dirPath: string
		let hasOwnFolder: boolean

		if (hasAssets) {
			dirPath = parentPath ? `${parentPath}/${docName}` : docName
			hasOwnFolder = true
		} else {
			dirPath = parentPath
			hasOwnFolder = false
		}

		// Build asset filename map for this doc
		let assetFiles = new Map<string, string>()
		let usedAssetNames = new Set<string>()
		for (let asset of doc.assets) {
			let ext = getExtensionFromBlob(asset.blob)
			let assetBaseName = sanitizeFilename(asset.name) || "image"
			let fileName = assetBaseName + ext
			let counter = 1
			while (usedAssetNames.has(fileName.toLowerCase())) {
				fileName = `${assetBaseName}-${counter++}${ext}`
			}
			usedAssetNames.add(fileName.toLowerCase())
			assetFiles.set(asset.id, fileName)
		}

		docLocations.set(doc.id, {
			dirPath,
			filename: `${docName}.md`,
			hasOwnFolder,
			assetFiles,
		})
	}

	return docLocations
}

function transformContentForBackup(
	content: string,
	assetFiles: Map<string, string>,
): string {
	return content.replace(
		/!\[([^\]]*)\]\(asset:([^)]+)\)/g,
		(match, alt, assetId) => {
			let assetFilename = assetFiles.get(assetId)
			if (assetFilename) {
				return `![${alt}](assets/${assetFilename})`
			}
			return match
		},
	)
}

function transformContentForImport(
	content: string,
	assetFiles: Map<string, string>,
): string {
	// Transform local asset paths back to asset: references
	return content.replace(
		/!\[([^\]]*)\]\(assets\/([^)]+)\)/g,
		(match, alt, assetFilename) => {
			// Find asset ID by filename
			for (let [id, filename] of assetFiles) {
				if (filename === assetFilename) {
					return `![${alt}](asset:${id})`
				}
			}
			// If not found, keep the original local path (might be a manual addition)
			return match
		},
	)
}

function computeExpectedStructure(
	docs: BackupDoc[],
	docLocations: Map<string, DocLocation>,
): ExpectedStructure {
	let expectedPaths = new Set<string>()
	let expectedFiles = new Map<string, Set<string>>()

	for (let doc of docs) {
		let loc = docLocations.get(doc.id)!

		// Add the directory path and all parent paths
		if (loc.dirPath) {
			let parts = loc.dirPath.split("/")
			for (let i = 1; i <= parts.length; i++) {
				expectedPaths.add(parts.slice(0, i).join("/"))
			}
		}

		// Add expected file
		if (!expectedFiles.has(loc.dirPath)) {
			expectedFiles.set(loc.dirPath, new Set())
		}
		expectedFiles.get(loc.dirPath)!.add(loc.filename)

		// If doc has assets, expect assets subfolder
		if (loc.hasOwnFolder && doc.assets.length > 0) {
			let assetsPath = loc.dirPath ? `${loc.dirPath}/assets` : "assets"
			expectedPaths.add(assetsPath)
		}
	}

	return { expectedPaths, expectedFiles }
}

async function scanBackupFolder(
	handle: FileSystemDirectoryHandle,
): Promise<ScannedFile[]> {
	let files: ScannedFile[] = []

	async function scanDir(
		dir: FileSystemDirectoryHandle,
		relativePath: string,
	): Promise<void> {
		for await (let [name, handle] of dir.entries()) {
			let entryPath = relativePath ? `${relativePath}/${name}` : name

			if (handle.kind === "directory") {
				// Skip dot directories and special directories
				if (name.startsWith(".")) continue
				let subDir = await dir.getDirectoryHandle(name)
				await scanDir(subDir, entryPath)
			} else if (handle.kind === "file" && name.endsWith(".md")) {
				// Skip manifest file
				if (name === ".alkalye-manifest.json") continue

				let fileHandle = await dir.getFileHandle(name)
				let file = await fileHandle.getFile()
				let content = await file.text()
				let lastModified = file.lastModified

				// Check for assets folder
				let assets: { name: string; blob: Blob }[] = []
				try {
					let assetsDir = await dir.getDirectoryHandle("assets")
					for await (let [assetName, assetHandle] of assetsDir.entries()) {
						if (assetHandle.kind === "file" && !assetName.startsWith(".")) {
							let assetFileHandle = await assetsDir.getFileHandle(assetName)
							let assetFile = await assetFileHandle.getFile()
							assets.push({ name: assetName, blob: assetFile })
						}
					}
				} catch {
					// No assets folder
				}

				files.push({
					relativePath: entryPath,
					name: name.replace(/\.md$/, ""),
					content,
					assets,
					lastModified,
				})
			}
		}
	}

	await scanDir(handle, "")
	return files
}

async function readManifest(
	handle: FileSystemDirectoryHandle,
): Promise<BackupManifest | null> {
	try {
		let fileHandle = await handle.getFileHandle(".alkalye-manifest.json")
		let file = await fileHandle.getFile()
		let text = await file.text()
		let parsed = JSON.parse(text)
		let validated = backupManifestSchema.safeParse(parsed)
		if (!validated.success) return null
		return validated.data
	} catch {
		return null
	}
}

async function writeManifest(
	handle: FileSystemDirectoryHandle,
	manifest: BackupManifest,
): Promise<void> {
	let fileHandle = await handle.getFileHandle(".alkalye-manifest.json", {
		create: true,
	})
	let writable = await fileHandle.createWritable()
	await writable.write(JSON.stringify(manifest, null, 2))
	await writable.close()
}
