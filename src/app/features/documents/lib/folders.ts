import { co } from "jazz-tools"
import { Document } from "@/schema"
import { getPath, parseFrontmatter } from "@/app/features/editor"
import { applyContentDiffLoadingCommentAnchors } from "@/app/features/comments"
import { syncDocumentMetadata } from "./metadata"

export {
	makeFolderDocumentContent,
	applyFolderPathToContent,
	moveDocumentToFolder,
	moveDocumentsToFolder,
}

function makeFolderDocumentContent(path: string): string {
	return `---\ntitle: Untitled\npath: ${path}\n---\n\n`
}

function applyFolderPathToContent(
	content: string,
	newPath: string | null,
): string {
	let { frontmatter } = parseFrontmatter(content)
	let currentPath = getPath(content)

	if (currentPath === newPath) return content
	if (!frontmatter) {
		if (!newPath) return content
		return `---\npath: ${newPath}\n---\n\n${content}`
	}
	if (currentPath && !newPath) {
		return content.replace(
			/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*\r?\n([\s\S]*?---)/,
			"$1$2",
		)
	}
	if (currentPath && newPath) {
		return content.replace(
			/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*/,
			`$1path: ${newPath}`,
		)
	}
	if (!newPath) return content
	return content.replace(/^(---\r?\n)/, `$1path: ${newPath}\n`)
}

async function moveDocumentToFolder(
	doc: co.loaded<typeof Document, { content: true }>,
	newPath: string | null,
): Promise<boolean> {
	if (!doc.content) return false

	let content = doc.content.toString()
	let newContent = applyFolderPathToContent(content, newPath)
	if (newContent === content) return false

	await applyContentDiffLoadingCommentAnchors(doc, newContent)
	doc.$jazz.set("updatedAt", new Date())
	syncDocumentMetadata(doc)
	return true
}

async function moveDocumentsToFolder(
	docs: co.loaded<typeof Document>[],
	newPath: string,
): Promise<number> {
	let moved = 0
	for (let doc of docs) {
		let loaded = await doc.$jazz.ensureLoaded({ resolve: { content: true } })
		if (!loaded) continue
		if (await moveDocumentToFolder(loaded, newPath)) moved++
	}
	return moved
}
