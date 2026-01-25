import { createFileRoute, redirect } from "@tanstack/react-router"
import { Group, type ResolveQuery } from "jazz-tools"
import { Space, createSpaceDocument } from "@/schema"

export { Route }

let spaceQuery = {
	documents: { $each: true, $onError: "catch" },
} as const satisfies ResolveQuery<typeof Space>

let Route = createFileRoute("/spaces/$spaceId/")({
	loader: async ({ params }) => {
		let space = await Space.load(params.spaceId, { resolve: spaceQuery })

		if (!space.$isLoaded || !space.documents?.$isLoaded) {
			throw redirect({ to: "/" })
		}

		// Find most recent non-deleted doc
		let mostRecentDoc = [...space.documents]
			.filter(d => d?.$isLoaded && !d.deletedAt)
			.sort(
				(a, b) =>
					new Date(b!.updatedAt).getTime() - new Date(a!.updatedAt).getTime(),
			)
			.at(0)

		if (mostRecentDoc) {
			throw redirect({
				to: "/spaces/$spaceId/doc/$id",
				params: { spaceId: params.spaceId, id: mostRecentDoc.$jazz.id },
			})
		}

		// No docs exist - check if user can create (has write access)
		let spaceGroup =
			space.$jazz.owner instanceof Group ? space.$jazz.owner : null
		let canWrite =
			spaceGroup?.myRole() === "admin" || spaceGroup?.myRole() === "writer"

		if (!canWrite) {
			// Public space with no docs, can't create - redirect to home
			throw redirect({ to: "/" })
		}

		// User can write - create new doc with its own group
		let newDoc = createSpaceDocument(space.$jazz.owner, "")
		space.documents.$jazz.push(newDoc)

		throw redirect({
			to: "/spaces/$spaceId/doc/$id",
			params: { spaceId: params.spaceId, id: newDoc.$jazz.id },
		})
	},
})
