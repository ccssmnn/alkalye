import type { co } from "jazz-tools"
import type { Document, UserAccount } from "@/schema"

export {
	getEditHistory,
	getContentAtEdit,
	formatEditDate,
	getAuthorName,
	accountIdFromSessionId,
	groupEditsByDay,
	getDateKey,
}
export type { EditHistoryItem, DayGroup }

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

// Internal structure containing all edit metadata
interface EditHistoryResult {
	edits: EditHistoryItem[]
	// Store the transaction count to invalidate cache when new edits arrive
	transactionCount: number
}

// Cache to avoid recomputing edit history on every render
// Uses WeakMap with document as key so it auto-cleans when documents are GC'd
let editHistoryCache = new WeakMap<object, EditHistoryResult>()

function getEditHistory(doc: LoadedDocument): EditHistoryItem[] {
	if (!doc.content?.$isLoaded) return []

	// Check cache first - use the content's raw object as cache key
	let contentRaw = doc.content.$jazz.raw
	let currentTransactionCount =
		contentRaw.core.getValidSortedTransactions().length
	let cached = editHistoryCache.get(contentRaw)

	// Invalidate cache if transaction count has changed (new edits arrived)
	if (cached && cached.transactionCount === currentTransactionCount) {
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

	// Cache the result with transaction count for invalidation
	let result: EditHistoryResult = {
		edits,
		transactionCount: currentTransactionCount,
	}
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

// --- Day-based grouping ---

interface DayGroup {
	dateKey: string // YYYY-MM-DD format for sorting/comparison
	date: Date // Representative date (start of day)
	edits: EditHistoryItem[] // All edits on this day
	lastEditIndex: number // Index of the last edit of the day (for day-level scrubbing)
}

// Get a consistent date key for grouping (YYYY-MM-DD in local timezone)
function getDateKey(date: Date): string {
	let year = date.getFullYear()
	let month = String(date.getMonth() + 1).padStart(2, "0")
	let day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

// Group edits by day, returning an array sorted chronologically
function groupEditsByDay(edits: EditHistoryItem[]): DayGroup[] {
	let dayMap = new Map<string, DayGroup>()

	for (let edit of edits) {
		let dateKey = getDateKey(edit.madeAt)

		if (!dayMap.has(dateKey)) {
			// Create a date at start of day for display
			let startOfDay = new Date(edit.madeAt)
			startOfDay.setHours(0, 0, 0, 0)

			dayMap.set(dateKey, {
				dateKey,
				date: startOfDay,
				edits: [],
				lastEditIndex: edit.index,
			})
		}

		let group = dayMap.get(dateKey)!
		group.edits.push(edit)
		// Keep track of the last edit index (edits are already sorted chronologically)
		group.lastEditIndex = edit.index
	}

	// Sort by dateKey (chronological order)
	return [...dayMap.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}
