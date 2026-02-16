import { co, Group, Account, FileStream } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { Document, Asset, ImageAsset, VideoAsset } from "@/schema"
import { getDocumentTitle } from "@/lib/document-utils"
import { getPath, parseFrontmatter } from "@/editor/frontmatter"
import {
	computeDocLocations,
	transformContentForBackup,
	computeExpectedStructure,
	scanBackupFolder,
	readManifest,
	writeManifest,
	transformContentForImport,
	type BackupDoc,
	type ManifestEntry,
	type ScannedFile,
} from "@/lib/backup-sync"

export {
	hashContent,
	syncBackup,
	syncFromBackup,
	prepareBackupDoc,
	type LoadedDocument,
	type DocumentList,
}

type LoadedDocument = co.loaded<
	typeof Document,
	{ content: true; assets: { $each: { image: true; video: true } } }
>

type DocumentList = co.loaded<ReturnType<typeof co.list<typeof Document>>>

interface SyncFromBackupResult {
	created: number
	updated: number
	deleted: number
	errors: string[]
}

interface ScannedAssetHash {
	name: string
	hash: string
}

let preferredRelativePathByDocId = new Map<string, string>()
let recentImportedRelativePaths = new Map<string, number>()
let RECENT_IMPORT_WINDOW_MS = 30_000

async function hashContent(content: string): Promise<string> {
	let encoder = new TextEncoder()
	let data = encoder.encode(content)
	let hashBuffer = await crypto.subtle.digest("SHA-256", data)
	let hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray
		.map(b => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16)
}

async function syncBackup(
	handle: FileSystemDirectoryHandle,
	docs: BackupDoc[],
	scopeId = "docs:unknown",
): Promise<void> {
	await performSyncBackup(handle, docs, scopeId)
}

