import { useAccount } from "jazz-tools/react"
import { z } from "zod"
import { parseFrontmatter } from "@/editor/frontmatter"
import { type Theme, ThemePreset, UserAccount } from "@/schema"
import { type co } from "jazz-tools"

type ThemePresetType = z.infer<typeof ThemePreset>

export {
	getThemeName,
	getPresetName,
	findThemeByName,
	getThemePresets,
	findPresetByName,
	useDocumentTheme,
}

export type { ResolvedTheme, ThemesQuery, LoadedThemes, ThemePresetType }

type ResolvedTheme = {
	theme: co.loaded<typeof Theme, ThemesQuery["$each"]> | null
	preset: ThemePresetType | null
	warning: string | null
}

type ThemesQuery = { $each: { css: true; assets: { $each: { data: true } } } }
type LoadedThemes = co.loaded<
	ReturnType<typeof co.list<typeof Theme>>,
	ThemesQuery
>

// Parse theme name from frontmatter
// Returns null if no theme specified, or the theme name string
function getThemeName(content: string): string | null {
	let { frontmatter } = parseFrontmatter(content)
	if (!frontmatter) return null

	let theme = frontmatter.theme
	if (typeof theme !== "string" || !theme.trim()) return null

	return theme.trim()
}

// Parse preset name from frontmatter for slideshow themes
// Returns null if no preset specified
function getPresetName(content: string): string | null {
	let { frontmatter } = parseFrontmatter(content)
	if (!frontmatter) return null

	let preset = frontmatter.preset
	if (typeof preset !== "string" || !preset.trim()) return null

	return preset.trim()
}

// Find a theme by name (case-insensitive) from the user's themes list
function findThemeByName(
	themes: LoadedThemes | null | undefined,
	themeName: string,
): co.loaded<typeof Theme, ThemesQuery["$each"]> | null {
	if (!themes) return null

	let lowerName = themeName.toLowerCase()
	for (let theme of themes) {
		if (theme?.name?.toLowerCase() === lowerName) {
			return theme as co.loaded<typeof Theme, ThemesQuery["$each"]>
		}
	}
	return null
}

// Parse presets from theme's presets JSON string
function getThemePresets(theme: {
	presets?: string | null
}): ThemePresetType[] {
	if (!theme.presets) return []

	try {
		let parsed = JSON.parse(theme.presets) as { presets: ThemePresetType[] }
		return parsed.presets ?? []
	} catch {
		return []
	}
}

// Find a preset by name (case-insensitive) from theme's presets
function findPresetByName(
	theme: { presets?: string | null },
	presetName: string,
): ThemePresetType | null {
	let presets = getThemePresets(theme)
	if (presets.length === 0) return null

	let lowerName = presetName.toLowerCase()
	for (let preset of presets) {
		if (preset.name.toLowerCase() === lowerName) {
			return preset
		}
	}
	return null
}

// Query for loading themes with CSS and assets
let themesQuery = {
	root: { themes: { $each: { css: true, assets: { $each: { data: true } } } } },
} as const

// Hook to resolve theme and preset from document content
// Returns the theme object if found, preset if applicable, and any warnings
function useDocumentTheme(content: string): ResolvedTheme {
	let me = useAccount(UserAccount, { resolve: themesQuery })

	let themeName = getThemeName(content)
	let presetName = getPresetName(content)

	// No theme specified in frontmatter
	if (!themeName) {
		return { theme: null, preset: null, warning: null }
	}

	// Skip appearance-only values (light/dark) - these are handled by parsePresentationTheme
	if (themeName === "light" || themeName === "dark") {
		return { theme: null, preset: null, warning: null }
	}

	// User not loaded yet
	if (!me.$isLoaded || !me.root?.themes) {
		return { theme: null, preset: null, warning: null }
	}

	let themes = me.root.themes as LoadedThemes
	let theme = findThemeByName(themes, themeName)

	// Theme not found
	if (!theme) {
		return {
			theme: null,
			preset: null,
			warning: `Theme "${themeName}" not found. Upload it in Settings > Themes.`,
		}
	}

	// Find preset if specified
	let preset: ThemePresetType | null = null
	let warning: string | null = null

	if (presetName) {
		preset = findPresetByName(theme, presetName)
		if (!preset) {
			// Fall back to first preset
			let presets = getThemePresets(theme)
			preset = presets[0] ?? null
			if (preset) {
				warning = `Preset "${presetName}" not found in theme "${themeName}". Using "${preset.name}" instead.`
			}
		}
	}

	return { theme, preset, warning }
}
