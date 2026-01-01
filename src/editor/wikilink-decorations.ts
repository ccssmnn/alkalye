import { type Extension, RangeSetBuilder } from "@codemirror/state"
import {
	EditorView,
	Decoration,
	type DecorationSet,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view"
import { WIKILINK_REGEX } from "./wikilink-parser"

export { createWikilinkDecorations }
export type { WikilinkResolver }

type WikilinkResolver = (
	id: string,
) => { title: string; exists: boolean } | null

class WikilinkWidget extends WidgetType {
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
			? "cm-wikilink"
			: "cm-wikilink cm-wikilink-broken"
		span.textContent = this.title
		span.dataset.docId = this.id

		span.addEventListener("mousedown", e => {
			// Prevent CodeMirror from placing cursor and removing decoration
			e.preventDefault()
			e.stopPropagation()
		})

		span.addEventListener("click", e => {
			e.preventDefault()
			e.stopPropagation()
			// Only navigate if doc exists
			if (this.exists) {
				this.onNavigate(this.id, e.ctrlKey || e.metaKey)
			}
		})

		return span
	}

	eq(other: WikilinkWidget) {
		return (
			this.id === other.id &&
			this.title === other.title &&
			this.exists === other.exists
		)
	}

	ignoreEvent(e: Event) {
		// Let our click handler run, not CodeMirror's
		return e.type === "mousedown" || e.type === "click"
	}
}

function findWikilinks(
	text: string,
): Array<{ id: string; from: number; to: number }> {
	let links: Array<{ id: string; from: number; to: number }> = []
	WIKILINK_REGEX.lastIndex = 0
	let match: RegExpExecArray | null
	while ((match = WIKILINK_REGEX.exec(text)) !== null) {
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

function createWikilinkDecorations(
	resolver: WikilinkResolver,
	onNavigate: (id: string, newTab: boolean) => void,
): Extension {
	let decorationPlugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet
			resolver: WikilinkResolver
			onNavigate: (id: string, newTab: boolean) => void

			constructor(view: EditorView) {
				this.resolver = resolver
				this.onNavigate = onNavigate
				this.decorations = this.buildDecorations(view)
			}

			update(update: ViewUpdate) {
				// Rebuild on any change - resolver may return different results
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
				let links = findWikilinks(text)
				let selection = view.state.selection.main

				for (let link of links) {
					// Don't decorate if cursor is inside the wikilink
					if (selection.from >= link.from && selection.to <= link.to) {
						continue
					}

					// Always call resolver - it uses refs so returns fresh data
					let resolved = this.resolver(link.id)
					let title = resolved?.title ?? "Document Not Found"
					let exists = resolved?.exists ?? false

					let widget = Decoration.replace({
						widget: new WikilinkWidget(link.id, title, exists, this.onNavigate),
					})
					builder.add(link.from, link.to, widget)
				}

				return builder.finish()
			}
		},
		{
			decorations: v => v.decorations,
		},
	)

	let theme = EditorView.baseTheme({
		".cm-wikilink": {
			color: "var(--brand)",
			cursor: "pointer",
			borderRadius: "2px",
			padding: "0 2px",
			backgroundColor: "var(--brand-subtle)",
		},
		".cm-wikilink:hover": {
			backgroundColor: "color-mix(in oklch, var(--brand) 20%, transparent)",
			textDecoration: "underline",
		},
		".cm-wikilink-broken": {
			color: "var(--destructive)",
			textDecoration: "underline wavy",
			textDecorationColor: "var(--destructive)",
			backgroundColor:
				"color-mix(in oklch, var(--destructive) 10%, transparent)",
		},
		".cm-wikilink-broken:hover": {
			backgroundColor:
				"color-mix(in oklch, var(--destructive) 20%, transparent)",
		},
	})

	return [decorationPlugin, theme]
}
