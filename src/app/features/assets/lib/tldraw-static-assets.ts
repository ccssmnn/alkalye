import geistFontUrl from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url"
import geistMonoFontUrl from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url"
import { iconTypes, type TLUiAssetUrlOverrides } from "tldraw"

export { localTldrawAssetUrls }

let localTldrawAssetUrls = {
	fonts: {
		tldraw_mono: geistMonoFontUrl,
		tldraw_mono_italic: geistMonoFontUrl,
		tldraw_mono_bold: geistMonoFontUrl,
		tldraw_mono_italic_bold: geistMonoFontUrl,
		tldraw_serif: geistFontUrl,
		tldraw_serif_italic: geistFontUrl,
		tldraw_serif_bold: geistFontUrl,
		tldraw_serif_italic_bold: geistFontUrl,
		tldraw_sans: geistFontUrl,
		tldraw_sans_italic: geistFontUrl,
		tldraw_sans_bold: geistFontUrl,
		tldraw_sans_italic_bold: geistFontUrl,
		tldraw_draw: geistFontUrl,
		tldraw_draw_italic: geistFontUrl,
		tldraw_draw_bold: geistFontUrl,
		tldraw_draw_italic_bold: geistFontUrl,
	},
	icons: Object.fromEntries(
		iconTypes.map(icon => [icon, `/tldraw/icons/0_merged.svg#${icon}`]),
	),
	translations: {
		en: "/tldraw/translations/en.json",
		de: "/tldraw/translations/de.json",
	},
} satisfies TLUiAssetUrlOverrides
