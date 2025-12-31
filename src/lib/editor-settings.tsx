import { useEffect } from "react"
import type { z } from "zod"
import type { co } from "jazz-tools"
import {
	EditorSettings,
	Settings,
	DEFAULT_EDITOR_SETTINGS as DEFAULTS,
} from "@/schema"

export {
	useEditorSettings,
	applyEditorSettings,
	DEFAULTS as DEFAULT_EDITOR_SETTINGS,
}
export type { EditorSettingsData }

type EditorSettingsData = z.infer<typeof EditorSettings>
type SettingsCoMap = co.loaded<typeof Settings>

function applyEditorSettings(settings: EditorSettingsData) {
	let root = document.documentElement
	root.style.setProperty("--editor-content-width", `${settings.lineWidth}ch`)
	root.style.setProperty("--editor-line-height", String(settings.lineHeight))
	root.style.setProperty(
		"--editor-letter-spacing",
		`${settings.letterSpacing}em`,
	)
	root.style.setProperty("--editor-font-size", `${settings.fontSize}px`)
	root.dataset.strikethroughDoneTasks = String(settings.strikethroughDoneTasks)
	root.dataset.fadeDoneTasks = String(settings.fadeDoneTasks)
	root.dataset.highlightCurrentLine = String(settings.highlightCurrentLine)
}

// Apply defaults on load (will be overwritten when Jazz loads)
applyEditorSettings(DEFAULTS)

function useEditorSettings(settings: SettingsCoMap | null | undefined) {
	let editorSettings = settings?.editor ?? DEFAULTS

	function setSettings(updates: Partial<EditorSettingsData>) {
		if (!settings) return
		let newEditor = { ...settings.editor, ...updates }
		settings.$jazz.set("editor", newEditor)
	}

	function resetSettings() {
		if (!settings) return
		settings.$jazz.set("editor", DEFAULTS)
	}

	useEffect(() => {
		applyEditorSettings(editorSettings)
	}, [editorSettings])

	return { settings: editorSettings, setSettings, resetSettings }
}
