import type { ResolveQuery } from "jazz-tools"
import { Asset } from "./schema"

export { assetPreviewResolve, assetContentResolve }

let assetPreviewResolve = {
	image: true,
	video: true,
	revision: {
		lightPreview: true,
		darkPreview: true,
	},
} as const satisfies ResolveQuery<typeof Asset>

let assetContentResolve = {
	image: true,
	video: true,
	revision: {
		snapshot: true,
		lightPreview: true,
		darkPreview: true,
	},
} as const satisfies ResolveQuery<typeof Asset>
