import { beforeEach, describe, expect, test } from "vitest"
import {
	createJazzTestAccount,
	setActiveAccount,
	setupJazzTestSync,
} from "jazz-tools/testing"
import { Document, UserAccount } from "@/schema"
import { createPersonalDocument } from "@/lib/documents"
import { getEditHistory, accountIdFromSessionId } from "./time-machine"
import type { co } from "jazz-tools"

describe("Time Machine - Edit History", () => {
	let adminAccount: co.loaded<typeof UserAccount>
	let otherAccount: co.loaded<typeof UserAccount>

	beforeEach(async () => {
		await setupJazzTestSync()

		adminAccount = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		otherAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})
	})

	test("accountIdFromSessionId extracts account ID correctly", () => {
		let sessionId = "co_zabc123_session_xyz789"
		let accountId = accountIdFromSessionId(sessionId)
		expect(accountId).toBe("co_zabc123")
	})

	test("getEditHistory returns edits ordered by madeAt timestamp", async () => {
		let doc = await createPersonalDocument(adminAccount, "Initial content")

		// Make several edits with time gaps
		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Second edit")

		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Third edit")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let editHistory = getEditHistory(loaded)

		// Verify edits are in chronological order
		expect(editHistory.length).toBeGreaterThanOrEqual(3)
		for (let i = 1; i < editHistory.length; i++) {
			expect(editHistory[i].madeAt.getTime()).toBeGreaterThanOrEqual(
				editHistory[i - 1].madeAt.getTime(),
			)
		}

		// Verify indices are sequential
		for (let i = 0; i < editHistory.length; i++) {
			expect(editHistory[i].index).toBe(i)
		}
	})

	test("getEditHistory orders interleaved edits from multiple users chronologically", async () => {
		// Create a doc and share it with another user
		let doc = await createPersonalDocument(adminAccount, "Admin initial")
		let group = doc.$jazz.owner

		// Add the other account as a writer
		group.addMember(otherAccount, "writer")
		await adminAccount.$jazz.waitForAllCoValuesSync()
		await otherAccount.$jazz.waitForAllCoValuesSync()

		// Admin makes first edit
		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Admin edit 1")

		// Switch to other account and make an edit
		setActiveAccount(otherAccount)
		let otherDoc = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!otherDoc.$isLoaded) throw new Error("Doc not loaded for other user")

		await new Promise(r => setTimeout(r, 10))
		otherDoc.content!.$jazz.applyDiff("Other user edit")

		// Switch back to admin and make another edit
		setActiveAccount(adminAccount)
		await adminAccount.$jazz.waitForAllCoValuesSync()

		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Admin edit 2")

		await adminAccount.$jazz.waitForAllCoValuesSync()
		await otherAccount.$jazz.waitForAllCoValuesSync()

		// Load fresh and get edit history
		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let editHistory = getEditHistory(loaded)

		// Verify edits are sorted chronologically (not grouped by user)
		expect(editHistory.length).toBeGreaterThanOrEqual(4) // Initial + 3 edits

		// All edits should be in chronological order
		for (let i = 1; i < editHistory.length; i++) {
			let prevTime = editHistory[i - 1].madeAt.getTime()
			let currTime = editHistory[i].madeAt.getTime()
			expect(currTime).toBeGreaterThanOrEqual(prevTime)
		}

		// Verify we have edits from both users (interleaved)
		let adminAccountId = adminAccount.$jazz.id
		let otherAccountId = otherAccount.$jazz.id

		let adminEdits = editHistory.filter(e => e.accountId === adminAccountId)
		let otherEdits = editHistory.filter(e => e.accountId === otherAccountId)

		// Both users should have made edits
		expect(adminEdits.length).toBeGreaterThanOrEqual(2)
		expect(otherEdits.length).toBeGreaterThanOrEqual(1)
	})

	test("getEditHistory handles single edit document", async () => {
		let doc = await createPersonalDocument(adminAccount, "Only content")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let editHistory = getEditHistory(loaded)

		expect(editHistory.length).toBeGreaterThanOrEqual(1)
		expect(editHistory[0].index).toBe(0)
		expect(editHistory[0].madeAt).toBeInstanceOf(Date)
	})

	test("getEditHistory includes accountId for each edit", async () => {
		let doc = await createPersonalDocument(adminAccount, "Test content")

		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Another edit")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let editHistory = getEditHistory(loaded)

		// All edits should have an accountId
		for (let edit of editHistory) {
			expect(edit.accountId).not.toBeNull()
			expect(typeof edit.accountId).toBe("string")
		}
	})
})
