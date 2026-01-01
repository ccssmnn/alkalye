import {
	type Extension,
	RangeSetBuilder,
	StateField,
	StateEffect,
} from "@codemirror/state"
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

// Effect to update resolved titles
let updateTitlesEffect =
	StateEffect.define<Map<string, { title: string; exists: boolean }>>()

// State field to store resolved titles
let resolvedTitlesField = StateField.define<
	Map<string, { title: string; exists: boolean }>
>({
	create() {
		return new Map()
	},
	update(value, tr) {
		for (let effect of tr.effects) {
			if (effect.is(updateTitlesEffect)) {
				return effect.value
			}
		}
		return value
	},
})

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

	ignoreEvent() {
		return false
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
			pendingResolve: Set<string> = new Set()

			constructor(view: EditorView) {
				this.resolver = resolver
				this.onNavigate = onNavigate
				this.decorations = this.buildDecorations(view)
				this.resolveUnknownLinks(view)
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					this.decorations = this.buildDecorations(update.view)
					this.resolveUnknownLinks(update.view)
				}
				// Check if titles were updated
				for (let effect of update.transactions.flatMap(t => t.effects)) {
					if (effect.is(updateTitlesEffect)) {
						this.decorations = this.buildDecorations(update.view)
					}
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				let builder = new RangeSetBuilder<Decoration>()
				let doc = view.state.doc
				let text = doc.toString()
				let links = findWikilinks(text)
				let resolvedTitles = view.state.field(resolvedTitlesField)
				let selection = view.state.selection.main

				for (let link of links) {
					// Don't decorate if cursor is inside the wikilink
					if (selection.from >= link.from && selection.to <= link.to) {
						continue
					}

					let resolved = resolvedTitles.get(link.id) ?? this.resolver(link.id)
					let title = resolved?.title ?? link.id
					let exists = resolved?.exists ?? false

					let widget = Decoration.replace({
						widget: new WikilinkWidget(link.id, title, exists, this.onNavigate),
					})
					builder.add(link.from, link.to, widget)
				}

				return builder.finish()
			}

			resolveUnknownLinks(view: EditorView) {
				let text = view.state.doc.toString()
				let links = findWikilinks(text)
				let resolvedTitles = view.state.field(resolvedTitlesField)
				let toResolve: string[] = []

				for (let link of links) {
					if (
						!resolvedTitles.has(link.id) &&
						!this.pendingResolve.has(link.id)
					) {
						toResolve.push(link.id)
						this.pendingResolve.add(link.id)
					}
				}

				if (toResolve.length === 0) return

				// Resolve asynchronously
				Promise.all(
					toResolve.map(async id => {
						let resolved = this.resolver(id)
						// If resolver returns null, it means async resolution is needed
						// The caller should update the state field when data is available
						return { id, resolved }
					}),
				).then(results => {
					let newTitles = new Map(resolvedTitles)
					let hasUpdates = false

					for (let { id, resolved } of results) {
						this.pendingResolve.delete(id)
						if (resolved) {
							newTitles.set(id, resolved)
							hasUpdates = true
						}
					}

					if (hasUpdates) {
						view.dispatch({
							effects: updateTitlesEffect.of(newTitles),
						})
					}
				})
			}
		},
		{
			decorations: v => v.decorations,
		},
	)

	let theme = EditorView.baseTheme({
		".cm-wikilink": {
			color: "var(--editor-link-color, #0066cc)",
			cursor: "pointer",
			borderRadius: "2px",
			padding: "0 2px",
			backgroundColor: "var(--editor-wikilink-bg, rgba(0, 102, 204, 0.1))",
		},
		".cm-wikilink:hover": {
			backgroundColor:
				"var(--editor-wikilink-bg-hover, rgba(0, 102, 204, 0.2))",
			textDecoration: "underline",
		},
		".cm-wikilink-broken": {
			color: "var(--editor-link-broken-color, #cc0000)",
			textDecoration: "underline wavy",
			textDecorationColor: "var(--editor-link-broken-color, #cc0000)",
			backgroundColor: "var(--editor-wikilink-broken-bg, rgba(204, 0, 0, 0.1))",
		},
		".cm-wikilink-broken:hover": {
			backgroundColor:
				"var(--editor-wikilink-broken-bg-hover, rgba(204, 0, 0, 0.2))",
		},
	})

	return [resolvedTitlesField, decorationPlugin, theme]
}
