export {
	clearReloadDiagnostics,
	readReloadDiagnostics,
	reloadDiagnosticsReport,
	type ReloadDiagnostic,
}

type ReloadDiagnostic = {
	at: string
	event: string
	details: Record<string, string | number | boolean | null>
}

let storageKey = "alkalye:reload-diagnostics"

function readReloadDiagnostics(): ReloadDiagnostic[] {
	try {
		let value = window.localStorage.getItem(storageKey)
		if (!value) return []
		let parsed: unknown = JSON.parse(value)
		if (!Array.isArray(parsed)) return []
		return parsed.flatMap(parseDiagnostic)
	} catch {
		return []
	}
}

function clearReloadDiagnostics(): void {
	window.localStorage.removeItem(storageKey)
}

function reloadDiagnosticsReport(): string {
	return JSON.stringify(readReloadDiagnostics(), null, 2)
}

function parseDiagnostic(value: unknown): ReloadDiagnostic[] {
	if (!isRecord(value)) return []
	if (typeof value.at !== "string" || typeof value.event !== "string") return []
	let details = isRecord(value.details) ? value.details : {}
	let safeDetails: ReloadDiagnostic["details"] = {}
	for (let [key, detail] of Object.entries(details)) {
		if (
			typeof detail === "string" ||
			typeof detail === "number" ||
			typeof detail === "boolean" ||
			detail === null
		) {
			safeDetails[key] = detail
		}
	}
	return [{ at: value.at, event: value.event, details: safeDetails }]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}
