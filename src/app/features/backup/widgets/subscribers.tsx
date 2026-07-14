import { useEffect, useRef, useState } from "react"
import { useAccount, useCoState } from "jazz-tools/react"
import { type ResolveQuery, Group } from "jazz-tools"
import { UserAccount, Space } from "@/schema"
import { syncBackup, syncFromBackup, prepareBackupDocs } from "../lib/engine"
import {
	BACKUP_DEBOUNCE_MS,
	SPACE_BACKUP_DEBOUNCE_MS,
	SPACE_BACKUP_KEY_PREFIX,
	useBackupStore,
	useSpaceBackupPath,
	getSpaceBackupPath,
	getSpaceBackupHash,
	setSpaceBackupHash,
	isSpaceInitialBackupPending,
	subscribeSpaceBackupChanges,
	getBackupHandle,
	getSpaceBackupHandle,
	supportsFileSystemWatch,
	observeDirectoryChanges,
	toTimestamp,
} from "../lib/storage"
import {
	chooseBackupPush,
	createBackupSyncCoordinator,
	hasBackupDocumentsChangedSince,
	selectActiveBackupDocuments,
} from "../lib/subscriber-state"
import { useIntl } from "@/shared/intl/setup"

export {
	BackupSubscriber,
	SpacesBackupSubscriber,
	backupQuery,
	spaceBackupDocumentResolve,
}

let spaceBackupDocumentResolve = {
	documents: { $each: true, $onError: "catch" },
} as const

let backupQuery = {
	root: {
		documents: { $each: true, $onError: "catch" },
	},
} as const satisfies ResolveQuery<typeof UserAccount>

