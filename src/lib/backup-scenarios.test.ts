import { beforeEach, describe, expect, it } from "vitest"
import { co, Group, FileStream } from "jazz-tools"
import { createJazzTestAccount, setupJazzTestSync } from "jazz-tools/testing"
import { UserAccount, Document, Asset, VideoAsset } from "@/schema"
import { getPath } from "@/editor/frontmatter"
import { getDocumentTitle } from "@/lib/document-utils"
import type { BackupDoc } from "./backup-sync"
import { readManifest } from "./backup-sync"
import { hashContent, syncBackup, syncFromBackup } from "./backup"
import {
	MockDirectoryHandle,
	basename,
	readFileAtPath as readFile,
	removeFileAtPath as removeFile,
	writeFileAtPath,
} from "./backup-test-helpers"

type LoadedAccount = co.loaded<typeof UserAccount>
type LoadedDoc = co.loaded<typeof Document>

describe("backup scenarios", () => {
	let account: LoadedAccount
	let docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>
	let root: MockDirectoryHandle

	beforeEach(async () => {
		await setupJazzTestSync()
		account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		let loaded = await account.$jazz.ensureLoaded({
			resolve: {
				root: {
					documents: {
						$each: {
							content: true,
							assets: { $each: { image: true, video: true } },
						},
					},
				},
			},
		})

		docs = loaded.root.documents
		root = new MockDirectoryHandle("root")
	})

	it("new doc in alkalye", async () => {
		let doc = await createDoc(docs, "# New Doc\n\nHello")
		await pushToBackup(root, docs)

		let manifest = await readManifest(root)
		expect(manifest?.entries.some(entry => entry.docId === doc.$jazz.id)).toBe(
			true,
		)
		expect(await hasFile(root, "New Doc.md")).toBe(true)
	})

	it("new doc locally", async () => {
		let initialCount = getLoadedDocs(docs).length
		root.addFile("Local Note.md", "# Local Note\n\nFrom filesystem", 2_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.created).toBe(1)

		let loadedDocs = getLoadedDocs(docs)
		expect(loadedDocs).toHaveLength(initialCount + 1)
		let imported = loadedDocs.find(d => getDocumentTitle(d) === "Local Note")
		expect(imported).toBeDefined()
	})

	it("imports asset references with created asset ids", async () => {
		await writeFileAtPath(
			root,
			"Video Doc/Video Doc.md",
			"# Video Doc\n\n![Clip](assets/clip.mp4)",
		)
		await writeFileAtPath(root, "Video Doc/assets/clip.mp4", "video-bytes")

		let result = await syncFromBackup(root, docs, true)
		expect(result.created).toBe(1)

		let imported = getLoadedDocs(docs).find(
			d => getDocumentTitle(d) === "Video Doc",
		)
		expect(imported).toBeDefined()
		if (!imported?.content?.$isLoaded) throw new Error("Doc content not loaded")

		let content = imported.content.toString()
		let refMatch = content.match(/!\[[^\]]*\]\(asset:([^)]+)\)/)
		expect(refMatch).toBeTruthy()

		let refs = (content.match(/asset:[^)]+/g) ?? []).map(ref =>
			ref.replace("asset:", ""),
		)
		let assetIds = (imported.assets?.$isLoaded ? [...imported.assets] : [])
			.filter(asset => asset?.$isLoaded)
			.map(asset => asset.$jazz.id)

		expect(assetIds.length).toBeGreaterThan(0)
		for (let refId of refs) {
			expect(assetIds).toContain(refId)
		}
	})

	it("renamed in alkalye", async () => {
		let doc = await createDoc(docs, "# Hello World")
		await pushToBackup(root, docs)
		expect(await hasFile(root, "Hello World.md")).toBe(true)

		if (!doc.content?.$isLoaded) throw new Error("Doc content not loaded")
		doc.content.$jazz.applyDiff("# Another Title")
		doc.$jazz.set("updatedAt", new Date(Date.now() + 2_000))
		await pushToBackup(root, docs)

		expect(await hasFile(root, "Another Title.md")).toBe(true)
		expect(await hasFile(root, "Hello World.md")).toBe(false)
	})

	it("renamed locally", async () => {
		let doc = await createDoc(docs, "# Hello")
		await pushToBackup(root, docs)
		let countBeforePull = getLoadedDocs(docs).length

		let oldFile = await readFile(root, "Hello.md")
		await removeFile(root, "Hello.md")
		root.addFile("Renamed Locally.md", oldFile, 5_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.created).toBe(0)

		let loadedDocs = getLoadedDocs(docs)
		expect(loadedDocs).toHaveLength(countBeforePull)
		expect(loadedDocs.some(d => d.$jazz.id === doc.$jazz.id)).toBe(true)
	})

	it("renamed folder locally updates path in alkalye", async () => {
		await createDoc(docs, "---\npath: work\n---\n\n# Folder Move")
		await pushToBackup(root, docs)

		let source = await readFile(root, "work/Folder Move.md")
		await removeFile(root, "work/Folder Move.md")
		root.addFile("archive/Folder Move.md", source, 8_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.updated).toBe(1)

		let loaded = getLoadedDocs(docs).find(
			d => getDocumentTitle(d) === "Folder Move",
		)
		expect(loaded).toBeDefined()
		expect(getPath(loaded?.content?.toString() ?? "")).toBe("archive")
	})

	it("matches moved doc by filename when content hashes collide", async () => {
		let first = await createDoc(docs, "# Same")
		let second = await createDoc(docs, "# Same")
		await pushToBackup(root, docs)

		let manifest = await readManifest(root)
		if (!manifest) throw new Error("Manifest not found")

		let firstEntry = manifest.entries.find(
			entry => entry.docId === first.$jazz.id,
		)
		let secondEntry = manifest.entries.find(
			entry => entry.docId === second.$jazz.id,
		)
		if (!firstEntry || !secondEntry) throw new Error("Manifest entries missing")

		let secondContent = await readFile(root, secondEntry.relativePath)
		await removeFile(root, firstEntry.relativePath)
		await removeFile(root, secondEntry.relativePath)

		let movedFilename = basename(secondEntry.relativePath)
		await writeFileAtPath(root, `archive/${movedFilename}`, secondContent)

		let result = await syncFromBackup(root, docs, true)
		expect(result.updated).toBe(1)
		expect(result.deleted).toBe(1)

		let firstLoaded = getLoadedDocs(docs).find(
			d => d.$jazz.id === first.$jazz.id,
		)
		let secondLoaded = getLoadedDocs(docs).find(
			d => d.$jazz.id === second.$jazz.id,
		)

		expect(firstLoaded?.deletedAt).toBeTruthy()
		expect(secondLoaded?.deletedAt).toBeFalsy()
	})

	it("keeps asset refs stable when pulling updates for docs with assets", async () => {
		let { doc, assetId } = await createDocWithVideoAsset(docs, "Asset Sync")
		let localContent =
			"# Asset Sync\n\n![Clip](assets/clip.mp4)\n\nExternal edit"
		let localPath = "Asset Sync.md"
		await writeFileAtPath(root, localPath, localContent)
		let contentHash = await hashContent(
			"# Asset Sync\n\n![Clip](assets/clip.mp4)",
		)
		let manifestContent = JSON.stringify(
			{
				version: 1,
				entries: [
					{
						docId: doc.$jazz.id,
						relativePath: localPath,
						contentHash,
						lastSyncedAt: new Date().toISOString(),
						assets: [{ id: assetId, name: "clip.mp4", hash: "asset-hash" }],
					},
				],
				lastSyncAt: new Date().toISOString(),
			},
			null,
			2,
		)
		await writeFileAtPath(root, ".alkalye-manifest.json", manifestContent)

		let result = await syncFromBackup(root, docs, true)
		expect(result.updated).toBe(1)

		let loaded = getLoadedDocs(docs).find(d => d.$jazz.id === doc.$jazz.id)
		expect(loaded).toBeDefined()
		if (!loaded?.content?.$isLoaded) throw new Error("Doc content not loaded")

		let content = loaded.content.toString()
		expect(content).toContain(`asset:${assetId}`)
		expect(content).not.toContain("(assets/")
	})

	it("writes asset ids to manifest entries on backup", async () => {
		let backupDocs: BackupDoc[] = [
			{
				id: "doc-asset-manifest",
				title: "Asset Manifest",
				content: "# Asset Manifest\n\n![Clip](asset:asset-1)",
				path: null,
				updatedAtMs: Date.now(),
				assets: [
					{
						id: "asset-1",
						name: "clip",
						blob: new Blob(["video"], { type: "video/mp4" }),
					},
				],
			},
		]

		await syncBackup(root, backupDocs)

		let manifest = await readManifest(root)
		expect(manifest).toBeDefined()
		expect(manifest?.entries[0].assets[0].id).toBe("asset-1")
	})

	it("changed path in alkalye", async () => {
		let doc = await createDoc(docs, "# Path Doc")
		await pushToBackup(root, docs)

		if (!doc.content?.$isLoaded) throw new Error("Doc content not loaded")
		doc.content.$jazz.applyDiff("---\npath: work/notes\n---\n\n# Path Doc")
		doc.$jazz.set("updatedAt", new Date(Date.now() + 3_000))
		await pushToBackup(root, docs)

		expect(await hasFile(root, "work/notes/Path Doc.md")).toBe(true)
		expect(await hasFile(root, "Path Doc.md")).toBe(false)
	})

	it("changed path locally is normalized to filesystem location", async () => {
		await createDoc(docs, "---\npath: work\n---\n\n# Local Path")
		await pushToBackup(root, docs)

		let source = "---\npath: notes\n---\n\n# Local Path"
		root.addFile("work/Local Path.md", source, 7_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.updated).toBeGreaterThanOrEqual(0)

		let loaded = getLoadedDocs(docs).find(
			d => getDocumentTitle(d) === "Local Path",
		)
		expect(loaded).toBeDefined()
		expect(getPath(loaded?.content?.toString() ?? "")).toBe("work")
	})

	it("deleted in alkalye", async () => {
		let doc = await createDoc(docs, "# Delete Me")
		await pushToBackup(root, docs)
		expect(await hasFile(root, "Delete Me.md")).toBe(true)

		doc.$jazz.set("deletedAt", new Date())
		doc.$jazz.set("updatedAt", new Date(Date.now() + 4_000))
		await pushToBackup(root, docs)

		expect(await hasFile(root, "Delete Me.md")).toBe(false)
		let manifest = await readManifest(root)
		expect(manifest?.entries.some(entry => entry.docId === doc.$jazz.id)).toBe(
			false,
		)
	})

	it("deleted locally", async () => {
		let doc = await createDoc(docs, "# Remove Local")
		await pushToBackup(root, docs)
		await removeFile(root, "Remove Local.md")

		let result = await syncFromBackup(root, docs, true)
		expect(result.deleted).toBe(1)

		let target = getLoadedDocs(docs).find(d => d.$jazz.id === doc.$jazz.id)
		expect(target?.deletedAt).toBeTruthy()
	})

	it("edited both locally and in alkalye keeps document accessible and stable", async () => {
		let doc = await createDoc(docs, "# Conflict\n\nbase")
		await pushToBackup(root, docs)

		if (!doc.content?.$isLoaded) throw new Error("Doc content not loaded")
		doc.content.$jazz.applyDiff("# Conflict\n\nbase\nfrom-alkalye")
		doc.$jazz.set("updatedAt", new Date(Date.now() + 5_000))

		let existing = await readFile(root, "Conflict.md")
		root.addFile("Conflict.md", `${existing}\nfrom-local`, 9_000)

		let result = await syncFromBackup(root, docs, true)
		expect(result.errors).toHaveLength(0)

		let loaded = getLoadedDocs(docs).find(d => d.$jazz.id === doc.$jazz.id)
		expect(loaded).toBeDefined()
		expect(loaded?.deletedAt).toBeFalsy()
		expect(loaded?.content?.toString()).toContain("Conflict")
	})
})

