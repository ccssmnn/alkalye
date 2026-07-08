import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { LocalNode } from "cojson"
import type { CoValueCore } from "cojson"
import {
	createJazzTestAccount,
	setupJazzTestSync,
	setActiveAccount,
	TestJSCrypto,
} from "jazz-tools/testing"
import { Group, co } from "jazz-tools"
import {
	UserAccount,
	UserProfile,
	UserRoot,
	Document,
	Space,
	Theme,
} from "@/schema"
import {
	runAccountMigration,
	setMigrationFullDownloadTimeout,
} from "./migrations"

let BareAccount = co
	.account({ profile: UserProfile, root: UserRoot })
	.withMigration((account, creationProps?: { name: string }) => {
		if (!account.$jazz.has("profile")) {
			let profileGroup = Group.create()
			profileGroup.makePublic()
			account.$jazz.set(
				"profile",
				UserProfile.create(
					{ name: creationProps?.name ?? "Fixture" },
					profileGroup,
				),
			)
		}
	})

let MinimalRootAccount = co
	.account({ profile: UserProfile, root: UserRoot })
	.withMigration((account, creationProps?: { name: string }) => {
		if (!account.$jazz.has("profile")) {
			let profileGroup = Group.create()
			profileGroup.makePublic()
			account.$jazz.set(
				"profile",
				UserProfile.create(
					{ name: creationProps?.name ?? "Minimal" },
					profileGroup,
				),
			)
		}
		if (!account.$jazz.has("root")) {
			account.$jazz.set(
				"root",
				UserRoot.create({
					documents: co.list(Document).create([]),
					migrationVersion: 1,
				}),
			)
		}
	})

function feedAllChunks(from: CoValueCore, into: LocalNode) {
	let content = from.verified?.newContentSince(undefined)
	if (!content) return
	for (let chunk of content) into.syncManager.handleNewContent(chunk, "import")
}

describe("runAccountMigration - new account creation", () => {
	beforeEach(async () => {
		await setupJazzTestSync()
	})

	test("creates root, welcome document, settings, spaces, themes and profile", async () => {
		let account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let loaded = await account.$jazz.ensureLoaded({
			resolve: {
				profile: true,
				root: {
					documents: { $each: { content: true } },
					settings: true,
					spaces: true,
					themes: true,
				},
			},
		})

		expect(loaded.root.$isLoaded).toBe(true)
		expect(loaded.root.documents.length).toBe(1)
		expect(loaded.root.documents[0]?.content?.toString()).toContain("Welcome")
		expect(loaded.root.settings?.$isLoaded).toBe(true)
		expect(loaded.root.spaces?.$isLoaded).toBe(true)
		expect(loaded.root.themes?.$isLoaded).toBe(true)
		expect(loaded.profile.name.length).toBeGreaterThan(0)
	})
})

describe("runAccountMigration - idempotency on a fully loaded account", () => {
	beforeEach(async () => {
		await setupJazzTestSync()
	})

	test("re-running the migration replaces no pointers", async () => {
		let account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let before = await account.$jazz.ensureLoaded({
			resolve: { root: { documents: true, spaces: true } },
		})
		let rootIdBefore = before.root.$jazz.id
		let documentsIdBefore = before.root.documents.$jazz.id
		let spacesIdBefore = before.root.spaces?.$jazz.id

		await runAccountMigration(account)

		let after = await account.$jazz.ensureLoaded({
			resolve: { root: { documents: true, spaces: true } },
		})
		expect(after.root.$jazz.id).toBe(rootIdBefore)
		expect(after.root.documents.$jazz.id).toBe(documentsIdBefore)
		expect(after.root.spaces?.$jazz.id).toBe(spacesIdBefore)
	})

	test("a login-shaped run never creates a new root or overwrites pointers", async () => {
		let account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let before = await account.$jazz.ensureLoaded({
			resolve: { root: { documents: true, spaces: true } },
		})
		let rootPointerBefore = account.$jazz.raw.get("root")
		let documentsIdBefore = before.root.documents.$jazz.id
		let spacesIdBefore = before.root.spaces?.$jazz.id

		await runAccountMigration(account, undefined)

		expect(account.$jazz.raw.get("root")).toBe(rootPointerBefore)
		let after = await account.$jazz.ensureLoaded({
			resolve: { root: { documents: true, spaces: true } },
		})
		expect(after.root.documents.$jazz.id).toBe(documentsIdBefore)
		expect(after.root.spaces?.$jazz.id).toBe(spacesIdBefore)
	})
})

