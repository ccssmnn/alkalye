import { expect, test } from "@playwright/test"
import { createAccount, waitForEditorBoot } from "./auth-helpers"
import {
	acceptSpaceInvite,
	createSpace,
	createSpaceInvite,
	deleteSpaceById,
	listSpaceInvites,
	listSpaces,
	readSpaceById,
	revokeSpaceInvite,
	updateSpaceById,
} from "./space-helpers"

test("space CRUD + invite helpers return JSON", async ({ page }) => {
	await waitForEditorBoot(page)
	await createAccount(page)

	let created = await createSpace(page, { name: "E2E Space" })
	expect(created.ok).toBe(true)

	let listed = await listSpaces(page)
	expect(listed.ok).toBe(true)
	expect(listed.items.some(space => space.id === created.id)).toBe(true)

	let read = await readSpaceById(page, { spaceId: created.id })
	expect(read.ok).toBe(true)
	expect(read.space.name).toBe("E2E Space")

	let updated = await updateSpaceById(page, {
		spaceId: created.id,
		name: "E2E Space Updated",
	})
	expect(updated.ok).toBe(true)

	let invite = await createSpaceInvite(page, {
		spaceId: created.id,
		role: "reader",
	})
	expect(invite.ok).toBe(true)
	expect(invite.link).toContain("invite")

	let pending = await listSpaceInvites(page, { spaceId: created.id })
	expect(pending.ok).toBe(true)
	expect(
		pending.items.some(i => i.inviteGroupId === invite.inviteGroupId),
	).toBe(true)

	let revoked = await revokeSpaceInvite(page, {
		spaceId: created.id,
		inviteGroupId: invite.inviteGroupId ?? undefined,
	})
	expect(revoked.ok).toBe(true)

	let removed = await deleteSpaceById(page, { spaceId: created.id })
	expect(removed.ok).toBe(true)
})

test("space invite accept helper returns JSON", async ({ page }) => {
	await waitForEditorBoot(page)
	await createAccount(page)

	let created = await createSpace(page, { name: "Invite Accept Space" })
	let invite = await createSpaceInvite(page, {
		spaceId: created.id,
		role: "reader",
	})

	let accepted = await acceptSpaceInvite(page, { link: invite.link })
	expect(accepted.ok).toBe(true)
	expect(accepted.spaceId).toBe(created.id)
	expect(accepted.url).toContain(`/app/spaces/${created.id}`)
})
