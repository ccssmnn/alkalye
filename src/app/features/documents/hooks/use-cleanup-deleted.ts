import { useEffect, useRef } from "react"
import { useAccount } from "jazz-tools/react"
import { type co, type ResolveQuery } from "jazz-tools"
import { Document } from "../lib/schema"
import { UserAccount } from "@/schema"
import {
	permanentlyDeleteDocument,
	PERMANENT_DELETE_DAYS,
} from "../lib/delete-covalue"

export { useCleanupDeleted }

let CLEANUP_COOLDOWN_KEY = "alkalye:lastCleanupRun"
let COOLDOWN_MS = 8 * 60 * 60 * 1000
let STARTUP_DELAY_MS = 15_000

let cleanupQuery = {
	root: {
		documents: true,
		inactiveDocuments: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

type LoadedUser = co.loaded<typeof UserAccount, typeof cleanupQuery>

function useCleanupDeleted(): void {
	let cleanupRan = useRef(false)
	let me = useAccount(UserAccount, { resolve: { root: true } })

	useEffect(() => {
		if (cleanupRan.current || !me.$isLoaded) return

		let timer = setTimeout(() => {
			cleanupRan.current = true

			let lastRun = localStorage.getItem(CLEANUP_COOLDOWN_KEY)
			if (lastRun && Date.now() - parseInt(lastRun, 10) < COOLDOWN_MS) {
				return
			}

			me.$jazz
				.ensureLoaded({ resolve: cleanupQuery })
				.then(cleanupDeletedItems)
				.then(() => {
					localStorage.setItem(CLEANUP_COOLDOWN_KEY, Date.now().toString())
				})
				.catch(console.error)
		}, STARTUP_DELAY_MS)

		return () => clearTimeout(timer)
	}, [me.$isLoaded, me])
}

async function cleanupDeletedItems(me: LoadedUser): Promise<void> {
	let { documents, inactiveDocuments } = me.root

	if (documents && inactiveDocuments) {
		let docsToMove: Array<{ idx: number; doc: co.loaded<typeof Document> }> = []

		for (let i = 0; i < documents.length; i++) {
			let ref = documents[i]
			if (!ref) continue
			let doc = await Document.load(ref.$jazz.id)
			if (doc?.$isLoaded && doc.deletedAt) {
				docsToMove.push({ idx: i, doc })
			}
		}

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
}

function isStale(deletedAt: Date): boolean {
	let cutoff = new Date()
	cutoff.setDate(cutoff.getDate() - PERMANENT_DELETE_DAYS)
	return new Date(deletedAt) < cutoff
}
