import { type Extension } from "@codemirror/state"
import { syntaxHighlighting } from "@codemirror/language"
import {
	editorTheme,
	markdownHighlightStyle,
	codeHighlightStyle,
} from "./theme"
import { lineDecorations } from "./line-decorations"
import { presentationDecorations } from "./presentation-decorations"
import { wrappedIndent } from "./wrapped-indent"
import {
	keyboardAwareScrollMargins,
	clickBelowContent,
	preventBrowserScroll,
} from "./extension-screen-keyboard"

export { editorExtensions }

let editorExtensions: Extension = [
	editorTheme,
	syntaxHighlighting(markdownHighlightStyle),
	lineDecorations,
	wrappedIndent,
	syntaxHighlighting(codeHighlightStyle),
	keyboardAwareScrollMargins,
	preventBrowserScroll,
	clickBelowContent,
	presentationDecorations,
]
