import { RangeSetBuilder } from "@codemirror/state"
import {
	EditorView,
	Decoration,
	type DecorationSet,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view"
import type { Extension } from "@codemirror/state"
import { getPresentationMode, parsePresentation } from "../lib/presentation"

export { presentationDecorations }

let slideLine = Decoration.line({ class: "cm-presentation-slide-line" })

function buildPresentationDecorations(view: EditorView): DecorationSet {
	let builder = new RangeSetBuilder<Decoration>()
	let doc = view.state.doc
	let content = doc.toString()

	if (!getPresentationMode(content)) {
		return builder.finish()
	}

	let items = parsePresentation(content)
	let ranges: { start: number; end: number }[] = []

	for (let item of items) {
		if (item.type === "block") {
			ranges.push({ start: item.block.startLine, end: item.block.endLine })
		}
	}

	for (let range of ranges) {
		for (let i = range.start; i <= range.end; i++) {
			let lineNum = i + 1
			if (lineNum <= doc.lines) {
				let line = doc.line(lineNum)
				builder.add(line.from, line.from, slideLine)
			}
		}
	}

	return builder.finish()
}

let presentationPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet

		constructor(view: EditorView) {
			this.decorations = buildPresentationDecorations(view)
		}

		update(update: ViewUpdate) {
			if (update.docChanged) {
				this.decorations = buildPresentationDecorations(update.view)
			}
		}
	},
	{ decorations: v => v.decorations },
)

let presentationTheme = EditorView.baseTheme({
	".cm-presentation-slide-line": {
		backgroundColor: "var(--brand-subtle)",
	},
})

let presentationDecorations: Extension = [presentationPlugin, presentationTheme]
