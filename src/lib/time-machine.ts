import type { co } from "jazz-tools"
import type { Document, UserAccount } from "@/schema"

export { getEditHistory, formatEditDate, getAuthorName, accountIdFromSessionId }
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
	content: string
}

function accountIdFromSessionId(sessionId: string): string {
	let until = sessionId.indexOf("_session")
	return sessionId.slice(0, until)
}

function getEditHistory(doc: LoadedDocument): EditHistoryItem[] {
	if (!doc.content?.$isLoaded) return []

	let contentRaw = doc.content.$jazz.raw

	// Get all sessions and their ops to build timeline
	let allOps: Array<{
		madeAt: number
		accountId: string | null
		sessionId: string
	}> = []

	// Helper to extract operations from a CoJSON raw object's core
	function extractOpsFromCore(core: typeof contentRaw.core) {
		let knownState = core.knownState()
		let transactions = core.getValidSortedTransactions()
		for (let [sessionId, maxOp] of Object.entries(knownState.sessions)) {
			for (let i = 0; i <= maxOp; i++) {
				let tx = transactions.find(t => {
					return t.txID.sessionID === sessionId && t.txID.txIndex === i
				})
				if (tx) {
					allOps.push({
						madeAt: tx.madeAt,
						accountId: accountIdFromSessionId(sessionId),
						sessionId: sessionId,
					})
				}
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

	// Sort by timestamp
	allOps.sort((a, b) => a.madeAt - b.madeAt)

	// Build snapshots at each point in time
	// Content is taken at each timestamp (even if the change was an asset change)
	let uniqueTimes = [...new Set(allOps.map(op => op.madeAt))]
	let edits: EditHistoryItem[] = []
	for (let i = 0; i < uniqueTimes.length; i++) {
		let time = uniqueTimes[i]
		let contentAtTime = contentRaw.atTime(time).toString()
		let op = allOps.find(o => o.madeAt === time)

		edits.push({
			index: i,
			madeAt: new Date(time),
			accountId: op?.accountId ?? null,
			content: contentAtTime,
		})
	}

	// If no edits found, return at least the current state
	if (edits.length === 0) {
		edits.push({
			index: 0,
			madeAt: doc.createdAt,
			accountId: null,
			content: doc.content.toString(),
		})
	}

	return edits
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
