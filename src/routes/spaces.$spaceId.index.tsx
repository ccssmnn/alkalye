import { createFileRoute, redirect } from "@tanstack/react-router"
import { co, type ResolveQuery } from "jazz-tools"
import { Document, Space } from "@/schema"

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

		// Space deleted
		if (space.deletedAt) {
			throw redirect({ to: "/" })
		}

		// Find most recent non-deleted doc
		let mostRecentDoc = [...space.documents]
			.filter(d => d?.$isLoaded && !d.deletedAt && !d.permanentlyDeletedAt)
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

		// No docs - create new one
		let now = new Date()
		let newDoc = Document.create(
			{
				version: 1,
				content: co.plainText().create("", space.$jazz.owner),
				spaceId: params.spaceId,
				createdAt: now,
				updatedAt: now,
			},
			space.$jazz.owner,
		)
		space.documents.$jazz.push(newDoc)

		throw redirect({
			to: "/spaces/$spaceId/doc/$id",
			params: { spaceId: params.spaceId, id: newDoc.$jazz.id },
		})
	},
})
