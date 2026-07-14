import type { co } from "jazz-tools"
import { Asset } from "./schema"

export { toEditorAsset, toSidebarAsset }
export type { EditorAsset, SidebarAsset }

interface EditorAsset {
	id: string
	name: string
	type: "image" | "video" | "tldraw"
	previewId?: string
	video?: { $isLoaded?: boolean; toBlob?: () => Blob | undefined }
	muteAudio?: boolean
}

interface SidebarAsset {
	id: string
	name: string
	type: "image" | "video" | "tldraw"
	imageId?: string
	lightPreviewId?: string
	darkPreviewId?: string
	tldrawRevisionId?: string
	getVideoBlob?: () => Blob | undefined
	muteAudio?: boolean
}

function toEditorAsset(
	asset: co.loaded<typeof Asset>,
	theme: "light" | "dark",
): EditorAsset {
	let revision =
		asset.type === "tldraw" && asset.revision?.$isLoaded
			? asset.revision
			: undefined
	return {
		id: asset.$jazz.id,
		name: asset.name,
		type: asset.type,
		previewId:
			asset.type === "image"
				? asset.image?.$jazz.id
				: theme === "dark"
					? revision?.darkPreview?.$jazz.id
					: revision?.lightPreview?.$jazz.id,
		video: asset.type === "video" ? asset.video : undefined,
		muteAudio: asset.type === "video" ? asset.muteAudio : undefined,
	}
}

function toSidebarAsset(asset: co.loaded<typeof Asset>): SidebarAsset {
	let video =
		asset.type === "video" && asset.video?.$isLoaded ? asset.video : null
	let revision =
		asset.type === "tldraw" && asset.revision?.$isLoaded
			? asset.revision
			: undefined
	return {
		id: asset.$jazz.id,
		name: asset.name,
		type: asset.type,
		imageId: asset.type === "image" ? asset.image?.$jazz.id : undefined,
		lightPreviewId: revision?.lightPreview?.$jazz.id,
		darkPreviewId: revision?.darkPreview?.$jazz.id,
		tldrawRevisionId: revision?.$jazz.id,
		getVideoBlob: video ? () => video.toBlob() : undefined,
		muteAudio: asset.type === "video" ? asset.muteAudio : undefined,
	}
}