let spacesBackupQuery = {
	root: {
		spaces: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

let spaceLastPullAtById = new Map<string, number>()

function BackupSubscriber() {
	let { enabled } = useBackupStore()
	if (!enabled) return null
	return <ActiveBackupSubscriber />
}

function SpacesBackupSubscriber() {
	let me = useAccount(UserAccount, { resolve: spacesBackupQuery })
	let [, setStorageVersion] = useState(0)

	useEffect(() => {
		let unsubscribe = subscribeSpaceBackupChanges(() => {
			setStorageVersion(v => v + 1)
		})

		function handleStorageChange(e: StorageEvent) {
			if (e.key?.startsWith(SPACE_BACKUP_KEY_PREFIX)) {
				setStorageVersion(v => v + 1)
			}
		}

		window.addEventListener("storage", handleStorageChange)
		return () => {
			unsubscribe()
			window.removeEventListener("storage", handleStorageChange)
		}
	}, [])

	let spacesWithBackup = getSpacesWithBackup(me)

	return (
		<>
			{spacesWithBackup.map(spaceId => (
				<SpaceBackupSubscriber key={spaceId} spaceId={spaceId} />
			))}
		</>
	)
}

function ActiveBackupSubscriber() {
	let t = useIntl()
	let {
		enabled,
		bidirectional,
		directoryName,
		lastBackupAt,
		lastBackupHash,
		lastPullAt,
		setLastBackupAt,
		setLastBackupHash,
		setLastPullAt,
		setLastError,
		setEnabled,
		setDirectoryName,
	} = useBackupStore()
	let me = useAccount(UserAccount, { resolve: backupQuery })
	let [pushCoordinator] = useState(() =>
		createBackupSyncCoordinator(BACKUP_DEBOUNCE_MS),
	)
	let lastContentHashRef = useRef<string | null>(lastBackupHash)
	let directoryGenerationRef = useRef(0)
	let previousDirectoryNameRef = useRef(directoryName)
	let lastPullAtRef = useRef<number | null>(toTimestamp(lastPullAt))

	useEffect(() => {
		lastPullAtRef.current = toTimestamp(lastPullAt)
	}, [lastPullAt])

	useEffect(() => {
		return () => pushCoordinator.dispose()
	}, [pushCoordinator])

	useEffect(() => {
		if (previousDirectoryNameRef.current === directoryName) return
		previousDirectoryNameRef.current = directoryName
		directoryGenerationRef.current += 1
		pushCoordinator.cancel()
		lastContentHashRef.current = lastBackupHash
		lastPullAtRef.current = null
	}, [directoryName, lastBackupHash, pushCoordinator])

	useEffect(() => {
		if (pushCoordinator.isBusy()) return
		lastContentHashRef.current = lastBackupHash
	}, [lastBackupHash, pushCoordinator])

	useEffect(() => {
		if (!enabled || !me.$isLoaded) return

		let docs = me.root?.documents
		if (!docs?.$isLoaded) return

		let selection = selectActiveBackupDocuments(docs.values())
		let { contentHash } = selection
		let changedSinceLastBackup = hasBackupDocumentsChangedSince(
			selection,
			lastBackupAt,
		)
		let previousHash = lastContentHashRef.current ?? lastBackupHash
		let directoryGeneration = directoryGenerationRef.current
		let preparationErrors: string[] = []
		let request = {
			key: `${directoryGeneration}:${contentHash}`,
			async run() {
				let handle = await getBackupHandle()
				if (!handle) {
					if (directoryGeneration !== directoryGenerationRef.current)
						return false
					setEnabled(false)
					setDirectoryName(null)
					setLastError(t("backup.error"))
					return false
				}

				let prepared = await prepareBackupDocs(selection)
				preparationErrors = prepared.errors
				let scopeId = docs.$jazz.id ? `docs:${docs.$jazz.id}` : "docs:unknown"
				await syncBackup(handle, prepared.documents, scopeId, {
					isComplete: selection.isComplete && preparationErrors.length === 0,
					deletedDocumentIds: selection.deletedDocumentIds,
				})
				return true
			},
			commit() {
				if (directoryGeneration !== directoryGenerationRef.current) return
				lastContentHashRef.current = contentHash
				setLastBackupAt(new Date().toISOString())
				setLastBackupHash(contentHash)
				setLastError(
					preparationErrors.length > 0 ? preparationErrors.join("\n") : null,
				)
			},
			fail(error: unknown) {
				if (directoryGeneration !== directoryGenerationRef.current) return
				setLastError(
					error instanceof Error ? error.message : t("backup.failed"),
				)
			},
		}

		let pushChoice = chooseBackupPush(
			previousHash,
			contentHash,
			Boolean(lastBackupAt) && !changedSinceLastBackup,
		)
		if (!pushChoice.shouldPush) {
			if (pushCoordinator.isRunning()) {
				pushCoordinator.queue(request)
				return
			}
			pushCoordinator.cancelPush()
			lastContentHashRef.current = pushChoice.nextHash
			if (lastBackupHash !== contentHash) setLastBackupHash(contentHash)
			return
		}

		pushCoordinator.queue(request)
	}, [
		enabled,
		me,
		directoryName,
		lastBackupAt,
		lastBackupHash,
		setLastBackupAt,
		setLastBackupHash,
		setLastError,
		setEnabled,
		setDirectoryName,
		pushCoordinator,
		t,
	])

	useEffect(() => {
		if (!enabled || !bidirectional || !me.$isLoaded) return
		if (!supportsFileSystemWatch()) return

		let docs = me.root?.documents
		if (!docs?.$isLoaded) return

		async function doPull() {
			try {
				if (watchAborted) return
				let handle = await getBackupHandle()
				if (!handle) return

				if (!docs.$isLoaded || !isDocumentList(docs)) return
				let result = await syncFromBackup(
					handle,
					docs,
					true,
					lastPullAtRef.current,
				)
				if (result.errors.length > 0) {
					console.warn("Backup pull errors:", result.errors)
				}

				let pulledAt = new Date().toISOString()
				lastPullAtRef.current = Date.parse(pulledAt)
				setLastPullAt(pulledAt)
			} catch (e) {
				console.error("Backup pull failed:", e)
			}
		}

		let watchAborted = false
		let stopWatching: (() => void) | null = null

		async function setupWatch() {
			let handle = await getBackupHandle()
			if (!handle) return

			let stop = await observeDirectoryChanges(handle, () => {
				if (!watchAborted) pushCoordinator.pull(doPull)
			})
			if (watchAborted) {
				stop?.()
				return
			}
			stopWatching = stop
			pushCoordinator.pull(doPull)
		}

		setupWatch()

		return () => {
			watchAborted = true
			stopWatching?.()
		}
	}, [
		enabled,
		bidirectional,
		directoryName,
		me,
		pushCoordinator,
		setLastPullAt,
	])

	return null
}

interface SpaceBackupSubscriberProps {
	spaceId: string
}

function SpaceBackupSubscriber({ spaceId }: SpaceBackupSubscriberProps) {
	let { directoryName, setDirectoryName } = useSpaceBackupPath(spaceId)
	let [pushCoordinator] = useState(() =>
		createBackupSyncCoordinator(SPACE_BACKUP_DEBOUNCE_MS),
	)
	let lastContentHashRef = useRef<string | null>(getSpaceBackupHash(spaceId))
	let directoryGenerationRef = useRef(0)
	let previousDirectoryNameRef = useRef(directoryName)

	let space = useCoState(Space, spaceId, {
		resolve: spaceBackupDocumentResolve,
	})

	useEffect(() => {
		return () => pushCoordinator.dispose()
	}, [pushCoordinator])

	useEffect(() => {
		if (previousDirectoryNameRef.current === directoryName) return
		previousDirectoryNameRef.current = directoryName
		directoryGenerationRef.current += 1
		pushCoordinator.cancel()
		lastContentHashRef.current = getSpaceBackupHash(spaceId)
		spaceLastPullAtById.delete(spaceId)
	}, [directoryName, pushCoordinator, spaceId])

	useEffect(() => {
		if (!directoryName) {
			pushCoordinator.cancel()
			lastContentHashRef.current = null
			return
		}
		if (!space?.$isLoaded || !space.documents?.$isLoaded) return

		let docs = space.documents
		let selection = selectActiveBackupDocuments(docs.values())
		let { contentHash } = selection
		let previousHash = lastContentHashRef.current ?? getSpaceBackupHash(spaceId)
		let directoryGeneration = directoryGenerationRef.current
		let preparationErrors: string[] = []
		let request = {
			key: `${directoryGeneration}:${contentHash}`,
			async run() {
				let handle = await getSpaceBackupHandle(spaceId)
				if (!handle) {
					if (directoryGeneration === directoryGenerationRef.current) {
						setDirectoryName(null)
					}
					return false
				}

				let prepared = await prepareBackupDocs(selection)
				preparationErrors = prepared.errors
				let scopeId = docs.$jazz.id ? `docs:${docs.$jazz.id}` : "docs:unknown"
				await syncBackup(handle, prepared.documents, scopeId, {
					isComplete: selection.isComplete && preparationErrors.length === 0,
					deletedDocumentIds: selection.deletedDocumentIds,
				})
				return true
			},
			commit() {
				if (directoryGeneration !== directoryGenerationRef.current) return
				lastContentHashRef.current = contentHash
				setSpaceBackupHash(spaceId, contentHash)
				if (preparationErrors.length > 0) {
					console.error(
						`Space backup skipped documents for ${spaceId}:`,
						preparationErrors,
					)
				}
			},
			fail(error: unknown) {
				if (directoryGeneration !== directoryGenerationRef.current) return
				console.error(`Space backup failed for ${spaceId}:`, error)
			},
		}

		let pushChoice = chooseBackupPush(
			previousHash,
			contentHash,
			!isSpaceInitialBackupPending(spaceId),
		)
		if (!pushChoice.shouldPush) {
			if (pushCoordinator.isRunning()) {
				pushCoordinator.queue(request)
				return
			}
			pushCoordinator.cancelPush()
			lastContentHashRef.current = pushChoice.nextHash
			setSpaceBackupHash(spaceId, contentHash)
			return
		}

		pushCoordinator.queue(request)
	}, [directoryName, pushCoordinator, space, spaceId, setDirectoryName])

	useEffect(() => {
		if (!directoryName) return
		if (!space?.$isLoaded || !space.documents?.$isLoaded) return
		if (!supportsFileSystemWatch()) return

		let docs = space.documents

		let spaceGroup =
			space.$jazz.owner instanceof Group ? space.$jazz.owner : null
		let canWrite =
			spaceGroup?.myRole() === "admin" || spaceGroup?.myRole() === "writer"

		async function doPull() {
			try {
				if (watchAborted) return
				let handle = await getSpaceBackupHandle(spaceId)
				if (!handle) return

				if (!docs.$isLoaded || !isDocumentList(docs)) return
				let result = await syncFromBackup(
					handle,
					docs,
					canWrite,
					spaceLastPullAtById.get(spaceId) ?? null,
				)
				if (result.errors.length > 0) {
					console.warn(`Space ${spaceId} pull errors:`, result.errors)
				}
				spaceLastPullAtById.set(spaceId, Date.now())
			} catch (e) {
				console.error(`Space backup pull failed for ${spaceId}:`, e)
			}
		}

		let watchAborted = false
		let stopWatching: (() => void) | null = null

		async function setupWatch() {
			let handle = await getSpaceBackupHandle(spaceId)
			if (!handle) return

			let stop = await observeDirectoryChanges(handle, () => {
				if (!watchAborted) pushCoordinator.pull(doPull)
			})
			if (watchAborted) {
				stop?.()
				return
			}
			stopWatching = stop
			pushCoordinator.pull(doPull)
		}

		setupWatch()

		return () => {
			watchAborted = true
			stopWatching?.()
		}
	}, [directoryName, pushCoordinator, space, spaceId])

	return null
}

function getSpacesWithBackup(
	me: ReturnType<
		typeof useAccount<typeof UserAccount, typeof spacesBackupQuery>
	>,
): string[] {
	if (!me.$isLoaded || !me.root?.spaces?.$isLoaded) return []

	let spaceIds: string[] = []
	for (let space of Array.from(me.root.spaces)) {
		if (!space?.$isLoaded) continue
		let backupPath = getSpaceBackupPath(space.$jazz.id)
		if (backupPath) {
			spaceIds.push(space.$jazz.id)
		}
	}
	return spaceIds
}

function isDocumentList(value: unknown): boolean {
	if (typeof value !== "object" || value === null) return false
	return "$jazz" in value && "find" in value
}
