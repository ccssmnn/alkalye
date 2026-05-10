import { createFileRoute } from "@tanstack/react-router"
import { Document } from "@/schema"
import {
	TimeMachineScreen,
	resolve,
	settingsResolve,
	type ViewMode,
} from "@/app/features/time-machine"

export { Route }

let Route = createFileRoute("/doc/$id/timemachine")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		edit?: number
		mode?: ViewMode
	} => {
		let mode: ViewMode | undefined
		if (search.mode === "days" || search.mode === "edits") {
			mode = search.mode
		}
		return {
			edit:
				typeof search.edit === "string" || typeof search.edit === "number"
					? Number(search.edit)
					: undefined,
			mode,
		}
	},
	loader: async ({ params, context }) => {
		let doc = await Document.load(params.id, { resolve })
		if (!doc.$isLoaded) {
			return { doc: null, loadingState: doc.$jazz.loadingState, me: null }
		}

		let me = context.me
			? await context.me.$jazz.ensureLoaded({ resolve: settingsResolve })
			: null

		return { doc, loadingState: null, me }
	},
	component: RouteComponent,
})

function RouteComponent() {
	let { id } = Route.useParams()
	let loaderData = Route.useLoaderData()
	let search = Route.useSearch()
	return <TimeMachineScreen id={id} loaderData={loaderData} search={search} />
}
