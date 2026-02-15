import { useState } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval"

export {
	BACKUP_DEBOUNCE_MS,
	SPACE_BACKUP_DEBOUNCE_MS,
	SPACE_BACKUP_KEY_PREFIX,
	useBackupStore,
	enableBackup,
	disableBackup,
	changeBackupDirectory,
	checkBackupPermission,
	getSpaceBackupPath,
	setSpaceBackupPath,
	clearSpaceBackupPath,
	useSpaceBackupPath,
	getBackupHandle,
	getSpaceBackupHandle,
	setSpaceBackupHandle,
	clearSpaceBackupHandle,
	supportsFileSystemWatch,
	isBackupSupported,
	observeDirectoryChanges,
	toTimestamp,
}

declare global {
	interface FileSystemObserver {
		observe(
			handle: FileSystemDirectoryHandle,
			options?: { recursive?: boolean },
		): Promise<void>
		disconnect(): void
	}

	interface Window {
		FileSystemObserver?: {
			new (
				onChange: (records: unknown[], observer: FileSystemObserver) => void,
			): FileSystemObserver
		}
		showDirectoryPicker(options?: {
			mode?: "read" | "readwrite"
		}): Promise<FileSystemDirectoryHandle>
	}

	interface FileSystemDirectoryHandle {
		entries(): AsyncIterableIterator<[string, FileSystemHandle]>
		queryPermission(options: {
			mode: "read" | "readwrite"
		}): Promise<"granted" | "denied" | "prompt">
		requestPermission(options: {
			mode: "read" | "readwrite"
		}): Promise<"granted" | "denied" | "prompt">
	}
}

let BACKUP_DEBOUNCE_MS = 1200
let SPACE_BACKUP_DEBOUNCE_MS = 1200
let HANDLE_STORAGE_KEY = "backup-directory-handle"
let SPACE_BACKUP_KEY_PREFIX = "backup-settings-space-"

interface BackupState {
	enabled: boolean
	bidirectional: boolean
	directoryName: string | null
	lastBackupAt: string | null
	lastPullAt: string | null
	lastError: string | null
	setEnabled: (enabled: boolean) => void
	setBidirectional: (bidirectional: boolean) => void
	setDirectoryName: (name: string | null) => void
	setLastBackupAt: (date: string | null) => void
	setLastPullAt: (date: string | null) => void
	setLastError: (error: string | null) => void
	reset: () => void
}

interface SpaceBackupState {
	directoryName: string | null
}

let useBackupStore = create<BackupState>()(
	persist(
		set => ({
			enabled: false,
			bidirectional: true,
			directoryName: null,
			lastBackupAt: null,
			lastPullAt: null,
			lastError: null,
			setEnabled: enabled => set({ enabled }),
			setBidirectional: bidirectional => set({ bidirectional }),
			setDirectoryName: directoryName => set({ directoryName }),
			setLastBackupAt: lastBackupAt => set({ lastBackupAt }),
			setLastPullAt: lastPullAt => set({ lastPullAt }),
			setLastError: lastError => set({ lastError }),
			reset: () =>
				set({
					enabled: false,
					bidirectional: true,
					directoryName: null,
					lastBackupAt: null,
					lastPullAt: null,
					lastError: null,
				}),
		}),
		{ name: "backup-settings" },
	),
)

async function enableBackup(): Promise<{
	success: boolean
	directoryName?: string
	error?: string
}> {
	let handle = await requestBackupDirectory()
	if (!handle) return { success: false, error: "Cancelled" }

	useBackupStore.getState().setEnabled(true)
	useBackupStore.getState().setDirectoryName(handle.name)
	useBackupStore.getState().setLastError(null)

	return { success: true, directoryName: handle.name }
}

async function disableBackup(): Promise<void> {
	await clearHandle()
	useBackupStore.getState().reset()
}

async function changeBackupDirectory(): Promise<{
	success: boolean
	directoryName?: string
	error?: string
}> {
	let handle = await requestBackupDirectory()
	if (!handle) return { success: false, error: "Cancelled" }

	useBackupStore.getState().setDirectoryName(handle.name)
	useBackupStore.getState().setLastError(null)
	return { success: true, directoryName: handle.name }
}

async function checkBackupPermission(): Promise<boolean> {
	let handle = await getBackupHandle()
	return handle !== null
}

