import { type Extension } from "@codemirror/state"
import { createImageDecorations, type ImageResolver } from "./image-decorations"
import { createImageAutocomplete } from "./image-autocomplete"

export { imageExtensions }

type AssetInfo = { id: string; name: string }

interface ImageExtensionsOptions {
	resolver: ImageResolver
	onPreview: (url: string, alt: string) => void
	getAssets: () => AssetInfo[]
}

function imageExtensions({
	resolver,
	onPreview,
	getAssets,
}: ImageExtensionsOptions): Extension[] {
	return [
		createImageDecorations(resolver, onPreview),
		createImageAutocomplete(getAssets),
	]
}
