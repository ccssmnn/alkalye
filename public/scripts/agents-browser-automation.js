/*
Public helper for /agents.
Uses window.alkalyeAgents registered by the route (same central action module).
*/

function requireAgentsApi() {
	if (!window.alkalyeAgents) {
		throw new Error("window.alkalyeAgents not found. Open /agents first.")
	}
	return window.alkalyeAgents
}

window.alkalyeAgentsPublicAutomation = {
	runAgentsAction(action, params = {}) {
		return requireAgentsApi().runAction(action, params)
	},
	createAccount(passphrase, name) {
		return requireAgentsApi().createAccount(passphrase, name)
	},
	signIn(passphrase) {
		return requireAgentsApi().signIn(passphrase)
	},
	upsertDocByTitle(params) {
		return requireAgentsApi().upsertDocByTitle(params)
	},
	listSpaces() {
		return requireAgentsApi().listSpaces()
	},
	listDocs(spaceId) {
		return requireAgentsApi().listDocs(spaceId)
	},
	getDoc(docId) {
		return requireAgentsApi().getDoc(docId)
	},
}
