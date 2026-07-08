import { Group, co } from "jazz-tools"
import { UserAccount, Document } from "@/schema"
import { isWelcomeDoc } from "@/app/features/documents/lib/welcome-doc"

export { migrateAnonymousData }

async function migrateAnonymousData(
	anonymousAccount: co.loaded<typeof UserAccount>,
) {
	let { root: anonRoot } = await anonymousAccount.$jazz.ensureLoaded({
		resolve: {
			root: {
				documents: { $each: { content: true } },
				inactiveDocuments: { $each: { content: true } },
			},
		},
	})

	if (!anonRoot) return

	let me = await UserAccount.getMe().$jazz.ensureLoaded({
		resolve: {
			root: {
				documents: true,
				inactiveDocuments: true,
			},
		},
	})

	if (!me.root) return

	for (let doc of Array.from(anonRoot.documents ?? [])) {
		if (!doc?.$isLoaded) continue
		// Skip unaltered welcome docs - new account already has one
		if (isWelcomeDoc(doc.content?.toString() ?? "")) continue
		let docGroup = doc.$jazz.owner
		if (docGroup instanceof Group) {
			docGroup.addMember(me, "admin")
		}
		me.root.documents.$jazz.push(doc)
	}

	for (let doc of Array.from(anonRoot.inactiveDocuments ?? [])) {
		if (!doc?.$isLoaded) continue
		// Skip unaltered welcome docs
		if (isWelcomeDoc(doc.content?.toString() ?? "")) continue
		let docGroup = doc.$jazz.owner
		if (docGroup instanceof Group) {
			docGroup.addMember(me, "admin")
		}
		if (!me.root.inactiveDocuments) {
			me.root.$jazz.set(
				"inactiveDocuments",
				co.list(Document).create([], me.root.$jazz.owner),
			)
		}
		me.root.inactiveDocuments!.$jazz.push(doc)
	}
}
