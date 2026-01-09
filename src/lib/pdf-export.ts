import { type co } from "jazz-tools"
import { type Theme, type ThemeAsset } from "@/schema"
import { type ThemesQuery, type ThemePresetType } from "./document-theme"

export { buildPrintableHtml, openPrintWindow }

type LoadedTheme = co.loaded<typeof Theme, ThemesQuery["$each"]>
type LoadedAsset = co.loaded<typeof ThemeAsset, { data: true }>

// Build a complete HTML document ready for printing/PDF export
// Includes all theme CSS and fonts embedded as base64 data URIs
async function buildPrintableHtml(params: {
	title: string
	htmlContent: string
	theme: LoadedTheme | null
	preset: ThemePresetType | null
	appearance: "light" | "dark"
}): Promise<string> {
	let { title, htmlContent, theme, preset, appearance } = params

	let fontFaceRules = ""
	let presetVariables = ""
	let themeCss = ""

	if (theme) {
		// Build @font-face rules with base64 embedded fonts
		fontFaceRules = await buildFontFaceRulesBase64(theme)

		// Build preset CSS variables
		if (preset) {
			presetVariables = buildPresetVariables(preset)
		}

		// Get theme CSS
		themeCss = theme.css?.toString() ?? ""
	}

	// Build the complete HTML document
	let html = `<!DOCTYPE html>
<html lang="en" data-theme="${appearance}">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${escapeHtml(title)}</title>
	<style>
		/* Reset and base styles */
		*, *::before, *::after {
			box-sizing: border-box;
		}

		html {
			font-size: 16px;
			line-height: 1.6;
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}

		body {
			margin: 0;
			padding: 2rem;
			font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			color: ${appearance === "dark" ? "#e5e5e5" : "#171717"};
			background: ${appearance === "dark" ? "#171717" : "#ffffff"};
		}

		/* Print-specific styles */
		@media print {
			body {
				padding: 0;
				background: white;
				color: black;
			}

			@page {
				margin: 2cm;
				size: A4;
			}

			/* Prevent page breaks inside these elements */
			h1, h2, h3, h4, h5, h6 {
				page-break-after: avoid;
				break-after: avoid;
			}

			pre, blockquote, figure, table {
				page-break-inside: avoid;
				break-inside: avoid;
			}

			/* Keep headings with following content */
			h1, h2, h3, h4, h5, h6 {
				page-break-after: avoid;
				break-after: avoid;
			}
		}

		/* Prose styles for content */
		article {
			max-width: 65ch;
			margin: 0 auto;
		}

		article h1, article h2, article h3, article h4, article h5, article h6 {
			font-weight: 600;
			line-height: 1.3;
			margin-top: 1.5em;
			margin-bottom: 0.5em;
		}

		article h1 { font-size: 2rem; margin-top: 0; }
		article h2 { font-size: 1.5rem; }
		article h3 { font-size: 1.25rem; }
		article h4 { font-size: 1.125rem; }

		article p {
			margin: 1em 0;
		}

		article a {
			color: inherit;
			text-decoration: underline;
		}

		article ul, article ol {
			padding-left: 1.5em;
			margin: 1em 0;
		}

		article li {
			margin: 0.25em 0;
		}

		article blockquote {
			margin: 1em 0;
			padding-left: 1em;
			border-left: 3px solid currentColor;
			opacity: 0.8;
		}

		article pre {
			background: ${appearance === "dark" ? "#262626" : "#f5f5f5"};
			padding: 1em;
			border-radius: 0.5em;
			overflow-x: auto;
			font-size: 0.875em;
			line-height: 1.5;
		}

		article code {
			font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
			font-size: 0.875em;
		}

		article :not(pre) > code {
			background: ${appearance === "dark" ? "#262626" : "#f5f5f5"};
			padding: 0.2em 0.4em;
			border-radius: 0.25em;
		}

		article img {
			max-width: 100%;
			height: auto;
			border-radius: 0.5em;
		}

		article figure {
			margin: 1em 0;
		}

		article figcaption {
			text-align: center;
			font-size: 0.875em;
			opacity: 0.7;
			margin-top: 0.5em;
		}

		article table {
			width: 100%;
			border-collapse: collapse;
			margin: 1em 0;
		}

		article th, article td {
			border: 1px solid ${appearance === "dark" ? "#404040" : "#e5e5e5"};
			padding: 0.5em;
			text-align: left;
		}

		article th {
			background: ${appearance === "dark" ? "#262626" : "#f5f5f5"};
			font-weight: 600;
		}

		article hr {
			border: none;
			border-top: 1px solid ${appearance === "dark" ? "#404040" : "#e5e5e5"};
			margin: 2em 0;
		}

		/* Task list styles */
		article ul:has(input[type="checkbox"]) {
			list-style: none;
			padding-left: 0;
		}

		article ul:has(input[type="checkbox"]) li {
			display: flex;
			align-items: flex-start;
			gap: 0.5em;
		}

		article input[type="checkbox"] {
			margin-top: 0.3em;
		}
	</style>
	${fontFaceRules ? `<style>\n${fontFaceRules}\n</style>` : ""}
	${presetVariables ? `<style>\n${presetVariables}\n</style>` : ""}
	${themeCss ? `<style>\n${themeCss}\n</style>` : ""}
</head>
<body>
	<article data-theme="${theme?.name ?? ""}">
		${htmlContent}
	</article>
</body>
</html>`

	return html
}

