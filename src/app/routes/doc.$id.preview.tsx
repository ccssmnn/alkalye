import { createFileRoute } from "@tanstack/react-router"
import { Document } from "@/schema"
import {
	DocPreviewScreen,
	previewResolve,
	resolveDocTitles,
	type ResolvedDoc,
} from "@/app/features/documents"
import { parseWikiLinks } from "@/app/features/editor"

export { Route }

let Route = createFileRoute("/doc/$id/preview")({
	loader: async ({ params }) => {
		let doc = await Document.load(params.id, {
			resolve: previewResolve,
		})
		if (!doc.$isLoaded) {
			return {
				doc: null,
				loadingState: doc.$jazz.loadingState,
				wikilinkCache: new Map<string, ResolvedDoc>(),
			}
		}

		let content = doc.content?.toString() ?? ""
		let wikilinks = parseWikiLinks(content)
		let wikilinkIds = wikilinks.map(w => w.id)
		let wikilinkCache = await resolveDocTitles(wikilinkIds)

		return { doc, loadingState: null, wikilinkCache }
	},
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>) => ({
		from: search.from as "list" | undefined,
	}),
})

function RouteComponent() {
	let { id } = Route.useParams()
	let loaderData = Route.useLoaderData()
	return <DocPreviewScreen id={id} loaderData={loaderData} />
}
