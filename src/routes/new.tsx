import { createFileRoute, redirect } from "@tanstack/react-router"
import { type ResolveQuery } from "jazz-tools"
import { z } from "zod"
import { UserAccount, Space, createSpaceDocument } from "@/schema"
import { createPersonalDocument } from "@/lib/documents"

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

			let newDoc = createSpaceDocument(space.$jazz.owner, "")
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

		let newDoc = await createPersonalDocument(loadedMe, "")

		throw redirect({
			to: "/doc/$id",
			params: { id: newDoc.$jazz.id },
		})
	},
})
