import {
	autocompletion,
	startCompletion,
	type CompletionContext,
	type CompletionResult,
	type Completion,
	type CompletionSource,
} from "@codemirror/autocomplete"
import { type Extension } from "@codemirror/state"
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view"

export { createWikilinkAutocomplete, createWikilinkCompletionSource }
export type { WikilinkDoc }

type WikilinkDoc = {
	id: string
	title: string
	path?: string | null // folder path
	tags?: string[] // tags
}

type GetDocsCallback = () => WikilinkDoc[]
type CreateDocCallback = (title: string) => Promise<string>

function createWikilinkCompletionSource(
	getDocs: GetDocsCallback,
	onCreateDoc?: CreateDocCallback,
): CompletionSource {
	return function (context: CompletionContext): CompletionResult | null {
		let line = context.state.doc.lineAt(context.pos)
		let textBefore = line.text.slice(0, context.pos - line.from)
		let textAfter = line.text.slice(context.pos - line.from)

		// Match [[ followed by optional text (not containing ] or [ or |)
		// Don't match if we're after a pipe (user is typing alias)
		let match = textBefore.match(/\[\[([^\][|]*)$/)
		if (!match) return null

		// Always activate inside [[ - don't require explicit trigger after space
		// This allows typing multi-word document names

		let typed = (match[1] ?? "").trim()
		let typedLower = typed.toLowerCase()
		let from = context.pos - (match[1]?.length ?? 0)

		// Check if brackets are already closed (auto-close added ]])
		let hasClosingBrackets = textAfter.startsWith("]]")

		let docs = getDocs()
		let options: Completion[] = docs
			.filter(doc => doc.title.toLowerCase().includes(typedLower))
			.slice(0, 20)
			.map(doc => ({
				label: doc.title,
				detail: doc.path || doc.tags?.join(", ") || undefined,
				apply: (view, _completion, from, to) => {
					// If closing brackets exist, replace up to and including them
					let endPos = hasClosingBrackets ? to + 2 : to
					let insertText = `${doc.id}]]`
					view.dispatch({
						changes: { from, to: endPos, insert: insertText },
						selection: { anchor: from + insertText.length },
					})
				},
			}))

		// Add "Create new document" option when no exact match
		if (onCreateDoc && typed.length > 0) {
			let exactMatch = docs.some(doc => doc.title.toLowerCase() === typedLower)
			if (!exactMatch) {
				options.push({
					label: `Create "${typed}"`,
					detail: "new document",
					boost: -1,
					apply: async (view, _completion, from, to) => {
						try {
							let newId = await onCreateDoc(typed)
							let endPos = hasClosingBrackets ? to + 2 : to
							let insertText = `${newId}]]`
							view.dispatch({
								changes: { from, to: endPos, insert: insertText },
								selection: { anchor: from + insertText.length },
							})
						} catch (e) {
							console.error("Failed to create document:", e)
						}
					},
				})
			}
		}

		// Always return a result when inside [[ to keep autocomplete open
		// Even with no matches, "Create" option should appear when typing
		if (options.length === 0) {
			// Return empty but valid result to keep autocomplete context alive
			// This prevents flickering when filtering narrows to zero matches
			return { from, options: [] }
		}

		return {
			from,
			options,
			// validFor tells CM when to reuse results vs re-query
			// Must match any text user might type (including spaces)
			validFor: /^[^\][|]*$/,
		}
	}
}

let autocompleteTheme = EditorView.baseTheme({
	".cm-tooltip.cm-tooltip-autocomplete": {
		backgroundColor: "var(--popover, #fff)",
		border: "1px solid var(--border, #e5e5e5)",
		borderRadius: "0",
		boxShadow:
			"0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
		padding: "0",
		fontFamily: "var(--editor-font-family, 'Geist Mono Variable', monospace)",
		fontSize: "var(--editor-font-size, 14px)",
	},
	".cm-tooltip.cm-tooltip-autocomplete > ul": {
		fontFamily: "var(--editor-font-family, 'Geist Mono Variable', monospace)",
		maxHeight: "200px",
	},
	".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
		padding: "8px 12px",
		display: "flex",
		alignItems: "center",
		gap: "8px",
		color: "var(--popover-foreground, #1a1a1a)",
	},
	".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
		backgroundColor: "var(--accent, #f5f5f5)",
		color: "var(--accent-foreground, #1a1a1a)",
	},
	".cm-completionLabel": {
		flex: "1",
	},
	".cm-completionDetail": {
		color: "var(--muted-foreground, #737373)",
		fontSize: "11px",
	},
	".cm-completionIcon": {
		display: "none",
	},
})

// Trigger autocomplete only when user types the second [
// After that, activateOnTyping handles subsequent keystrokes
let wikilinkTrigger = ViewPlugin.fromClass(
	class {
		update(update: ViewUpdate) {
			if (!update.docChanged) return

			// Only trigger when "[" was just inserted
			let insertedBracket = false
			update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
				if (inserted.toString() === "[") insertedBracket = true
			})
			if (!insertedBracket) return

			let pos = update.state.selection.main.head
			let line = update.state.doc.lineAt(pos)
			let textBefore = line.text.slice(0, pos - line.from)

			// Check if we just completed [[ (cursor right after second bracket)
			if (textBefore.endsWith("[[")) {
				setTimeout(() => startCompletion(update.view), 0)
			}
		}
	},
)

function createWikilinkAutocomplete(
	getDocs: GetDocsCallback,
	onCreateDoc?: CreateDocCallback,
): Extension {
	let source = createWikilinkCompletionSource(getDocs, onCreateDoc)

	return [
		autocompletion({
			override: [source],
			activateOnTyping: true,
			defaultKeymap: true,
		}),
		wikilinkTrigger,
		autocompleteTheme,
	]
}
