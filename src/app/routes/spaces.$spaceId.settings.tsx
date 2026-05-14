import { createFileRoute } from "@tanstack/react-router"
import { Space } from "@/schema"
import {
	SpaceSettingsScreen,
	spaceSettingsResolve,
} from "@/app/features/spaces"

export { Route }

let Route = createFileRoute("/spaces/$spaceId/settings")({
	loader: async ({ params }) => {
		let space = await Space.load(params.spaceId, {
			resolve: spaceSettingsResolve,
		})
		if (!space.$isLoaded) {
			return { space: null, loadingState: space.$jazz.loadingState }
		}
		return { space, loadingState: null }
	},
	component: SpaceSettingsPage,
})

function SpaceSettingsPage() {
	let { spaceId } = Route.useParams()
	let data = Route.useLoaderData()
	return <SpaceSettingsScreen spaceId={spaceId} loaderData={data} />
}