describe("runAccountMigration - guarded backfill of missing keys", () => {
	beforeEach(async () => {
		await setupJazzTestSync()
	})

	test("adds missing optional collections on a fully downloaded existing account", async () => {
		let account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: MinimalRootAccount,
		})

		let { root: before } = await account.$jazz.ensureLoaded({
			resolve: { root: true },
		})
		expect(before.$jazz.has("spaces")).toBe(false)
		expect(before.$jazz.has("settings")).toBe(false)
		expect(before.$jazz.has("themes")).toBe(false)

		let migrationAccount = UserAccount.getMe()
		await runAccountMigration(migrationAccount)

		let { root: after } = await migrationAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true, settings: true, themes: true } },
		})
		expect(after.spaces?.$isLoaded).toBe(true)
		expect(after.settings?.$isLoaded).toBe(true)
		expect(after.themes?.$isLoaded).toBe(true)
	})
})

// Push a transaction larger than the recommended size into a CoMap so cojson
// records an intermediate signature after it. Transactions made afterwards
// land in a separate syncable piece that can be withheld, leaving the CoMap
// available but still streaming - with the later-set keys reported as missing.
function bloatCoMap(core: CoValueCore) {
	let oversizedValue = "x".repeat(200 * 1024)
	core.makeTransaction(
		[{ op: "set", key: "streamingFiller", value: oversizedValue }],
		"trusting",
	)
}

async function buildAccountWithRealRoot(
	options: { withOptionalCollections: boolean } = {
		withOptionalCollections: true,
	},
) {
	let account = await createJazzTestAccount({
		isCurrentActiveAccount: true,
		AccountSchema: BareAccount,
	})

	let doc = Document.create(
		{
			version: 1,
			content: co.plainText().create("real content", account),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		account,
	)
	let realRoot = UserRoot.create(
		{
			documents: co.list(Document).create([doc], account),
			migrationVersion: 1,
		},
		account,
	)
	if (options.withOptionalCollections) {
		realRoot.$jazz.set("spaces", co.list(Space).create([], account))
		realRoot.$jazz.set("themes", co.list(Theme).create([], account))
	}

	bloatCoMap(account.$jazz.raw.core)
	account.$jazz.set("root", realRoot)
	await account.$jazz.waitForAllCoValuesSync()

	return { account, realRoot }
}

// Rebuilds the account on a fresh node (same agent secret, new session, like a
// login on a new device) with the given CoValue's final content piece withheld,
// so that CoValue is available but still streaming when the migration runs.
async function loadOnNodeStreaming(
	account: co.loaded<typeof BareAccount>,
	streamingCore: CoValueCore,
) {
	let crypto = await TestJSCrypto.create()
	let rawAccountId = account.$jazz.raw.id
	let agentSecret = account.$jazz.localNode.getCurrentAgent().agentSecret
	let freshNode = new LocalNode(
		agentSecret,
		crypto.newRandomSessionID(rawAccountId),
		crypto,
	)

	let sourceNode = account.$jazz.localNode
	for (let core of sourceNode.allCoValues()) {
		if (core.id === streamingCore.id) continue
		feedAllChunks(core, freshNode)
	}

	let streamingContent = streamingCore.verified?.newContentSince(undefined)
	if (!streamingContent) throw new Error("no content to stream")
	let withheldChunk = streamingContent[streamingContent.length - 1]
	for (let chunk of streamingContent.slice(0, -1)) {
		freshNode.syncManager.handleNewContent(chunk, "import")
	}

	let controlledAccount = BareAccount.getCoValueClass().fromNode(freshNode)
	setActiveAccount(controlledAccount)

	return {
		freshNode,
		rawAccountId,
		chunkCount: streamingContent.length,
		withheldChunk,
	}
}

// Pins the original incident: signing into an existing account on a fresh
// device runs the migration against a streaming account where has("root") is
// false, and the pre-fix migration created a fresh empty root that replaced
// the real one everywhere. Protection comes from the creationProps split - a
// login-shaped run has no root-creation path at all.
describe("runAccountMigration - account streaming data loss (regression)", () => {
	beforeEach(async () => {
		setMigrationFullDownloadTimeout(500)
		await setupJazzTestSync()
	})

	afterEach(() => {
		setMigrationFullDownloadTimeout(10_000)
	})

	test("never creates a root on a login against a streaming account (original incident)", async () => {
		let { account, realRoot } = await buildAccountWithRealRoot()
		let { freshNode, rawAccountId, chunkCount, withheldChunk } =
			await loadOnNodeStreaming(account, account.$jazz.raw.core)

		expect(chunkCount).toBeGreaterThan(1)

		let accountCore = freshNode.getCoValue(rawAccountId)
		expect(accountCore.isAvailable()).toBe(true)
		expect(accountCore.isStreaming()).toBe(true)
		expect(accountCore.isCompletelyDownloaded()).toBe(false)

		let migrationAccount = UserAccount.getMe()
		expect(migrationAccount.$jazz.has("profile")).toBe(true)
		expect(migrationAccount.$jazz.has("root")).toBe(false)

		setTimeout(() => {
			freshNode.syncManager.handleNewContent(withheldChunk, "import")
		}, 50)

		await runAccountMigration(migrationAccount)

		expect(migrationAccount.$jazz.raw.get("root")).toBe(realRoot.$jazz.id)
	})

	test("writes nothing when the account never finishes streaming", async () => {
		let { account } = await buildAccountWithRealRoot()
		await loadOnNodeStreaming(account, account.$jazz.raw.core)

		let migrationAccount = UserAccount.getMe()
		expect(migrationAccount.$jazz.has("root")).toBe(false)

		await runAccountMigration(migrationAccount)

		expect(migrationAccount.$jazz.raw.get("root")).toBeUndefined()
	})

	// Pins the account-level isFullyDownloaded gate: without it, has("root") on
	// the still-streaming account reads false and the migration returns before
	// backfilling, silently skipping the missing collections on this login.
	test("backfills missing collections once the account finishes streaming", async () => {
		let { account } = await buildAccountWithRealRoot({
			withOptionalCollections: false,
		})
		let { freshNode, withheldChunk } = await loadOnNodeStreaming(
			account,
			account.$jazz.raw.core,
		)

		let migrationAccount = UserAccount.getMe()
		expect(migrationAccount.$jazz.has("root")).toBe(false)

		setTimeout(() => {
			freshNode.syncManager.handleNewContent(withheldChunk, "import")
		}, 50)

		await runAccountMigration(migrationAccount)

		let { root } = await migrationAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true, settings: true, themes: true } },
		})
		expect(root.spaces?.$isLoaded).toBe(true)
		expect(root.settings?.$isLoaded).toBe(true)
		expect(root.themes?.$isLoaded).toBe(true)
	})
})