// Open a new window with the printable HTML and trigger print dialog
function openPrintWindow(html: string): void {
	let printWindow = window.open("", "_blank")
	if (!printWindow) {
		// Popup blocked - fall back to opening in same window
		let blob = new Blob([html], { type: "text/html" })
		let url = URL.createObjectURL(blob)
		window.open(url, "_blank")
		// Note: can't revoke URL since new window needs it
		return
	}

	printWindow.document.write(html)
	printWindow.document.close()

	// Wait for fonts to load before printing
	printWindow.onload = () => {
		// Small delay to ensure fonts are fully rendered
		setTimeout(() => {
			printWindow.print()
		}, 100)
	}
}

// Build @font-face rules with fonts embedded as base64 data URIs
// This ensures fonts work in the printed PDF without external references
async function buildFontFaceRulesBase64(theme: LoadedTheme): Promise<string> {
	if (!theme.assets?.$isLoaded) return ""

	let rules: string[] = []

	for (let asset of [...theme.assets]) {
		if (!asset?.$isLoaded) continue
		let loaded = asset as LoadedAsset
		if (!loaded.data?.$isLoaded) continue

		// Only process font files
		if (!loaded.mimeType.startsWith("font/")) continue

		let blob = loaded.data.toBlob()
		if (!blob) continue

		// Convert blob to base64 data URI
		let base64 = await blobToBase64(blob)
		let dataUri = `data:${loaded.mimeType};base64,${base64}`

		rules.push(`
@font-face {
	font-family: "${loaded.name}";
	src: url("${dataUri}") format("${getFontFormat(loaded.mimeType)}");
	font-display: swap;
}`)
	}

	return rules.join("\n")
}

// Build CSS variables from preset colors
function buildPresetVariables(preset: ThemePresetType): string {
	let vars: string[] = []
	let { colors, fonts } = preset

	// Core colors
	vars.push(`--preset-background: ${colors.background}`)
	vars.push(`--preset-foreground: ${colors.foreground}`)
	vars.push(`--preset-accent: ${colors.accent}`)

	// Accent color palette
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

	// Appearance
	vars.push(`--preset-appearance: ${preset.appearance}`)

	// Theme aliases
	vars.push(`--theme-background: ${colors.background}`)
	vars.push(`--theme-foreground: ${colors.foreground}`)
	vars.push(`--theme-accent: ${colors.accent}`)

	return `:root {\n\t${vars.join(";\n\t")};\n}`
}

// Convert Blob to base64 string
function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		let reader = new FileReader()
		reader.onloadend = () => {
			let result = reader.result as string
			// Remove the data URL prefix to get just the base64
			let base64 = result.split(",")[1]
			resolve(base64)
		}
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

// Get font format from MIME type
function getFontFormat(mimeType: string): string {
	let formats: Record<string, string> = {
		"font/woff2": "woff2",
		"font/woff": "woff",
		"font/ttf": "truetype",
		"font/otf": "opentype",
	}
	return formats[mimeType] ?? "woff2"
}

// Escape HTML special characters
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}
