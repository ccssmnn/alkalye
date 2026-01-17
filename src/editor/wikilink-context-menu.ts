import { type EditorView } from "@codemirror/view"
import { WIKILINK_REGEX } from "./wikilink-parser"

export { getWikilinkAtPosition, removeWikilink, replaceWikilink }
export type { WikilinkAtPosition }

type WikilinkAtPosition = {
	id: string
	alias?: string
	from: number
	to: number
}

function getWikilinkAtPosition(
	view: EditorView,
	pos: number,
): WikilinkAtPosition | null {
	let doc = view.state.doc
	let line = doc.lineAt(pos)
	let lineText = line.text
	let offsetInLine = pos - line.from

	WIKILINK_REGEX.lastIndex = 0
	let match: RegExpExecArray | null

	while ((match = WIKILINK_REGEX.exec(lineText)) !== null) {
		let start = match.index
		let end = match.index + match[0].length

		if (offsetInLine >= start && offsetInLine <= end) {
			let inner = match[1]
			let suffix = match[2]
			let pipeIndex = inner.indexOf("|")
			let id: string
			let alias: string | undefined

			if (pipeIndex !== -1) {
				id = inner.slice(0, pipeIndex).trim()
				alias = inner.slice(pipeIndex + 1).trim()
			} else {
				id = inner.trim()
			}

			if (suffix) {
				alias = (alias ?? "") + suffix
			}

			return {
				id,
				alias: alias || undefined,
				from: line.from + start,
				to: line.from + end,
			}
		}
	}

	return null
}

function removeWikilink(view: EditorView, wikilink: WikilinkAtPosition): void {
	view.dispatch({
		changes: { from: wikilink.from, to: wikilink.to, insert: "" },
	})
}

function replaceWikilink(
	view: EditorView,
	wikilink: WikilinkAtPosition,
	newId: string,
): void {
	// Preserve alias if present
	let newText = wikilink.alias
		? `[[${newId}|${wikilink.alias}]]`
		: `[[${newId}]]`
	view.dispatch({
		changes: { from: wikilink.from, to: wikilink.to, insert: newText },
	})
}
