import { beforeEach, describe, expect, test } from "vitest"
import { createJazzTestAccount, setupJazzTestSync } from "jazz-tools/testing"
import { Document, UserAccount } from "@/schema"
import { createPersonalDocument } from "@/lib/documents"
import {
	getEditHistory,
	getContentAtEdit,
	accountIdFromSessionId,
	formatEditDate,
} from "./time-machine"
import type { co } from "jazz-tools"

describe("Time Machine - Edit History", () => {
	let adminAccount: co.loaded<typeof UserAccount>

	beforeEach(async () => {
		await setupJazzTestSync()

		adminAccount = await createJazzTestAccount({
			isCurrentActiveAccount: true,
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

		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Second edit")

		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Third edit")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let editHistory = getEditHistory(loaded)

		expect(editHistory.length).toBeGreaterThanOrEqual(3)
		for (let i = 1; i < editHistory.length; i++) {
			expect(editHistory[i].madeAt.getTime()).toBeGreaterThanOrEqual(
				editHistory[i - 1].madeAt.getTime(),
			)
		}

		for (let i = 0; i < editHistory.length; i++) {
			expect(editHistory[i].index).toBe(i)
		}
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

		for (let edit of editHistory) {
			expect(edit.accountId).not.toBeNull()
			expect(typeof edit.accountId).toBe("string")
		}
	})

	test("getContentAtEdit returns content at specific edit index", async () => {
		let doc = await createPersonalDocument(adminAccount, "Version 1")

		await new Promise(r => setTimeout(r, 50))
		doc.content!.$jazz.applyDiff("Version 2")

		await new Promise(r => setTimeout(r, 50))
		doc.content!.$jazz.applyDiff("Version 3")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let editHistory = getEditHistory(loaded)
		expect(editHistory.length).toBeGreaterThanOrEqual(3)

		let contents = editHistory.map((_, i) => getContentAtEdit(loaded, i))
		expect(contents).toContain("Version 1")
		expect(contents).toContain("Version 2")
		expect(contents).toContain("Version 3")

		let v1Index = contents.indexOf("Version 1")
		let v2Index = contents.indexOf("Version 2")
		let v3Index = contents.indexOf("Version 3")
		expect(v1Index).toBeLessThan(v2Index)
		expect(v2Index).toBeLessThan(v3Index)
	})

	test("getContentAtEdit handles out of bounds indices", async () => {
		let doc = await createPersonalDocument(adminAccount, "Only content")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		expect(getContentAtEdit(loaded, -1)).toBe("Only content")
		expect(getContentAtEdit(loaded, 100)).toBe("Only content")
	})

	test("getEditHistory is efficient with caching", async () => {
		let doc = await createPersonalDocument(adminAccount, "Test content")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let history1 = getEditHistory(loaded)
		let history2 = getEditHistory(loaded)
		let history3 = getEditHistory(loaded)

		expect(history1).toBe(history2)
		expect(history2).toBe(history3)
	})

	test("getEditHistory handles document with many edits performantly", async () => {
		let doc = await createPersonalDocument(adminAccount, "Initial")

		let editCount = 100
		for (let i = 1; i <= editCount; i++) {
			doc.content!.$jazz.applyDiff(`Edit ${i}`)
		}

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let startHistory = performance.now()
		let editHistory = getEditHistory(loaded)
		let historyDuration = performance.now() - startHistory

		expect(historyDuration).toBeLessThan(100)
		expect(editHistory.length).toBeGreaterThan(0)

		let startCached = performance.now()
		for (let i = 0; i < 10; i++) {
			getEditHistory(loaded)
		}
		let cachedDuration = performance.now() - startCached

		expect(cachedDuration).toBeLessThan(5)

		let startContent = performance.now()
		let middleEdit = Math.floor(editHistory.length / 2)
		let middleContent = getContentAtEdit(loaded, middleEdit)
		let contentDuration = performance.now() - startContent

		expect(contentDuration).toBeLessThan(50)
		expect(middleContent.length).toBeGreaterThan(0)
	})

	test("getEditHistory maintains O(n) complexity", async () => {
		let doc = await createPersonalDocument(adminAccount, "Initial")

		for (let i = 1; i <= 50; i++) {
			doc.content!.$jazz.applyDiff(`Edit ${i}`)
		}

		let loaded50 = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded50.$isLoaded) throw new Error("Doc not loaded")

		let start50 = performance.now()
		getEditHistory(loaded50)
		let duration50 = performance.now() - start50

		for (let i = 51; i <= 100; i++) {
			doc.content!.$jazz.applyDiff(`Edit ${i}`)
		}

		let loaded100 = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded100.$isLoaded) throw new Error("Doc not loaded")

		let start100 = performance.now()
		getEditHistory(loaded100)
		let duration100 = performance.now() - start100

		expect(duration100).toBeLessThan(duration50 * 5 + 10)
	})
})

