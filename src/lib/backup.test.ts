import { describe, it, expect } from "vitest"
import { hashContent, syncFromBackup } from "./backup"

describe("hashContent", () => {
	it("returns consistent hash for same content", async () => {
		let content = "Hello, World!"
		let hash1 = await hashContent(content)
		let hash2 = await hashContent(content)

		expect(hash1).toBe(hash2)
		expect(hash1).toHaveLength(16)
	})

	it("returns different hash for different content", async () => {
		let hash1 = await hashContent("Content A")
		let hash2 = await hashContent("Content B")

		expect(hash1).not.toBe(hash2)
	})

	it("handles empty string", async () => {
		let hash = await hashContent("")

		expect(hash).toHaveLength(16)
		expect(hash).toMatch(/^[a-f0-9]+$/)
	})

	it("handles unicode content", async () => {
		let content = "Hello 👋 World 🌍"
		let hash1 = await hashContent(content)
		let hash2 = await hashContent(content)

		expect(hash1).toBe(hash2)
	})

	it("changes hash when only one character changes", async () => {
		let hash1 = await hashContent("abc")
		let hash2 = await hashContent("abd")

		expect(hash1).not.toBe(hash2)
	})
})

describe("bidirectional sync exports", () => {
	it("exports hashContent for testing", () => {
		expect(typeof hashContent).toBe("function")
	})

	it("exports syncFromBackup for integration tests", () => {
		expect(typeof syncFromBackup).toBe("function")
	})
})