async function syncFromBackup(
	handle: FileSystemDirectoryHandle,
	targetDocs: DocumentList,
	canWrite: boolean,
	lastPullAtMs: number | null = null,
): Promise<SyncFromBackupResult> {
	let result: SyncFromBackupResult = {
		created: 0,
		updated: 0,
		deleted: 0,
		errors: [],
	}

	let manifest = await readManifest(handle)
	let scannedFiles = await scanBackupFolder(handle)
	let listOwner = targetDocs.$jazz.owner
	let importScopeKey = getDocumentListScopeKey(targetDocs)
	let manifestEntriesForScope =
		manifest?.entries.filter(entry =>
			manifestEntryMatchesScope(entry, importScopeKey),
		) ?? []
	let manifestEntriesOutsideScope =
		manifest?.entries.filter(
			entry => !manifestEntryMatchesScope(entry, importScopeKey),
		) ?? []
	let nextManifestByDocId = new Map(
		manifestEntriesForScope.map(entry => [entry.docId, entry]),
	)
	let manifestChanged = false

	let manifestByPath = new Map(
		manifestEntriesForScope.map(e => [e.relativePath, e]),
	)
	let scannedByPath = new Map(scannedFiles.map(f => [f.relativePath, f]))
	let matchedManifestDocIds = new Set<string>()

	for (let file of scannedFiles) {
		try {
			let contentHash = await hashContent(file.content)
			let scannedAssetHashes = await hashScannedAssets(file.assets)
			let manifestEntry = manifestByPath.get(file.relativePath)
			let assetsInSync = false
			if (manifestEntry) {
				matchedManifestDocIds.add(manifestEntry.docId)
				assetsInSync = areScannedAssetsInSync(
					manifestEntry.assets,
					scannedAssetHashes,
				)
				let unchangedSinceManifest =
					manifestEntry.contentHash === contentHash &&
					manifestEntry.relativePath === file.relativePath &&
					assetsInSync
				let isBeforeLastPull =
					lastPullAtMs !== null && file.lastModified < lastPullAtMs
				if (isBeforeLastPull && unchangedSinceManifest) continue
			}

			if (!manifestEntry) {
				let movedEntry = findMovedManifestEntry(
					manifestEntriesForScope,
					scannedByPath,
					matchedManifestDocIds,
					file,
					contentHash,
					scannedAssetHashes,
				)
				if (movedEntry) {
					manifestEntry = movedEntry
					matchedManifestDocIds.add(movedEntry.docId)
					assetsInSync = areScannedAssetsInSync(
						movedEntry.assets,
						scannedAssetHashes,
					)
				}
			}

			if (!manifestEntry) {
				let matchingUntrackedDocId = findMatchingUntrackedDocId(
					file,
					targetDocs,
				)
				if (matchingUntrackedDocId) {
					let changed = upsertManifestEntry(nextManifestByDocId, {
						docId: matchingUntrackedDocId,
						relativePath: file.relativePath,
						scopeId: importScopeKey,
						contentHash,
						lastSyncedAt: new Date().toISOString(),
						assets: buildManifestAssetsFromScanned(scannedAssetHashes),
					})
					manifestChanged = manifestChanged || changed
					preferredRelativePathByDocId.set(
						matchingUntrackedDocId,
						file.relativePath,
					)
					continue
				}

				if (!canWrite) {
					result.errors.push(`Cannot create ${file.name}: no write permission`)
					continue
				}
				if (wasRecentlyImported(importScopeKey, file.relativePath)) continue
				let newDocId = await createDocFromFile(file, targetDocs, listOwner)
				let changed = upsertManifestEntry(nextManifestByDocId, {
					docId: newDocId,
					relativePath: file.relativePath,
					scopeId: importScopeKey,
					contentHash,
					lastSyncedAt: new Date().toISOString(),
					assets: buildManifestAssetsFromScanned(scannedAssetHashes),
				})
				manifestChanged = manifestChanged || changed
				preferredRelativePathByDocId.set(newDocId, file.relativePath)
				markRecentlyImported(importScopeKey, file.relativePath)
				result.created++
			} else if (
				manifestEntry.contentHash !== contentHash ||
				manifestEntry.relativePath !== file.relativePath ||
				!assetsInSync
			) {
				preferredRelativePathByDocId.set(manifestEntry.docId, file.relativePath)
				if (!canWrite) {
					result.errors.push(`Cannot update ${file.name}: no write permission`)
					continue
				}
				let didUpdate = await updateDocFromFile(
					file,
					manifestEntry.docId,
					manifestEntry,
					targetDocs,
				)
				if (didUpdate) {
					let changed = upsertManifestEntry(nextManifestByDocId, {
						docId: manifestEntry.docId,
						relativePath: file.relativePath,
						scopeId: importScopeKey,
						locationKey: manifestEntry.locationKey,
						contentHash,
						lastSyncedAt: new Date().toISOString(),
						assets: buildManifestAssetsFromScanned(
							scannedAssetHashes,
							manifestEntry.assets,
						),
					})
					manifestChanged = manifestChanged || changed
					result.updated++
				} else {
					result.errors.push(
						`Skipped update for ${file.relativePath}: target document not loaded`,
					)
				}
			} else if (manifestEntry) {
				let changed = upsertManifestEntry(nextManifestByDocId, {
					docId: manifestEntry.docId,
					relativePath: file.relativePath,
					scopeId: importScopeKey,
					locationKey: manifestEntry.locationKey,
					contentHash,
					lastSyncedAt: manifestEntry.lastSyncedAt,
					assets: buildManifestAssetsFromScanned(
						scannedAssetHashes,
						manifestEntry.assets,
					),
				})
				manifestChanged = manifestChanged || changed
			}
		} catch (err) {
			result.errors.push(
				`Failed to process ${file.relativePath}: ${err instanceof Error ? err.message : "Unknown error"}`,
			)
		}
	}

	if (manifestEntriesForScope.length > 0 && canWrite) {
		for (let entry of manifestEntriesForScope) {
			if (matchedManifestDocIds.has(entry.docId)) continue
			if (!scannedByPath.has(entry.relativePath)) {
				try {
					let doc = targetDocs.find(d => d?.$jazz.id === entry.docId)
					if (doc?.$isLoaded && !doc.deletedAt) {
						doc.$jazz.set("deletedAt", new Date())
						doc.$jazz.set("updatedAt", new Date())
						result.deleted++
					}
					nextManifestByDocId.delete(entry.docId)
					manifestChanged = true
				} catch (err) {
					result.errors.push(
						`Failed to delete ${entry.relativePath}: ${err instanceof Error ? err.message : "Unknown error"}`,
					)
				}
			}
		}
	}

	let nextScopeEntries = Array.from(nextManifestByDocId.values())
	if (
		manifestChanged ||
		haveManifestEntriesChanged(manifestEntriesForScope, nextScopeEntries)
	) {
		await writeManifest(handle, {
			version: 1,
			entries: [...nextScopeEntries, ...manifestEntriesOutsideScope],
			lastSyncAt: new Date().toISOString(),
		})
	}

	return result
}

