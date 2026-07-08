import type { PointerCandidate } from "./edit-history"

export {
	logInspectReport,
	ROOT_LIST_KEYS,
	INSPECTED_ROOT_KEYS,
	type RootListKey,
	type InspectedRootKey,
	type DocumentsSummary,
	type SpacesSummary,
	type RootCandidateReport,
	type ListCandidateReport,
	type InspectResult,
}

let ROOT_LIST_KEYS = [
	"documents",
	"inactiveDocuments",
	"spaces",
	"themes",
] as const

let INSPECTED_ROOT_KEYS = [...ROOT_LIST_KEYS, "settings"] as const

type RootListKey = (typeof ROOT_LIST_KEYS)[number]
type InspectedRootKey = (typeof INSPECTED_ROOT_KEYS)[number]

type DocumentsSummary = { count: number; previews: string[] }
type SpacesSummary = { count: number; names: string[] }

type RootCandidateReport = PointerCandidate & {
	isCurrent: boolean
	loadable: boolean
	documents: DocumentsSummary
	spaces: SpacesSummary
}

type ListCandidateReport = PointerCandidate & {
	isCurrent: boolean
	loadable: boolean
	summary: DocumentsSummary | SpacesSummary | { count: number }
}

type InspectResult = {
	currentRootId: string | undefined
	rootCandidates: RootCandidateReport[]
	currentRootLists: Partial<Record<InspectedRootKey, ListCandidateReport[]>>
}

function logInspectReport(result: InspectResult): void {
	console.info("=== Alkalye account recovery — inspect (read-only) ===")
	console.info("Current root:", result.currentRootId ?? "(none)")

	console.info(
		`Root pointer history (${result.rootCandidates.length} value(s)):`,
	)
	for (let candidate of result.rootCandidates) {
		console.info(
			`  ${candidate.isCurrent ? "→ current" : "  previous"} ${candidate.id}` +
				` | ${candidate.at?.toISOString() ?? "unknown time"}` +
				` | docs: ${candidate.documents.count}, spaces: ${candidate.spaces.count}` +
				(candidate.loadable ? "" : " | NOT LOADABLE"),
		)
		for (let preview of candidate.documents.previews) {
			console.info(`        · ${preview}`)
		}
		if (candidate.spaces.names.length > 0) {
			console.info(`        spaces: ${candidate.spaces.names.join(", ")}`)
		}
	}

	for (let key of INSPECTED_ROOT_KEYS) {
		let candidates = result.currentRootLists[key]
		if (!candidates || candidates.length < 2) continue
		console.info(`Current root's "${key}" pointer history:`)
		for (let candidate of candidates) {
			let summary =
				"names" in candidate.summary
					? `spaces: ${candidate.summary.count} (${candidate.summary.names.join(", ")})`
					: "previews" in candidate.summary
						? `docs: ${candidate.summary.count}`
						: `items: ${candidate.summary.count}`
			console.info(
				`  ${candidate.isCurrent ? "→ current" : "  previous"} ${candidate.id} | ${summary}`,
			)
		}
	}

	console.info(
		"SAFETY: only the NEWEST previous candidate is safe to restore. " +
			"Older candidates predate later deletions and can resurrect deleted documents; " +
			"recover() refuses them unless you pass { force: true }. " +
			"Note: old/new ordering is based on wall-clock edit timestamps, not causality - " +
			"device clock skew can misorder candidates, so sanity-check the timestamps above.",
	)
	console.info(
		"To restore, call e.g. alkalyeRecovery.recover({ rootId: '<previous-root-id>' }) " +
			"or alkalyeRecovery.recover({ documents: '<previous-list-id>', spaces: '<previous-list-id>' }). " +
			"If recover is not installed, opt in first: reload with ?recovery=1 or run " +
			"localStorage.setItem('alkalyeRecoveryEnabled', '1') and reload.",
	)
}
