// Temporary incident tooling for the 2026-07 root-pointer-overwrite incident.
// Delete this feature once affected accounts are recovered.
export {
	inspectRecovery,
	recoverAccount,
	type InspectResult,
	type RecoverOptions,
	type RecoverOutcome,
} from "./lib/recovery"
export {
	installRecoveryConsole,
	RECOVERY_OPT_IN_STORAGE_KEY,
} from "./lib/window-bridge"
