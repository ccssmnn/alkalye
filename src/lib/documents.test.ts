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
	listCollaborators,
	leavePersonalDocument,
	parseInviteLink,
	changeCollaboratorRole,
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
		let inviteData = parseInviteLink(inviteLink)

		await acceptDocumentInvite(otherAccount, inviteData)

		let { root } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})
		expect(root.documents.some(d => d.$jazz.id === doc.$jazz.id)).toBe(true)
	})

	test("revoked user cannot access document", async () => {
		let inviteLink = await createDocumentInvite(doc, "writer")
		let inviteData = parseInviteLink(inviteLink)

		await acceptDocumentInvite(otherAccount, inviteData)

		setActiveAccount(otherAccount)
		let loadedDoc = await Document.load(doc.$jazz.id)
		expect(loadedDoc.$isLoaded).toBe(true)

		setActiveAccount(adminAccount)
		revokeDocumentInvite(doc, inviteData.inviteGroupId)

		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedDocAfterRevoke = await Document.load(doc.$jazz.id)
		expect(loadedDocAfterRevoke.$jazz.loadingState).toEqual("unauthorized")
	})

	test("accepting a revoked invite should throw", async () => {
		setActiveAccount(adminAccount)
		let inviteLink = await createDocumentInvite(doc, "writer")
		let inviteData = parseInviteLink(inviteLink)

		revokeDocumentInvite(doc, inviteData.inviteGroupId)

		await adminAccount.$jazz.waitForAllCoValuesSync()
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		await expect(
			acceptDocumentInvite(otherAccount, inviteData),
		).rejects.toThrow()
	})

	test("list collaborators returns all invited users with their roles", async () => {
		let writerAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})
		let readerAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		let writerInvite = await createDocumentInvite(doc, "writer")
		let readerInvite = await createDocumentInvite(doc, "reader")

		let writerData = parseInviteLink(writerInvite)
		let readerData = parseInviteLink(readerInvite)

		await acceptDocumentInvite(writerAccount, writerData)
		await acceptDocumentInvite(readerAccount, readerData)

		let collaborators = listCollaborators(doc)
		expect(collaborators.length).toBe(2)

		let writerCollabs = collaborators.filter(c => c.role === "writer")
		let readerCollabs = collaborators.filter(c => c.role === "reader")

		expect(writerCollabs.length).toBe(1)
		expect(readerCollabs.length).toBe(1)
		expect(writerCollabs[0].userId).toBe(writerAccount.$jazz.id)
		expect(readerCollabs[0].userId).toBe(readerAccount.$jazz.id)
	})

	test("leaving document removes it from personal docs and collaborator list", async () => {
		let inviteLink = await createDocumentInvite(doc, "writer")
		let inviteData = parseInviteLink(inviteLink)

		await acceptDocumentInvite(otherAccount, inviteData)

		setActiveAccount(otherAccount)

		let { root: beforeRoot } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})
		expect(beforeRoot.documents.some(d => d.$jazz.id === doc.$jazz.id)).toBe(
			true,
		)

		let collaboratorsBefore = listCollaborators(doc)
		expect(
			collaboratorsBefore.some(c => c.userId === otherAccount.$jazz.id),
		).toBe(true)
		expect(
			collaboratorsBefore.find(c => c.userId === otherAccount.$jazz.id)?.role,
		).toBe("writer")

		await leavePersonalDocument(doc, otherAccount)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		let { root: afterRoot } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})
		expect(afterRoot.documents.some(d => d.$jazz.id === doc.$jazz.id)).toBe(
			false,
		)

		let collaboratorsAfter = listCollaborators(doc)
		expect(
			collaboratorsAfter.some(c => c.userId === otherAccount.$jazz.id),
		).toBe(false)
	})

	test("changing collaborator role is reflected in listCollaborators", async () => {
		let inviteLink = await createDocumentInvite(doc, "reader")
		let inviteData = parseInviteLink(inviteLink)

		await acceptDocumentInvite(otherAccount, inviteData)

		let collaboratorsBefore = listCollaborators(doc)
		let otherCollabsBefore = collaboratorsBefore.filter(
			c => c.userId === otherAccount.$jazz.id,
		)
		expect(otherCollabsBefore.length).toBe(1)
		expect(otherCollabsBefore[0].role).toBe("reader")

		setActiveAccount(adminAccount)
		await changeCollaboratorRole(doc, inviteData.inviteGroupId, "writer")

		let collaboratorsAfter = listCollaborators(doc)
		let otherCollabsAfter = collaboratorsAfter.filter(
			c => c.userId === otherAccount.$jazz.id,
		)
		expect(otherCollabsAfter.length).toBe(1)
		expect(otherCollabsAfter[0].role).toBe("writer")
	})
})
