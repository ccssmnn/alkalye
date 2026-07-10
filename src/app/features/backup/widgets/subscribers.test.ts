import { describe, expect, it } from "vitest"
import { backupQuery, spaceBackupDocumentResolve } from "./subscribers"

describe("backup subscriber queries", () => {
	it("subscribe shallowly at mount", () => {
		expect(backupQuery.root.documents).toEqual({
			$each: true,
			$onError: "catch",
		})
		expect(spaceBackupDocumentResolve.documents).toEqual({
			$each: true,
			$onError: "catch",
		})
	})
})
