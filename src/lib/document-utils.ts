import { parseFrontmatter } from "@/editor/frontmatter"
import { parseSearchTerms } from "@/components/ui/text-highlight"

export {
	getDocumentTitle,
	isDocumentPinned,
	formatRelativeDate,
	countContentMatches,
	getDaysUntilPermanentDelete,
	PERMANENT_DELETE_DAYS,
}

let PERMANENT_DELETE_DAYS = 30

function getDocumentTitle(
	doc: string | { content?: { toString(): string } },
): string {
	let content = typeof doc === "string" ? doc : (doc.content?.toString() ?? "")
	let { frontmatter, body } = parseFrontmatter(content)

	if (frontmatter?.title) return frontmatter.title

	let line = body.split("\n").find(l => l.trim()) ?? ""
	return (
		line
			.replace(/^#{1,6}\s+/, "")
			.replace(/\*\*([^*]+)\*\*/g, "$1")
			.replace(/\*([^*]+)\*/g, "$1")
			.replace(/__([^_]+)__/g, "$1")
			.replace(/_([^_]+)_/g, "$1")
			.replace(/`([^`]+)`/g, "$1")
			.trim()
			.slice(0, 80) || "Untitled"
	)
}

function isDocumentPinned(doc: { content?: { toString(): string } }): boolean {
	let content = doc.content?.toString() ?? ""
	let { frontmatter } = parseFrontmatter(content)
	return frontmatter?.pinned === true
}

function formatRelativeDate(date: Date): string {
	let now = new Date()
	let diff = now.getTime() - new Date(date).getTime()
	let days = Math.floor(diff / (1000 * 60 * 60 * 24))

	if (days === 0) return "Today"
	if (days === 1) return "Yesterday"
	if (days < 7) return `${days}d ago`
	if (days < 30) return `${Math.floor(days / 7)}w ago`
	return new Date(date).toLocaleDateString()
}

function countMatches(text: string, query: string): number {
	let q = query.toLowerCase()
	let t = text.toLowerCase()
	let count = 0
	let idx = 0
	while ((idx = t.indexOf(q, idx)) !== -1) {
		count++
		idx += q.length
	}
	return count
}

function countContentMatches(content: string, query: string): number {
	let { body } = parseFrontmatter(content)
	let terms = parseSearchTerms(query)
	if (terms.length === 0) return 0
	let total = 0
	for (let term of terms) {
		total += countMatches(body, term)
	}
	return total
}

function getDaysUntilPermanentDelete(deletedAt: Date): number {
	let diff = Date.now() - new Date(deletedAt).getTime()
	let daysSinceDelete = Math.floor(diff / (1000 * 60 * 60 * 24))
	return Math.max(0, PERMANENT_DELETE_DAYS - daysSinceDelete)
}
