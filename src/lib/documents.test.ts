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

		let result = await listCollaborators(doc, undefined, false)
		expect(result.collaborators.length).toBe(2)

		let writerCollabs = result.collaborators.filter(c => c.role === "writer")
		let readerCollabs = result.collaborators.filter(c => c.role === "reader")

		expect(writerCollabs.length).toBe(1)
		expect(readerCollabs.length).toBe(1)
		expect(writerCollabs[0].id).toBe(writerAccount.$jazz.id)
		expect(readerCollabs[0].id).toBe(readerAccount.$jazz.id)
	}, 30000)

	test("leaving document removes it from personal docs and collaborator list", async () => {
		let inviteLink = await createDocumentInvite(doc, "writer")
		let inviteData = parseInviteLink(inviteLink)

		await acceptDocumentInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)

		let { root: beforeRoot } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})
		expect(beforeRoot.documents.some(d => d.$jazz.id === doc.$jazz.id)).toBe(
			true,
		)

		setActiveAccount(adminAccount)
		let collaboratorsBefore = await listCollaborators(doc, undefined, false)
		expect(
			collaboratorsBefore.collaborators.some(
				c => c.id === otherAccount.$jazz.id,
			),
		).toBe(true)
		expect(
			collaboratorsBefore.collaborators.find(
				c => c.id === otherAccount.$jazz.id,
			)?.role,
		).toBe("writer")

		setActiveAccount(otherAccount)
		await leavePersonalDocument(doc, otherAccount)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		let { root: afterRoot } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { documents: true } },
		})
		expect(afterRoot.documents.some(d => d.$jazz.id === doc.$jazz.id)).toBe(
			false,
		)

		setActiveAccount(adminAccount)
		let collaboratorsAfter = await listCollaborators(doc, undefined, false)
		expect(
			collaboratorsAfter.collaborators.some(
				c => c.id === otherAccount.$jazz.id,
			),
		).toBe(false)
	}, 30000)

	test("changing collaborator role is reflected in listCollaborators", async () => {
		let inviteLink = await createDocumentInvite(doc, "reader")
		let inviteData = parseInviteLink(inviteLink)

		await acceptDocumentInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		let collaboratorsBefore = await listCollaborators(doc, undefined, false)
		let otherCollabsBefore = collaboratorsBefore.collaborators.filter(
			c => c.id === otherAccount.$jazz.id,
		)
		expect(otherCollabsBefore.length).toBe(1)
		expect(otherCollabsBefore[0].role).toBe("reader")

		await changeCollaboratorRole(doc, inviteData.inviteGroupId, "writer")

		let collaboratorsAfter = await listCollaborators(doc, undefined, false)
		let otherCollabsAfter = collaboratorsAfter.collaborators.filter(
			c => c.id === otherAccount.$jazz.id,
		)
		expect(otherCollabsAfter.length).toBe(1)
		expect(otherCollabsAfter[0].role).toBe("writer")
	}, 30000)

	test("listCollaborators returns pending invites for empty invite groups", async () => {
		let inviteLink = await createDocumentInvite(doc, "writer")
		let inviteData = parseInviteLink(inviteLink)

		let result = await listCollaborators(doc)
		expect(result.pendingInvites.length).toBe(1)
		expect(result.pendingInvites[0].inviteGroupId).toBe(
			inviteData.inviteGroupId,
		)
		expect(result.collaborators.length).toBe(0)
	})

	test("listCollaborators excludes space group from collaborators", async () => {
		let writerAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		let inviteLink = await createDocumentInvite(doc, "writer")
		let inviteData = parseInviteLink(inviteLink)

		await acceptDocumentInvite(writerAccount, inviteData)

		let result = await listCollaborators(doc, "space-group-id", false)
		expect(result.collaborators.length).toBe(1)
		expect(result.pendingInvites.length).toBe(0)
	})

	test("listCollaborators returns empty when doc uses space group directly", async () => {
		let result = await listCollaborators(doc, doc.$jazz.id)
		expect(result.collaborators.length).toBe(0)
		expect(result.pendingInvites.length).toBe(0)
	})
})
