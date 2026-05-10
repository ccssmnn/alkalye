import { createFileRoute } from "@tanstack/react-router"
import { SpaceListScreen, spaceListLoader } from "@/app/features/spaces"

export { Route }

let Route = createFileRoute("/spaces/$spaceId/")({
	loader: ({ params }) => spaceListLoader(params.spaceId),
	component: SpaceIndexPage,
})

function SpaceIndexPage() {
	let data = Route.useLoaderData()
	return <SpaceListScreen loaderData={data} />
}
