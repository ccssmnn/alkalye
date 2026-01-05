import { beforeEach, describe, expect, test } from "vitest"
import {
	createJazzTestAccount,
	setActiveAccount,
	setupJazzTestSync,
} from "jazz-tools/testing"
import { Document, UserAccount } from "@/schema"
import {
	createPersonalDocument,
	permanentlyDeletePersonalDocument,
	createDocumentInvite,
	acceptDocumentInvite,
	revokeDocumentInvite,
} from "@/lib/documents"
import type { co } from "jazz-tools"

describe("Document Collaboration", () => {
	let adminAccount: co.loaded<typeof UserAccount>
	let otherAccount: co.loaded<typeof UserAccount>
	let doc: co.loaded<typeof Document>

	beforeEach(async () => {
		await setupJazzTestSync()

		adminAccount = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		otherAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		doc = await createPersonalDocument(adminAccount, "Test content")
	})

	test("admin can access their own document", async () => {
		let loadedDoc = await Document.load(doc.$jazz.id, {
			resolve: { content: true },
		})
		expect(loadedDoc.$isLoaded).toBe(true)
	})

	test("other user cannot access document they are not invited to", async () => {
		setActiveAccount(otherAccount)
		let loadedDoc = await Document.load(doc.$jazz.id, {
			resolve: { content: true },
		})

		expect(loadedDoc.$jazz.loadingState).toEqual("unauthorized")
	})

	test("admin can find document in personal docs", async () => {
		let { root } = await adminAccount.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})
		expect(root.documents.some(d => d.$jazz.id === doc.$jazz.id)).toBe(true)
	})

	test("document removed from personal docs after permanent delete", async () => {
		await permanentlyDeletePersonalDocument(doc, adminAccount)

		let { root } = await adminAccount.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})

		expect(root.documents.some(d => d.$jazz.id === doc.$jazz.id)).toBe(false)
	})

	test("invited user can find document in personal docs after accepting invite", async () => {
		let inviteLink = await createDocumentInvite(doc, "writer")

		let parts = inviteLink.split("/")
		let inviteGroupId = parts[parts.length - 2]
		let inviteSecret = parts[parts.length - 1]

		await acceptDocumentInvite(otherAccount, {
			docId: doc.$jazz.id,
			inviteGroupId: inviteGroupId,
			inviteSecret: inviteSecret as `inviteSecret_z${string}`,
		})

		let { root } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})
		expect(root.documents.some(d => d.$jazz.id === doc.$jazz.id)).toBe(true)
	})

	test("revoked user cannot access document", async () => {
		let inviteLink = await createDocumentInvite(doc, "writer")

		let parts = inviteLink.split("/")
		let inviteGroupId = parts[parts.length - 2]
		let inviteSecret = parts[parts.length - 1]

		await acceptDocumentInvite(otherAccount, {
			docId: doc.$jazz.id,
			inviteGroupId: inviteGroupId,
			inviteSecret: inviteSecret as `inviteSecret_z${string}`,
		})

		setActiveAccount(otherAccount)
		let loadedDoc = await Document.load(doc.$jazz.id)
		expect(loadedDoc.$isLoaded).toBe(true)

		setActiveAccount(adminAccount)
		revokeDocumentInvite(doc, inviteGroupId)

		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedDocAfterRevoke = await Document.load(doc.$jazz.id)
		expect(loadedDocAfterRevoke.$jazz.loadingState).toEqual("unauthorized")
	})

	test("accepting a revoked invite should throw", async () => {
		setActiveAccount(adminAccount)
		let inviteLink = await createDocumentInvite(doc, "writer")

		let parts = inviteLink.split("/")
		let inviteGroupId = parts[parts.length - 2]
		let inviteSecret = parts[parts.length - 1]

		revokeDocumentInvite(doc, inviteGroupId)

		await adminAccount.$jazz.waitForAllCoValuesSync()
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		await expect(
			acceptDocumentInvite(otherAccount, {
				docId: doc.$jazz.id,
				inviteGroupId: inviteGroupId,
				inviteSecret: inviteSecret as `inviteSecret_z${string}`,
			}),
		).rejects.toThrow("Document not found or invite was revoked")
	})
})
