import { EditorState, type Extension } from "@codemirror/state"
import {
	Decoration,
	EditorView,
	ViewPlugin,
	type DecorationSet,
	WidgetType,
} from "@codemirror/view"
import {
	foldEffect,
	unfoldEffect,
	foldedRanges,
	foldService,
	codeFolding,
} from "@codemirror/language"

export {
	getPath,
	getTags,
	parseFrontmatter,
	getFrontmatterRange,
	frontmatterFolding,
	togglePinned,
	addTag,
	getBacklinks,
	getBacklinksWithRange,
	setBacklinks,
	addBacklink,
	removeBacklink,
	setTheme,
}

export type { Frontmatter }

interface Frontmatter {
	title?: string
	pinned?: boolean
	tags?: string
	path?: string
	[key: string]: string | boolean | undefined
}

function parseFrontmatter(content: string): {
	frontmatter: Frontmatter | null
	body: string
} {
	let match = content.match(/^---\r?\n([\s\S]*?)(?:\r?\n)?---(?:\r?\n)?/)
	if (!match) return { frontmatter: null, body: content }

	let yaml = match[1]
	let body = content.slice(match[0].length)
	let frontmatter: Frontmatter = {}

	for (let line of yaml.split(/\r?\n/)) {
		let colonIdx = line.indexOf(":")
		if (colonIdx === -1) continue
		let key = line.slice(0, colonIdx).trim()
		let value = line.slice(colonIdx + 1).trim()
		if (value.startsWith('"') && value.endsWith('"')) {
			value = value.slice(1, -1)
		} else if (value.startsWith("'") && value.endsWith("'")) {
			value = value.slice(1, -1)
		}
		if (value === "true") {
			frontmatter[key] = true
		} else if (value === "false") {
			frontmatter[key] = false
		} else {
			frontmatter[key] = value
		}
	}

	return { frontmatter, body }
}

function togglePinned(content: string): string {
	let { frontmatter } = parseFrontmatter(content)
	let isPinned = frontmatter?.pinned === true

	if (isPinned) {
		return content.replace(
			/^(---\r?\n[\s\S]*?)pinned:\s*true\r?\n([\s\S]*?---)/,
			"$1$2",
		)
	}

	if (!frontmatter) {
		return `---\npinned: true\n---\n\n${content}`
	}

	return content.replace(/^(---\r?\n)/, "$1pinned: true\n")
}

function getTags(content: string): string[] {
	let { frontmatter } = parseFrontmatter(content)
	if (!frontmatter?.tags) return []
	return frontmatter.tags
		.split(",")
		.map(t => t.trim())
		.filter(Boolean)
}

function getPath(content: string): string | null {
	let { frontmatter } = parseFrontmatter(content)
	if (!frontmatter?.path || typeof frontmatter.path !== "string") return null
	let path = frontmatter.path.trim()
	if (!path) return null
	return path.replace(/^\/+|\/+$/g, "") || null
}

function addTag(content: string, tag: string): string {
	let { frontmatter } = parseFrontmatter(content)
	let existingTags = getTags(content)

	if (existingTags.includes(tag)) return content

	let newTags = [...existingTags, tag].join(", ")

	if (!frontmatter) {
		return `---\ntags: ${newTags}\n---\n\n${content}`
	}

	if (!frontmatter.tags) {
		return content.replace(/^(---\r?\n)/, `$1tags: ${newTags}\n`)
	}

	return content.replace(
		/^(---\r?\n[\s\S]*?)tags:\s*[^\r\n]*/,
		`$1tags: ${newTags}`,
	)
}

function getBacklinks(content: string): string[] {
	let { frontmatter } = parseFrontmatter(content)
	if (!frontmatter?.backlinks || typeof frontmatter.backlinks !== "string")
		return []
	return frontmatter.backlinks
		.split(",")
		.map(id => id.trim())
		.filter(Boolean)
}

type BacklinksWithRange = {
	ids: string[]
	lineFrom: number
	lineTo: number
	valueFrom: number
	valueTo: number
}