async function prepareBackupDoc(doc: LoadedDocument): Promise<BackupDoc> {
	let content = doc.content?.toString() ?? ""
	let title = getDocumentTitle(doc)
	let path = getPath(content)
	let updatedAtMs = doc.updatedAt?.getTime() ?? 0

	let assets: BackupDoc["assets"] = []
	if (doc.assets?.$isLoaded) {
		for (let asset of [...doc.assets]) {
			if (!asset?.$isLoaded) continue

			let blob: Blob | undefined
			if (asset.type === "image" && asset.image?.$isLoaded) {
				let original = asset.image.original
				if (original?.$isLoaded) {
					blob = original.toBlob()
				}
			} else if (asset.type === "video" && asset.video?.$isLoaded) {
				blob = await asset.video.toBlob()
			}

			if (blob) {
				assets.push({ id: asset.$jazz.id, name: asset.name, blob })
			}
		}
	}

	return { id: doc.$jazz.id, title, content, path, updatedAtMs, assets }
}

async function getOrCreateDirectory(
	parent: FileSystemDirectoryHandle,
	path: string,
): Promise<FileSystemDirectoryHandle> {
	let parts = path.split("/").filter(Boolean)
	let current = parent
	for (let part of parts) {
		current = await current.getDirectoryHandle(part, { create: true })
	}
	return current
}

async function writeFile(
	dir: FileSystemDirectoryHandle,
	name: string,
	content: string | Blob,
): Promise<void> {
	let file = await dir.getFileHandle(name, { create: true })
	let writable = await file.createWritable()
	await writable.write(content)
	await writable.close()
}

async function deleteFile(
	dir: FileSystemDirectoryHandle,
	name: string,
): Promise<void> {
	try {
		await dir.removeEntry(name)
	} catch {
		return
	}
}

async function listFiles(dir: FileSystemDirectoryHandle): Promise<string[]> {
	let files: string[] = []
	for await (let [name, handle] of dir.entries()) {
		if (handle.kind === "file") files.push(name)
	}
	return files
}

async function listDirectories(
	dir: FileSystemDirectoryHandle,
): Promise<string[]> {
	let dirs: string[] = []
	for await (let [name, handle] of dir.entries()) {
		if (handle.kind === "directory") dirs.push(name)
	}
	return dirs
}

async function performSyncBackup(
	handle: FileSystemDirectoryHandle,
	docs: BackupDoc[],
	scopeId: string,
): Promise<void> {
	let docLocations = computeDocLocations(docs)
	let existingManifest = await readManifest(handle)
	let existingScopeEntries =
		existingManifest?.entries.filter(entry =>
			manifestEntryMatchesScope(entry, scopeId),
		) ?? []
	let existingForeignEntries =
		existingManifest?.entries.filter(
			entry => !manifestEntryMatchesScope(entry, scopeId),
		) ?? []
	let existingEntriesByDocId = new Map(
		existingScopeEntries.map(entry => [entry.docId, entry]),
	)
	let manifestEntries: {
		docId: string
		relativePath: string
		scopeId: string
		locationKey: string
		contentHash: string
		lastSyncedAt: string
		assets: { id: string; name: string; hash: string }[]
	}[] = []
	let hasFilesystemChanges = false
	let nowIso = new Date().toISOString()

	for (let doc of docs) {
		let loc = docLocations.get(doc.id)!
		let locationKey = getDocLocationKey(doc)
		let computedRelativePath = loc.dirPath
			? `${loc.dirPath}/${loc.filename}`
			: loc.filename
		let existingEntry = existingEntriesByDocId.get(doc.id)
		let preferredRelativePath = preferredRelativePathByDocId.get(doc.id)
		let finalRelativePath = computedRelativePath
		if (existingEntry) {
			if (existingEntry.locationKey === locationKey) {
				finalRelativePath = existingEntry.relativePath
			}
		}
		if (preferredRelativePath) {
			finalRelativePath = preferredRelativePath
		}
		let finalLocation = buildLocationFromRelativePath(loc, finalRelativePath)
		docLocations.set(doc.id, finalLocation)
		loc = finalLocation

		let dir = loc.dirPath
			? await getOrCreateDirectory(handle, loc.dirPath)
			: handle

		let exportedContent = transformContentForBackup(doc.content, loc.assetFiles)
		let contentHash = await hashContent(exportedContent)
		let relativePath = finalRelativePath
		let assets: { id: string; name: string; hash: string }[] = []
		for (let asset of doc.assets) {
			let filename = loc.assetFiles.get(asset.id)!
			assets.push({
				id: asset.id,
				name: filename,
				hash: await hashBlob(asset.blob),
			})
		}

		let shouldWriteDoc =
			!existingEntry ||
			existingEntry.relativePath !== relativePath ||
			existingEntry.contentHash !== contentHash ||
			!areManifestAssetsEqual(existingEntry.assets, assets)

		if (!shouldWriteDoc) {
			let docFileExists = await fileExists(dir, loc.filename)
			if (!docFileExists) {
				shouldWriteDoc = true
			} else if (doc.assets.length > 0) {
				let assetsExist = await assetsExistAtLocation(dir, loc, doc)
				if (!assetsExist) {
					shouldWriteDoc = true
				}
			}
		}

		if (shouldWriteDoc) {
			hasFilesystemChanges = true
			await writeFile(dir, loc.filename, exportedContent)

			if (doc.assets.length > 0) {
				let assetsDir = await dir.getDirectoryHandle("assets", { create: true })
				for (let asset of doc.assets) {
					let filename = loc.assetFiles.get(asset.id)!
					await writeFile(assetsDir, filename, asset.blob)
				}
			}
		}

		manifestEntries.push({
			docId: doc.id,
			relativePath,
			scopeId,
			locationKey,
			contentHash,
			lastSyncedAt: shouldWriteDoc
				? nowIso
				: (existingEntry?.lastSyncedAt ?? nowIso),
			assets,
		})
	}

	let currentDocIds = new Set(docs.map(doc => doc.id))
	let shouldPreserveMissingScopeEntries =
		scopeId !== "docs:unknown" && docs.length < existingEntriesByDocId.size
	let preservedScopeEntries = shouldPreserveMissingScopeEntries
		? existingScopeEntries.filter(entry => !currentDocIds.has(entry.docId))
		: []
	let nextScopeEntries = [...manifestEntries, ...preservedScopeEntries]
	let docsChanged =
		existingScopeEntries.length !== nextScopeEntries.length ||
		hasFilesystemChanges
	let shouldCleanup =
		existingForeignEntries.length === 0 && !shouldPreserveMissingScopeEntries

	if (docsChanged) {
		if (shouldCleanup) {
			await cleanupOrphanedFiles(handle, docs, docLocations)
		}

		await writeManifest(handle, {
			version: 1,
			entries: [...nextScopeEntries, ...existingForeignEntries],
			lastSyncAt: nowIso,
		})
	}

	for (let doc of docs) {
		preferredRelativePathByDocId.delete(doc.id)
	}
}