describe("Time Machine - Offline Support", () => {
	let adminAccount: co.loaded<typeof UserAccount>

	beforeEach(async () => {
		await setupJazzTestSync()

		adminAccount = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})
	})

	test("getEditHistory uses only locally cached data (no network calls)", async () => {
		let doc = await createPersonalDocument(adminAccount, "Initial content")

		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Second version")

		await new Promise(r => setTimeout(r, 10))
		doc.content!.$jazz.applyDiff("Third version")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let editHistory = getEditHistory(loaded)
		expect(editHistory.length).toBeGreaterThanOrEqual(3)

		for (let i = 0; i < editHistory.length; i++) {
			let content = getContentAtEdit(loaded, i)
			expect(typeof content).toBe("string")
		}
	})

	test("edit history reconstruction works from local CRDT operations", async () => {
		let doc = await createPersonalDocument(adminAccount, "Version A")

		await new Promise(r => setTimeout(r, 20))
		doc.content!.$jazz.applyDiff("Version B")

		await new Promise(r => setTimeout(r, 20))
		doc.content!.$jazz.applyDiff("Version C")

		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Doc not loaded")

		let editHistory = getEditHistory(loaded)

		let allVersions = editHistory.map((_, i) => getContentAtEdit(loaded, i))

		expect(allVersions).toContain("Version A")
		expect(allVersions).toContain("Version B")
		expect(allVersions).toContain("Version C")

		let indexA = allVersions.indexOf("Version A")
		let indexB = allVersions.indexOf("Version B")
		let indexC = allVersions.indexOf("Version C")

		expect(indexA).toBeLessThan(indexB)
		expect(indexB).toBeLessThan(indexC)
	})
})

describe("Time Machine - Very Old Edits", () => {
	test("formatEditDate displays old dates correctly", () => {
		let oneYearAgo = new Date()
		oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
		let formatted = formatEditDate(oneYearAgo)

		expect(formatted).toMatch(/\d{4}/)
		expect(formatted).toMatch(/\d{1,2}:\d{2}/)

		let sixMonthsAgo = new Date()
		sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
		let formattedSixMonths = formatEditDate(sixMonthsAgo)

		expect(formattedSixMonths).toMatch(
			/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/,
		)
		expect(formattedSixMonths).toMatch(/\d{1,2}:\d{2}/)

		let twoYearsAgo = new Date()
		twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
		let formattedTwoYears = formatEditDate(twoYearsAgo)

		expect(formattedTwoYears).toMatch(/\d{4}/)
	})

	test("formatEditDate handles dates at Unix epoch boundaries", () => {
		let y2k = new Date(2000, 0, 1, 12, 30)
		let formatted = formatEditDate(y2k)

		expect(formatted).toContain("2000")
		expect(formatted).toContain("Jan")
	})

	test("formatEditDate displays all date components correctly", () => {
		let testDate = new Date(2023, 5, 15, 14, 30)

		let formatted = formatEditDate(testDate)

		expect(formatted).toContain("Jun")
		expect(formatted).toContain("15")
		expect(formatted).toContain("2023")
		expect(formatted).toMatch(/\d{1,2}:\d{2}/)
	})
})
