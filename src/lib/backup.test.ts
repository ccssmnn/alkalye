import { describe, it, expect } from "vitest"
import { hashContent } from "./backup"

// =============================================================================
// Hash Content
// =============================================================================

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
})

// =============================================================================
// Bidirectional Sync (Exported for Testing)
// =============================================================================

describe("bidirectional sync exports", () => {
	it("exports hashContent for testing", () => {
		expect(typeof hashContent).toBe("function")
	})
})