async function cleanupOrphanedFiles(
	handle: FileSystemDirectoryHandle,
	docs: BackupDoc[],
	docLocations: Map<
		string,
		ReturnType<typeof computeDocLocations> extends Map<string, infer V>
			? V
			: never
	>,
): Promise<void> {
	let { expectedPaths, expectedFiles } = computeExpectedStructure(
		docs,
		docLocations,
	)
	let expectedAssetFilesByDir = new Map<string, Set<string>>()
	for (let doc of docs) {
		let location = docLocations.get(doc.id)
		if (!location || !location.hasOwnFolder) continue
		let assetsPath = location.dirPath ? `${location.dirPath}/assets` : "assets"
		expectedAssetFilesByDir.set(
			assetsPath,
			new Set(location.assetFiles.values()),
		)
	}

	async function cleanAssetsDirectory(
		dir: FileSystemDirectoryHandle,
		path: string,
	): Promise<boolean> {
		let hasContent = false
		let expected = expectedAssetFilesByDir.get(path) ?? new Set()

		for await (let [name, child] of dir.entries()) {
			if (name.startsWith(".")) continue
			if (child.kind === "directory") {
				await dir.removeEntry(name, { recursive: true })
				continue
			}
			if (expected.has(name)) {
				hasContent = true
				continue
			}
			await deleteFile(dir, name)
		}

		return hasContent
	}

	async function cleanDir(
		dir: FileSystemDirectoryHandle,
		path: string,
	): Promise<boolean> {
		let subdirs = await listDirectories(dir)
		let hasContent = false

		for (let subdir of subdirs) {
			let subPath = path ? `${path}/${subdir}` : subdir

			if (subdir === "assets" && expectedPaths.has(subPath)) {
				let subHandle = await dir.getDirectoryHandle(subdir)
				let assetsHasContent = await cleanAssetsDirectory(subHandle, subPath)
				if (assetsHasContent) hasContent = true
				continue
			}

			if (expectedPaths.has(subPath)) {
				let subHandle = await dir.getDirectoryHandle(subdir)
				let subHasContent = await cleanDir(subHandle, subPath)
				if (subHasContent) hasContent = true
			} else {
				try {
					await dir.removeEntry(subdir, { recursive: true })
				} catch {
					continue
				}
			}
		}

		let expected = expectedFiles.get(path) ?? new Set()
		let files = await listFiles(dir)
		for (let file of files) {
			if (file.endsWith(".md")) {
				if (expected.has(file)) {
					hasContent = true
				} else {
					await deleteFile(dir, file)
				}
			}
		}

		return hasContent
	}

	await cleanDir(handle, "")
}

