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

interface EditHistoryCache {
	edits: EditHistoryItem[]
	transactionCount: number
}

let editHistoryCache = new WeakMap<object, EditHistoryCache>()

function getEditHistory(doc: LoadedDocument): EditHistoryItem[] {
	if (!doc.content?.$isLoaded) return []

	let contentRaw = doc.content.$jazz.raw
	let transactionCount = contentRaw.core.getValidSortedTransactions().length
	let cached = editHistoryCache.get(contentRaw)

	if (cached && cached.transactionCount === transactionCount) {
		return cached.edits
	}

	let timestampToOp = new Map<
		number,
		{ madeAt: number; accountId: string | null }
	>()

	function collectTransactions(core: typeof contentRaw.core) {
		for (let tx of core.getValidSortedTransactions()) {
			if (!timestampToOp.has(tx.madeAt)) {
				timestampToOp.set(tx.madeAt, {
					madeAt: tx.madeAt,
					accountId: accountIdFromSessionId(tx.txID.sessionID),
				})
			}
		}
	}

	collectTransactions(contentRaw.core)

	if (doc.assets?.$isLoaded) {
		collectTransactions(doc.assets.$jazz.raw.core)
	}

	let sortedTimestamps = [...timestampToOp.keys()].sort((a, b) => a - b)

	let edits: EditHistoryItem[] = sortedTimestamps.map((time, index) => {
		let op = timestampToOp.get(time)!
		return {
			index,
			madeAt: new Date(time),
			accountId: op.accountId,
		}
	})

	if (edits.length === 0) {
		edits = [{ index: 0, madeAt: doc.createdAt, accountId: null }]
	}

	editHistoryCache.set(contentRaw, { edits, transactionCount })

	return edits
}

function getContentAtEdit(doc: LoadedDocument, editIndex: number): string {
	if (!doc.content?.$isLoaded) return ""

	let edits = getEditHistory(doc)
	if (editIndex < 0 || editIndex >= edits.length) {
		return doc.content.toString()
	}

	let isLatestEdit = editIndex === edits.length - 1
	if (isLatestEdit) {
		return doc.content.toString()
	}

	let edit = edits[editIndex]
	return doc.content.$jazz.raw.atTime(edit.madeAt.getTime()).toString()
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

interface DayGroup {
	dateKey: string
	date: Date
	edits: EditHistoryItem[]
	lastEditIndex: number
}

function getDateKey(date: Date): string {
	let year = date.getFullYear()
	let month = String(date.getMonth() + 1).padStart(2, "0")
	let day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

function groupEditsByDay(edits: EditHistoryItem[]): DayGroup[] {
	let dayMap = new Map<string, DayGroup>()

	for (let edit of edits) {
		let dateKey = getDateKey(edit.madeAt)

		if (!dayMap.has(dateKey)) {
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
		group.lastEditIndex = edit.index
	}

	return [...dayMap.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}
