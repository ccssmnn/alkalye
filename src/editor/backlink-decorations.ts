import { type Extension, RangeSetBuilder } from "@codemirror/state"
import {
	EditorView,
	Decoration,
	type DecorationSet,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view"
import { getFrontmatterRange, getBacklinksWithRange } from "./frontmatter"

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

				// Check if frontmatter exists
				let fmRange = getFrontmatterRange(view.state)
				if (!fmRange) return Decoration.none

				let backlinks = getBacklinksWithRange(text)
				if (!backlinks || backlinks.ids.length === 0) return Decoration.none

				let selection = view.state.selection.main

				// Don't decorate if cursor is on the backlinks line
				if (
					selection.from >= backlinks.lineFrom &&
					selection.to <= backlinks.lineTo
				) {
					return Decoration.none
				}

				// Create widgets for each ID
				let widgets: { from: number; to: number; widget: BacklinkWidget }[] = []
				let currentPos = backlinks.valueFrom
				let idsText = text.slice(backlinks.valueFrom, backlinks.valueTo)
				let parts = idsText.split(",")

				for (let i = 0; i < parts.length; i++) {
					let part = parts[i]
					let trimmedId = part.trim()
					if (!trimmedId) {
						currentPos += part.length + 1
						continue
					}

					let resolved = this.resolver(trimmedId)
					let title = resolved?.title ?? trimmedId
					let exists = resolved?.exists ?? false

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

					currentPos += part.length + 1
				}

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
