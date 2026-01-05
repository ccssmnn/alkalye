import { createFileRoute, redirect } from "@tanstack/react-router"
import { Group, co, type ResolveQuery } from "jazz-tools"
import { z } from "zod"
import { UserAccount, Document, Space } from "@/schema"

export { Route }

let documentsQuery = {
	root: {
		documents: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

let spaceQuery = {
	documents: true,
} as const satisfies ResolveQuery<typeof Space>

let Route = createFileRoute("/new")({
	validateSearch: z.object({
		spaceId: z.string().optional(),
	}),
	loader: async ({ context, location }) => {
		let { me } = context
		if (!me) throw redirect({ to: "/" })

		let spaceId = new URLSearchParams(location.search).get("spaceId")

		// Space context: create doc in space.documents
		if (spaceId) {
			let space = await Space.load(spaceId, { resolve: spaceQuery })
			if (!space.$isLoaded || !space.documents?.$isLoaded) {
				throw redirect({ to: "/" })
			}

			let now = new Date()
			let newDoc = Document.create(
				{
					version: 1,
					content: co.plainText().create("", space.$jazz.owner),
					spaceId,
					createdAt: now,
					updatedAt: now,
				},
				space.$jazz.owner,
			)
			space.documents.$jazz.push(newDoc)

			throw redirect({
				to: "/spaces/$spaceId/doc/$id",
				params: { spaceId, id: newDoc.$jazz.id },
			})
		}

		// Personal context: create doc in UserRoot.documents
		let loadedMe = await me.$jazz.ensureLoaded({ resolve: documentsQuery })
		let docs = loadedMe.root?.documents
		if (!docs?.$isLoaded) throw redirect({ to: "/" })

		let now = new Date()
		let group = Group.create()
		let newDoc = Document.create(
			{
				version: 1,
				content: co.plainText().create("", group),
				createdAt: now,
				updatedAt: now,
			},
			group,
		)
		docs.$jazz.push(newDoc)

		throw redirect({
			to: "/doc/$id",
			params: { id: newDoc.$jazz.id },
		})
	},
})
