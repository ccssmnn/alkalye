import { type co } from "jazz-tools"
import { type Theme, type ThemeAsset } from "@/schema"
import { type ThemesQuery, type ThemePresetType } from "./document-theme"

export { buildThemeStyles, type ThemeStyles }

type LoadedTheme = co.loaded<typeof Theme, ThemesQuery["$each"]>
type LoadedAsset = co.loaded<typeof ThemeAsset, { data: true }>

type ThemeStyles = {
	css: string
	fontFaceRules: string
	presetVariables: string
	blobUrls: string[]
}

// Build complete CSS styles for a theme including fonts and preset variables
// Returns blob URLs that should be revoked when component unmounts
function buildThemeStyles(
	theme: LoadedTheme,
	preset: ThemePresetType | null,
): ThemeStyles {
	let blobUrls: string[] = []
	let fontFaceRules = ""
	let presetVariables = ""

	// Build @font-face rules from theme assets
	if (theme.assets?.$isLoaded) {
		for (let asset of [...theme.assets]) {
			if (!asset?.$isLoaded) continue
			let loaded = asset as LoadedAsset
			if (!loaded.data?.$isLoaded) continue

			// Only process font files
			if (!loaded.mimeType.startsWith("font/")) continue

			let blob = loaded.data.toBlob()
			if (!blob) continue

			let url = URL.createObjectURL(blob)
			blobUrls.push(url)

			fontFaceRules += `
@font-face {
	font-family: "${loaded.name}";
	src: url("${url}") format("${getFontFormat(loaded.mimeType)}");
	font-display: swap;
}
`
		}
	}

	// Build CSS variables from preset colors
	if (preset) {
		let vars: string[] = []
		let { colors, fonts } = preset

		// Core colors
		vars.push(`--preset-background: ${colors.background}`)
		vars.push(`--preset-foreground: ${colors.foreground}`)
		vars.push(`--preset-accent: ${colors.accent}`)

		// Optional colors
		if (colors.heading) vars.push(`--preset-heading: ${colors.heading}`)
		if (colors.link) vars.push(`--preset-link: ${colors.link}`)
		if (colors.codeBackground)
			vars.push(`--preset-code-background: ${colors.codeBackground}`)

		// Fonts
		if (fonts?.title) vars.push(`--preset-font-title: ${fonts.title}`)
		if (fonts?.body) vars.push(`--preset-font-body: ${fonts.body}`)

		// Add appearance class
		vars.push(`--preset-appearance: ${preset.appearance}`)

		presetVariables = `:root {\n\t${vars.join(";\n\t")};\n}`
	}

	// Get the theme CSS
	let css = theme.css?.toString() ?? ""

	return {
		css,
		fontFaceRules,
		presetVariables,
		blobUrls,
	}
}

function getFontFormat(mimeType: string): string {
	let formats: Record<string, string> = {
		"font/woff2": "woff2",
		"font/woff": "woff",
		"font/ttf": "truetype",
		"font/otf": "opentype",
	}
	return formats[mimeType] ?? "woff2"
}
