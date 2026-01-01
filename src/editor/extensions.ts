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

export { createWikilinkDecorations } from "./wikilink-decorations"
export {
	createWikilinkAutocomplete,
	type WikilinkDoc,
} from "./wikilink-autocomplete"
export {
	getWikilinkAtPosition,
	removeWikilink,
	replaceWikilink,
	type WikilinkAtPosition,
} from "./wikilink-context-menu"
export { createBacklinkDecorations } from "./backlink-decorations"
export { createLinkDecorations } from "./link-decorations"
export { createImageDecorations, type ImageResolver } from "./image-decorations"

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
