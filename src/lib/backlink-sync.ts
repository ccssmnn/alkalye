import { useRef, useEffect } from "react"
import { Document, Space, UserAccount } from "@/schema"
import { parseWikiLinks } from "@/editor/wikilink-parser"
import { getBacklinks, addBacklink, removeBacklink } from "@/editor/frontmatter"
import { co } from "jazz-tools"
import { useAccount, useCoState } from "jazz-tools/react"

export { useBacklinkSync }

type LoadedDoc = co.loaded<typeof Document, { content: true }>

// Backlink sync options - when spaceId is provided, only sync within that space
type BacklinkSyncOptions = {
	spaceId?: string
}

function useBacklinkSync(
	docId: string,
	readOnly: boolean,
	options: BacklinkSyncOptions = {},
) {
	let { spaceId } = options

	let me = useAccount(UserAccount, {
		resolve: { root: { documents: { $each: { content: true } } } },
	})

	// Load space documents when in space context
	let space = useCoState(Space, spaceId, {
		resolve: { documents: { $each: { content: true } } },
	})

	// Store refs so syncBacklinks can access fresh documents
	let meRef = useRef(me)
	let spaceRef = useRef(space)
	useEffect(() => {
		meRef.current = me
		spaceRef.current = space
	})

	function getDocuments(): LoadedDoc[] {
		let currentSpace = spaceRef.current
		let currentMe = meRef.current

		// If in space context, only return space documents
		if (spaceId) {
			if (!currentSpace?.$isLoaded || !currentSpace.documents?.$isLoaded) {
				return []
			}
			return currentSpace.documents.filter(
				(d): d is LoadedDoc =>
					d?.$isLoaded === true && d.content !== undefined && !d.deletedAt,
			)
		}

		// Personal context: only return personal documents (no spaceId)
		if (!currentMe.$isLoaded || !currentMe.root?.documents?.$isLoaded) return []
		return currentMe.root.documents.filter(
			(d): d is LoadedDoc =>
				d?.$isLoaded === true &&
				d.content !== undefined &&
				!d.deletedAt &&
				!d.spaceId,
		)
	}

	let lastSyncedLinkIdsRef = useRef(new Set<string>())
	let timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Determine if docs are ready based on context
	let docsReady = spaceId
		? space?.$isLoaded && space.documents?.$isLoaded
		: me.$isLoaded && me.root?.documents?.$isLoaded

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current)
		}
	}, [])

	// Reset state when switching docs
	useEffect(() => {
		lastSyncedLinkIdsRef.current = new Set()
		if (timeoutRef.current) clearTimeout(timeoutRef.current)
	}, [docId])

	function syncBacklinks(content: string) {
		if (!docsReady || readOnly) return

		let links = parseWikiLinks(content)
		let currentLinkIds = new Set(links.map(l => l.id))
		let lastSyncedLinkIds = lastSyncedLinkIdsRef.current

		let addedIds = [...currentLinkIds].filter(id => !lastSyncedLinkIds.has(id))
		let removedIds = [...lastSyncedLinkIds].filter(
			id => !currentLinkIds.has(id),
		)

		let docs = getDocuments()

		for (let linkedId of addedIds) {
			let linkedDoc = docs.find(d => d.$jazz.id === linkedId)
			if (!linkedDoc || !canEditDoc(linkedDoc)) continue

			let linkedContent = linkedDoc.content?.toString() ?? ""
			if (getBacklinks(linkedContent).includes(docId)) continue

			let updatedContent = addBacklink(linkedContent, docId)
			linkedDoc.content?.$jazz.applyDiff(updatedContent)
			linkedDoc.$jazz.set("updatedAt", new Date())
		}

		for (let linkedId of removedIds) {
			let linkedDoc = docs.find(d => d.$jazz.id === linkedId)
			if (!linkedDoc || !canEditDoc(linkedDoc)) continue

			let linkedContent = linkedDoc.content?.toString() ?? ""
			if (!getBacklinks(linkedContent).includes(docId)) continue

			let updatedContent = removeBacklink(linkedContent, docId)
			linkedDoc.content?.$jazz.applyDiff(updatedContent)
			linkedDoc.$jazz.set("updatedAt", new Date())
		}

		lastSyncedLinkIdsRef.current = currentLinkIds
	}

	function sync(content: string) {
		if (timeoutRef.current) clearTimeout(timeoutRef.current)
		timeoutRef.current = setTimeout(() => syncBacklinks(content), 400)
	}

	return { syncBacklinks: sync }
}

function canEditDoc(doc: LoadedDoc): boolean {
	let role = doc.$jazz.owner.myRole?.()
	return role === "admin" || role === "writer"
}
