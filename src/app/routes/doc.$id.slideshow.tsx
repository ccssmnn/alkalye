import { createFileRoute } from "@tanstack/react-router"
import { Document } from "@/schema"
import {
	SlideshowScreen,
	slideshowResolve,
	loadSlideshowWikilinkCache,
	type SlideshowLoaderData,
} from "@/app/features/presentation"
import { type ResolvedDoc } from "@/lib/doc-resolver"

export { Route }

let Route = createFileRoute("/doc/$id/slideshow")({
	loader: async ({ params }): Promise<SlideshowLoaderData> => {
		let doc = await Document.load(params.id, { resolve: slideshowResolve })
		if (!doc.$isLoaded) {
			return {
				doc: null,
				loadingState: doc.$jazz.loadingState,
				wikilinkCache: new Map<string, ResolvedDoc>(),
			}
		}

		let wikilinkCache = await loadSlideshowWikilinkCache(doc)
		return { doc, loadingState: null, wikilinkCache }
	},
	component: RouteComponent,
})

function RouteComponent() {
	let { id } = Route.useParams()
	let loaderData = Route.useLoaderData()
	return <SlideshowScreen id={id} loaderData={loaderData} />
}
