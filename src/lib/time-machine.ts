import type { co } from "jazz-tools"
import type { Document, UserAccount } from "@/schema"

export {
	getEditHistory,
	getContentAtEdit,
	formatEditDate,
	getAuthorName,
	accountIdFromSessionId,
}
export type { EditHistoryItem }

type LoadedDocument = co.loaded<
	typeof Document,
	{ content: true; assets: true }
>
type LoadedAccount = co.loaded<typeof UserAccount, { profile: true }>

interface EditHistoryItem {
	index: number
	madeAt: Date
	accountId: string | null
}

function accountIdFromSessionId(sessionId: string): string {
	let until = sessionId.indexOf("_session")
	return sessionId.slice(0, until)
}

// Type for the raw content reference
type ContentRaw =
	NonNullable<LoadedDocument["content"]> extends {
		$isLoaded: true
		$jazz: { raw: infer R }
	}
		? R
		: never

// Internal structure containing all edit metadata plus the raw reference for lazy content loading
interface EditHistoryResult {
	edits: EditHistoryItem[]
	// Store the raw content reference for lazy content loading
	contentRaw: ContentRaw | null
}

// Cache to avoid recomputing edit history on every render
// Uses WeakMap with document as key so it auto-cleans when documents are GC'd
let editHistoryCache = new WeakMap<object, EditHistoryResult>()

function getEditHistory(doc: LoadedDocument): EditHistoryItem[] {
	if (!doc.content?.$isLoaded) return []

	// Check cache first - use the content's raw object as cache key
	// This will invalidate when content changes (new raw object)
	let contentRaw = doc.content.$jazz.raw
	let cached = editHistoryCache.get(contentRaw)
	if (cached) {
		return cached.edits
	}

	// Build timeline efficiently using a Map for O(1) lookup
	let timestampToOp = new Map<
		number,
		{ madeAt: number; accountId: string | null }
	>()

	// Helper to extract operations from a CoJSON raw object's core - O(n) instead of O(n²)
	function extractOpsFromCore(core: typeof contentRaw.core) {
		let transactions = core.getValidSortedTransactions()
		// Transactions are already sorted, just iterate once
		for (let tx of transactions) {
			let accountId = accountIdFromSessionId(tx.txID.sessionID)
			// Only keep the first op at each timestamp (they represent the same moment)
			if (!timestampToOp.has(tx.madeAt)) {
				timestampToOp.set(tx.madeAt, {
					madeAt: tx.madeAt,
					accountId,
				})
			}
		}
	}

	// Extract content operations
	extractOpsFromCore(contentRaw.core)

	// Extract asset list operations (when assets are added/removed)
	if (doc.assets?.$isLoaded) {
		let assetsCore = doc.assets.$jazz.raw.core
		extractOpsFromCore(assetsCore)
	}

	// Get sorted unique timestamps
	let sortedTimes = [...timestampToOp.keys()].sort((a, b) => a - b)

	// Build edit metadata without computing content (lazy loading)
	let edits: EditHistoryItem[] = sortedTimes.map((time, index) => {
		let op = timestampToOp.get(time)!
		return {
			index,
			madeAt: new Date(time),
			accountId: op.accountId,
		}
	})

	// If no edits found, return at least the current state
	if (edits.length === 0) {
		edits = [
			{
				index: 0,
				madeAt: doc.createdAt,
				accountId: null,
			},
		]
	}

	// Cache the result
	let result: EditHistoryResult = { edits, contentRaw }
	editHistoryCache.set(contentRaw, result)

	return edits
}

// Get content for a specific edit - lazy loaded
function getContentAtEdit(doc: LoadedDocument, editIndex: number): string {
	if (!doc.content?.$isLoaded) return ""

	let edits = getEditHistory(doc)
	if (editIndex < 0 || editIndex >= edits.length) {
		return doc.content.toString()
	}

	let edit = edits[editIndex]
	let contentRaw = doc.content.$jazz.raw

	// For the latest edit, just return current content (faster)
	if (editIndex === edits.length - 1) {
		return doc.content.toString()
	}

	// Get content at the specific timestamp
	return contentRaw.atTime(edit.madeAt.getTime()).toString()
}

function formatEditDate(date: Date): string {
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	})
}

function getAuthorName(
	account: LoadedAccount | null,
	currentUserId?: string,
): string {
	if (!account) return "Unknown"
	if (account.$jazz.id === currentUserId) return "you"
	return account.profile?.name ?? "Unknown"
}
