import { describe, it, expect, vi } from "vitest"
import {
	AGENT_ACTIONS,
	getActionFormFields,
	parseActionParams,
	executeAgentAction,
	buildAgentUtilities,
} from "./actions"

function createContext() {
	return {
		me: {
			root: {
				spaces: [],
				documents: [],
			},
		},
		auth: {
			registerNewAccount: vi.fn(async () => true),
			logIn: vi.fn(async () => true),
		},
		getFallbackName: () => "Fallback Writer",
	} as any
}

describe("agents/actions", () => {
	it("defines the action registry", () => {
		expect(AGENT_ACTIONS).toContain("createAccount")
		expect(AGENT_ACTIONS).toContain("upsertDocByTitle")
		expect(AGENT_ACTIONS).toContain("clearLog")
	})

	it("derives form fields with metadata from schemas", () => {
		let fields = getActionFormFields("upsertDocByTitle")
		expect(fields.map(field => field.key)).toEqual(["title", "content", "spaceId", "mode"])
		expect(fields.find(field => field.key === "mode")?.kind).toBe("select")
		expect(fields.find(field => field.key === "mode")?.defaultValue).toBe("append")
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

	it("executes auth actions through central execute", async () => {
		let context = createContext()
		let createResult = await executeAgentAction(
			"createAccount",
			{ passphrase: "word1 word2", name: "Ada" },
			context,
		)
		expect(context.auth.registerNewAccount).toHaveBeenCalledWith("word1 word2", "Ada")
		expect(createResult).toEqual({ signedIn: true, name: "Ada" })

		let signInResult = await executeAgentAction("signIn", { passphrase: "word1 word2" }, context)
		expect(context.auth.logIn).toHaveBeenCalledWith("word1 word2")
		expect(signInResult).toEqual({ signedIn: true })
	})

	it("executes clearLog action in registry", async () => {
		let result = await executeAgentAction("clearLog", {}, createContext())
		expect(result).toEqual({ clearLog: true })
	})

	it("builds reusable JS utilities from same action runner", async () => {
		let runAction = vi.fn(async () => ({ ok: true }))
		let utilities = buildAgentUtilities(runAction)
		await utilities.upsertDocByTitle({ title: "Roadmap", content: "- next", mode: "append" })
		expect(runAction).toHaveBeenCalledWith("upsertDocByTitle", {
			title: "Roadmap",
			content: "- next",
			mode: "append",
		})
	})
})
