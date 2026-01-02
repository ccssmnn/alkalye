import { getExtensionFromBlob, sanitizeFilename } from "@/lib/export"

export {
	computeDocLocations,
	transformContentForBackup,
	computeExpectedStructure,
	type BackupDoc,
	type DocLocation,
	type ExpectedStructure,
}

interface BackupDoc {
	id: string
	title: string
	content: string
	path: string | null
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