async function createDocFromFile(
	file: ScannedFile,
	targetDocs: DocumentList,
	listOwner: Group | Account,
): Promise<string> {
	let docGroup = Group.create()
	if (listOwner instanceof Group) {
		docGroup.addMember(listOwner)
	}

	let now = new Date()

	let docAssets: co.loaded<typeof Asset>[] = []
	let assetFilesById = new Map<string, string>()
	for (let assetFile of file.assets) {
		let asset = await createAssetFromBlob(assetFile, docGroup, now)
		docAssets.push(asset)
		assetFilesById.set(asset.$jazz.id, assetFile.name)
	}

	let transformedContent = transformContentForImport(
		file.content,
		assetFilesById,
	)
	let content = applyPathFromRelativePath(
		transformedContent,
		file.relativePath,
		file.assets.length > 0,
	)

	let newDoc = Document.create(
		{
			version: 1,
			content: co.plainText().create(content, docGroup),
			assets:
				docAssets.length > 0
					? co.list(Asset).create(docAssets, docGroup)
					: undefined,
			createdAt: now,
			updatedAt: now,
		},
		docGroup,
	)

	targetDocs.$jazz.push(newDoc)
	return newDoc.$jazz.id
}

async function updateDocFromFile(
	file: ScannedFile,
	docId: string,
	manifestEntry: ManifestEntry,
	targetDocs: DocumentList,
): Promise<boolean> {
	let doc = targetDocs.find(
		(d): d is LoadedDocument => d?.$isLoaded === true && d.$jazz.id === docId,
	)
	if (!doc || !doc.content?.$isLoaded) {
		return false
	}

	let assetFilesById = await syncDocAssetsFromFile(doc, file, manifestEntry)
	let content = applyPathFromRelativePath(
		transformContentForImport(file.content, assetFilesById),
		file.relativePath,
		file.assets.length > 0,
	)

	doc.content.$jazz.applyDiff(content)
	doc.$jazz.set("updatedAt", new Date())
	return true
}

async function syncDocAssetsFromFile(
	doc: LoadedDocument,
	file: ScannedFile,
	manifestEntry: ManifestEntry,
): Promise<Map<string, string>> {
	if (file.assets.length === 0) {
		let manifestFilesById = getAssetFilesByIdFromManifest(manifestEntry)
		let keepsManifestRefs = Array.from(manifestFilesById.values()).some(
			filename => file.content.includes(`assets/${filename}`),
		)
		if (keepsManifestRefs) {
			return manifestFilesById
		}
		if (doc.assets?.$isLoaded) {
			for (let i = doc.assets.length - 1; i >= 0; i--) {
				doc.assets.$jazz.splice(i, 1)
			}
		}
		return new Map<string, string>()
	}

	if (!doc.assets) {
		doc.$jazz.set("assets", co.list(Asset).create([], doc.$jazz.owner))
	}
	if (!doc.assets?.$isLoaded) {
		return getAssetFilesByIdFromManifest(manifestEntry)
	}

	let currentAssets = Array.from(doc.assets).filter(
		(asset): asset is co.loaded<typeof Asset> => asset?.$isLoaded === true,
	)
	let assetsById = new Map(currentAssets.map(asset => [asset.$jazz.id, asset]))
	let fileAssetsWithHash = await Promise.all(
		file.assets.map(async asset => ({
			name: asset.name,
			blob: asset.blob,
			hash: await hashBlob(asset.blob),
		})),
	)

	let manifestByName = new Map(
		manifestEntry.assets.map(asset => [asset.name, asset]),
	)
	let manifestByHash = new Map<string, ManifestEntry["assets"]>()
	for (let asset of manifestEntry.assets) {
		if (!manifestByHash.has(asset.hash)) {
			manifestByHash.set(asset.hash, [])
		}
		manifestByHash.get(asset.hash)?.push(asset)
	}

	let keepAssetIds = new Set<string>()
	let assetFilesById = new Map<string, string>()

	for (let fileAsset of fileAssetsWithHash) {
		let matchedByName = manifestByName.get(fileAsset.name)
		let matchedId =
			matchedByName?.id && assetsById.has(matchedByName.id)
				? matchedByName.id
				: null

		if (!matchedId) {
			let byHash = manifestByHash.get(fileAsset.hash) ?? []
			for (let candidate of byHash) {
				if (!candidate.id || keepAssetIds.has(candidate.id)) continue
				if (!assetsById.has(candidate.id)) continue
				matchedId = candidate.id
				break
			}
		}

		if (matchedId) {
			let existing = assetsById.get(matchedId)
			if (!existing) continue

			let shouldUpdateBinary =
				matchedByName?.id === matchedId
					? matchedByName.hash !== fileAsset.hash
					: false

			if (shouldUpdateBinary) {
				matchedId = await syncExistingAssetFromFile(
					doc,
					existing,
					matchedId,
					fileAsset,
				)
			}

			let updatedAsset = doc.assets.find(
				asset => asset?.$isLoaded && asset.$jazz.id === matchedId,
			)
			if (!updatedAsset) continue
			assetsById.set(matchedId, updatedAsset)
			if (updatedAsset.name !== removeExtension(fileAsset.name)) {
				updatedAsset.$jazz.applyDiff({ name: removeExtension(fileAsset.name) })
			}

			keepAssetIds.add(matchedId)
			assetFilesById.set(matchedId, fileAsset.name)
			continue
		}

		let created = await createAssetFromBlob(
			fileAsset,
			doc.$jazz.owner,
			new Date(),
		)
		doc.assets.$jazz.push(created)
		keepAssetIds.add(created.$jazz.id)
		assetFilesById.set(created.$jazz.id, fileAsset.name)
	}

	for (let i = doc.assets.length - 1; i >= 0; i--) {
		let asset = doc.assets[i]
		if (!asset?.$isLoaded) continue
		if (keepAssetIds.has(asset.$jazz.id)) continue
		doc.assets.$jazz.splice(i, 1)
	}

	if (fileAssetsWithHash.length === 0) {
		return new Map<string, string>()
	}

	return assetFilesById
}

