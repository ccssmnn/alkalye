import { type Extension, RangeSetBuilder } from "@codemirror/state"
import {
	EditorView,
	Decoration,
	type DecorationSet,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view"
import { getFrontmatterRange } from "./frontmatter"

export { createBacklinkDecorations }
export type { BacklinkResolver }

type BacklinkResolver = (
	id: string,
) => { title: string; exists: boolean } | null

class BacklinkWidget extends WidgetType {
	id: string
	title: string
	exists: boolean
	onNavigate: (id: string, newTab: boolean) => void

	constructor(
		id: string,
		title: string,
		exists: boolean,
		onNavigate: (id: string, newTab: boolean) => void,
	) {
		super()
		this.id = id
		this.title = title
		this.exists = exists
		this.onNavigate = onNavigate
	}

	toDOM() {
		let span = document.createElement("span")
		span.className = this.exists
			? "cm-backlink"
			: "cm-backlink cm-backlink-broken"
		span.textContent = this.title
		span.dataset.docId = this.id

		span.addEventListener("mousedown", e => {
			e.preventDefault()
			e.stopPropagation()
		})

		span.addEventListener("click", e => {
			e.preventDefault()
			e.stopPropagation()
			if (this.exists) {
				this.onNavigate(this.id, e.ctrlKey || e.metaKey)
			}
		})

		return span
	}

	eq(other: BacklinkWidget) {
		return (
			this.id === other.id &&
			this.title === other.title &&
			this.exists === other.exists
		)
	}

	ignoreEvent(e: Event) {
		return e.type === "mousedown" || e.type === "click"
	}
}

function findBacklinkLine(
	text: string,
): { lineStart: number; lineEnd: number; ids: string[] } | null {
	// Find the backlinks line in frontmatter
	let match = text.match(/^---\r?\n([\s\S]*?)(?:\r?\n)?---/)
	if (!match) return null

	let frontmatter = match[1]
	let frontmatterStart = 4 // "---\n".length

	let lines = frontmatter.split(/\r?\n/)
	let offset = frontmatterStart

	for (let line of lines) {
		let backlinkMatch = line.match(/^backlinks:\s*(.*)$/)
		if (backlinkMatch) {
			let ids = backlinkMatch[1]
				.split(",")
				.map(id => id.trim())
				.filter(Boolean)
			let lineStart = offset
			let lineEnd = offset + line.length
			return { lineStart, lineEnd, ids }
		}
		offset += line.length + 1 // +1 for newline
	}

	return null
}

function createBacklinkDecorations(
	resolver: BacklinkResolver,
	onNavigate: (id: string, newTab: boolean) => void,
): Extension {
	let decorationPlugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet
			resolver: BacklinkResolver
			onNavigate: (id: string, newTab: boolean) => void

			constructor(view: EditorView) {
				this.resolver = resolver
				this.onNavigate = onNavigate
				this.decorations = this.buildDecorations(view)
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.decorations = this.buildDecorations(update.view)
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				let builder = new RangeSetBuilder<Decoration>()
				let doc = view.state.doc
				let text = doc.toString()

				// Check if frontmatter is folded - don't decorate if so
				let fmRange = getFrontmatterRange(view.state)
				if (!fmRange) return Decoration.none

				let backlinks = findBacklinkLine(text)
				if (!backlinks || backlinks.ids.length === 0) return Decoration.none

				let selection = view.state.selection.main

				// Don't decorate if cursor is on the backlinks line
				if (
					selection.from >= backlinks.lineStart &&
					selection.to <= backlinks.lineEnd
				) {
					return Decoration.none
				}

				// Find the position after "backlinks: "
				let backlinkKeyMatch = text
					.slice(backlinks.lineStart, backlinks.lineEnd)
					.match(/^backlinks:\s*/)
				if (!backlinkKeyMatch) return Decoration.none

				let valueStart = backlinks.lineStart + backlinkKeyMatch[0].length
				let valueEnd = backlinks.lineEnd

				// Create widgets for each ID
				let widgets: { from: number; to: number; widget: BacklinkWidget }[] = []
				let currentPos = valueStart
				let idsText = text.slice(valueStart, valueEnd)
				let parts = idsText.split(",")

				for (let i = 0; i < parts.length; i++) {
					let part = parts[i]
					let trimmedId = part.trim()
					if (!trimmedId) {
						currentPos += part.length + 1 // +1 for comma
						continue
					}

					let resolved = this.resolver(trimmedId)
					let title = resolved?.title ?? trimmedId
					let exists = resolved?.exists ?? false

					// Calculate exact positions
					let leadingSpaces = part.length - part.trimStart().length
					let idStart = currentPos + leadingSpaces
					let idEnd = idStart + trimmedId.length

					widgets.push({
						from: idStart,
						to: idEnd,
						widget: new BacklinkWidget(
							trimmedId,
							title,
							exists,
							this.onNavigate,
						),
					})

					currentPos += part.length + 1 // +1 for comma
				}

				// Add decorations in order
				for (let w of widgets) {
					let deco = Decoration.replace({
						widget: w.widget,
					})
					builder.add(w.from, w.to, deco)
				}

				return builder.finish()
			}
		},
		{
			decorations: v => v.decorations,
		},
	)

	let theme = EditorView.baseTheme({
		".cm-backlink": {
			color: "var(--brand)",
			cursor: "pointer",
			borderRadius: "2px",
			padding: "0 2px",
			backgroundColor: "var(--brand-subtle)",
		},
		".cm-backlink:hover": {
			backgroundColor: "color-mix(in oklch, var(--brand) 20%, transparent)",
			textDecoration: "underline",
		},
		".cm-backlink-broken": {
			color: "var(--destructive)",
			textDecoration: "underline wavy",
			textDecorationColor: "var(--destructive)",
			backgroundColor:
				"color-mix(in oklch, var(--destructive) 10%, transparent)",
		},
		".cm-backlink-broken:hover": {
			backgroundColor:
				"color-mix(in oklch, var(--destructive) 20%, transparent)",
		},
	})

	return [decorationPlugin, theme]
}
