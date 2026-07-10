import { describe, expect, test } from "vitest"
import {
	chooseBackupPush,
	createBackupSyncCoordinator,
	hasBackupDocumentsChangedSince,
	selectActiveBackupDocuments,
} from "./subscriber-state"

describe("backup subscriber state", () => {
	test("uses existing backup first mount as baseline", () => {
		expect(chooseBackupPush(null, "docs:1", true)).toEqual({
			nextHash: "docs:1",
			shouldPush: false,
		})
	})

	test("pushes on first enable without existing backup", () => {
		expect(chooseBackupPush(null, "docs:1", false)).toEqual({
			nextHash: "docs:1",
			shouldPush: true,
		})
	})

	test("pushes after observed hash changes", () => {
		expect(chooseBackupPush("docs:1", "docs:2", true)).toEqual({
			nextHash: "docs:2",
			shouldPush: true,
		})
	})

	test("selects active documents and versions loaded deletions", () => {
		let newest = backupDocument("doc-b", new Date("2026-07-10T12:00:00Z"))
		let oldest = backupDocument("doc-a", new Date("2026-07-09T12:00:00Z"))
		let deleted = backupDocument(
			"doc-c",
			new Date("2026-07-10T13:00:00Z"),
			new Date("2026-07-10T13:00:00Z"),
		)
		let unloaded = { ...backupDocument("doc-d", undefined), $isLoaded: false }

		let selection = selectActiveBackupDocuments([
			newest,
			null,
			deleted,
			unloaded,
			oldest,
		])

		expect(selection.documents).toEqual([newest, oldest])
		expect(selection.versions.map(version => version.document)).toEqual([
			newest,
			deleted,
			oldest,
		])
		expect(selection.deletedDocumentIds).toEqual(["doc-c"])
		expect(selection.unresolvedSlots).toBe(2)
		expect(selection.isComplete).toBe(false)
		expect(selection.contentHash).toBe(
			`doc-a:${oldest.updatedAt?.getTime()}|doc-b:${newest.updatedAt?.getTime()}|doc-c:${deleted.updatedAt?.getTime()}:deleted:${deleted.deletedAt?.getTime()}|unresolved:2`,
		)
	})

	test("marks a fully resolved selection complete", () => {
		let selection = selectActiveBackupDocuments([
			backupDocument("doc-a", undefined),
		])

		expect(selection.unresolvedSlots).toBe(0)
		expect(selection.isComplete).toBe(true)
	})

	test("includes documents without an updated timestamp", () => {
		let doc = backupDocument("doc-a", undefined)

		expect(selectActiveBackupDocuments([doc]).contentHash).toBe(
			"doc-a:undefined",
		)
	})

	test("treats loaded deletion after last backup as changed", () => {
		let deleted = backupDocument(
			"doc-a",
			new Date("2026-07-10T12:01:00Z"),
			new Date("2026-07-10T12:01:00Z"),
		)
		let selection = selectActiveBackupDocuments([deleted])

		expect(
			hasBackupDocumentsChangedSince(selection, "2026-07-10T12:00:00Z"),
		).toBe(true)
	})
})

