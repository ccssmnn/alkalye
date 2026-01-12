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
	findPresetByAppearance,
	useDocumentTheme,
}

export type { ResolvedTheme, ThemesQuery, LoadedThemes, ThemePresetType }

type ResolvedTheme = {
	theme: co.loaded<typeof Theme, ThemesQuery["$each"]> | null
	preset: ThemePresetType | null
	warning: string | null
	isLoading: boolean
}

type ThemesQuery = {
	$each: { css: true; template: true; assets: { $each: { data: true } } }
}
type LoadedThemes = co.loaded<
	ReturnType<typeof co.list<typeof Theme>>,
	ThemesQuery
>

function getThemeName(content: string): string | null {
	let { frontmatter } = parseFrontmatter(content)
	if (!frontmatter) return null

	let theme = frontmatter.theme
	if (typeof theme !== "string" || !theme.trim()) return null

	return theme.trim()
}

function getPresetName(content: string): string | null {
	let { frontmatter } = parseFrontmatter(content)
	if (!frontmatter) return null

	let preset = frontmatter.preset
	if (typeof preset !== "string" || !preset.trim()) return null

	return preset.trim()
}

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

function getThemePresets(theme: {
	presets?: string | null
}): ThemePresetType[] {
	if (!theme.presets) {
		return []
	}

	try {
		let parsed = JSON.parse(theme.presets) as
			| ThemePresetType[]
			| { presets: ThemePresetType[] }
		let presets = Array.isArray(parsed) ? parsed : (parsed.presets ?? [])
		return presets
	} catch {
		return []
	}
}

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

let themesQuery = {
	root: {
		settings: true,
		themes: {
			$each: { css: true, template: true, assets: { $each: { data: true } } },
		},
	},
} as const

type ThemeMode = "preview" | "slideshow"
type Appearance = "light" | "dark"

function findPresetByAppearance(
	theme: { presets?: string | null },
	appearance: Appearance,
): ThemePresetType | null {
	let presets = getThemePresets(theme)
	for (let preset of presets) {
		if (preset.appearance === appearance) {
			return preset
		}
	}
	return null
}

function useDocumentTheme(
	content: string,
	mode: ThemeMode = "preview",
	appearance?: Appearance | null,
): ResolvedTheme {
	let me = useAccount(UserAccount, { resolve: themesQuery })

	let themeName = getThemeName(content)
	let presetName = getPresetName(content)

	if (!me.$isLoaded || !me.root?.themes) {
		return { theme: null, preset: null, warning: null, isLoading: true }
	}

	let isAppearanceOnlyTheme = themeName === "light" || themeName === "dark"
	let effectiveThemeName = isAppearanceOnlyTheme ? null : themeName
	if (!effectiveThemeName) {
		let settings = me.root.settings
		if (settings) {
			effectiveThemeName =
				mode === "slideshow"
					? (settings.defaultSlideshowTheme ?? null)
					: (settings.defaultPreviewTheme ?? null)
		}
	}

	if (!effectiveThemeName) {
		return { theme: null, preset: null, warning: null, isLoading: false }
	}

	let themes = me.root.themes as LoadedThemes

	let theme = findThemeByName(themes, effectiveThemeName)
	if (!theme) {
		if (themeName && !isAppearanceOnlyTheme) {
			return {
				theme: null,
				preset: null,
				warning: `Theme "${effectiveThemeName}" not found. Upload it in Settings > Themes.`,
				isLoading: false,
			}
		}
		return { theme: null, preset: null, warning: null, isLoading: false }
	}

	let preset: ThemePresetType | null = null
	let warning: string | null = null

	if (presetName) {
		preset = findPresetByName(theme, presetName)
		if (!preset) {
			let presets = getThemePresets(theme)
			if (appearance) {
				preset = findPresetByAppearance(theme, appearance)
			}
			preset = preset ?? presets[0] ?? null
			if (preset) {
				warning = `Preset "${presetName}" not found in theme "${effectiveThemeName}". Using "${preset.name}" instead.`
			}
		}
	} else if (appearance) {
		preset = findPresetByAppearance(theme, appearance)
		if (!preset) {
			let presets = getThemePresets(theme)
			preset = presets[0] ?? null
		}
	}

	return { theme, preset, warning, isLoading: false }
}
