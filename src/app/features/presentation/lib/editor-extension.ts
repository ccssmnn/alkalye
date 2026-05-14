import { type Extension } from "@codemirror/state"
import { createPresentationDecorations } from "./presentation-decorations"

export { presentationExtensions }

function presentationExtensions(): Extension[] {
	return [createPresentationDecorations()]
}
