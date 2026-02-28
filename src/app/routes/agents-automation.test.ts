import { describe, it, expect } from "vitest"
import {
	AGENTS_STABLE_IDS,
	buildAgentAutomationPlan,
	makeAgentFieldId,
	makeAgentFieldTestId,
	makeAgentTestSelector,
} from "./agents-automation"

describe("agents-automation", () => {
	it("builds stable selectors", () => {
		expect(makeAgentTestSelector(AGENTS_STABLE_IDS.submit)).toBe(
			'[data-testid="agents-submit"]',
		)
		expect(makeAgentFieldId("docId")).toBe("agents-field-docId")
		expect(makeAgentFieldTestId("docId")).toBe("agents-field-docId")
	})

	it("creates plan for action and fields", () => {
		let plan = buildAgentAutomationPlan("getDoc", { docId: "doc-1" })
		expect(plan).toEqual([
			{
				action: "set-value",
				selector: '[data-testid="agents-action-select"]',
				value: "getDoc",
			},
			{
				action: "set-value",
				selector: '[data-testid="agents-field-docId"]',
				value: "doc-1",
			},
			{
				action: "click",
				selector: '[data-testid="agents-submit"]',
			},
		])
	})
})
