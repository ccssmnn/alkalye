import { co } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { useCoState } from "jazz-tools/react"
import { Asset, ImageAsset, VideoAsset } from "./schema"
import { Document } from "@/app/features/documents/lib/schema"
import { compressVideo } from "./video-conversion"

export {
	makeUploadImage,
	makeUploadVideo,
	makeUploadAssets,
	makeRenameAsset,
	makeIsAssetUsed,
	makeDeleteAsset,
	makeDownloadAsset,
}
export type { LoadedDocument, MaybeDocWithContent, VideoUploadProgress }

type LoadedDocument = co.loaded<
	typeof Document,
	{
		content: true
		cursors: true
		assets: { $each: { image: true; video: true } }
	}
>

type MaybeDocWithContent = ReturnType<
	typeof useCoState<typeof Document, { content: true }>
>

type VideoUploadProgress = {
	phase: "compressing" | "uploading" | "done"
	progress: number
}

function makeUploadImage(doc: LoadedDocument) {
	return async function handleUploadImage(
		file: File,
	): Promise<{ id: string; name: string }> {
		let image = await createImage(file, {
			owner: doc.$jazz.owner,
			maxSize: 2048,
		})

		if (!doc.assets) {
			doc.$jazz.set("assets", co.list(Asset).create([], doc.$jazz.owner))
		}

		let asset = ImageAsset.create(
			{
				type: "image",
				name: file.name.replace(/\.[^.]+$/, ""),
				image,
				createdAt: new Date(),
			},
			doc.$jazz.owner,
		)

		doc.assets!.$jazz.push(asset)
		doc.$jazz.set("updatedAt", new Date())

		return { id: asset.$jazz.id, name: asset.name }
	}
}

function makeUploadVideo(doc: LoadedDocument) {
	return async function handleUploadVideo(
		file: File,
		options: {
			onProgress?: (progress: VideoUploadProgress) => void
			signal?: AbortSignal
		} = {},
	): Promise<{ id: string; name: string }> {
		let { onProgress, signal } = options

		let compressed = await compressVideo(file, {
			onProgress: p =>
				onProgress?.({ phase: "compressing", progress: p.progress }),
			signal,
		})

		onProgress?.({ phase: "uploading", progress: 0 })
		let video = await co.fileStream().createFromBlob(compressed, {
			owner: doc.$jazz.owner,
			onProgress: p => onProgress?.({ phase: "uploading", progress: p }),
		})

		if (!doc.assets) {
			doc.$jazz.set("assets", co.list(Asset).create([], doc.$jazz.owner))
		}

		let asset = VideoAsset.create(
			{
				type: "video",
				name: file.name.replace(/\.[^.]+$/, ""),
				video,
				mimeType: "video/mp4",
				createdAt: new Date(),
			},
			doc.$jazz.owner,
		)

		doc.assets!.$jazz.push(asset)
		doc.$jazz.set("updatedAt", new Date())

		onProgress?.({ phase: "done", progress: 1 })
		return { id: asset.$jazz.id, name: asset.name }
	}
}

function makeUploadAssets(doc: LoadedDocument) {
	return async function handleUploadAssets(files: FileList) {
		for (let file of Array.from(files)) {
			if (!file.type.startsWith("image/")) continue

			let image = await createImage(file, {
				owner: doc.$jazz.owner,
				maxSize: 2048,
			})

			if (!doc.assets) {
				doc.$jazz.set("assets", co.list(Asset).create([], doc.$jazz.owner))
			}

			let asset = ImageAsset.create(
				{
					type: "image",
					name: file.name.replace(/\.[^.]+$/, ""),
					image,
					createdAt: new Date(),
				},
				doc.$jazz.owner,
			)

			doc.assets!.$jazz.push(asset)
		}

		doc.$jazz.set("updatedAt", new Date())
	}
}

function makeRenameAsset(doc: LoadedDocument) {
	return function handleRenameAsset(assetId: string, newName: string) {
		let asset = doc.assets?.find(a => a?.$jazz.id === assetId)
		if (asset?.$isLoaded) {
			asset.$jazz.applyDiff({ name: newName })
			doc.$jazz.set("updatedAt", new Date())
		}
	}
}

function makeIsAssetUsed(docWithContent: MaybeDocWithContent) {
	return function isAssetUsed(assetId: string): boolean {
		if (!docWithContent?.$isLoaded || !docWithContent.content) return false
		let content = docWithContent.content.toString()
		let regex = new RegExp(`!\\[[^\\]]*\\]\\(asset:${assetId}\\)`)
		return regex.test(content)
	}
}

function makeDeleteAsset(
	doc: LoadedDocument,
	docWithContent: MaybeDocWithContent,
) {
	return function handleDeleteAsset(assetId: string) {
		if (!doc.assets) return

		if (docWithContent?.$isLoaded && docWithContent.content) {
			let content = docWithContent.content.toString()
			let regex = new RegExp(`!\\[[^\\]]*\\]\\(asset:${assetId}\\)`, "g")
			let newContent = content.replace(regex, "")
			if (newContent !== content) {
				docWithContent.content.$jazz.applyDiff(newContent)
			}
		}

		let idx = doc.assets.findIndex(a => a?.$jazz.id === assetId)
		if (idx !== -1) {
			doc.assets.$jazz.splice(idx, 1)
			doc.$jazz.set("updatedAt", new Date())
		}
	}
}

function makeDownloadAsset(doc: LoadedDocument) {
	return async function handleDownloadAsset(assetId: string, name: string) {
		let asset = doc.assets?.find(a => a?.$jazz.id === assetId)
		if (!asset?.$isLoaded) return

		let blob: Blob | undefined
		if (asset.type === "image" && asset.image?.$isLoaded) {
			let original = asset.image.original
			if (original?.$isLoaded) {
				blob = original.toBlob()
			}
		} else if (asset.type === "video" && asset.video?.$isLoaded) {
			blob = asset.video.toBlob()
		}

		if (!blob) return

		let url = URL.createObjectURL(blob)
		let a = document.createElement("a")
		a.href = url
		a.download = `${name}.${blob.type.split("/")[1] || "png"}`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}
}
