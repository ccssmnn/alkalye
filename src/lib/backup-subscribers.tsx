import { useEffect, useRef, useState } from "react"
import { useAccount, useCoState } from "jazz-tools/react"
import { type ResolveQuery, Group } from "jazz-tools"
import { UserAccount, Space } from "@/schema"
import {
	syncBackup,
	syncFromBackup,
	prepareBackupDoc,
	type LoadedDocument,
} from "@/lib/backup-engine"
import {
	BACKUP_DEBOUNCE_MS,
	SPACE_BACKUP_DEBOUNCE_MS,
	SPACE_BACKUP_KEY_PREFIX,
	useBackupStore,
	useSpaceBackupPath,
	getSpaceBackupPath,
	getBackupHandle,
	getSpaceBackupHandle,
	supportsFileSystemWatch,
	observeDirectoryChanges,
	toTimestamp,
} from "@/lib/backup-storage"

export { BackupSubscriber, SpacesBackupSubscriber, spaceBackupDocumentResolve }

let spaceBackupDocumentResolve = {
	documents: {
		$each: {
			content: true,
			assets: { $each: { image: true, video: true } },
		},
		$onError: "catch",
	},
} as const

let backupQuery = {
	root: {
		documents: {
			$each: { content: true, assets: { $each: { image: true, video: true } } },
			$onError: "catch",
		},
	},
} as const satisfies ResolveQuery<typeof UserAccount>

