import { beforeEach, describe, expect, test } from "vitest"
import { createJazzTestAccount, setupJazzTestSync } from "jazz-tools/testing"
import { Group, co } from "jazz-tools"
import { Document, Space, UserAccount, UserRoot, createSpace } from "@/schema"

async function seedAccountWithData() {
	let account = await createJazzTestAccount({
		isCurrentActiveAccount: true,
		AccountSchema: UserAccount,
	})

	let { root } = await account.$jazz.ensureLoaded({
		resolve: { root: { documents: true, spaces: true } },
	})

	let now = new Date()
	let realDoc = Document.create(
		{
			version: 1,
			content: co.plainText().create("# My real document\nImportant work"),
			createdAt: now,
			updatedAt: now,
		},
		Group.create(),
	)
	root.documents.$jazz.push(realDoc)
	createSpace("My Space", root)

	return { account, root, realDocId: realDoc.$jazz.id }
}

describe("incident confirmation - edit history survives pointer overwrite", () => {
	beforeEach(async () => {
		await setupJazzTestSync()
	})

	test("overwriting account.root leaves the old root ID and content readable via edit history", async () => {
		let { account, root: oldRoot, realDocId } = await seedAccountWithData()
		let oldRootId = oldRoot.$jazz.id

		let freshEmptyRoot = UserRoot.create({
			documents: co.list(Document).create([]),
			migrationVersion: 1,
		})
		account.$jazz.set("root", freshEmptyRoot)

		let edits = [...account.$jazz.raw.editsAt("root")]

		console.log(
			"account.root edit history:",
			JSON.stringify(
				edits.map(e => ({
					value: e.value,
					at: e.at instanceof Date ? e.at.toISOString() : e.at,
					by: e.by,
				})),
				null,
				2,
			),
		)

		expect(edits.length).toBeGreaterThanOrEqual(2)
		expect(edits[0]?.value).toBe(oldRootId)
		expect(edits[edits.length - 1]?.value).toBe(freshEmptyRoot.$jazz.id)

		let recoveredRoot = await UserRoot.load(oldRootId, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!recoveredRoot?.$isLoaded) throw new Error("Old root not loadable")
		expect(recoveredRoot.documents.some(d => d?.$jazz.id === realDocId)).toBe(
			true,
		)
		let recoveredDoc = recoveredRoot.documents.find(
			d => d?.$jazz.id === realDocId,
		)
		expect(recoveredDoc?.content?.toString()).toContain("My real document")
	})

	test("overwriting root.documents/spaces list pointers leaves old list IDs readable via edit history", async () => {
		let { root, realDocId } = await seedAccountWithData()

		let oldDocumentsId = root.documents.$jazz.id
		let oldSpacesId = root.spaces?.$jazz.id
		let spaceName = root.spaces?.[0]?.name

		root.$jazz.set("documents", co.list(Document).create([], root.$jazz.owner))
		root.$jazz.set("spaces", co.list(Space).create([], root.$jazz.owner))

		let documentsEdits = [...root.$jazz.raw.editsAt("documents")]
		let spacesEdits = [...root.$jazz.raw.editsAt("spaces")]

		console.log(
			"root.documents edit history:",
			JSON.stringify(
				documentsEdits.map(e => ({ value: e.value, by: e.by })),
				null,
				2,
			),
		)
		console.log(
			"root.spaces edit history:",
			JSON.stringify(
				spacesEdits.map(e => ({ value: e.value, by: e.by })),
				null,
				2,
			),
		)

		expect(documentsEdits[0]?.value).toBe(oldDocumentsId)
		expect(spacesEdits[0]?.value).toBe(oldSpacesId)

		let recoveredDocs = await co.list(Document).load(oldDocumentsId, {
			resolve: { $each: { content: true } },
		})
		if (!recoveredDocs?.$isLoaded) throw new Error("Old documents not loadable")
		expect(recoveredDocs.some(d => d?.$jazz.id === realDocId)).toBe(true)

		if (oldSpacesId) {
			let recoveredSpaces = await co.list(Space).load(oldSpacesId, {
				resolve: { $each: true },
			})
			if (!recoveredSpaces?.$isLoaded)
				throw new Error("Old spaces not loadable")
			expect(recoveredSpaces[0]?.name).toBe(spaceName)
		}
	})
})
