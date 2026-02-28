import { describe, it, expect, vi } from "vitest"
import {
	AGENT_ACTIONS,
	getActionFormFields,
	parseActionParams,
	runAuthAction,
} from "./agents-contract"

describe("agents-contract", () => {
	it("defines a schema for every action", () => {
		expect(AGENT_ACTIONS).toContain("createAccount")
		expect(AGENT_ACTIONS).toContain("signIn")
		expect(AGENT_ACTIONS).toContain("listSpaces")
	})

	it("derives form fields from createAccount schema", () => {
		let fields = getActionFormFields("createAccount")
		expect(fields.map(field => field.key)).toEqual(["passphrase", "name"])
		expect(fields[0]?.multiline).toBe(true)
		expect(fields[0]?.required).toBe(true)
		expect(fields[1]?.required).toBe(false)
	})

	it("parses optional blank values as undefined", () => {
		let parsed = parseActionParams("createDoc", {
			spaceId: "",
			title: "",
			content: "",
		})
		expect(parsed.ok).toBe(true)
		if (!parsed.ok) return
		expect(parsed.data.spaceId).toBeUndefined()
		expect(parsed.data.title).toBeUndefined()
		expect(parsed.data.content).toBeUndefined()
	})

	it("validates required fields", () => {
		let parsed = parseActionParams("getDoc", { docId: "" })
		expect(parsed.ok).toBe(false)
		if (parsed.ok) return
		expect(parsed.error).toContain("docId is required")
	})

	it("runs createAccount auth action", async () => {
		let registerNewAccount = vi.fn(async () => true)
		let logIn = vi.fn(async () => true)

		let result = await runAuthAction(
			"createAccount",
			{ passphrase: "word1 word2", name: "Ada" },
			{ registerNewAccount, logIn },
			() => "Fallback",
		)

		expect(registerNewAccount).toHaveBeenCalledWith("word1 word2", "Ada")
		expect(logIn).not.toHaveBeenCalled()
		expect(result).toEqual({ signedIn: true, name: "Ada" })
	})

	it("runs signIn auth action", async () => {
		let registerNewAccount = vi.fn(async () => true)
		let logIn = vi.fn(async () => true)

		let result = await runAuthAction(
			"signIn",
			{ passphrase: "word1 word2" },
			{ registerNewAccount, logIn },
			() => "Fallback",
		)

		expect(registerNewAccount).not.toHaveBeenCalled()
		expect(logIn).toHaveBeenCalledWith("word1 word2")
		expect(result).toEqual({ signedIn: true })
	})
})