async function syncExistingAssetFromFile(
	doc: LoadedDocument,
	existing: co.loaded<typeof Asset>,
	assetId: string,
	fileAsset: { name: string; blob: Blob },
): Promise<string> {
	let nextType = fileAsset.blob.type.startsWith("video/") ? "video" : "image"
	if (existing.type !== nextType) {
		let index =
			doc.assets?.findIndex(asset => asset?.$jazz.id === assetId) ?? -1
		if (index === -1 || !doc.assets) return assetId
		doc.assets.$jazz.splice(index, 1)
		let replacement = await createAssetFromBlob(
			fileAsset,
			doc.$jazz.owner,
			existing.createdAt,
		)
		doc.assets.$jazz.push(replacement)
		return replacement.$jazz.id
	}

	if (existing.type === "video") {
		let stream = await FileStream.createFromBlob(fileAsset.blob, {
			owner: doc.$jazz.owner,
		})
		existing.$jazz.applyDiff({
			name: removeExtension(fileAsset.name),
			video: stream,
			mimeType: fileAsset.blob.type || "video/mp4",
		})
		return assetId
	}

	let image = await createImage(fileAsset.blob, {
		owner: doc.$jazz.owner,
		maxSize: 2048,
	})
	existing.$jazz.applyDiff({ name: removeExtension(fileAsset.name), image })
	return assetId
}

async function createAssetFromBlob(
	assetFile: { name: string; blob: Blob },
	owner: Group,
	now: Date,
) {
	let isVideo = assetFile.blob.type.startsWith("video/")
	if (isVideo) {
		let video = await FileStream.createFromBlob(assetFile.blob, {
			owner,
		})
		return VideoAsset.create(
			{
				type: "video",
				name: removeExtension(assetFile.name),
				video,
				mimeType: assetFile.blob.type || "video/mp4",
				createdAt: now,
			},
			owner,
		)
	}

	let image = await createImage(assetFile.blob, {
		owner,
		maxSize: 2048,
	})
	return ImageAsset.create(
		{
			type: "image",
			name: removeExtension(assetFile.name),
			image,
			createdAt: now,
		},
		owner,
	)
}

function removeExtension(filename: string): string {
	return filename.replace(/\.[^.]+$/, "")
}

function findMovedManifestEntry(
	manifestEntries: ManifestEntry[],
	scannedByPath: Map<string, ScannedFile>,
	matchedManifestDocIds: Set<string>,
	file: ScannedFile,
	contentHash: string,
	scannedAssetHashes: ScannedAssetHash[],
) {
	let candidates = manifestEntries.filter(entry => {
		if (matchedManifestDocIds.has(entry.docId)) return false
		if (scannedByPath.has(entry.relativePath)) return false
		if (entry.contentHash !== contentHash) return false
		if (!areScannedAssetsInSync(entry.assets, scannedAssetHashes)) return false
		return true
	})
	if (candidates.length === 0) return null
	if (candidates.length === 1) return candidates[0]

	let matchingBasename = candidates.filter(entry => {
		return getFilename(entry.relativePath) === getFilename(file.relativePath)
	})
	if (matchingBasename.length === 1) {
		return matchingBasename[0]
	}

	return null
}

