import type { AgentAction } from "./agents-contract"

export {
	AGENTS_STABLE_IDS,
	type AgentsStableId,
	type AgentAutomationStep,
	makeAgentFieldId,
	makeAgentFieldTestId,
	makeAgentTestSelector,
	buildAgentAutomationPlan,
}

let AGENTS_STABLE_IDS = {
	page: "agents-page",
	form: "agents-form",
	actionSelect: "agents-action-select",
	dynamicFields: "agents-dynamic-fields",
	submit: "agents-submit",
	log: "agents-log",
	logList: "agents-log-list",
	logEntry: "agents-log-entry",
	fieldPrefix: "agents-field-",
}

type AgentsStableId =
	| "agents-page"
	| "agents-form"
	| "agents-action-select"
	| "agents-dynamic-fields"
	| "agents-submit"
	| "agents-log"
	| "agents-log-list"
	| "agents-log-entry"

type AgentAutomationStep = {
	action: "set-value" | "click"
	selector: string
	value?: string
}

function makeAgentFieldId(fieldKey: string): string {
	return `${AGENTS_STABLE_IDS.fieldPrefix}${fieldKey}`
}

function makeAgentFieldTestId(fieldKey: string): string {
	return makeAgentFieldId(fieldKey)
}

function makeAgentTestSelector(testId: string): string {
	return `[data-testid=\"${testId}\"]`
}

function buildAgentAutomationPlan(
	action: AgentAction,
	params: Record<string, string>,
): AgentAutomationStep[] {
	let steps: AgentAutomationStep[] = [
		{
			action: "set-value",
			selector: makeAgentTestSelector(AGENTS_STABLE_IDS.actionSelect),
			value: action,
		},
	]

	for (let [key, value] of Object.entries(params)) {
		steps.push({
			action: "set-value",
			selector: makeAgentTestSelector(makeAgentFieldTestId(key)),
			value,
		})
	}

	steps.push({
		action: "click",
		selector: makeAgentTestSelector(AGENTS_STABLE_IDS.submit),
	})

	return steps
}