function getBacklinksWithRange(content: string): BacklinksWithRange | null {
	let match = content.match(/^---\r?\n([\s\S]*?)(?:\r?\n)?---/)
	if (!match) return null

	let frontmatter = match[1]
	let frontmatterStart = content.indexOf("\n") + 1

	let lines = frontmatter.split(/\r?\n/)
	let offset = frontmatterStart

	for (let line of lines) {
		let backlinkMatch = line.match(/^backlinks:\s*(.*)$/)
		if (backlinkMatch) {
			let ids = backlinkMatch[1]
				.split(",")
				.map(id => id.trim())
				.filter(Boolean)
			let lineFrom = offset
			let lineTo = offset + line.length
			let valueFrom = offset + line.indexOf(":") + 1
			// Skip leading whitespace after colon
			let valueStartOffset = backlinkMatch[0].indexOf(backlinkMatch[1])
			valueFrom = offset + valueStartOffset
			let valueTo = lineTo
			return { ids, lineFrom, lineTo, valueFrom, valueTo }
		}
		offset += line.length + 1
	}

	return null
}

function removeEmptyFrontmatter(content: string): string {
	// Remove frontmatter if it's empty (only whitespace between ---)
	return content.replace(/^---\r?\n\s*---\r?\n?/, "")
}

function setBacklinks(content: string, ids: string[]): string {
	let { frontmatter } = parseFrontmatter(content)
	let newBacklinks = ids.filter(Boolean).join(", ")

	if (!frontmatter) {
		if (!newBacklinks) return content
		return `---\nbacklinks: ${newBacklinks}\n---\n\n${content}`
	}

	if (!frontmatter.backlinks) {
		if (!newBacklinks) return content
		return content.replace(/^(---\r?\n)/, `$1backlinks: ${newBacklinks}\n`)
	}

	if (!newBacklinks) {
		let result = content.replace(
			/^(---\r?\n[\s\S]*?)backlinks:\s*[^\r\n]*\r?\n/,
			"$1",
		)
		return removeEmptyFrontmatter(result)
	}

	return content.replace(
		/^(---\r?\n[\s\S]*?)backlinks:\s*[^\r\n]*/,
		`$1backlinks: ${newBacklinks}`,
	)
}

function addBacklink(content: string, id: string): string {
	let existing = getBacklinks(content)
	if (existing.includes(id)) return content
	return setBacklinks(content, [...existing, id])
}

function removeBacklink(content: string, id: string): string {
	let existing = getBacklinks(content)
	if (!existing.includes(id)) return content
	return setBacklinks(
		content,
		existing.filter(x => x !== id),
	)
}

// Set or update the theme field in frontmatter
// Pass null or empty string to remove the theme field
function setTheme(content: string, themeName: string | null): string {
	let { frontmatter } = parseFrontmatter(content)

	// Remove theme if null or empty
	if (!themeName) {
		if (!frontmatter?.theme) return content
		// Remove the theme line
		let result = content.replace(
			/^(---\r?\n[\s\S]*?)theme:\s*[^\r\n]*\r?\n/,
			"$1",
		)
		return removeEmptyFrontmatter(result)
	}

	// No frontmatter - create new with theme
	if (!frontmatter) {
		return `---\ntheme: ${themeName}\n---\n\n${content}`
	}

	// Frontmatter exists but no theme field - add it
	if (!frontmatter.theme) {
		return content.replace(/^(---\r?\n)/, `$1theme: ${themeName}\n`)
	}

	// Update existing theme field
	return content.replace(
		/^(---\r?\n[\s\S]*?)theme:\s*[^\r\n]*/,
		`$1theme: ${themeName}`,
	)
}

function getFrontmatterRange(
	state: EditorState,
): { from: number; to: number } | null {
	let doc = state.doc
	let firstLine = doc.line(1)

	if (firstLine.text !== "---") return null

	for (let i = 2; i <= doc.lines; i++) {
		let line = doc.line(i)
		if (line.text === "---") {
			return { from: firstLine.to, to: line.to }
		}
	}
	return null
}

