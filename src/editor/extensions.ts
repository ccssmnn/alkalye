import { type Extension } from "@codemirror/state"
import { syntaxHighlighting } from "@codemirror/language"
import {
	editorTheme,
	markdownHighlightStyle,
	codeHighlightStyle,
} from "./theme"
import { lineDecorations } from "./line-decorations"
import { frontmatterFolding } from "./frontmatter"
import { presentationDecorations } from "./presentation-decorations"
import {
	keyboardAwareScrollMargins,
	clickBelowContent,
	preventBrowserScroll,
} from "./extension-screen-keyboard"

export {
	keyboardAwareScrollMargins,
	clickBelowContent,
	preventBrowserScroll,
	editorExtensions,
}

let editorExtensions: Extension = [
	editorTheme,
	syntaxHighlighting(markdownHighlightStyle),
	lineDecorations,
	syntaxHighlighting(codeHighlightStyle),
	keyboardAwareScrollMargins,
	preventBrowserScroll,
	clickBelowContent,
	frontmatterFolding,
	presentationDecorations,
]
