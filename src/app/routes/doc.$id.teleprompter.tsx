import { createFileRoute } from "@tanstack/react-router"
import { Document } from "@/schema"
import {
	TeleprompterScreen,
	teleprompterResolve,
	loadTeleprompterWikilinkCache,
	type TeleprompterLoaderData,
} from "@/app/features/presentation"
import { type ResolvedDoc } from "@/lib/doc-resolver"

export { Route }

let Route = createFileRoute("/doc/$id/teleprompter")({
	loader: async ({ params }): Promise<TeleprompterLoaderData> => {
		let doc = await Document.load(params.id, { resolve: teleprompterResolve })
		if (!doc.$isLoaded) {
			return {
				doc: null,
				loadingState: doc.$jazz.loadingState as "unauthorized" | "unavailable",
				wikilinkCache: new Map<string, ResolvedDoc>(),
			}
		}

		let wikilinkCache = await loadTeleprompterWikilinkCache(doc)
		return { doc, loadingState: null, wikilinkCache }
	},
	component: RouteComponent,
})

function RouteComponent() {
	let { id } = Route.useParams()
	let loaderData = Route.useLoaderData()
	return <TeleprompterScreen id={id} loaderData={loaderData} />
}
