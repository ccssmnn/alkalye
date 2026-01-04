import { useState, useEffect } from "react"
import { Document } from "@/schema"
import { getDocumentTitle } from "@/lib/document-utils"
import { getPresentationMode } from "@/lib/presentation"

export { resolveDocTitle, resolveDocTitles, useDocTitle, useDocTitles }
export type { ResolvedDoc }

type ResolvedDoc = {
	id: string
	title: string
	exists: boolean
	isPresentation: boolean
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
			return { id, title, exists: false, isPresentation: false }
		}

		let content = doc.content?.toString() ?? ""
		let title = getDocumentTitle(content)
		let isPresentation = getPresentationMode(content)
		return { id, title, exists: true, isPresentation }
	} catch {
		return {
			id,
			title: "Document Not Accessible",
			exists: false,
			isPresentation: false,
		}
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
	let [prevId, setPrevId] = useState(id)

	// Reset state when id changes to null (adjust state during render pattern)
	if (id !== prevId) {
		setPrevId(id)
		if (!id) {
			setResolved(null)
		}
	}

	useEffect(() => {
		if (!id) return

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

function useDocTitles(
	ids: string[],
	initialCache: Map<string, ResolvedDoc> = new Map(),
): Map<string, ResolvedDoc> {
	let [resolved, setResolved] = useState<Map<string, ResolvedDoc>>(initialCache)
	let idsKey = ids.join(",")
	let [prevIdsKey, setPrevIdsKey] = useState(idsKey)

	if (idsKey !== prevIdsKey) {
		setPrevIdsKey(idsKey)
		if (ids.length === 0) {
			setResolved(new Map())
		}
	}

	useEffect(() => {
		// Find ids not in cache
		let uncached = ids.filter(id => !resolved.has(id))
		if (uncached.length === 0) return

		let cancelled = false
		resolveDocTitles(uncached).then(docs => {
			if (cancelled) return
			setResolved(prev => {
				let next = new Map(prev)
				for (let [id, doc] of docs) {
					next.set(id, doc)
				}
				return next
			})
		})

		return () => {
			cancelled = true
		}
	}, [ids, idsKey, resolved])

	return resolved
}
