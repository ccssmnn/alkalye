import { messages, translate } from "@ccssmnn/intl"

export { baseThemesMessages, deThemesMessages }

let baseThemesMessages = messages({
	"themes.picker.ariaLabel": "Theme",
	"themes.picker.tooltip": "Select theme",
	"themes.label.preview": "Preview Themes",
	"themes.label.slideshow": "Slideshow Themes",
	"themes.action.remove": "Remove theme",
	"themes.preset.ariaLabel": "Preset",
	"themes.preset.tooltip": "Select preset",
	"themes.preset.appearance.light": "Light",
	"themes.preset.appearance.dark": "Dark",
	"themes.preset.action.remove": "Remove preset (use auto)",
})

let deThemesMessages = translate(baseThemesMessages, {
	"themes.picker.ariaLabel": "Design",
	"themes.picker.tooltip": "Design wählen",
	"themes.label.preview": "Vorschau Designs",
	"themes.label.slideshow": "Präsentation Designs",
	"themes.action.remove": "Design entfernen",
	"themes.preset.ariaLabel": "Vorgabe",
	"themes.preset.tooltip": "Vorgabe wählen",
	"themes.preset.appearance.light": "Hell",
	"themes.preset.appearance.dark": "Dunkel",
	"themes.preset.action.remove": "Vorgabe entfernen (automatisch)",
})
