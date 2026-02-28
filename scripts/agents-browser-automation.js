/*
Browser automation helpers for /agents.
Run in browser console (or inject via automation tool).
All selectors use stable data-testid IDs.
*/

let AGENTS_TEST_IDS = {
	page: "agents-page",
	form: "agents-form",
	actionSelect: "agents-action-select",
	submit: "agents-submit",
	logList: "agents-log-list",
	fieldPrefix: "agents-field-",
}

function selector(testId) {
	return `[data-testid="${testId}"]`
}

function fieldTestId(fieldKey) {
	return `${AGENTS_TEST_IDS.fieldPrefix}${fieldKey}`
}

function getElement(testId) {
	let element = document.querySelector(selector(testId))
	if (!element) {
		throw new Error(`Missing element for test id: ${testId}`)
	}
	return element
}

function setElementValue(element, value) {
	if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement) && !(element instanceof HTMLSelectElement)) {
		throw new Error("Expected input, textarea, or select element")
	}
	element.value = value
	element.dispatchEvent(new Event("input", { bubbles: true }))
	element.dispatchEvent(new Event("change", { bubbles: true }))
}

function runAgentsAction(action, params) {
	let actionSelect = getElement(AGENTS_TEST_IDS.actionSelect)
	setElementValue(actionSelect, action)

	for (let [fieldKey, value] of Object.entries(params ?? {})) {
		let input = getElement(fieldTestId(fieldKey))
		setElementValue(input, value)
	}

	let submit = getElement(AGENTS_TEST_IDS.submit)
	submit.click()
}

function createAccount(passphrase, name) {
	runAgentsAction("createAccount", { passphrase, name })
}

function signIn(passphrase) {
	runAgentsAction("signIn", { passphrase })
}

window.alkalyeAgentsAutomation = {
	runAgentsAction,
	createAccount,
	signIn,
	selector,
	fieldTestId,
}
