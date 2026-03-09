import { describe, expect, it } from "vitest"
import { runCli } from "./commands"
import type { RuntimeDeps } from "./types"

describe("cli integration smoke", () => {
	it("reports invalid passphrase", async () => {
		let result = await runCli(["auth", "sign-in", "--passphrase", "word1 word2"], createDeps())
		expect(result).toEqual({
			ok: false,
			command: "auth.sign-in",
			error: { code: "invalid_passphrase", message: "Invalid passphrase" },
		})
	})

	it("fails docs list without auth material", async () => {
		let result = await runCli(["docs", "list", "--space-id", "space-1"], createDeps())
		expect(result).toEqual({
			ok: false,
			command: "docs.list",
			error: {
				code: "missing_session",
				message: "Missing auth material. Provide --session-account-id/--session-secret, --session-file, or passphrase flags.",
			},
		})
	})
})

function createDeps(): RuntimeDeps {
	return {
		env: {},
		readFile: async () => "",
		readStdin: async () => "",
		now: () => "2026-03-09T00:00:00.000Z",
	}
}
