import { co, z } from "jazz-tools"

export { ImageAsset, VideoAsset, Asset }

let ImageAsset = co.map({
	type: z.literal("image"),
	name: z.string(),
	image: co.image(),
	createdAt: z.date(),
})

let VideoAsset = co.map({
	type: z.literal("video"),
	name: z.string(),
	video: co.fileStream(),
	mimeType: z.string(),
	muteAudio: z.boolean().optional(),
	createdAt: z.date(),
})

let Asset = co.discriminatedUnion("type", [ImageAsset, VideoAsset])
