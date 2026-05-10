import { Marked } from "marked"
import { parseFrontmatter } from "@/editor/frontmatter"
import { resolveDocumentTheme, type LoadedThemes } from "@/app/features/themes"
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

	let { theme, preset } = resolveDocumentTheme({
		content,
		themes,
		defaultThemeName: defaultPreviewTheme,
		appearance: "light",
	})

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
