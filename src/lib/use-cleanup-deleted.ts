import { useEffect, useRef } from "react"
import { useAccount } from "jazz-tools/react"
import { type co, type ResolveQuery } from "jazz-tools"
import { UserAccount } from "@/schema"
import {
	permanentlyDeleteDocument,
	permanentlyDeleteSpace,
} from "@/lib/delete-covalue"
import { PERMANENT_DELETE_DAYS } from "@/lib/document-utils"

export { useCleanupDeleted }

let cleanupQuery = {
	root: {
		documents: { $each: true },
		inactiveDocuments: { $each: true },
		spaces: { $each: true },
		inactiveSpaces: { $each: true },
	},
} as const satisfies ResolveQuery<typeof UserAccount>

type LoadedUser = co.loaded<typeof UserAccount, typeof cleanupQuery>

/**
 * Background cleanup hook that runs on app load.
 * - Moves soft-deleted items to inactive lists
 * - Permanently deletes items older than 30 days from inactive lists
 */
function useCleanupDeleted(): void {
	let cleanupRan = useRef(false)
	let me = useAccount(UserAccount, { resolve: cleanupQuery })

	useEffect(() => {
		if (cleanupRan.current || !me.$isLoaded) return
		cleanupRan.current = true

		// Run cleanup in background without blocking
		cleanupDeletedItems(me).catch(console.error)
	}, [me.$isLoaded, me])
}

async function cleanupDeletedItems(me: LoadedUser): Promise<void> {
	let { documents, inactiveDocuments, spaces, inactiveSpaces } = me.root

	// Process documents - move deleted to inactive
	if (documents && inactiveDocuments) {
		let docsToMove: number[] = []
		let docsArray = Array.from(documents.values())

		for (let i = 0; i < docsArray.length; i++) {
			let doc = docsArray[i]
			if (doc?.$isLoaded && doc.deletedAt) {
				docsToMove.push(i)
			}
		}

		// Remove from end to preserve indices
		for (let i = docsToMove.length - 1; i >= 0; i--) {
			let doc = docsArray[docsToMove[i]]
			if (doc) inactiveDocuments.$jazz.push(doc)
			documents.$jazz.splice(docsToMove[i], 1)
		}
	}

	// Delete stale inactive documents
	if (inactiveDocuments) {
		let docsToDelete: number[] = []
		let inactiveDocsArray = Array.from(inactiveDocuments.values())

		for (let i = 0; i < inactiveDocsArray.length; i++) {
			let doc = inactiveDocsArray[i]
			if (doc?.$isLoaded && doc.deletedAt && isStale(doc.deletedAt)) {
				docsToDelete.push(i)
			}
		}

		for (let i = docsToDelete.length - 1; i >= 0; i--) {
			let doc = inactiveDocsArray[docsToDelete[i]]
			inactiveDocuments.$jazz.splice(docsToDelete[i], 1)
			if (doc) {
				try {
					await permanentlyDeleteDocument(doc)
				} catch {
					// May fail if not accessible, skip
				}
			}
		}
	}

	// Process spaces - move deleted to inactive
	if (spaces && inactiveSpaces) {
		let spacesToMove: number[] = []
		let spacesArray = Array.from(spaces.values())

		for (let i = 0; i < spacesArray.length; i++) {
			let space = spacesArray[i]
			if (space?.$isLoaded && space.deletedAt) {
				spacesToMove.push(i)
			}
		}

		for (let i = spacesToMove.length - 1; i >= 0; i--) {
			let space = spacesArray[spacesToMove[i]]
			if (space) inactiveSpaces.$jazz.push(space)
			spaces.$jazz.splice(spacesToMove[i], 1)
		}
	}

	// Delete stale inactive spaces
	if (inactiveSpaces) {
		let spacesToDelete: number[] = []
		let inactiveSpacesArray = Array.from(inactiveSpaces.values())

		for (let i = 0; i < inactiveSpacesArray.length; i++) {
			let space = inactiveSpacesArray[i]
			if (space?.$isLoaded && space.deletedAt && isStale(space.deletedAt)) {
				spacesToDelete.push(i)
			}
		}

		for (let i = spacesToDelete.length - 1; i >= 0; i--) {
			let space = inactiveSpacesArray[spacesToDelete[i]]
			inactiveSpaces.$jazz.splice(spacesToDelete[i], 1)
			if (space) {
				try {
					await permanentlyDeleteSpace(space)
				} catch {
					// May fail if not accessible, skip
				}
			}
		}
	}
}

function isStale(deletedAt: Date): boolean {
	let cutoff = new Date()
	cutoff.setDate(cutoff.getDate() - PERMANENT_DELETE_DAYS)
	return new Date(deletedAt) < cutoff
}
