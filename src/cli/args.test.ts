import { describe, expect, it } from "vitest"
import { parseArgs } from "./args"

describe("parseArgs", () => {
	it("parses docs create with required options", () => {
		let result = parseArgs([
			"docs",
			"create",
			"--space-id",
			"space-1",
			"--title",
			"My doc",
			"--content",
			"Hello",
			"--timeout",
			"5000",
		])

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value.spaceId).toBe("space-1")
		expect(result.value.title).toBe("My doc")
		expect(result.value.timeoutMs).toBe(5000)
	})

	it("rejects invalid timeout", () => {
		let result = parseArgs([
			"docs",
			"create",
			"--space-id",
			"space-1",
			"--title",
			"My doc",
			"--content",
			"Hello",
			"--timeout",
			"0",
		])

		expect(result).toEqual({
			ok: false,
			code: "invalid_timeout",
			message: "Timeout must be a positive integer (milliseconds)",
		})
	})

	it("requires doc id for read", () => {
		let result = parseArgs(["docs", "read"])
		expect(result).toEqual({
			ok: false,
			code: "missing_required_option",
			message: "Missing required option --doc-id",
		})
	})

	it("supports auth sign in with stdin passphrase", () => {
		let result = parseArgs(["auth", "sign-in", "--passphrase-stdin"])
		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.value.passphraseStdin).toBe(true)
	})

	it("rejects unknown flag", () => {
		let result = parseArgs(["auth", "status", "--wat"])
		expect(result).toEqual({
			ok: false,
			code: "unknown_flag",
			message: "Unknown option: --wat",
		})
	})
})
