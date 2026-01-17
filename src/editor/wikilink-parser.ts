export { parseWikiLinks, WIKILINK_REGEX }
export type { WikiLink }

type WikiLink = {
	id: string
	alias?: string // custom display text via [[id|alias]]
	from: number
	to: number
}

// Matches [[doc_id]] or [[doc_id|alias]] or [[]] (empty)
// Group 1: content inside brackets (may contain |alias)
let WIKILINK_REGEX = /\[\[([^\]]*)\]\](\w*)/g

function parseWikiLinks(content: string): WikiLink[] {
	let links: WikiLink[] = []
	let match: RegExpExecArray | null

	// Reset regex state
	WIKILINK_REGEX.lastIndex = 0

	while ((match = WIKILINK_REGEX.exec(content)) !== null) {
		let inner = match[1]
		let suffix = match[2] // text immediately after ]] like "s" in [[link]]s
		if (inner) {
			// Check for alias: [[id|alias]]
			let pipeIndex = inner.indexOf("|")
			let id: string
			let alias: string | undefined

			if (pipeIndex !== -1) {
				id = inner.slice(0, pipeIndex).trim()
				alias = inner.slice(pipeIndex + 1).trim()
			} else {
				id = inner.trim()
			}

			// Append suffix to alias if present
			if (suffix) {
				alias = (alias ?? "") + suffix
			}

			if (id) {
				links.push({
					id,
					alias: alias || undefined,
					from: match.index,
					to: match.index + match[0].length,
				})
			}
		}
	}

	return links
}
