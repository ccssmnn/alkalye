import { Marked } from "marked"
import { parseFrontmatter } from "@/editor/frontmatter"
import {
	findThemeByName,
	getThemeName,
	getPresetName,
	findPresetByName,
	getThemePresets,
	findPresetByAppearance,
	type LoadedThemes,
} from "@/lib/document-theme"
import { getDocumentTitle } from "@/lib/document-utils"
import { buildPrintableHtml, openPrintWindow } from "@/lib/pdf-export"

export { printToPdf }

async function printToPdf(params: {
	content: string
	themes: LoadedThemes | undefined
	defaultPreviewTheme: string | null
}) {
	let { content, themes, defaultPreviewTheme } = params
	let { body } = parseFrontmatter(content)
	let title = getDocumentTitle(content)

	let themeName = getThemeName(content)
	let presetName = getPresetName(content)

	let isAppearanceOnlyTheme = themeName === "light" || themeName === "dark"
	let effectiveThemeName = isAppearanceOnlyTheme ? null : themeName

	if (!effectiveThemeName && defaultPreviewTheme) {
		effectiveThemeName = defaultPreviewTheme
	}

	let theme = effectiveThemeName
		? findThemeByName(themes ?? null, effectiveThemeName)
		: null
	let preset = null

	if (theme && presetName) {
		preset = findPresetByName(theme, presetName)
	} else if (theme) {
		preset = findPresetByAppearance(theme, "light")
		if (!preset) {
			let presets = getThemePresets(theme)
			preset = presets[0] ?? null
		}
	}

	let marked = new Marked()
	marked.setOptions({ gfm: true, breaks: true })
	let htmlContent = await marked.parse(body)

	let printableHtml = await buildPrintableHtml({
		title,
		htmlContent,
		theme,
		preset,
	})

	openPrintWindow(printableHtml)
}
