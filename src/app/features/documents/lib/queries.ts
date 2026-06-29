import { co, type ResolveQuery } from "jazz-tools"
import { useCoState, useAccount } from "jazz-tools/react"
import { Document } from "./schema"
import { UserAccount } from "@/schema"

export { loaderResolve, resolve, settingsResolve, meResolve }
export type { LoadedDocument, MaybeDocWithContent, LoadedMe }

type LoadedDocument = co.loaded<typeof Document, typeof resolve>
type MaybeDocWithContent = ReturnType<
	typeof useCoState<typeof Document, { content: true }>
>
type LoadedMe = ReturnType<
	typeof useAccount<typeof UserAccount, typeof meResolve>
>

let loaderResolve = {
	content: true,
	cursors: true,
	assets: true,
	comments: { $each: { replies: true } },
} as const satisfies ResolveQuery<typeof Document>

let resolve = {
	content: true,
	cursors: true,
	assets: { $each: { image: true, video: true } },
	comments: { $each: { replies: true } },
} as const satisfies ResolveQuery<typeof Document>

let settingsResolve = {
	root: { settings: true },
} as const satisfies ResolveQuery<typeof UserAccount>

let meResolve = {
	root: {
		documents: { $each: { content: true, comments: { $each: true } } },
		spaces: {
			$each: {
				documents: { $each: { content: true, comments: { $each: true } } },
			},
		},
		settings: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>
