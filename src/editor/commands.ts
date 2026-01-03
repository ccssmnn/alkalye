import { EditorView } from "@codemirror/view"

type Command = (view: EditorView) => boolean
type ChangeSpec = { from: number; to: number; insert: string }

export {
	indentListItems,
	insertCodeBlock,
	insertImage,
	insertLink,
	moveLineDown,
	moveLineUp,
	outdentListItems,
	setBody,
	setHeadingLevel,
	toggleBlockquote,
	toggleBold,
	toggleBulletList,
	toggleInlineCode,
	toggleItalic,
	toggleLinePrefix,
	toggleOrderedList,
	toggleStrikethrough,
	toggleTaskComplete,
	toggleTaskList,
	wrapSelection,
}
export type { Command }

function wrapSelection(marker: string): Command {
	return view => {
		let { from, to } = view.state.selection.main

		if (from === to) {
			let markerLen = marker.length
			view.dispatch({
				changes: { from, to, insert: marker + marker },
				selection: { anchor: from + markerLen },
			})
			return true
		}

		let selectedText = view.state.sliceDoc(from, to)

		let markerLen = marker.length
		let before = view.state.sliceDoc(from - markerLen, from)
		let after = view.state.sliceDoc(to, to + markerLen)

		if (before === marker && after === marker) {
			view.dispatch({
				changes: [
					{ from: from - markerLen, to: from, insert: "" },
					{ from: to, to: to + markerLen, insert: "" },
				],
				selection: { anchor: from - markerLen, head: to - markerLen },
			})
		} else {
			view.dispatch({
				changes: { from, to, insert: marker + selectedText + marker },
				selection: { anchor: from + markerLen, head: to + markerLen },
			})
		}
		return true
	}
}

