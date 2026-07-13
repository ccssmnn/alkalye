import type { co } from "jazz-tools"
import type { Document, UserAccount } from "@/schema"
import { Asset, TldrawRevision } from "@/schema"

export {
	getEditHistory,
	getContentAtEdit,
	getEditTimestamp,
	getHistoricalAssetIds,
	restoreAssetsAtTime,
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
	let transactionCount = getTransactionCount(doc)
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
		for (let asset of doc.assets.values()) {
			if (asset?.$isLoaded) collectTransactions(asset.$jazz.raw.core)
		}
	}

	if (doc.comments?.$isLoaded) {
		collectTransactions(doc.comments.$jazz.raw.core)
		for (let thread of doc.comments.values()) {
			if (!thread?.$isLoaded) continue
			collectTransactions(thread.$jazz.raw.core)
			if (thread.replies?.$isLoaded) {
				collectTransactions(thread.replies.$jazz.raw.core)
				for (let reply of thread.replies.values()) {
					if (reply?.$isLoaded) collectTransactions(reply.$jazz.raw.core)
				}
			}
		}
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

function getEditTimestamp(doc: LoadedDocument, editIndex: number): number {
	let edits = getEditHistory(doc)
	return edits[editIndex]?.madeAt.getTime() ?? Date.now()
}

function getHistoricalAssetIds(
	doc: LoadedDocument,
	timestamp: number,
): string[] {
	if (!doc.assets?.$isLoaded) return []
	let items = doc.assets.$jazz.raw.atTime(timestamp).toJSON()
	return items.filter(item => typeof item === "string")
}

async function restoreAssetsAtTime(doc: LoadedDocument, timestamp: number) {
	if (!doc.assets?.$isLoaded) return

	let assetIds = getHistoricalAssetIds(doc, timestamp)
	let assets = await Promise.all(
		assetIds.map(assetId =>
			Asset.load(assetId, {
				resolve: {
					image: true,
					video: true,
					revision: true,
				},
			}),
		),
	)
	let loadedAssets = assets.map(asset => {
		if (!asset?.$isLoaded) throw new Error("Historical asset is unavailable")
		return asset
	})
	let restorations = await Promise.all(
		loadedAssets.map(async asset => {
			let historical = asset.$jazz.raw.atTime(timestamp)
			let historicalName = historical.get("name")
			let name =
				typeof historicalName === "string" ? historicalName : asset.name
			if (asset.type !== "tldraw") {
				return { asset, name, revision: undefined }
			}
			let revisionId = historical.get("revision")
			if (typeof revisionId !== "string") {
				throw new Error("Historical whiteboard revision is unavailable")
			}
			let revision = await TldrawRevision.load(revisionId, {
				resolve: {
					snapshot: true,
					lightPreview: true,
					darkPreview: true,
				},
			})
			if (!revision?.$isLoaded) {
				throw new Error("Historical whiteboard revision is unavailable")
			}
			return { asset, name, revision }
		}),
	)

	for (let { asset, name, revision } of restorations) {
		if (asset.type === "image" && name !== asset.name) {
			asset.$jazz.set("name", name)
		}
		if (asset.type === "video" && name !== asset.name) {
			asset.$jazz.set("name", name)
		}
		if (asset.type === "tldraw" && name !== asset.name) {
			asset.$jazz.set("name", name)
		}
		if (asset.type === "tldraw" && revision) {
			asset.$jazz.set("revision", revision)
		}
	}

	doc.assets.$jazz.splice(0, doc.assets.length, ...loadedAssets)
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

function getTransactionCount(doc: LoadedDocument) {
	let count = doc.content.$jazz.raw.core.getValidSortedTransactions().length

	if (doc.assets?.$isLoaded) {
		count += doc.assets.$jazz.raw.core.getValidSortedTransactions().length
		for (let asset of doc.assets.values()) {
			if (!asset?.$isLoaded) continue
			count += asset.$jazz.raw.core.getValidSortedTransactions().length
		}
	}

	if (!doc.comments?.$isLoaded) return count

	count += doc.comments.$jazz.raw.core.getValidSortedTransactions().length
	for (let thread of doc.comments.values()) {
		if (!thread?.$isLoaded) continue
		count += thread.$jazz.raw.core.getValidSortedTransactions().length
		if (!thread.replies?.$isLoaded) continue
		count += thread.replies.$jazz.raw.core.getValidSortedTransactions().length
		for (let reply of thread.replies.values()) {
			if (reply?.$isLoaded) {
				count += reply.$jazz.raw.core.getValidSortedTransactions().length
			}
		}
	}

	return count
}