describe("backup push coordinator", () => {
	test("serializes pushes and only commits the newest queued hash", async () => {
		let scheduler = createManualScheduler()
		let first = makeDeferred()
		let activePushes = 0
		let maxActivePushes = 0
		let runs: string[] = []
		let commits: string[] = []
		let coordinator = createBackupSyncCoordinator(10, scheduler.schedule)

		coordinator.queue(
			pushRequest(
				"0:first",
				async () => {
					activePushes += 1
					maxActivePushes = Math.max(maxActivePushes, activePushes)
					runs.push("first")
					await first.promise
					activePushes -= 1
					return true
				},
				commits,
			),
		)
		scheduler.runNext()
		await Promise.resolve()

		coordinator.queue(
			pushRequest(
				"0:second",
				async () => {
					activePushes += 1
					maxActivePushes = Math.max(maxActivePushes, activePushes)
					runs.push("second")
					activePushes -= 1
					return true
				},
				commits,
			),
		)
		scheduler.runNext()
		expect(coordinator.isBusy()).toBe(true)
		expect(runs).toEqual(["first"])

		first.resolve()
		await coordinator.whenIdle()

		expect(maxActivePushes).toBe(1)
		expect(runs).toEqual(["first", "second"])
		expect(commits).toEqual(["0:second"])
	})

	test("keeps queued debounce work busy and replaces its snapshot", async () => {
		let scheduler = createManualScheduler()
		let runs: string[] = []
		let commits: string[] = []
		let coordinator = createBackupSyncCoordinator(10, scheduler.schedule)

		coordinator.queue(pushRequest("0:first", recordRun("first", runs), commits))
		coordinator.queue(
			pushRequest("0:second", recordRun("second", runs), commits),
		)

		expect(coordinator.isBusy()).toBe(true)
		scheduler.runNext()
		await coordinator.whenIdle()

		expect(runs).toEqual(["second"])
		expect(commits).toEqual(["0:second"])
	})

	test("invalidates active completion when generation is cancelled", async () => {
		let scheduler = createManualScheduler()
		let delayed = makeDeferred()
		let commits: string[] = []
		let coordinator = createBackupSyncCoordinator(10, scheduler.schedule)

		coordinator.queue(
			pushRequest(
				"0:first",
				async () => {
					await delayed.promise
					return true
				},
				commits,
			),
		)
		scheduler.runNext()
		await Promise.resolve()
		coordinator.cancel()
		delayed.resolve()
		await coordinator.whenIdle()

		expect(commits).toEqual([])
	})

	test("defers a watched pull until queued and running pushes finish", async () => {
		let scheduler = createManualScheduler()
		let push = makeDeferred()
		let order: string[] = []
		let coordinator = createBackupSyncCoordinator(10, scheduler.schedule)

		coordinator.queue({
			...pushRequest(
				"push",
				async () => {
					order.push("push:start")
					await push.promise
					order.push("push:end")
					return true
				},
				[],
			),
		})
		coordinator.pull(async () => {
			order.push("pull")
		})

		expect(order).toEqual([])
		scheduler.runNext()
		await Promise.resolve()
		expect(order).toEqual(["push:start"])

		push.resolve()
		await coordinator.whenIdle()
		expect(order).toEqual(["push:start", "push:end", "pull"])
	})

	test("runs a pending pull after cancelling a queued push", async () => {
		let scheduler = createManualScheduler()
		let pushRuns: string[] = []
		let pullRuns = 0
		let coordinator = createBackupSyncCoordinator(10, scheduler.schedule)

		coordinator.queue(pushRequest("push", recordRun("push", pushRuns), []))
		coordinator.pull(async () => {
			pullRuns += 1
		})
		coordinator.cancelPush()
		await coordinator.whenIdle()

		expect(pushRuns).toEqual([])
		expect(pullRuns).toBe(1)
	})

	test("waits for an active pull before beginning a push", async () => {
		let scheduler = createManualScheduler()
		let pull = makeDeferred()
		let order: string[] = []
		let coordinator = createBackupSyncCoordinator(10, scheduler.schedule)

		coordinator.pull(async () => {
			order.push("pull:start")
			await pull.promise
			order.push("pull:end")
		})
		await Promise.resolve()
		coordinator.queue(pushRequest("push", recordRun("push", order), []))
		scheduler.runNext()
		await Promise.resolve()

		expect(order).toEqual(["pull:start"])
		pull.resolve()
		await coordinator.whenIdle()
		expect(order).toEqual(["pull:start", "pull:end", "push"])
	})
})

function backupDocument(id: string, updatedAt?: Date, deletedAt?: Date) {
	return {
		$isLoaded: true,
		$jazz: { id },
		deletedAt,
		updatedAt,
	}
}

function pushRequest(
	key: string,
	run: () => Promise<boolean>,
	commits: string[],
) {
	return {
		key,
		run,
		commit() {
			commits.push(key)
		},
		fail(error: unknown) {
			throw error
		},
	}
}

function recordRun(name: string, runs: string[]) {
	return async function run() {
		runs.push(name)
		return true
	}
}

function createManualScheduler() {
	let scheduled: Array<{ cancelled: boolean; run: () => void }> = []

	function schedule(run: () => void) {
		let task = { cancelled: false, run }
		scheduled.push(task)
		return function cancel() {
			task.cancelled = true
		}
	}

	function runNext() {
		let task = scheduled.find(candidate => !candidate.cancelled)
		if (!task) throw new Error("No scheduled backup push")
		task.cancelled = true
		task.run()
	}

	return { runNext, schedule }
}

function makeDeferred() {
	let resolvePromise: (() => void) | undefined
	let promise = new Promise<void>(resolve => {
		resolvePromise = resolve
	})

	return {
		promise,
		resolve() {
			resolvePromise?.()
		},
	}
}
