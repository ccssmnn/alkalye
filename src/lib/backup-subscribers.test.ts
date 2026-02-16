import { describe, expect, it } from "vitest"
import { spaceBackupDocumentResolve } from "./backup-subscribers"

describe("space backup subscriber query", () => {
	it("resolves image and video assets", () => {
		expect(spaceBackupDocumentResolve.documents.$each.assets.$each.image).toBe(
			true,
		)
		expect(spaceBackupDocumentResolve.documents.$each.assets.$each.video).toBe(
			true,
		)
	})
})
