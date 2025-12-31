import { type Extension } from "@codemirror/state"
import { keymap } from "@codemirror/view"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"

export { createBracketsExtension }

function createBracketsExtension(): Extension {
	return [closeBrackets(), keymap.of(closeBracketsKeymap)]
}