function toggleLinePrefix(prefix: string): Command {
	return view => {
		let { from, to } = view.state.selection.main
		let startLine = view.state.doc.lineAt(from)
		let endLine = view.state.doc.lineAt(to)

		let prefixTrimmed = prefix.trimStart()

		if (startLine.number === endLine.number) {
			let lineText = startLine.text
			let { indent, textAfterIndent } = getIndentAndText(lineText)

			if (textAfterIndent.startsWith(prefixTrimmed)) {
				view.dispatch({
					changes: {
						from: startLine.from + indent.length,
						to: startLine.from + indent.length + prefixTrimmed.length,
						insert: "",
					},
					selection: {
						anchor: Math.max(
							startLine.from + indent.length,
							from - prefixTrimmed.length,
						),
					},
				})
			} else {
				let existingPrefix = textAfterIndent.match(
					/^(#{1,6}\s|[-*+]\s(\[[ x]\]\s)?|\d+\.\s)/,
				)
				if (existingPrefix) {
					let existingMarker = existingPrefix[0]
					let diff = prefixTrimmed.length - existingMarker.length
					let prefixStart = startLine.from + indent.length
					view.dispatch({
						changes: {
							from: prefixStart,
							to: prefixStart + existingMarker.length,
							insert: prefix,
						},
						selection: { anchor: from + diff },
					})
				} else {
					let prefixStart = startLine.from + indent.length
					view.dispatch({
						changes: { from: prefixStart, insert: prefix },
						selection: { anchor: from + prefix.length },
					})
				}
			}
			return true
		}

		let changes: ChangeSpec[] = []
		let allHavePrefix = true

		for (let i = startLine.number; i <= endLine.number; i++) {
			let line = view.state.doc.line(i)
			let { textAfterIndent } = getIndentAndText(line.text)
			if (!textAfterIndent.startsWith(prefixTrimmed)) {
				allHavePrefix = false
				break
			}
		}

		for (let i = startLine.number; i <= endLine.number; i++) {
			let line = view.state.doc.line(i)
			let { indent, textAfterIndent } = getIndentAndText(line.text)

			if (allHavePrefix) {
				changes.push({
					from: line.from + indent.length,
					to: line.from + indent.length + prefixTrimmed.length,
					insert: "",
				})
			} else {
				let existingPrefix = textAfterIndent.match(
					/^(#{1,6}\s|[-*+]\s(\[[ x]\]\s)?|\d+\.\s)/,
				)
				let prefixStart = line.from + indent.length
				if (existingPrefix) {
					let existingMarker = existingPrefix[0]
					changes.push({
						from: prefixStart,
						to: prefixStart + existingMarker.length,
						insert: prefix,
					})
				} else {
					changes.push({
						from: prefixStart,
						to: prefixStart,
						insert: prefix,
					})
				}
			}
		}

		view.dispatch({ changes })
		return true
	}
}

function setHeadingLevel(level: number): Command {
	return view => {
		let { from } = view.state.selection.main
		let line = view.state.doc.lineAt(from)
		let lineText = line.text

		let prefix = "#".repeat(level) + " "
		let existingPrefix = lineText.match(/^#{1,6}\s/)?.[0]

		if (existingPrefix === prefix) {
			view.dispatch({
				changes: {
					from: line.from,
					to: line.from + existingPrefix.length,
					insert: "",
				},
				selection: {
					anchor: Math.max(line.from, from - existingPrefix.length),
				},
			})
		} else if (existingPrefix) {
			let diff = prefix.length - existingPrefix.length
			view.dispatch({
				changes: {
					from: line.from,
					to: line.from + existingPrefix.length,
					insert: prefix,
				},
				selection: { anchor: from + diff },
			})
		} else {
			view.dispatch({
				changes: { from: line.from, insert: prefix },
				selection: { anchor: from + prefix.length },
			})
		}
		return true
	}
}

let insertLink: Command = view => {
	let { from, to } = view.state.selection.main

	let lineFrom = view.state.doc.lineAt(from).from
	let lineTo = view.state.doc.lineAt(to).to
	let lineText = view.state.sliceDoc(lineFrom, lineTo)

	let linkRegex = /\[([^\]]*)\]\(([^)]*)\)/g
	let match
	while ((match = linkRegex.exec(lineText)) !== null) {
		let linkStart = lineFrom + match.index
		let linkEnd = lineFrom + match.index + match[0].length

		if (from >= linkStart && to <= linkEnd) {
			let linkText = match[1]
			view.dispatch({
				changes: { from: linkStart, to: linkEnd, insert: linkText },
				selection: { anchor: linkStart, head: linkStart + linkText.length },
			})
			return true
		}
	}

	let selectedText = view.state.sliceDoc(from, to)
	let text = selectedText || "link"
	let linkMarkup = `[${text}](url)`
	let urlStart = from + text.length + 3
	let urlEnd = urlStart + 3

	view.dispatch({
		changes: { from, to, insert: linkMarkup },
		selection: { anchor: urlStart, head: urlEnd },
	})
	return true
}

let insertImage: Command = view => {
	let { from, to } = view.state.selection.main
	let selectedText = view.state.sliceDoc(from, to)
	let altText = selectedText || "alt"
	let imageMarkup = `![${altText}](url)`
	let urlStart = from + altText.length + 4
	let urlEnd = urlStart + 3

	view.dispatch({
		changes: { from, to, insert: imageMarkup },
		selection: { anchor: urlStart, head: urlEnd },
	})
	return true
}

let insertCodeBlock: Command = view => {
	let { from, to } = view.state.selection.main
	let selectedText = view.state.sliceDoc(from, to)

	if (from === to) {
		let codeBlock = "```\n\n```"
		view.dispatch({
			changes: { from, to, insert: codeBlock },
			selection: { anchor: from + 4 },
		})
	} else {
		let codeBlock = "```\n" + selectedText + "\n```"
		view.dispatch({
			changes: { from, to, insert: codeBlock },
			selection: { anchor: from + 4, head: from + 4 + selectedText.length },
		})
	}
	return true
}

let moveLineUp: Command = view => {
	let { from, to } = view.state.selection.main
	let line = view.state.doc.lineAt(from)
	if (line.number === 1) return false

	let prevLine = view.state.doc.line(line.number - 1)
	let lineText = line.text
	let prevText = prevLine.text
	let anchorOffset = Math.min(from - line.from, lineText.length)
	let headOffset = Math.min(to - line.from, lineText.length)

	view.dispatch({
		changes: [
			{ from: prevLine.from, to: prevLine.to, insert: lineText },
			{ from: line.from, to: line.to, insert: prevText },
		],
		selection: {
			anchor: prevLine.from + anchorOffset,
			head: prevLine.from + headOffset,
		},
	})
	return true
}

let moveLineDown: Command = view => {
	let { from, to } = view.state.selection.main
	let line = view.state.doc.lineAt(from)
	if (line.number === view.state.doc.lines) return false

	let nextLine = view.state.doc.line(line.number + 1)
	let lineText = line.text
	let nextText = nextLine.text
	let anchorOffset = Math.min(from - line.from, lineText.length)
	let headOffset = Math.min(to - line.from, lineText.length)
	let newLineStart = line.from + nextText.length + 1

	view.dispatch({
		changes: [
			{ from: line.from, to: line.to, insert: nextText },
			{ from: nextLine.from, to: nextLine.to, insert: lineText },
		],
		selection: {
			anchor: newLineStart + anchorOffset,
			head: newLineStart + headOffset,
		},
	})
	return true
}

let toggleTaskComplete: Command = view => {
	let { from } = view.state.selection.main
	let line = view.state.doc.lineAt(from)
	let lineText = line.text

	let uncheckedMatch = lineText.match(/^(\s*[-*]\s)\[ \](\s)/)
	if (uncheckedMatch) {
		let prefixLength = uncheckedMatch[1].length
		let checkboxStart = line.from + prefixLength
		view.dispatch({
			changes: {
				from: checkboxStart,
				to: checkboxStart + 3,
				insert: "[x]",
			},
		})
		return true
	}

	let checkedMatch = lineText.match(/^(\s*[-*]\s)\[x\](\s)/i)
	if (checkedMatch) {
		let prefixLength = checkedMatch[1].length
		let checkboxStart = line.from + prefixLength
		view.dispatch({
			changes: {
				from: checkboxStart,
				to: checkboxStart + 3,
				insert: "[ ]",
			},
		})
		return true
	}

	return false
}

let setBody: Command = view => {
	let { from } = view.state.selection.main
	let line = view.state.doc.lineAt(from)
	let lineText = line.text

	let existingPrefix = lineText.match(
		/^(#{1,6}\s|[-*+]\s(\[[ x]\]\s)?|>\s|\d+\.\s)/,
	)?.[0]
	if (existingPrefix) {
		view.dispatch({
			changes: {
				from: line.from,
				to: line.from + existingPrefix.length,
				insert: "",
			},
			selection: { anchor: Math.max(line.from, from - existingPrefix.length) },
		})
	}
	return true
}

function indentListItems(view: EditorView): boolean {
	let { from, to } = view.state.selection.main
	let startLine = view.state.doc.lineAt(from)
	let endLine = view.state.doc.lineAt(to)

	let changes: ChangeSpec[] = []

	for (let i = startLine.number; i <= endLine.number; i++) {
		let line = view.state.doc.line(i)
		let match = matchListItem(line.text)
		if (!match) continue

		let indentIncrement = getIndentIncrement(match.indent)
		changes.push({
			from: line.from,
			to: line.from + match.indent.length,
			insert: match.indent + indentIncrement,
		})
	}

	if (changes.length > 0) {
		view.dispatch({ changes })
		return true
	}

	return false
}

function outdentListItems(view: EditorView): boolean {
	let { from, to } = view.state.selection.main
	let startLine = view.state.doc.lineAt(from)
	let endLine = view.state.doc.lineAt(to)

	let changes: ChangeSpec[] = []

	for (let i = startLine.number; i <= endLine.number; i++) {
		let line = view.state.doc.line(i)
		let match = matchListItem(line.text)
		if (!match || match.indent.length === 0) continue

		let indent = match.indent
		let newIndent: string

		if (indent.startsWith("\t")) {
			newIndent = indent.slice(1)
		} else if (indent.length >= 2) {
			newIndent = indent.slice(2)
		} else {
			newIndent = ""
		}

		changes.push({
			from: line.from,
			to: line.from + indent.length,
			insert: newIndent,
		})
	}

	if (changes.length > 0) {
		view.dispatch({ changes })
		return true
	}

	return false
}

function getIndentAndText(lineText: string): {
	indent: string
	textAfterIndent: string
} {
	let indentMatch = lineText.match(/^(\s*)/)
	let indent = indentMatch ? indentMatch[1] : ""
	let textAfterIndent = lineText.slice(indent.length)
	return { indent, textAfterIndent }
}

let LIST_MARKER_PATTERN = /^(\s*)([-*+]\s(\[[ x]\]\s)?|\d+\.\s)/

function matchListItem(lineText: string): {
	indent: string
	marker: string
} | null {
	let match = lineText.match(LIST_MARKER_PATTERN)
	if (!match) return null
	return { indent: match[1], marker: match[2] }
}

function getIndentIncrement(indent: string): string {
	if (indent.includes("\t")) return "\t"
	return "  "
}

let toggleBold = wrapSelection("**")
let toggleItalic = wrapSelection("*")
let toggleStrikethrough = wrapSelection("~~")
let toggleInlineCode = wrapSelection("`")
let toggleBulletList = toggleLinePrefix("- ")
let toggleOrderedList = toggleLinePrefix("1. ")
let toggleTaskList = toggleLinePrefix("- [ ] ")
let toggleBlockquote = toggleLinePrefix("> ")