function getFilename(relativePath: string): string {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length === 0) return relativePath
	return parts[parts.length - 1]
}

function getAssetFilesByIdFromManifest(
	manifestEntry: ManifestEntry,
): Map<string, string> {
	let filesById = new Map<string, string>()
	for (let asset of manifestEntry.assets) {
		if (!asset.id) continue
		filesById.set(asset.id, asset.name)
	}
	return filesById
}

function applyPathFromRelativePath(
	content: string,
	relativePath: string,
	hasAssets: boolean,
): string {
	let diskPath = derivePathFromRelativePath(relativePath, hasAssets)
	let { frontmatter } = parseFrontmatter(content)
	let currentPath = getPath(content)

	if (!frontmatter) {
		if (!diskPath) return content
		return `---\npath: ${diskPath}\n---\n\n${content}`
	}

	if (currentPath === diskPath) return content

	if (currentPath && !diskPath) {
		return content.replace(
			/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*\r?\n([\s\S]*?---)/,
			"$1$2",
		)
	}

	if (currentPath && diskPath) {
		return content.replace(
			/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*/,
			`$1path: ${diskPath}`,
		)
	}

	if (!currentPath && diskPath) {
		return content.replace(/^(---\r?\n)/, `$1path: ${diskPath}\n`)
	}

	return content
}

function derivePathFromRelativePath(
	relativePath: string,
	hasAssets: boolean,
): string | null {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length <= 1) return null

	let directoryParts = parts.slice(0, -1)
	if (!hasAssets) {
		let path = directoryParts.join("/")
		return path || null
	}

	let parentParts = directoryParts.slice(0, -1)
	let path = parentParts.join("/")
	return path || null
}

function buildLocationFromRelativePath(
	baseLocation: ReturnType<typeof computeDocLocations> extends Map<
		string,
		infer V
	>
		? V
		: never,
	relativePath: string,
) {
	let parts = relativePath.split("/").filter(Boolean)
	if (parts.length === 0) return baseLocation

	return {
		...baseLocation,
		dirPath: parts.slice(0, -1).join("/"),
		filename: parts[parts.length - 1],
	}
}

async function hashBlob(blob: Blob): Promise<string> {
	let buffer = await blob.arrayBuffer()
	let hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
	let hashArray = Array.from(new Uint8Array(hashBuffer))
	return hashArray
		.map(b => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16)
}

async function fileExists(
	dir: FileSystemDirectoryHandle,
	name: string,
): Promise<boolean> {
	try {
		await dir.getFileHandle(name)
		return true
	} catch {
		return false
	}
}

async function assetsExistAtLocation(
	dir: FileSystemDirectoryHandle,
	loc: ReturnType<typeof computeDocLocations> extends Map<string, infer V>
		? V
		: never,
	doc: BackupDoc,
): Promise<boolean> {
	let assetsDir = await dir.getDirectoryHandle("assets").catch(() => null)
	if (!assetsDir) return false

	for (let asset of doc.assets) {
		let filename = loc.assetFiles.get(asset.id)
		if (!filename) return false
		let exists = await fileExists(assetsDir, filename)
		if (!exists) return false
	}

	return true
}

async function hashScannedAssets(
	assets: { name: string; blob: Blob }[],
): Promise<ScannedAssetHash[]> {
	let hashed = await Promise.all(
		assets.map(async asset => ({
			name: asset.name,
			hash: await hashBlob(asset.blob),
		})),
	)
	return hashed
}

function areScannedAssetsInSync(
	manifestAssets: { id?: string; name: string; hash: string }[],
	scannedAssets: ScannedAssetHash[],
): boolean {
	if (manifestAssets.length !== scannedAssets.length) return false

	let sortedManifest = [...manifestAssets].sort((a, b) =>
		a.name.localeCompare(b.name),
	)
	let sortedScanned = [...scannedAssets].sort((a, b) =>
		a.name.localeCompare(b.name),
	)

	for (let i = 0; i < sortedManifest.length; i++) {
		if (sortedManifest[i].name !== sortedScanned[i].name) return false
		if (sortedManifest[i].hash !== sortedScanned[i].hash) return false
	}

	return true
}

function areManifestAssetsEqual(
	a: { id?: string; name: string; hash: string }[],
	b: { id?: string; name: string; hash: string }[],
): boolean {
	if (a.length !== b.length) return false

	let sortedA = [...a].sort((left, right) =>
		left.name.localeCompare(right.name),
	)
	let sortedB = [...b].sort((left, right) =>
		left.name.localeCompare(right.name),
	)

	for (let i = 0; i < sortedA.length; i++) {
		if ((sortedA[i].id ?? null) !== (sortedB[i].id ?? null)) return false
		if (sortedA[i].name !== sortedB[i].name) return false
		if (sortedA[i].hash !== sortedB[i].hash) return false
	}

	return true
}