function isFrontmatterFolded(state: EditorState): boolean {
	let range = getFrontmatterRange(state)
	if (!range) return false

	let folded = false
	foldedRanges(state).between(range.from, range.to, () => {
		folded = true
	})
	return folded
}

let frontmatterFoldService = foldService.of((state, from, _to) => {
	let doc = state.doc
	let firstLine = doc.line(1)
	if (from !== firstLine.from) return null

	return getFrontmatterRange(state)
})

class FoldHintWidget extends WidgetType {
	toDOM(view: EditorView) {
		let span = document.createElement("span")
		span.className = "cm-frontmatter-fold-hint"
		span.textContent = "fold frontmatter"
		span.onclick = e => {
			e.preventDefault()
			e.stopPropagation()
			let range = getFrontmatterRange(view.state)
			if (range) {
				view.dispatch({
					effects: foldEffect.of({ from: range.from, to: range.to }),
				})
			}
		}
		return span
	}
}

let foldHintWidget = Decoration.widget({
	widget: new FoldHintWidget(),
	side: 1,
})

let foldHintPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet

		constructor(view: EditorView) {
			this.decorations = this.buildDecorations(view)
		}

		update(update: { docChanged: boolean; view: EditorView }) {
			if (update.docChanged || this.shouldRebuild(update.view)) {
				this.decorations = this.buildDecorations(update.view)
			}
		}

		shouldRebuild(view: EditorView): boolean {
			let range = getFrontmatterRange(view.state)
			if (!range) return this.decorations.size > 0
			let folded = isFrontmatterFolded(view.state)
			let hasDecoration = this.decorations.size > 0
			return folded === hasDecoration
		}

		buildDecorations(view: EditorView): DecorationSet {
			let range = getFrontmatterRange(view.state)
			if (!range) return Decoration.none
			if (isFrontmatterFolded(view.state)) return Decoration.none

			let firstLine = view.state.doc.line(1)
			return Decoration.set([foldHintWidget.range(firstLine.to)])
		}
	},
	{
		decorations: v => v.decorations,
	},
)

let autoFoldFrontmatter = ViewPlugin.fromClass(
	class {
		constructor(view: EditorView) {
			let range = getFrontmatterRange(view.state)
			if (range) {
				setTimeout(() => {
					view.dispatch({
						effects: foldEffect.of({ from: range.from, to: range.to }),
					})
				}, 0)
			}
		}
		update() {}
	},
)

let frontmatterFolding: Extension = [
	frontmatterFoldService,
	codeFolding({
		placeholderDOM(view) {
			let span = document.createElement("span")
			span.className = "cm-foldPlaceholder"
			span.textContent = "frontmatter..."
			span.onclick = e => {
				e.preventDefault()
				e.stopPropagation()
				let range = getFrontmatterRange(view.state)
				if (range) {
					view.dispatch({
						effects: unfoldEffect.of({ from: range.from, to: range.to }),
					})
				}
			}
			return span
		},
	}),
	foldHintPlugin,
	autoFoldFrontmatter,
	EditorView.baseTheme({
		".cm-frontmatter-fold-hint": {
			cursor: "pointer",
			color: "var(--editor-muted-foreground, var(--muted-foreground, #999))",
			fontSize: "0.85em",
			marginLeft: "0.5em",
			fontFamily: "var(--editor-font-family, 'Geist Mono Variable', monospace)",
		},
		".cm-frontmatter-fold-hint:hover": {
			color: "var(--editor-foreground, var(--foreground, #1a1a1a))",
		},
	}),
	EditorView.theme({
		".cm-foldPlaceholder": {
			backgroundColor: "transparent",
			color: "var(--editor-muted-foreground, var(--muted-foreground, #999))",
			border: "none",
			padding: "0",
			fontFamily: "var(--editor-font-family, 'Geist Mono Variable', monospace)",
			fontSize: "0.85em",
			cursor: "pointer",
		},
		".cm-foldPlaceholder:hover": {
			color: "var(--editor-foreground, var(--foreground, #1a1a1a))",
		},
	}),
]