function getSpaceBackupPath(spaceId: string): string | null {
	try {
		let key = getSpaceBackupStorageKey(spaceId)
		let stored = localStorage.getItem(key)
		if (!stored) return null
		let parsed = JSON.parse(stored)
		if (!isSpaceBackupState(parsed)) return null
		return parsed.directoryName
	} catch {
		return null
	}
}

function setSpaceBackupPath(spaceId: string, directoryName: string): void {
	let key = getSpaceBackupStorageKey(spaceId)
	let state: SpaceBackupState = { directoryName }
	localStorage.setItem(key, JSON.stringify(state))
}

function clearSpaceBackupPath(spaceId: string): void {
	let key = getSpaceBackupStorageKey(spaceId)
	localStorage.removeItem(key)
}

function useSpaceBackupPath(spaceId: string): {
	directoryName: string | null
	setDirectoryName: (name: string | null) => void
} {
	let [directoryName, setDirectoryNameState] = useState<string | null>(() =>
		getSpaceBackupPath(spaceId),
	)

	function setDirectoryName(name: string | null) {
		if (name) {
			setSpaceBackupPath(spaceId, name)
		} else {
			clearSpaceBackupPath(spaceId)
		}
		setDirectoryNameState(name)
	}

	return { directoryName, setDirectoryName }
}

async function getBackupHandle(): Promise<FileSystemDirectoryHandle | null> {
	let handle = await getStoredHandle()
	if (!handle) return null
	let hasPermission = await verifyPermission(handle)
	if (!hasPermission) return null
	return handle
}

async function getSpaceBackupHandle(
	spaceId: string,
): Promise<FileSystemDirectoryHandle | null> {
	try {
		let handle = await idbGet<FileSystemDirectoryHandle>(
			`${HANDLE_STORAGE_KEY}-space-${spaceId}`,
		)
		if (!handle) return null
		let hasPermission = await verifyPermission(handle)
		if (!hasPermission) return null
		return handle
	} catch {
		return null
	}
}

async function setSpaceBackupHandle(
	spaceId: string,
	handle: FileSystemDirectoryHandle,
): Promise<void> {
	await idbSet(`${HANDLE_STORAGE_KEY}-space-${spaceId}`, handle)
}

async function clearSpaceBackupHandle(spaceId: string): Promise<void> {
	await idbDel(`${HANDLE_STORAGE_KEY}-space-${spaceId}`)
}

function supportsFileSystemWatch(): boolean {
	return typeof window.FileSystemObserver === "function"
}

function isBackupSupported(): boolean {
	return "showDirectoryPicker" in window
}

async function observeDirectoryChanges(
	handle: FileSystemDirectoryHandle,
	onChange: () => void,
): Promise<(() => void) | null> {
	let Observer = window.FileSystemObserver
	if (!Observer) return null

	let observer = new Observer(() => {
		onChange()
	})
	await observer.observe(handle, { recursive: true })
	return () => observer.disconnect()
}

function toTimestamp(value: string | null): number | null {
	if (!value) return null
	let ms = Date.parse(value)
	return Number.isNaN(ms) ? null : ms
}

function getSpaceBackupStorageKey(spaceId: string): string {
	return `${SPACE_BACKUP_KEY_PREFIX}${spaceId}`
}

function isSpaceBackupState(value: unknown): value is SpaceBackupState {
	if (typeof value !== "object" || value === null) return false
	if (!("directoryName" in value)) return false
	return value.directoryName === null || typeof value.directoryName === "string"
}

async function getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
	try {
		let handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_STORAGE_KEY)
		return handle ?? null
	} catch {
		return null
	}
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
	await idbSet(HANDLE_STORAGE_KEY, handle)
}

async function clearHandle(): Promise<void> {
	await idbDel(HANDLE_STORAGE_KEY)
}

async function verifyPermission(
	handle: FileSystemDirectoryHandle,
): Promise<boolean> {
	let opts: { mode: "readwrite" } = { mode: "readwrite" }
	if ((await handle.queryPermission(opts)) === "granted") return true
	if ((await handle.requestPermission(opts)) === "granted") return true
	return false
}

async function requestBackupDirectory(): Promise<FileSystemDirectoryHandle | null> {
	try {
		let handle = await window.showDirectoryPicker({ mode: "readwrite" })
		await storeHandle(handle)
		return handle
	} catch (e) {
		if (e instanceof Error && e.name === "AbortError") return null
		throw e
	}
}
