import { createFileRoute, redirect } from "@tanstack/react-router"
import { Group, co, type ResolveQuery } from "jazz-tools"
import { z } from "zod"
import { UserAccount, Document } from "@/schema"

export { Route }

let lastOpenedQuery = {
	root: true,
} as const satisfies ResolveQuery<typeof UserAccount>

let documentsQuery = {
	root: {
		documents: { $each: true, $onError: "catch" },
	},
} as const satisfies ResolveQuery<typeof UserAccount>

let searchSchema = z.object({
	personal: z.boolean().optional(),
})

let Route = createFileRoute("/")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ personal: search.personal }),
	loader: async ({ context, deps }) => {
		let { me } = context
		if (!me) return null

		// Fast path: try last opened doc (skip if personal=true)
		if (!deps.personal) {
			let loaded = await me.$jazz.ensureLoaded({ resolve: lastOpenedQuery })
			let { lastOpenedDocId, lastOpenedSpaceId } = loaded.root ?? {}

			if (lastOpenedDocId) {
				let doc = await Document.load(lastOpenedDocId)
				if (doc.$isLoaded && !doc.deletedAt) {
					if (lastOpenedSpaceId) {
						throw redirect({
							to: "/spaces/$spaceId/doc/$id",
							params: { spaceId: lastOpenedSpaceId, id: lastOpenedDocId },
						})
					}
					throw redirect({
						to: "/doc/$id",
						params: { id: lastOpenedDocId },
					})
				}
			}
		}

		// Fallback: load all personal docs and find most recent
		let loadedMe = await me.$jazz.ensureLoaded({ resolve: documentsQuery })
		let docs = loadedMe.root?.documents
		if (!docs?.$isLoaded) return null

		let mostRecentDoc = docs
			.filter(d => !d.deletedAt)
			.sort(
				(a, b) =>
					new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
			)
			.at(0)

		if (mostRecentDoc !== undefined) {
			throw redirect({
				to: "/doc/$id",
				params: { id: mostRecentDoc.$jazz.id },
			})
		}

		// No docs exist - create new empty doc and redirect
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
