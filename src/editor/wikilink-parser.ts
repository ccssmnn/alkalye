export { parseWikiLinks, WIKILINK_REGEX }
export type { WikiLink }

type WikiLink = {
	id: string
	from: number
	to: number
}

// Matches [[doc_id]] or [[]] (empty) - captures the doc ID
let WIKILINK_REGEX = /\[\[([^\]]*)\]\]/g

function parseWikiLinks(content: string): WikiLink[] {
	let links: WikiLink[] = []
	let match: RegExpExecArray | null

	// Reset regex state
	WIKILINK_REGEX.lastIndex = 0

	while ((match = WIKILINK_REGEX.exec(content)) !== null) {
		if (match[1]) {
			links.push({
				id: match[1],
				from: match.index,
				to: match.index + match[0].length,
			})
		}
	}

	return links
}
