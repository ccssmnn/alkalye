import { co, type Group } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { z } from "zod"
import { Asset, TldrawAsset, TldrawRevision } from "./schema"
import { Document } from "@/app/features/documents/lib/schema"
import { syncDocumentMetadata } from "@/app/features/documents/lib/metadata"

export {
	TLDRAW_BACKUP_EXTENSION,
	TLDRAW_BACKUP_MIME_TYPE,
	createTldrawAsset,
	createTldrawAssetFromRevision,
	updateTldrawAsset,
	tldrawNameFromFile,
	copyTldrawRevision,
	createTldrawBackupBundle,
	createTldrawRevisionFromBackup,
	decodeTldrawBackupBundle,
}
export type { TldrawSave }

let TLDRAW_BACKUP_EXTENSION = ".alkalye-tldraw"
let TLDRAW_BACKUP_MIME_TYPE = "application/vnd.alkalye.tldraw+json"

type LoadedDocument = co.loaded<
	typeof Document,
	{
		content: true
		assets: true
	}
>

interface TldrawSave {
	json: string
	lightPreview: Blob
	darkPreview: Blob
}

let backupBundleSchema = z.object({
	format: z.literal("alkalye-tldraw-v1"),
	snapshot: z.string().max(8 * 1024 * 1024),
	lightPreview: z.string().max(12 * 1024 * 1024),
	darkPreview: z.string().max(12 * 1024 * 1024),
})

async function createTldrawAsset(
	doc: LoadedDocument,
	name: string,
	save: TldrawSave,
) {
	let revision = await createRevision(doc.$jazz.owner, save)
	let asset = createTldrawAssetFromRevision(name, revision, doc.$jazz.owner)

	let assets = doc.assets
	if (!assets) {
		assets = co.list(Asset).create([], doc.$jazz.owner)
		doc.$jazz.set("assets", assets)
	}
	assets.$jazz.push(asset)
	markDocumentUpdated(doc)
	return asset
}

function createTldrawAssetFromRevision(
	name: string,
	revision: co.loaded<typeof TldrawRevision>,
	owner: Group,
	createdAt = new Date(),
) {
	return TldrawAsset.create(
		{
			version: 1,
			type: "tldraw",
			name,
			revision,
			createdAt,
		},
		owner,
	)
}

async function updateTldrawAsset(
	doc: LoadedDocument,
	assetId: string,
	save: TldrawSave,
) {
	let asset = doc.assets?.find(candidate => candidate?.$jazz.id === assetId)
	if (!asset?.$isLoaded || asset.type !== "tldraw") return

	let revision = await createRevision(doc.$jazz.owner, save)
	asset.$jazz.set("revision", revision)
	markDocumentUpdated(doc)
}

function tldrawNameFromFile(file: File) {
	return file.name.replace(/\.tldr$/i, "") || "Whiteboard"
}

async function copyTldrawRevision(
	revision: co.loaded<typeof TldrawRevision>,
	owner: Group,
) {
	let { snapshotBlob, lightBlob, darkBlob } = await loadRevisionBlobs(revision)

	let [snapshot, lightPreview, darkPreview] = await Promise.all([
		co.fileStream().createFromBlob(snapshotBlob, { owner }),
		createImage(lightBlob, { owner, maxSize: 2048 }),
		createImage(darkBlob, { owner, maxSize: 2048 }),
	])
	return TldrawRevision.create(
		{ snapshot, lightPreview, darkPreview, createdAt: new Date() },
		owner,
	)
}

async function createTldrawBackupBundle(
	revision: co.loaded<typeof TldrawRevision>,
) {
	let { snapshotBlob, lightBlob, darkBlob } = await loadRevisionBlobs(revision)

	let [snapshot, lightPreview, darkPreview] = await Promise.all([
		snapshotBlob.text(),
		blobToDataUrl(lightBlob),
		blobToDataUrl(darkBlob),
	])
	return new Blob(
		[
			JSON.stringify({
				format: "alkalye-tldraw-v1",
				snapshot,
				lightPreview,
				darkPreview,
			}),
		],
		{ type: TLDRAW_BACKUP_MIME_TYPE },
	)
}

async function createTldrawRevisionFromBackup(blob: Blob, owner: Group) {
	return createRevision(owner, await decodeTldrawBackupBundle(blob))
}

async function decodeTldrawBackupBundle(blob: {
	size: number
	text: () => Promise<string>
}): Promise<TldrawSave> {
	if (blob.size > 32 * 1024 * 1024) {
		throw new Error("Whiteboard backup is too large")
	}
	let parsed = backupBundleSchema.parse(JSON.parse(await blob.text()))
	let { validateTldrawFile } = await import("./tldraw-file")
	validateTldrawFile(parsed.snapshot)
	return {
		json: parsed.snapshot,
		lightPreview: decodePngDataUrl(parsed.lightPreview),
		darkPreview: decodePngDataUrl(parsed.darkPreview),
	}
}

async function loadRevisionBlobs(revision: co.loaded<typeof TldrawRevision>) {
	let loaded = await revision.$jazz.ensureLoaded({
		resolve: {
			snapshot: true,
			lightPreview: { original: true },
			darkPreview: { original: true },
		},
	})
	let snapshotBlob = loaded.snapshot.toBlob()
	let lightOriginal = loaded.lightPreview.original
	let darkOriginal = loaded.darkPreview.original
	if (!snapshotBlob || !lightOriginal?.$isLoaded || !darkOriginal?.$isLoaded) {
		throw new Error("Whiteboard revision is incomplete")
	}
	let lightBlob = lightOriginal.toBlob()
	let darkBlob = darkOriginal.toBlob()
	if (!lightBlob || !darkBlob)
		throw new Error("Whiteboard previews are incomplete")
	return { snapshotBlob, lightBlob, darkBlob }
}

function decodePngDataUrl(dataUrl: string) {
	let prefix = "data:image/png;base64,"
	if (!dataUrl.startsWith(prefix)) {
		throw new Error("Whiteboard preview must be a PNG data URL")
	}
	let encoded = dataUrl.slice(prefix.length)
	if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
		throw new Error("Whiteboard preview is not valid base64")
	}
	let binary = atob(encoded)
	if (binary.length > 8 * 1024 * 1024) {
		throw new Error("Whiteboard preview is too large")
	}
	let bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
	return new Blob([bytes], { type: "image/png" })
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		let reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result === "string") resolve(reader.result)
			else reject(new Error("Could not encode whiteboard preview"))
		}
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

function markDocumentUpdated(doc: LoadedDocument) {
	doc.$jazz.set("updatedAt", new Date())
	syncDocumentMetadata(doc, { contentChanged: false })
}

async function createRevision(owner: Group, save: TldrawSave) {
	let snapshot = await co
		.fileStream()
		.createFromBlob(
			new Blob([save.json], { type: "application/vnd.tldraw+json" }),
			{ owner },
		)
	let [lightPreview, darkPreview] = await Promise.all([
		createImage(save.lightPreview, { owner, maxSize: 2048 }),
		createImage(save.darkPreview, { owner, maxSize: 2048 }),
	])

	return TldrawRevision.create(
		{
			snapshot,
			lightPreview,
			darkPreview,
			createdAt: new Date(),
		},
		owner,
	)
}
