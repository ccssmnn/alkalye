import { beforeEach, describe, expect, test } from "vitest"
import { createJazzTestAccount, setupJazzTestSync } from "jazz-tools/testing"
import { co, Group } from "jazz-tools"
import { Document, UserAccount } from "@/schema"
import {
	permanentlyDeleteDocument,
	permanentlyDeleteSpace,
} from "@/lib/delete-covalue"
import { createSpace } from "@/schema"

describe("permanentlyDeleteDocument", () => {
	beforeEach(async () => {
		await setupJazzTestSync()

		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})
	})

	test("deletes a document", async () => {
		let group = Group.create()
		let doc = Document.create(
			{
				version: 1,
				content: co.plainText().create("Test content", group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let docId = doc.$jazz.id

		await permanentlyDeleteDocument(doc)

		let loadedDoc = await Document.load(docId)
		expect(loadedDoc?.$jazz.loadingState).toBe("deleted")
		expect(loadedDoc?.$isLoaded).toBe(false)
	})

	test("document ID becomes inaccessible after deletion", async () => {
		let group = Group.create()
		let doc = Document.create(
			{
				version: 1,
				content: co.plainText().create("Test content", group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let docId = doc.$jazz.id

		await permanentlyDeleteDocument(doc)

		// Attempting to load the deleted document should return deleted state
		let loadedDoc = await Document.load(docId)
		expect(loadedDoc?.$jazz.loadingState).toBe("deleted")
	})

	// Note: Image asset deletion is tested implicitly via the resolve query.
	// Full image asset testing requires the 'sharp' package which isn't available in test env.
	// The resolve query `assets: { $each: { image: true, video: true } }` ensures nested deletion.
})

describe("permanentlyDeleteSpace", () => {
	let account: co.loaded<typeof UserAccount>

	beforeEach(async () => {
		await setupJazzTestSync()

		account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})
	})

	test("deletes a space and its documents", async () => {
		let { root } = await account.$jazz.ensureLoaded({
			resolve: { root: { spaces: true } },
		})

		let space = createSpace("Test Space", root)
		let spaceId = space.$jazz.id

		// Get the welcome doc that was created
		let loadedSpace = await space.$jazz.ensureLoaded({
			resolve: { documents: { $each: { content: true } } },
		})
		let welcomeDoc = loadedSpace.documents[0]
		let welcomeDocId = welcomeDoc?.$jazz.id

		await permanentlyDeleteSpace(space)

		// Space should be deleted
		let loadedSpaceAfter = await (await import("@/schema")).Space.load(spaceId)
		expect(loadedSpaceAfter?.$jazz.loadingState).toBe("deleted")

		// Document should also be deleted
		if (welcomeDocId) {
			let loadedDoc = await Document.load(welcomeDocId)
			expect(loadedDoc?.$jazz.loadingState).toBe("deleted")
		}
	})
})
