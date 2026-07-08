import {
	inspectRecovery,
	recoverAccount,
	type RecoverOptions,
	type RecoverOutcome,
} from "./recovery"

export { installRecoveryConsole, RECOVERY_OPT_IN_STORAGE_KEY }

let RECOVERY_OPT_IN_STORAGE_KEY = "alkalyeRecoveryEnabled"

type RecoveryConsole = {
	inspect: typeof inspectRecovery
	// Mutating API - only installed after explicit opt-in (?recovery=1 or
	// localStorage flag) so a pasted console snippet cannot silently rewrite
	// account pointers (self-XSS hardening).
	recover?: (options?: RecoverOptions) => Promise<RecoverOutcome>
}

declare global {
	interface Window {
		alkalyeRecovery?: RecoveryConsole
	}
}

function installRecoveryConsole(): void {
	if (typeof window === "undefined") return
	window.alkalyeRecovery = isRecoverOptedIn()
		? { inspect: inspectRecovery, recover: recoverAccount }
		: { inspect: inspectRecovery }
}

function isRecoverOptedIn(): boolean {
	let params = new URLSearchParams(window.location.search)
	if (params.get("recovery") === "1") return true
	try {
		return window.localStorage.getItem(RECOVERY_OPT_IN_STORAGE_KEY) === "1"
	} catch {
		return false
	}
}