function wasRecentlyImported(scopeKey: string, relativePath: string): boolean {
	let key = makeRecentImportKey(scopeKey, relativePath)
	let importedAt = recentImportedRelativePaths.get(key)
	if (!importedAt) return false
	if (Date.now() - importedAt > RECENT_IMPORT_WINDOW_MS) {
		recentImportedRelativePaths.delete(key)
		return false
	}
	return true
}

function markRecentlyImported(scopeKey: string, relativePath: string): void {
	recentImportedRelativePaths.set(
		makeRecentImportKey(scopeKey, relativePath),
		Date.now(),
	)
}

function makeRecentImportKey(scopeKey: string, relativePath: string): string {
	return `${scopeKey}:${relativePath}`
}

function getDocumentListScopeKey(targetDocs: DocumentList): string {
	let listId = targetDocs.$jazz.id
	if (listId) return `docs:${listId}`

	return "docs:unknown"
}

function getDocLocationKey(doc: BackupDoc): string {
	let path = doc.path ?? ""
	let hasAssets = doc.assets.length > 0 ? "assets" : "no-assets"
	return `${doc.title}|${path}|${hasAssets}`
}

function manifestEntryMatchesScope(
	entry: ManifestEntry,
	scopeId: string,
): boolean {
	if (!entry.scopeId) return true
	if (entry.scopeId === "docs:unknown") return true
	return entry.scopeId === scopeId
}

function buildManifestAssetsFromScanned(
	scannedAssets: ScannedAssetHash[],
	existingAssets: { id?: string; name: string; hash: string }[] = [],
): { id?: string; name: string; hash: string }[] {
	let existingByName = new Map(existingAssets.map(asset => [asset.name, asset]))
	return scannedAssets.map(asset => {
		let existing = existingByName.get(asset.name)
		if (!existing) {
			return { name: asset.name, hash: asset.hash }
		}
		if (existing.hash !== asset.hash) {
			return { name: asset.name, hash: asset.hash }
		}
		return { id: existing.id, name: asset.name, hash: asset.hash }
	})
}

function upsertManifestEntry(
	entriesByDocId: Map<string, ManifestEntry>,
	entry: ManifestEntry,
): boolean {
	let existing = entriesByDocId.get(entry.docId)
	if (existing && areManifestEntriesEquivalent(existing, entry)) {
		return false
	}
	entriesByDocId.set(entry.docId, entry)
	return true
}

function haveManifestEntriesChanged(
	left: ManifestEntry[],
	right: ManifestEntry[],
): boolean {
	if (left.length !== right.length) return true

	let sortedLeft = [...left].sort(compareManifestEntries)
	let sortedRight = [...right].sort(compareManifestEntries)
	for (let i = 0; i < sortedLeft.length; i++) {
		if (!areManifestEntriesEquivalent(sortedLeft[i], sortedRight[i])) {
			return true
		}
	}

	return false
}

function compareManifestEntries(
	left: ManifestEntry,
	right: ManifestEntry,
): number {
	if (left.docId !== right.docId) return left.docId.localeCompare(right.docId)
	return left.relativePath.localeCompare(right.relativePath)
}

function areManifestEntriesEquivalent(
	left: ManifestEntry,
	right: ManifestEntry,
): boolean {
	if (left.docId !== right.docId) return false
	if (left.relativePath !== right.relativePath) return false
	if ((left.scopeId ?? null) !== (right.scopeId ?? null)) return false
	if ((left.locationKey ?? null) !== (right.locationKey ?? null)) return false
	if (left.contentHash !== right.contentHash) return false
	if (left.lastSyncedAt !== right.lastSyncedAt) return false
	if (!areManifestAssetsEqual(left.assets, right.assets)) return false
	return true
}

function findMatchingUntrackedDocId(
	file: ScannedFile,
	targetDocs: DocumentList,
): string | null {
	if (file.assets.length > 0) return null

	let expectedContent = applyPathFromRelativePath(
		file.content,
		file.relativePath,
		false,
	)

	for (let doc of targetDocs) {
		if (!doc?.$isLoaded || doc.deletedAt) continue
		if (!doc.content?.$isLoaded) continue
		if (doc.assets?.$isLoaded && doc.assets.length > 0) continue

		if (doc.content.toString() === expectedContent) {
			return doc.$jazz.id
		}
	}

	return null
}
