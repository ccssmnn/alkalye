import { useState, useEffect } from "react"
import { Document } from "@/schema"
import { getDocumentTitle } from "@/lib/document-utils"

export { resolveDocTitle, resolveDocTitles, useDocTitle, useDocTitles }
export type { ResolvedDoc }

type ResolvedDoc = {
	id: string
	title: string
	exists: boolean
}

async function resolveDocTitle(id: string): Promise<ResolvedDoc> {
	try {
		let doc = await Document.load(id, {
			resolve: { content: true },
		})

		if (!doc.$isLoaded) {
			let title =
				doc.$jazz.loadingState === "unauthorized"
					? "Document Not Accessible"
					: "Document Not Found"
			return { id, title, exists: false }
		}

		let content = doc.content?.toString() ?? ""
		let title = getDocumentTitle(content)
		return { id, title, exists: true }
	} catch {
		return { id, title: "Document Not Accessible", exists: false }
	}
}

async function resolveDocTitles(
	ids: string[],
): Promise<Map<string, ResolvedDoc>> {
	let resolved = await Promise.all(ids.map(resolveDocTitle))
	let results = new Map<string, ResolvedDoc>()
	for (let doc of resolved) {
		results.set(doc.id, doc)
	}
	return results
}

function useDocTitle(id: string | null): ResolvedDoc | null {
	let [resolved, setResolved] = useState<ResolvedDoc | null>(null)

	useEffect(() => {
		if (!id) {
			setResolved(null)
			return
		}

		let cancelled = false
		resolveDocTitle(id).then(doc => {
			if (!cancelled) setResolved(doc)
		})

		return () => {
			cancelled = true
		}
	}, [id])

	return resolved
}

function useDocTitles(ids: string[]): Map<string, ResolvedDoc> {
	let [resolved, setResolved] = useState<Map<string, ResolvedDoc>>(new Map())

	useEffect(() => {
		if (ids.length === 0) {
			setResolved(new Map())
			return
		}

		let cancelled = false
		resolveDocTitles(ids).then(docs => {
			if (!cancelled) setResolved(docs)
		})

		return () => {
			cancelled = true
		}
	}, [ids.join(",")])

	return resolved
}
