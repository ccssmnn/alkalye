import { createFileRoute, redirect } from "@tanstack/react-router"
import { Group, co, type ResolveQuery } from "jazz-tools"
import { UserAccount, Document } from "@/schema"

export { Route }

let documentsQuery = {
	root: {
		documents: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

let Route = createFileRoute("/new")({
	loader: async ({ context }) => {
		let { me } = context
		if (!me) throw redirect({ to: "/" })

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
