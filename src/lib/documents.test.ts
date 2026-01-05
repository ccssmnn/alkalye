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
})
