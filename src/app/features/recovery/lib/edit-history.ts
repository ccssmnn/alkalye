export { collectCandidates, type PointerCandidate }

type RawEdit = { value?: unknown; at?: Date; by?: unknown }

type PointerCandidate = {
	id: string
	at: Date | undefined
	by: string
}

// Jazz resolves a pointer key by last-writer-wins, but every historical value
// stays in the edit log. `editsAt` yields those edits oldest-first, so an
// overwritten pointer (e.g. account.root replaced by the migration bug) can be
// recovered by reading the earlier value from here.
function collectCandidates(edits: Iterable<RawEdit>): PointerCandidate[] {
	let seen = new Set<string>()
	let candidates: PointerCandidate[] = []

	for (let edit of edits) {
		if (typeof edit.value !== "string") continue
		if (seen.has(edit.value)) continue
		seen.add(edit.value)
		candidates.push({
			id: edit.value,
			at: edit.at,
			by: edit.by === undefined ? "unknown" : String(edit.by),
		})
	}

	return candidates
}
