import { type Extension, Prec } from "@codemirror/state"
import { keymap, EditorView } from "@codemirror/view"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"

export { createBracketsExtension }

// Custom handler to skip [ auto-closing (for wikilinks [[]])
// but still use closeBrackets for other pairs
function createBracketsExtension(): Extension {
	return [
		// Use closeBrackets for most brackets
		closeBrackets(),
		keymap.of(closeBracketsKeymap),
		// Override [ to not auto-close
		Prec.high(
			EditorView.inputHandler.of((view, from, to, text) => {
				if (text === "[") {
					// Just insert the [ without auto-closing
					view.dispatch({
						changes: { from, to, insert: "[" },
						selection: { anchor: from + 1 },
					})
					return true
				}
				return false
			}),
		),
	]
}
