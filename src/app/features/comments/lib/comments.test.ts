import { describe, expect, test } from "vitest"
import { co } from "jazz-tools"
import { Group } from "jazz-tools"
import {
	createJazzTestAccount,
	setActiveAccount,
	setupJazzTestSync,
} from "jazz-tools/testing"
import { CommentThread, Document, UserAccount } from "@/schema"
import {
	addCommentReply,
	applyContentDiffWithCommentAnchors,
	areCommentsEnabled,
	cloneCommentThreads,
	copyCommentsAndApplyContent,
	createCommentThread,
	deleteCommentThread,
	getExportCommentsForContent,
	getCommentRange,
	getVisibleCommentThreads,
	mapCommentRangeAcrossContent,
	recoverRange,
	resolveCommentThread,
	setCommentsEnabled,
} from "./comments"
import { createPersonalDocument } from "@/app/features/documents/lib/documents"
import {
	acceptDocumentInvite,
	canEdit,
	createDocumentInvite,
	parseInviteLink,
} from "@/app/features/sharing/lib/document-sharing"

function recoverCommentRange(
	content: string,
	anchor: Parameters<typeof recoverRange>[1],
) {
	let range = recoverRange(content, anchor)
	return range ? { ...range, orphaned: false } : null
}

describe("comment range recovery", () => {
	test("recovers across inserted words inside the quoted text", () => {
		let content =
			"Your documents dadada sync automatically across all your devices."
		let range = recoverCommentRange(content, {
			quote: "Your documents sync automatically across all your devices.",
			contextBefore: "",
			contextAfter: "",
		})

		expect(range).toEqual({
			from: 0,
			to: content.length,
			orphaned: false,
		})
	})

	test("keeps a comment range when text inside it is deleted", () => {
		let oldContent =
			"Your documents sync automatically across all your devices."
		let newContent = "Your documents automatically across all your devices."
		let range = mapCommentRangeAcrossContent(oldContent, newContent, {
			from: 0,
			to: oldContent.length,
			orphaned: false,
		})

		expect(range).toEqual({
			from: 0,
			to: newContent.length,
			orphaned: false,
		})
	})

	test("keeps a comment range when text is inserted inside it", () => {
		let oldContent =
			"Your documents sync automatically across all your devices."
		let newContent =
			"Your documents dadada sync automatically across all your devices."
		let range = mapCommentRangeAcrossContent(oldContent, newContent, {
			from: 0,
			to: oldContent.length,
			orphaned: false,
		})

		expect(range).toEqual({
			from: 0,
			to: newContent.length,
			orphaned: false,
		})
	})

	test("collapses a comment range when the whole text is deleted", () => {
		let oldContent = "Before commented text after"
		let newContent = "Before  after"
		let range = mapCommentRangeAcrossContent(oldContent, newContent, {
			from: "Before ".length,
			to: "Before commented text".length,
			orphaned: false,
		})

		expect(range).toEqual({
			from: "Before ".length,
			to: "Before ".length,
			orphaned: false,
		})
	})

	test("tracks replacement edits over the commented text", () => {
		let oldContent = "abc def ghi"
		let newContent = "abc xyz ghi"
		let range = mapCommentRangeAcrossContent(oldContent, newContent, {
			from: "abc ".length,
			to: "abc def".length,
			orphaned: false,
		})

		expect(range).toEqual({
			from: "abc ".length,
			to: "abc xyz".length,
			orphaned: false,
		})
	})

	test("updates stored anchors when commented text is edited", async () => {
		await setupJazzTestSync()
		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let group = Group.create()
		let content = "Your documents sync automatically across all your devices."
		let doc = Document.create(
			{
				version: 1,
				content: co.plainText().create(content, group),
				comments: co.list(CommentThread).create([], group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let loadedDoc = await doc.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})
		let thread = createCommentThread(
			loadedDoc,
			{ from: 0, to: content.length },
			"Check this",
		)
		expect(thread).toBeTruthy()

		let newContent =
			"Your documents dadada sync automatically across all your devices."
		applyContentDiffWithCommentAnchors(loadedDoc, newContent)

		let range = getCommentRange(loadedDoc, thread!.anchor)
		expect(range).toEqual({
			from: 0,
			to: newContent.length,
			orphaned: false,
		})
		expect(thread!.anchor.quote).toBe(newContent)
		expect(thread!.anchor.originalQuote).toBe(content)
	})

	test("keeps a collapsed position when commented text is deleted", async () => {
		await setupJazzTestSync()
		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let group = Group.create()
		let content = "Before commented text after"
		let doc = Document.create(
			{
				version: 1,
				content: co.plainText().create(content, group),
				comments: co.list(CommentThread).create([], group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let loadedDoc = await doc.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})
		let thread = createCommentThread(
			loadedDoc,
			{ from: "Before ".length, to: "Before commented text".length },
			"Check this",
		)
		expect(thread).toBeTruthy()

		applyContentDiffWithCommentAnchors(loadedDoc, "Before  after")

		let range = getCommentRange(loadedDoc, thread!.anchor)
		expect(range).toEqual({
			from: "Before ".length,
			to: "Before ".length,
			orphaned: false,
		})
		expect(thread!.anchor.originalQuote).toBe("commented text")
	})

	test("keeps a collapsed position at the start when leading text is deleted", async () => {
		await setupJazzTestSync()
		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let group = Group.create()
		let content = "commented text after"
		let doc = Document.create(
			{
				version: 1,
				content: co.plainText().create(content, group),
				comments: co.list(CommentThread).create([], group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let loadedDoc = await doc.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})
		let thread = createCommentThread(
			loadedDoc,
			{ from: 0, to: "commented text".length },
			"Check this",
		)
		expect(thread).toBeTruthy()

		applyContentDiffWithCommentAnchors(loadedDoc, " after")

		expect(getCommentRange(loadedDoc, thread!.anchor)).toEqual({
			from: 0,
			to: 0,
			orphaned: false,
		})
	})

	test("copies comments and remaps when target already has final content", async () => {
		await setupJazzTestSync()
		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let group = Group.create()
		let content = "alpha beta gamma"
		let newContent = "alpha very beta gamma"
		let source = Document.create(
			{
				version: 1,
				content: co.plainText().create(content, group),
				comments: co.list(CommentThread).create([], group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let sourceDoc = await source.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})
		createCommentThread(
			sourceDoc,
			{ from: content.indexOf("beta"), to: content.indexOf("beta") + 4 },
			"Check this",
		)
		let target = Document.create(
			{
				version: 1,
				content: co.plainText().create(newContent, group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let targetDoc = await target.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})

		await copyCommentsAndApplyContent(sourceDoc, targetDoc, newContent)

		let thread = targetDoc.comments?.[0]
		expect(targetDoc.content.toString()).toBe(newContent)
		expect(thread?.$isLoaded).toBe(true)
		expect(getCommentRange(targetDoc, thread!.anchor)).toEqual({
			from: newContent.indexOf("beta"),
			to: newContent.indexOf("beta") + 4,
			orphaned: false,
		})
	})

	test("copies disabled comments setting without copying threads", async () => {
		await setupJazzTestSync()
		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let group = Group.create()
		let source = Document.create(
			{
				version: 1,
				content: co.plainText().create("alpha beta", group),
				comments: co.list(CommentThread).create([], group),
				commentsDisabled: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let target = Document.create(
			{
				version: 1,
				content: co.plainText().create("omega", group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let sourceDoc = await source.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})
		let targetDoc = await target.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})

		await copyCommentsAndApplyContent(sourceDoc, targetDoc, "omega", {
			copyComments: false,
		})

		expect(targetDoc.content.toString()).toBe("omega")
		expect(targetDoc.commentsDisabled).toBe(true)
		expect(targetDoc.comments).toBeUndefined()
	})

	test("exports comments mapped to transformed content", async () => {
		await setupJazzTestSync()
		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let group = Group.create()
		let content = "alpha beta gamma"
		let doc = Document.create(
			{
				version: 1,
				content: co.plainText().create(content, group),
				comments: co.list(CommentThread).create([], group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let loadedDoc = await doc.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})
		createCommentThread(
			loadedDoc,
			{ from: content.indexOf("beta"), to: content.indexOf("beta") + 4 },
			"Check this",
		)

		let comments = getExportCommentsForContent(
			loadedDoc,
			"intro alpha beta gamma",
		)

		expect(comments).toMatchObject([
			{
				quote: "beta",
				from: "intro alpha beta gamma".indexOf("beta"),
				to: "intro alpha beta gamma".indexOf("beta") + 4,
			},
		])
	})

	test("clones comments with target document anchors", async () => {
		await setupJazzTestSync()
		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let group = Group.create()
		let content = "alpha beta gamma beta"
		let source = Document.create(
			{
				version: 1,
				content: co.plainText().create(content, group),
				comments: co.list(CommentThread).create([], group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let sourceDoc = await source.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})
		createCommentThread(
			sourceDoc,
			{ from: "alpha beta gamma ".length, to: content.length },
			"Second beta",
		)

		let target = Document.create(
			{
				version: 1,
				content: co.plainText().create(content, group),
				comments: co.list(CommentThread).create([], group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let targetDoc = await target.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})

		cloneCommentThreads(sourceDoc, targetDoc)

		let thread = targetDoc.comments?.[0]
		expect(thread?.$isLoaded).toBe(true)
		expect(getCommentRange(targetDoc, thread!.anchor)).toEqual({
			from: "alpha beta gamma ".length,
			to: content.length,
			orphaned: false,
		})
	})

	test("clones disabled comments setting without threads", async () => {
		await setupJazzTestSync()
		await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let group = Group.create()
		let source = Document.create(
			{
				version: 1,
				content: co.plainText().create("alpha", group),
				comments: co.list(CommentThread).create([], group),
				commentsDisabled: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let target = Document.create(
			{
				version: 1,
				content: co.plainText().create("alpha", group),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			group,
		)
		let sourceDoc = await source.$jazz.ensureLoaded({
			resolve: { content: true, comments: { $each: { replies: true } } },
		})
		let targetDoc = await target.$jazz.ensureLoaded({
			resolve: { content: true },
		})

		cloneCommentThreads(sourceDoc, targetDoc)

		expect(targetDoc.commentsDisabled).toBe(true)
	})
})

describe("comment permissions", () => {
	test("writer can add, reply, resolve, and delete comments", async () => {
		let { adminAccount, collaboratorAccount, doc } =
			await createSharedCommentDocument("writer")

		setActiveAccount(collaboratorAccount)
		let writerDoc = await loadCommentDoc(doc.$jazz.id)
		expect(canEdit(writerDoc)).toBe(true)

		let thread = createCommentThread(
			writerDoc,
			{ from: 0, to: "Shared".length },
			"Looks good",
			"Writer",
		)
		expect(thread).toBeTruthy()

		addCommentReply(thread!, "Follow up", "Writer")
		resolveCommentThread(thread!)
		deleteCommentThread(thread!)

		expect(thread!.replies.length).toBe(2)
		expect(thread!.resolvedAt).toBeInstanceOf(Date)
		expect(thread!.deletedAt).toBeInstanceOf(Date)

		setActiveAccount(adminAccount)
	})

	test("reader can read comments but is not allowed to edit them", async () => {
		let { collaboratorAccount, doc } =
			await createSharedCommentDocument("reader")

		setActiveAccount(collaboratorAccount)
		let readerDoc = await loadCommentDoc(doc.$jazz.id)

		expect(canEdit(readerDoc)).toBe(false)
		expect(getVisibleCommentThreads(readerDoc)).toHaveLength(1)
		expect(getVisibleCommentThreads(readerDoc)[0].anchor.quote).toBe("Shared")
	})

	test("disabled comments are hidden and reject new threads", async () => {
		await setupJazzTestSync()
		let adminAccount = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})
		let doc = await createPersonalDocument(adminAccount, "Disabled comments")
		let loadedDoc = await loadCommentDoc(doc.$jazz.id)
		createCommentThread(
			loadedDoc,
			{ from: 0, to: "Disabled".length },
			"Existing comment",
		)

		setCommentsEnabled(loadedDoc, false)

		expect(areCommentsEnabled(loadedDoc)).toBe(false)
		expect(getVisibleCommentThreads(loadedDoc)).toEqual([])
		expect(
			createCommentThread(
				loadedDoc,
				{ from: 0, to: "Disabled".length },
				"Should not be created",
			),
		).toBeNull()
	})
})

async function createSharedCommentDocument(role: "writer" | "reader") {
	await setupJazzTestSync()
	let adminAccount = await createJazzTestAccount({
		isCurrentActiveAccount: true,
		AccountSchema: UserAccount,
	})
	let collaboratorAccount = await createJazzTestAccount({
		AccountSchema: UserAccount,
	})
	let doc = await createPersonalDocument(adminAccount, "Shared comment text")
	let loadedDoc = await loadCommentDoc(doc.$jazz.id)
	createCommentThread(
		loadedDoc,
		{ from: 0, to: "Shared".length },
		"Existing comment",
		"Admin",
	)

	let { link } = await createDocumentInvite(loadedDoc, role)
	await acceptDocumentInvite(collaboratorAccount, parseInviteLink(link))

	return { adminAccount, collaboratorAccount, doc: loadedDoc }
}

async function loadCommentDoc(id: string) {
	let doc = await Document.load(id, {
		resolve: { content: true, comments: { $each: { replies: true } } },
	})
	if (!doc.$isLoaded) throw new Error("Document not loaded")
	return doc
}
