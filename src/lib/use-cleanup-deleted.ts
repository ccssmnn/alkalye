import { useEffect, useRef } from "react"
import { useAccount } from "jazz-tools/react"
import { type co, type ResolveQuery } from "jazz-tools"
import { Document, Space, UserAccount } from "@/schema"
import {
	permanentlyDeleteDocument,
	permanentlyDeleteSpace,
} from "@/lib/delete-covalue"
import { PERMANENT_DELETE_DAYS } from "@/lib/document-utils"

export { useCleanupDeleted }

let CLEANUP_COOLDOWN_KEY = "alkalye:lastCleanupRun"
let COOLDOWN_MS = 8 * 60 * 60 * 1000 // 8 hours

let cleanupQuery = {
	root: {
		documents: true,
		inactiveDocuments: true,
		spaces: true,
		inactiveSpaces: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

type LoadedUser = co.loaded<typeof UserAccount, typeof cleanupQuery>

/**
 * Background cleanup hook that runs once per day.
 * - Moves soft-deleted items to inactive lists
 * - Permanently deletes items older than 30 days from inactive lists
 */
function useCleanupDeleted(): void {
	let cleanupRan = useRef(false)
	let me = useAccount(UserAccount, { resolve: cleanupQuery })

	useEffect(() => {
		if (cleanupRan.current || !me.$isLoaded) return
		cleanupRan.current = true

		// Check cooldown - only run once per day
		let lastRun = localStorage.getItem(CLEANUP_COOLDOWN_KEY)
		if (lastRun && Date.now() - parseInt(lastRun, 10) < COOLDOWN_MS) {
			return
		}

		// Run cleanup in background without blocking
		cleanupDeletedItems(me)
			.then(() => {
				localStorage.setItem(CLEANUP_COOLDOWN_KEY, Date.now().toString())
			})
			.catch(console.error)
	}, [me.$isLoaded, me])
}

async function cleanupDeletedItems(me: LoadedUser): Promise<void> {
	let { documents, inactiveDocuments, spaces, inactiveSpaces } = me.root

	// Process documents - move deleted to inactive
	if (documents && inactiveDocuments) {
		let docsToMove: Array<{ idx: number; doc: co.loaded<typeof Document> }> = []

		for (let i = 0; i < documents.length; i++) {
			let ref = documents[i]
			if (!ref) continue
			// Load each document to check deletedAt
			let doc = await Document.load(ref.$jazz.id)
			if (doc?.$isLoaded && doc.deletedAt) {
				docsToMove.push({ idx: i, doc })
			}
		}

		// Remove from end to preserve indices
		for (let i = docsToMove.length - 1; i >= 0; i--) {
			let { idx, doc } = docsToMove[i]
			inactiveDocuments.$jazz.push(doc)
			documents.$jazz.splice(idx, 1)
		}
	}

	// Delete stale inactive documents
	if (inactiveDocuments) {
		let docsToDelete: Array<{ idx: number; doc: co.loaded<typeof Document> }> =
			[]

		for (let i = 0; i < inactiveDocuments.length; i++) {
			let ref = inactiveDocuments[i]
			if (!ref) continue
			let doc = await Document.load(ref.$jazz.id)
			if (doc?.$isLoaded && doc.deletedAt && isStale(doc.deletedAt)) {
				docsToDelete.push({ idx: i, doc })
			}
		}

		for (let i = docsToDelete.length - 1; i >= 0; i--) {
			let { idx, doc } = docsToDelete[i]
			inactiveDocuments.$jazz.splice(idx, 1)
			try {
				await permanentlyDeleteDocument(doc)
			} catch {
				// May fail if not accessible, skip
			}
		}
	}

	// Process spaces - move deleted to inactive
	if (spaces && inactiveSpaces) {
		let spacesToMove: Array<{ idx: number; space: co.loaded<typeof Space> }> =
			[]

		for (let i = 0; i < spaces.length; i++) {
			let ref = spaces[i]
			if (!ref) continue
			let space = await Space.load(ref.$jazz.id)
			if (space?.$isLoaded && space.deletedAt) {
				spacesToMove.push({ idx: i, space })
			}
		}

		for (let i = spacesToMove.length - 1; i >= 0; i--) {
			let { idx, space } = spacesToMove[i]
			inactiveSpaces.$jazz.push(space)
			spaces.$jazz.splice(idx, 1)
		}
	}

	// Delete stale inactive spaces
	if (inactiveSpaces) {
		let spacesToDelete: Array<{ idx: number; space: co.loaded<typeof Space> }> =
			[]

		for (let i = 0; i < inactiveSpaces.length; i++) {
			let ref = inactiveSpaces[i]
			if (!ref) continue
			let space = await Space.load(ref.$jazz.id)
			if (space?.$isLoaded && space.deletedAt && isStale(space.deletedAt)) {
				spacesToDelete.push({ idx: i, space })
			}
		}

		for (let i = spacesToDelete.length - 1; i >= 0; i--) {
			let { idx, space } = spacesToDelete[i]
			inactiveSpaces.$jazz.splice(idx, 1)
			try {
				await permanentlyDeleteSpace(space)
			} catch {
				// May fail if not accessible, skip
			}
		}
	}
}

function isStale(deletedAt: Date): boolean {
	let cutoff = new Date()
	cutoff.setDate(cutoff.getDate() - PERMANENT_DELETE_DAYS)
	return new Date(deletedAt) < cutoff
}
