import { expect, test } from "@playwright/test"
import { createAccount, waitForEditorBoot } from "./auth-helpers"
import { create } from "./doc-helpers"
import {
	acceptDocumentInvite,
	createDocumentInvite,
	listDocumentInvites,
	revokeDocumentInvite,
} from "./document-collab-helpers"

test("document invite CRUD helpers return JSON", async ({ page }) => {
	await waitForEditorBoot(page)
	await createAccount(page)

	let created = await create(page, {
		title: "Doc Invite CRUD",
		body: "content",
	})

	let invite = await createDocumentInvite(page, {
		docId: created.id,
		role: "writer",
	})
	expect(invite.ok).toBe(true)

	let pending = await listDocumentInvites(page, {
		docId: created.id,
	})
	expect(pending.ok).toBe(true)
	expect(
		pending.items.some(item => item.inviteGroupId === invite.inviteGroupId),
	).toBe(true)

	let revoked = await revokeDocumentInvite(page, {
		docId: created.id,
		inviteGroupId: invite.inviteGroupId ?? undefined,
	})
	expect(revoked.ok).toBe(true)
})

test("document invite accept helper returns JSON", async ({ page }) => {
	await waitForEditorBoot(page)
	await createAccount(page)

	let created = await create(page, {
		title: "Doc Invite Accept",
		body: "acceptance",
	})

	let invite = await createDocumentInvite(page, {
		docId: created.id,
		role: "reader",
	})

	let accepted = await acceptDocumentInvite(page, { link: invite.link })
	expect(accepted.ok).toBe(true)
	expect(accepted.docId).toBe(created.id)
	expect(accepted.url).toContain(`/app/doc/${created.id}`)
})