async function buildAccountWithStreamingRoot() {
	let account = await createJazzTestAccount({
		isCurrentActiveAccount: true,
		AccountSchema: BareAccount,
	})

	let doc = Document.create(
		{
			version: 1,
			content: co.plainText().create("real content", account),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		account,
	)
	let realRoot = UserRoot.create(
		{
			documents: co.list(Document).create([doc], account),
			migrationVersion: 1,
		},
		account,
	)

	bloatCoMap(realRoot.$jazz.raw.core)
	let realSpaces = co.list(Space).create([], account)
	let realThemes = co.list(Theme).create([], account)
	realRoot.$jazz.set("spaces", realSpaces)
	realRoot.$jazz.set("themes", realThemes)

	account.$jazz.set("root", realRoot)
	await account.$jazz.waitForAllCoValuesSync()

	return { account, realRoot, realSpaces, realThemes }
}

describe("runAccountMigration - root streaming data loss (regression)", () => {
	beforeEach(async () => {
		setMigrationFullDownloadTimeout(500)
		await setupJazzTestSync()
	})

	afterEach(() => {
		setMigrationFullDownloadTimeout(10_000)
	})

	test("waits for the root to finish streaming instead of backfilling collections that exist", async () => {
		let { account, realRoot, realSpaces, realThemes } =
			await buildAccountWithStreamingRoot()
		let { freshNode, rawAccountId, chunkCount, withheldChunk } =
			await loadOnNodeStreaming(account, realRoot.$jazz.raw.core)

		expect(chunkCount).toBeGreaterThan(1)
		expect(freshNode.getCoValue(rawAccountId).isCompletelyDownloaded()).toBe(
			true,
		)

		let rootCore = freshNode.getCoValue(realRoot.$jazz.raw.id)
		expect(rootCore.isAvailable()).toBe(true)
		expect(rootCore.isStreaming()).toBe(true)
		expect(rootCore.isCompletelyDownloaded()).toBe(false)

		let migrationAccount = UserAccount.getMe()
		expect(migrationAccount.$jazz.has("root")).toBe(true)

		setTimeout(() => {
			freshNode.syncManager.handleNewContent(withheldChunk, "import")
		}, 50)

		await runAccountMigration(migrationAccount)

		let { root } = await migrationAccount.$jazz.ensureLoaded({
			resolve: { root: true },
		})
		expect(root.$jazz.raw.get("spaces")).toBe(realSpaces.$jazz.id)
		expect(root.$jazz.raw.get("themes")).toBe(realThemes.$jazz.id)
	})

	test("writes nothing when the root never finishes streaming", async () => {
		let { account, realRoot, realSpaces, realThemes } =
			await buildAccountWithStreamingRoot()
		let { freshNode, withheldChunk } = await loadOnNodeStreaming(
			account,
			realRoot.$jazz.raw.core,
		)

		let migrationAccount = UserAccount.getMe()
		await runAccountMigration(migrationAccount)

		// Deliver the remaining chunk only after the migration gave up. Had the
		// migration written fresh empty lists against the partial root, those
		// writes would be newer and win last-writer-wins over the real pointers.
		freshNode.syncManager.handleNewContent(withheldChunk, "import")

		let { root } = await migrationAccount.$jazz.ensureLoaded({
			resolve: { root: true },
		})
		expect(root.$jazz.raw.get("spaces")).toBe(realSpaces.$jazz.id)
		expect(root.$jazz.raw.get("themes")).toBe(realThemes.$jazz.id)
	})
})
