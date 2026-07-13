import { co, type Group } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { Asset, ImageAsset, TldrawRevision, VideoAsset } from "./schema"
import { copyTldrawRevision, createTldrawAssetFromRevision } from "./tldraw"

export { copyAsset }

interface CopyAssetOptions {
	name?: string
	tldrawRevision?: co.loaded<typeof TldrawRevision>
}

async function copyAsset(
	asset: co.loaded<typeof Asset>,
	owner: Group,
	options: CopyAssetOptions = {},
) {
	let name = options.name ?? asset.name
	let createdAt = new Date()
	switch (asset.type) {
		case "image": {
			let loaded = await asset.$jazz.ensureLoaded({
				resolve: { image: { original: true } },
			})
			let blob = loaded.image.original.toBlob()
			if (!blob) throw new Error("Image asset is incomplete")
			let image = await createImage(blob, { owner, maxSize: 2048 })
			return ImageAsset.create({ type: "image", name, image, createdAt }, owner)
		}
		case "video": {
			let loaded = await asset.$jazz.ensureLoaded({ resolve: { video: true } })
			let blob = loaded.video.toBlob()
			if (!blob) throw new Error("Video asset is incomplete")
			let video = await co.fileStream().createFromBlob(blob, { owner })
			return VideoAsset.create(
				{
					type: "video",
					name,
					video,
					mimeType: asset.mimeType,
					muteAudio: asset.muteAudio,
					createdAt,
				},
				owner,
			)
		}
		case "tldraw": {
			let revision =
				options.tldrawRevision ??
				(await asset.$jazz.ensureLoaded({ resolve: { revision: true } }))
					.revision
			let copied = await copyTldrawRevision(revision, owner)
			return createTldrawAssetFromRevision(name, copied, owner, createdAt)
		}
		default:
			return unsupportedAsset(asset)
	}
}

function unsupportedAsset(asset: never): never {
	throw new Error(`Unsupported asset: ${asset}`)
}
