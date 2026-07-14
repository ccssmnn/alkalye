import { co, type Group } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { Asset, ImageAsset, VideoAsset } from "./schema"
import {
	TLDRAW_BACKUP_EXTENSION,
	TLDRAW_BACKUP_MIME_TYPE,
	TldrawBackupContentError,
	TldrawBackupSizeError,
	createTldrawAssetFromRevision,
	createTldrawBackupBundle,
	createTldrawRevisionFromBackup,
} from "./tldraw"

export {
	TLDRAW_BACKUP_EXTENSION,
	TLDRAW_BACKUP_MIME_TYPE,
	AssetSerializationError,
	classifyAssetFile,
	isAssetFileName,
	assetMimeTypeFromFileName,
	assetExtensionFromMimeType,
	serializeAsset,
	createAssetFromFile,
	updateAssetFromFile,
}
export type { AssetFileKind }

type AssetFileKind = "image" | "video" | "tldraw"

class AssetSerializationError extends Error {}

interface AssetFileInput {
	blob: Blob
	fileName: string
	name?: string
	createdAt?: Date
}

function classifyAssetFile(file: {
	name: string
	type: string
}): AssetFileKind | null {
	let name = file.name.toLowerCase()
	if (
		file.type === TLDRAW_BACKUP_MIME_TYPE ||
		name.endsWith(TLDRAW_BACKUP_EXTENSION)
	) {
		return "tldraw"
	}
	if (file.type.startsWith("image/") || isImageFileName(name)) return "image"
	if (file.type.startsWith("video/") || isVideoFileName(name)) return "video"
	return null
}

function isAssetFileName(name: string) {
	return classifyAssetFile({ name, type: "" }) !== null
}

function assetMimeTypeFromFileName(name: string) {
	let extension = name.toLowerCase().split(".").pop() ?? ""
	return mimeTypes[extension] ?? "application/octet-stream"
}

function assetExtensionFromMimeType(mimeType: string) {
	return extensionsByMimeType[mimeType]
}

async function serializeAsset(
	asset: co.loaded<typeof Asset>,
): Promise<Blob | undefined> {
	switch (asset.type) {
		case "image": {
			let loaded = await asset.$jazz.ensureLoaded({
				resolve: { image: { original: true } },
			})
			return loaded.image.original.toBlob()
		}
		case "video": {
			let loaded = await asset.$jazz.ensureLoaded({ resolve: { video: true } })
			return loaded.video.toBlob()
		}
		case "tldraw": {
			let loaded = await asset.$jazz.ensureLoaded({
				resolve: { revision: true },
			})
			try {
				return await createTldrawBackupBundle(loaded.revision)
			} catch (error) {
				if (
					!(error instanceof TldrawBackupSizeError) &&
					!(error instanceof TldrawBackupContentError)
				)
					throw error
				throw new AssetSerializationError(
					`Could not export asset "${asset.name}": ${error.message}`,
				)
			}
		}
		default:
			return unsupportedAsset(asset)
	}
}

async function createAssetFromFile(input: AssetFileInput, owner: Group) {
	let kind = classifyAssetFile({ name: input.fileName, type: input.blob.type })
	if (!kind) throw new Error(`Unsupported asset file: ${input.fileName}`)

	let name = input.name ?? removeExtension(input.fileName)
	let createdAt = input.createdAt ?? new Date()
	switch (kind) {
		case "image": {
			let image = await createImage(input.blob, { owner, maxSize: 2048 })
			return ImageAsset.create({ type: "image", name, image, createdAt }, owner)
		}
		case "video": {
			let video = await co.fileStream().createFromBlob(input.blob, { owner })
			let mimeType =
				input.blob.type || assetMimeTypeFromFileName(input.fileName)
			return VideoAsset.create(
				{ type: "video", name, video, mimeType, createdAt },
				owner,
			)
		}
		case "tldraw": {
			let revision = await createTldrawRevisionFromBackup(input.blob, owner)
			return createTldrawAssetFromRevision(name, revision, owner, createdAt)
		}
		default:
			return unsupportedAssetKind(kind)
	}
}

async function updateAssetFromFile(
	asset: co.loaded<typeof Asset>,
	input: AssetFileInput,
	owner: Group,
) {
	let kind = classifyAssetFile({ name: input.fileName, type: input.blob.type })
	if (kind !== asset.type) throw new Error("Asset file type changed")
	let name = input.name ?? removeExtension(input.fileName)

	switch (asset.type) {
		case "image": {
			let image = await createImage(input.blob, { owner, maxSize: 2048 })
			asset.$jazz.applyDiff({ name, image })
			return
		}
		case "video": {
			let video = await co.fileStream().createFromBlob(input.blob, { owner })
			let mimeType =
				input.blob.type || assetMimeTypeFromFileName(input.fileName)
			asset.$jazz.applyDiff({ name, video, mimeType })
			return
		}
		case "tldraw": {
			let revision = await createTldrawRevisionFromBackup(input.blob, owner)
			asset.$jazz.applyDiff({ name, revision })
			return
		}
		default:
			return unsupportedAsset(asset)
	}
}

function unsupportedAsset(asset: never): never {
	throw new Error(`Unsupported asset: ${asset}`)
}

function unsupportedAssetKind(kind: never): never {
	throw new Error(`Unsupported asset kind: ${kind}`)
}

function isImageFileName(name: string) {
	return imageExtensions.some(extension => name.endsWith(`.${extension}`))
}

function isVideoFileName(name: string) {
	return videoExtensions.some(extension => name.endsWith(`.${extension}`))
}

function removeExtension(name: string) {
	return name.replace(/\.[^.]+$/, "")
}

let imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]
let videoExtensions = ["mp4", "webm", "mov"]
let mimeTypes: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	bmp: "image/bmp",
	mp4: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
	"alkalye-tldraw": TLDRAW_BACKUP_MIME_TYPE,
}
let extensionsByMimeType: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/svg+xml": ".svg",
	"image/bmp": ".bmp",
	"video/mp4": ".mp4",
	"video/webm": ".webm",
	"video/quicktime": ".mov",
	[TLDRAW_BACKUP_MIME_TYPE]: TLDRAW_BACKUP_EXTENSION,
}