let spacesBackupQuery = {
	root: {
		spaces: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

let spaceLastPullAtById = new Map<string, number>()

function BackupSubscriber() {
	let {
		enabled,
		bidirectional,
		lastPullAt,
		setLastBackupAt,
		setLastPullAt,
		setLastError,
		setEnabled,
		setDirectoryName,
	} = useBackupStore()
	let me = useAccount(UserAccount, { resolve: backupQuery })
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let lastContentHashRef = useRef<string>("")
	let isPushingRef = useRef(false)
	let isPullingRef = useRef(false)

	useEffect(() => {
		if (!enabled || !me.$isLoaded) return

		let docs = me.root?.documents
		if (!docs?.$isLoaded) return

		let activeDocs = [...docs].filter(d => d?.$isLoaded && !d.deletedAt)
		let contentHash = activeDocs
			.map(d => `${d.$jazz.id}:${d.updatedAt?.getTime()}`)
			.sort()
			.join("|")

		if (contentHash === lastContentHashRef.current) return
		lastContentHashRef.current = contentHash

		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(async () => {
			try {
				let handle = await getBackupHandle()
				if (!handle) {
					setEnabled(false)
					setDirectoryName(null)
					setLastError("Permission lost - please re-enable backup")
					return
				}

				let loadedDocs = activeDocs.filter(
					(d): d is LoadedDocument => d?.$isLoaded === true,
				)
				let backupDocs = await Promise.all(loadedDocs.map(prepareBackupDoc))
				isPushingRef.current = true
				await syncBackup(handle, backupDocs)

				setLastBackupAt(new Date().toISOString())
				setLastError(null)
			} catch (e) {
				setLastError(e instanceof Error ? e.message : "Backup failed")
			} finally {
				isPushingRef.current = false
			}
		}, BACKUP_DEBOUNCE_MS)

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [enabled, me, setLastBackupAt, setLastError, setEnabled, setDirectoryName])

	useEffect(() => {
		if (!enabled || !bidirectional || !me.$isLoaded) return
		if (!supportsFileSystemWatch()) return

		let docs = me.root?.documents
		if (!docs?.$isLoaded) return

		async function doPull() {
			try {
				if (isPushingRef.current) return
				if (isPullingRef.current) return
				isPullingRef.current = true
				let handle = await getBackupHandle()
				if (!handle) return

				if (!docs.$isLoaded || !isDocumentList(docs)) return
				let result = await syncFromBackup(
					handle,
					docs,
					true,
					toTimestamp(lastPullAt),
				)
				if (result.errors.length > 0) {
					console.warn("Backup pull errors:", result.errors)
				}

				setLastPullAt(new Date().toISOString())
			} catch (e) {
				console.error("Backup pull failed:", e)
			} finally {
				isPullingRef.current = false
			}
		}

		let watchAborted = false
		let stopWatching: (() => void) | null = null

		async function setupWatch() {
			let handle = await getBackupHandle()
			if (!handle) return

			let stop = await observeDirectoryChanges(handle, () => {
				if (!watchAborted) doPull()
			})
			if (watchAborted) {
				stop?.()
				return
			}
			stopWatching = stop
		}

		setupWatch()

		return () => {
			watchAborted = true
			stopWatching?.()
		}
	}, [enabled, bidirectional, me, setLastPullAt, lastPullAt])

	return null
}

function SpacesBackupSubscriber() {
	let me = useAccount(UserAccount, { resolve: spacesBackupQuery })
	let [storageVersion, setStorageVersion] = useState(0)

	useEffect(() => {
		function handleStorageChange(e: StorageEvent) {
			if (e.key?.startsWith(SPACE_BACKUP_KEY_PREFIX)) {
				setStorageVersion(v => v + 1)
			}
		}

		window.addEventListener("storage", handleStorageChange)
		return () => window.removeEventListener("storage", handleStorageChange)
	}, [])

	let spacesWithBackup = getSpacesWithBackup(me, storageVersion)

	return (
		<>
			{spacesWithBackup.map(spaceId => (
				<SpaceBackupSubscriber key={spaceId} spaceId={spaceId} />
			))}
		</>
	)
}

interface SpaceBackupSubscriberProps {
	spaceId: string
}

function SpaceBackupSubscriber({ spaceId }: SpaceBackupSubscriberProps) {
	let { directoryName, setDirectoryName } = useSpaceBackupPath(spaceId)
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let lastContentHashRef = useRef<string>("")
	let isPushingRef = useRef(false)
	let isPullingRef = useRef(false)

	let space = useCoState(Space, spaceId, {
		resolve: spaceBackupDocumentResolve,
	})

	useEffect(() => {
		if (!directoryName) return
		if (!space?.$isLoaded || !space.documents?.$isLoaded) return

		let docs = space.documents
		let activeDocs = [...docs].filter(d => d?.$isLoaded && !d.deletedAt)

		let contentHash = activeDocs
			.map(d => `${d.$jazz.id}:${d.updatedAt?.getTime()}`)
			.sort()
			.join("|")

		if (contentHash === lastContentHashRef.current) return
		lastContentHashRef.current = contentHash

		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(async () => {
			try {
				let handle = await getSpaceBackupHandle(spaceId)
				if (!handle) {
					setDirectoryName(null)
					return
				}

				let loadedDocs = activeDocs.filter(
					(d): d is LoadedDocument => d?.$isLoaded === true,
				)
				let backupDocs = await Promise.all(loadedDocs.map(prepareBackupDoc))
				isPushingRef.current = true
				await syncBackup(handle, backupDocs)
			} catch (e) {
				console.error(`Space backup failed for ${spaceId}:`, e)
			} finally {
				isPushingRef.current = false
			}
		}, SPACE_BACKUP_DEBOUNCE_MS)

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [directoryName, space, spaceId, setDirectoryName])

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
				if (isPushingRef.current) return
				if (isPullingRef.current) return
				isPullingRef.current = true
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
			} finally {
				isPullingRef.current = false
			}
		}

		let watchAborted = false
		let stopWatching: (() => void) | null = null

		async function setupWatch() {
			let handle = await getSpaceBackupHandle(spaceId)
			if (!handle) return

			let stop = await observeDirectoryChanges(handle, () => {
				if (!watchAborted) doPull()
			})
			if (watchAborted) {
				stop?.()
				return
			}
			stopWatching = stop
		}

		setupWatch()

		return () => {
			watchAborted = true
			stopWatching?.()
		}
	}, [directoryName, space, spaceId])

	return null
}

function getSpacesWithBackup(
	me: ReturnType<
		typeof useAccount<typeof UserAccount, typeof spacesBackupQuery>
	>,
	_storageVersion: number,
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
