import { beforeEach, describe, expect, test } from "vitest"
import {
	getSpaceBackupHash,
	getSpaceBackupPath,
	isSpaceInitialBackupPending,
	clearSpaceBackupPath,
	setBackupDirectoryFreshnessPending,
	setSpaceBackupHash,
	setSpaceBackupPath,
	subscribeSpaceBackupChanges,
	useBackupStore,
} from "./storage"

describe("backup storage", () => {
	beforeEach(() => {
		localStorage.clear()
		useBackupStore.getState().reset()
	})

	test("new space backup starts with initial backup pending", () => {
		setSpaceBackupPath("space-1", "Backups")

		expect(getSpaceBackupPath("space-1")).toBe("Backups")
		expect(getSpaceBackupHash("space-1")).toBe(null)
		expect(isSpaceInitialBackupPending("space-1")).toBe(true)
	})

	test("space backup hash clears initial backup pending", () => {
		setSpaceBackupPath("space-1", "Backups")
		setSpaceBackupHash("space-1", "docs:1")

		expect(getSpaceBackupHash("space-1")).toBe("docs:1")
		expect(isSpaceInitialBackupPending("space-1")).toBe(false)
	})

	test("notifies same tab when space backup storage changes", () => {
		let changedSpaceIds: string[] = []
		let unsubscribe = subscribeSpaceBackupChanges(spaceId => {
			changedSpaceIds.push(spaceId)
		})

		setSpaceBackupPath("space-1", "Backups")
		setSpaceBackupHash("space-1", "docs:1")
		clearSpaceBackupPath("space-1")
		unsubscribe()
		setSpaceBackupPath("space-2", "Other Backups")

		expect(changedSpaceIds).toEqual(["space-1", "space-1", "space-1"])
	})

	test("changing global backup directory clears backup freshness", () => {
		useBackupStore.getState().setLastBackupAt("2026-01-01T00:00:00.000Z")
		useBackupStore.getState().setLastBackupHash("docs:1")
		useBackupStore.getState().setLastPullAt("2026-01-01T00:00:00.000Z")

		setBackupDirectoryFreshnessPending("New Backups")

		expect(useBackupStore.getState().directoryName).toBe("New Backups")
		expect(useBackupStore.getState().lastBackupAt).toBe(null)
		expect(useBackupStore.getState().lastBackupHash).toBe(null)
		expect(useBackupStore.getState().lastPullAt).toBe(null)
	})
})
