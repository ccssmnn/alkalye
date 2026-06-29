import { co } from "jazz-tools"
import { Document } from "@/schema"
import { getPath, parseFrontmatter } from "@/app/features/editor"
import { applyContentDiffWithCommentAnchors } from "@/app/features/comments"

export {
	makeFolderDocumentContent,
	applyFolderPathToContent,
	moveDocumentToFolder,
	moveDocumentsToFolder,
}

type LoadedDocument = co.loaded<
	typeof Document,
	{ content: true; comments: { $each: true } }
>

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

function moveDocumentToFolder(
	doc: LoadedDocument,
	newPath: string | null,
): boolean {
	if (!doc.content) return false

	let content = doc.content.toString()
	let newContent = applyFolderPathToContent(content, newPath)
	if (newContent === content) return false

	applyContentDiffWithCommentAnchors(doc, newContent)
	doc.$jazz.set("updatedAt", new Date())
	return true
}

function moveDocumentsToFolder(
	docs: LoadedDocument[],
	newPath: string,
): number {
	let moved = 0
	for (let doc of docs) {
		if (moveDocumentToFolder(doc, newPath)) moved++
	}
	return moved
}
