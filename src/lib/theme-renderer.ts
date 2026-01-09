import { type co } from "jazz-tools"
import { type Theme, type ThemeAsset } from "@/schema"
import { type ThemesQuery, type ThemePresetType } from "./document-theme"

export {
	buildThemeStyles,
	tryBuildThemeStyles,
	renderTemplateWithContent,
	tryRenderTemplateWithContent,
	type ThemeStyles,
	type ThemeRenderResult,
}

type LoadedTheme = co.loaded<typeof Theme, ThemesQuery["$each"]>
type LoadedAsset = co.loaded<typeof ThemeAsset, { data: true }>

type ThemeStyles = {
	css: string
	fontFaceRules: string
	presetVariables: string
	blobUrls: string[]
}

type ThemeRenderResult =
	| { ok: true; styles: ThemeStyles }
	| { ok: false; error: string }

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

		// Accent color palette (accent-1 is the primary accent, accent-2 through accent-6 from accents array)
		vars.push(`--preset-accent-1: ${colors.accent}`)
		if (colors.accents) {
			for (let i = 0; i < Math.min(colors.accents.length, 5); i++) {
				vars.push(`--preset-accent-${i + 2}: ${colors.accents[i]}`)
			}
		}

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

		// Also expose as --theme-* aliases for theme authors who prefer this naming
		vars.push(`--theme-background: ${colors.background}`)
		vars.push(`--theme-foreground: ${colors.foreground}`)
		vars.push(`--theme-accent: ${colors.accent}`)

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

// Safe wrapper that catches errors during theme style building
// Returns a result object indicating success or failure with error message
// Logs errors to console for debugging
function tryBuildThemeStyles(
	theme: LoadedTheme,
	preset: ThemePresetType | null,
): ThemeRenderResult {
	try {
		let styles = buildThemeStyles(theme, preset)
		return { ok: true, styles }
	} catch (error) {
		let errorMessage =
			error instanceof Error ? error.message : "Unknown error building theme"
		console.error(
			`[Theme Error] Failed to build styles for theme "${theme.name}":`,
			error,
		)
		return { ok: false, error: errorMessage }
	}
}

type TemplateRenderResult =
	| { ok: true; html: string }
	| { ok: false; error: string }

// Render document content into an HTML template
// Template should have an element with [data-document] attribute
// Returns null if template is invalid (no data-document placeholder)
function renderTemplateWithContent(
	template: string,
	content: string,
): string | null {
	// Parse the template to find the data-document placeholder
	let parser = new DOMParser()
	let doc = parser.parseFromString(template, "text/html")

	// Find the element with data-document attribute
	let placeholder = doc.querySelector("[data-document]")
	if (!placeholder) return null

	// Inject the rendered content into the placeholder
	placeholder.innerHTML = content

	// Return the body's inner HTML (not the full document)
	// This allows the preview component to wrap it appropriately
	return doc.body.innerHTML
}

// Safe wrapper that catches errors during template rendering
// Returns a result object indicating success or failure with error message
// Logs errors to console for debugging
function tryRenderTemplateWithContent(
	template: string,
	content: string,
	themeName: string,
): TemplateRenderResult {
	try {
		let html = renderTemplateWithContent(template, content)
		if (html === null) {
			console.error(
				`[Theme Error] Template for theme "${themeName}" is missing [data-document] placeholder`,
			)
			return {
				ok: false,
				error: "Template is missing [data-document] placeholder",
			}
		}
		return { ok: true, html }
	} catch (error) {
		let errorMessage =
			error instanceof Error ? error.message : "Unknown error rendering template"
		console.error(
			`[Theme Error] Failed to render template for theme "${themeName}":`,
			error,
		)
		return { ok: false, error: errorMessage }
	}
}
