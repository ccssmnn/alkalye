import { describe, expect, it } from "vitest"
import { resolvePassphrase } from "./passphrase"
import type { ParsedArgs, RuntimeDeps } from "./types"

describe("resolvePassphrase", () => {
	it("reads passphrase from env var", async () => {
		let args = baseArgs({ passphraseEnv: "ALK_PASS" })
		let result = await resolvePassphrase(args, deps({ ALK_PASS: " one two " }), true)
		expect(result).toEqual({ ok: true, value: "one two" })
	})

	it("reads passphrase from file", async () => {
		let args = baseArgs({ passphraseFile: "/tmp/passphrase.txt" })
		let result = await resolvePassphrase(args, deps(), true)
		expect(result).toEqual({ ok: true, value: "alpha beta" })
	})

	it("reads passphrase from stdin", async () => {
		let args = baseArgs({ passphraseStdin: true })
		let result = await resolvePassphrase(args, deps(), true)
		expect(result).toEqual({ ok: true, value: "stdin pass" })
	})

	it("fails when passphrase required and missing", async () => {
		let args = baseArgs({})
		let result = await resolvePassphrase(args, deps(), true)
		expect(result.ok).toBe(false)
		if (result.ok) return
		expect(result.code).toBe("missing_passphrase")
	})
})

function baseArgs(overrides: Partial<ParsedArgs>): ParsedArgs {
	return {
		command: "auth",
		action: "sign-in",
		baseUrl: "https://example.com",
		timeoutMs: 5000,
		headless: true,
		append: false,
		softDelete: true,
		passphraseStdin: false,
		...overrides,
	}
}

function deps(env: Record<string, string | undefined> = {}): RuntimeDeps {
	return {
		env,
		readFile: async () => "alpha beta\n",
		writeFile: async () => {},
		mkdir: async () => {},
		readStdin: async () => "stdin pass\n",
		now: () => "2026-03-09T00:00:00.000Z",
	}
}
