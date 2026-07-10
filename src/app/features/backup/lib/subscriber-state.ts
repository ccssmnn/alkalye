export {
	assertBackupSelectionUnchanged,
	chooseBackupPush,
	createBackupSyncCoordinator,
	hasBackupDocumentsChangedSince,
	selectActiveBackupDocuments,
	type BackupDocumentSelection,
	type BackupDocumentState,
}

type BackupDocumentState = {
	$isLoaded: boolean
	$jazz: { id: string }
	deletedAt?: Date
	updatedAt?: Date
}

type BackupDocumentVersion<T> = {
	document: T
	id: string
	deletedAtMs: number | null
	updatedAtMs: number | null
}

type BackupDocumentSelection<T> = {
	documents: T[]
	versions: BackupDocumentVersion<T>[]
	deletedDocumentIds: string[]
	unresolvedSlots: number
	isComplete: boolean
	contentHash: string
}

type BackupPushChoice = {
	nextHash: string
	shouldPush: boolean
}

type BackupPushRequest = {
	key: string
	run: () => Promise<boolean>
	commit: () => void
	fail: (error: unknown) => void
}

type ScheduleBackupPush = (run: () => void, delayMs: number) => () => void

function chooseBackupPush(
	previousHash: string | null,
	contentHash: string,
	hasExistingBackup: boolean,
): BackupPushChoice {
	if (previousHash === null) {
		return { nextHash: contentHash, shouldPush: !hasExistingBackup }
	}
	if (previousHash === contentHash) {
		return { nextHash: previousHash, shouldPush: false }
	}
	return { nextHash: contentHash, shouldPush: true }
}

function selectActiveBackupDocuments<T extends BackupDocumentState>(
	docs: Iterable<T | null | undefined>,
): BackupDocumentSelection<T> {
	let documents: T[] = []
	let versions: BackupDocumentVersion<T>[] = []
	let deletedDocumentIds: string[] = []
	let unresolvedSlots = 0
	for (let doc of docs) {
		if (!doc?.$isLoaded) {
			unresolvedSlots += 1
			continue
		}
		let version = getBackupDocumentVersion(doc)
		versions.push(version)
		if (doc.deletedAt) {
			deletedDocumentIds.push(doc.$jazz.id)
		} else {
			documents.push(doc)
		}
	}

	let versionParts = versions.map(formatBackupDocumentVersion)
	if (unresolvedSlots > 0) versionParts.push(`unresolved:${unresolvedSlots}`)
	let contentHash = versionParts.sort().join("|")

	return {
		documents,
		versions,
		deletedDocumentIds,
		unresolvedSlots,
		isComplete: unresolvedSlots === 0,
		contentHash,
	}
}

function hasBackupDocumentsChangedSince<T>(
	selection: BackupDocumentSelection<T>,
	lastBackupAt: string | null,
): boolean {
	if (!lastBackupAt) return false
	let lastBackupMs = Date.parse(lastBackupAt)
	if (Number.isNaN(lastBackupMs)) return false
	return selection.versions.some(version => {
		return (
			(version.updatedAtMs !== null && version.updatedAtMs > lastBackupMs) ||
			(version.deletedAtMs !== null && version.deletedAtMs > lastBackupMs)
		)
	})
}

function assertBackupSelectionUnchanged<T extends BackupDocumentState>(
	selection: BackupDocumentSelection<T>,
): void {
	for (let selected of selection.versions) {
		let current = getBackupDocumentVersion(selected.document)
		if (
			!selected.document.$isLoaded ||
			current.id !== selected.id ||
			current.updatedAtMs !== selected.updatedAtMs ||
			current.deletedAtMs !== selected.deletedAtMs
		) {
			throw new Error("Backup document selection changed during preparation")
		}
	}
}

function createBackupSyncCoordinator(
	delayMs: number,
	schedule: ScheduleBackupPush = scheduleBackupPush,
) {
	let queued: BackupPushRequest | null = null
	let active: BackupPushRequest | null = null
	let latest: BackupPushRequest | null = null
	let pendingPull: (() => Promise<void>) | null = null
	let activePull: Promise<void> | null = null
	let queuedReady = false
	let cancelScheduled: (() => void) | null = null
	let disposed = false
	let idleResolvers: Array<() => void> = []

	function clearQueued() {
		queued = null
		queuedReady = false
		cancelScheduled?.()
		cancelScheduled = null
	}

	function queue(request: BackupPushRequest) {
		if (disposed) return
		if (active?.key === request.key) {
			clearQueued()
			latest = active
			return
		}
		if (queued?.key === request.key) return

		clearQueued()
		queued = request
		latest = request
		cancelScheduled = schedule(markQueuedReady, delayMs)
	}

	function markQueuedReady() {
		cancelScheduled = null
		queuedReady = true
		void runReadyPush()
	}

	async function runReadyPush() {
		if (active || activePull || !queuedReady || !queued) return
		let request = queued
		queued = null
		queuedReady = false
		active = request

		try {
			let completed = await request.run()
			if (completed && latest === request) request.commit()
		} catch (error) {
			if (latest === request) request.fail(error)
		} finally {
			active = null
			if (queuedReady) {
				void runReadyPush()
			} else {
				void runReadyPull()
			}
			resolveIdleWaiters()
		}
	}

	function pull(run: () => Promise<void>) {
		if (disposed) return
		pendingPull = run
		void runReadyPull()
	}

	async function runReadyPull() {
		if (activePull || active || queued || !pendingPull) return
		let run = pendingPull
		pendingPull = null
		let pullPromise = Promise.resolve().then(run)
		activePull = pullPromise

		try {
			await pullPromise
		} finally {
			activePull = null
			if (queuedReady) {
				void runReadyPush()
			} else {
				void runReadyPull()
			}
			resolveIdleWaiters()
		}
	}

	function cancel() {
		clearQueued()
		latest = null
		pendingPull = null
		resolveIdleWaiters()
	}

	function cancelPush() {
		clearQueued()
		latest = null
		void runReadyPull()
		resolveIdleWaiters()
	}

	function dispose() {
		disposed = true
		cancel()
	}

	function isBusy() {
		return (
			active !== null ||
			queued !== null ||
			activePull !== null ||
			pendingPull !== null
		)
	}

	function isRunning() {
		return active !== null
	}

	function whenIdle(): Promise<void> {
		if (!isBusy()) return Promise.resolve()
		return new Promise(resolve => idleResolvers.push(resolve))
	}

	function resolveIdleWaiters() {
		if (isBusy()) return
		for (let resolve of idleResolvers) resolve()
		idleResolvers = []
	}

	return {
		cancel,
		cancelPush,
		dispose,
		isBusy,
		isRunning,
		pull,
		queue,
		whenIdle,
	}
}

function getBackupDocumentVersion<T extends BackupDocumentState>(
	document: T,
): BackupDocumentVersion<T> {
	return {
		document,
		id: document.$jazz.id,
		deletedAtMs: document.deletedAt?.getTime() ?? null,
		updatedAtMs: document.updatedAt?.getTime() ?? null,
	}
}

function formatBackupDocumentVersion<T>(
	version: BackupDocumentVersion<T>,
): string {
	let updatedAt = version.updatedAtMs ?? "undefined"
	if (version.deletedAtMs === null) return `${version.id}:${updatedAt}`
	return `${version.id}:${updatedAt}:deleted:${version.deletedAtMs}`
}

function scheduleBackupPush(run: () => void, delayMs: number): () => void {
	let timeout = setTimeout(run, delayMs)
	return function cancelBackupPush() {
		clearTimeout(timeout)
	}
}