function getLoadedDocs(
	docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>,
): LoadedDoc[] {
	let result: LoadedDoc[] = []
	for (let doc of docs) {
		if (doc?.$isLoaded) result.push(doc)
	}
	return result
}

async function createDoc(
	docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>,
	content: string,
): Promise<LoadedDoc> {
	let group = Group.create()
	let now = new Date()
	let doc = Document.create(
		{
			version: 1,
			content: co.plainText().create(content, group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)
	docs.$jazz.push(doc)
	return doc
}

async function createDocWithVideoAsset(
	docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>,
	title: string,
): Promise<{ doc: LoadedDoc; assetId: string }> {
	let group = Group.create()
	let now = new Date()
	let stream = await FileStream.createFromBlob(
		new Blob(["video"], { type: "video/mp4" }),
		{
			owner: group,
		},
	)
	let videoAsset = VideoAsset.create(
		{
			type: "video",
			name: "clip",
			video: stream,
			mimeType: "video/mp4",
			createdAt: now,
		},
		group,
	)
	let content = `# ${title}\n\n![Clip](asset:${videoAsset.$jazz.id})`
	let doc = Document.create(
		{
			version: 1,
			content: co.plainText().create(content, group),
			assets: co.list(Asset).create([videoAsset], group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)
	docs.$jazz.push(doc)
	if (!doc.$isLoaded) throw new Error("Doc failed to load")
	return { doc, assetId: videoAsset.$jazz.id }
}

async function pushToBackup(
	handle: FileSystemDirectoryHandle,
	docs: co.loaded<ReturnType<typeof co.list<typeof Document>>>,
): Promise<void> {
	let backupDocs: BackupDoc[] = []

	for (let doc of docs) {
		if (!doc?.$isLoaded || doc.deletedAt) continue
		let content = doc.content?.toString() ?? ""
		backupDocs.push({
			id: doc.$jazz.id,
			title: getDocumentTitle(doc),
			content,
			path: getPath(content),
			updatedAtMs: doc.updatedAt?.getTime() ?? 0,
			assets: [],
		})
	}

	await syncBackup(handle, backupDocs)
}

async function hasFile(
	root: MockDirectoryHandle,
	relativePath: string,
): Promise<boolean> {
	try {
		await readFile(root, relativePath)
		return true
	} catch {
		return false
	}
}
