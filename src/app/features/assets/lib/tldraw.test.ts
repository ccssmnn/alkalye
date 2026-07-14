import { describe, expect, test } from "vitest"
import { createJazzTestAccount, setupJazzTestSync } from "jazz-tools/testing"
import { createTLStore } from "tldraw"
import {
	TldrawBackupContentError,
	createTldrawBackupBundleFromSave,
	decodeTldrawBackupBundle,
	updateTldrawAsset,
} from "./tldraw"
import { Document, UserAccount } from "@/schema"
import { createPersonalDocument } from "@/app/features/documents/lib/documents"

describe("tldraw backups", () => {
	test("decodes a bounded local backup", async () => {
		let save = await decodeTldrawBackupBundle(createBackup())

		expect(save.json).toBe(createSnapshot())
		expect(save.lightPreview.type).toBe("image/png")
		expect(save.darkPreview.size).toBeGreaterThan(0)
	})

	test("round-trips snapshots and previews", async () => {
		let lightPreview = new Blob([Uint8Array.from([1, 2, 3])], {
			type: "image/png",
		})
		let darkPreview = new Blob([Uint8Array.from([4, 5, 6])], {
			type: "image/png",
		})
		let backup = await createTldrawBackupBundleFromSave({
			json: createSnapshot(),
			lightPreview,
			darkPreview,
		})

		let save = await decodeBlobBackup(backup)

		expect(save.json).toBe(createSnapshot())
		expect(await blobBytes(save.lightPreview)).toEqual([1, 2, 3])
		expect(await blobBytes(save.darkPreview)).toEqual([4, 5, 6])
	})

	test("refuses to create a backup that cannot be imported", async () => {
		let preview = new Blob([Uint8Array.from([1])], { type: "image/png" })
		let snapshot = createSnapshot()
		let oversizedSnapshot =
			snapshot + " ".repeat(8 * 1024 * 1024 + 1 - snapshot.length)

		await expect(
			createTldrawBackupBundleFromSave({
				json: oversizedSnapshot,
				lightPreview: preview,
				darkPreview: preview,
			}),
		).rejects.toThrow("Whiteboard snapshot is too large")
	})

	test("rejects external preview URLs", async () => {
		let backup = createBackup({ lightPreview: "https://example.com/image.png" })

		await expect(decodeTldrawBackupBundle(backup)).rejects.toThrow(
			"PNG data URL",
		)
	})

	test("rejects invalid snapshots", async () => {
		let backup = createBackup({ snapshot: "invalid" })

		await expect(decodeTldrawBackupBundle(backup)).rejects.toBeInstanceOf(Error)
	})

	test("classifies invalid stored snapshots as deterministic export errors", async () => {
		let preview = new Blob([Uint8Array.from([1])], { type: "image/png" })

		await expect(
			createTldrawBackupBundleFromSave({
				json: "invalid",
				lightPreview: preview,
				darkPreview: preview,
			}),
		).rejects.toBeInstanceOf(TldrawBackupContentError)
	})

	test("rejects an update after its asset disappears", async () => {
		await setupJazzTestSync()
		let account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})
		let doc = await createPersonalDocument(account, "Whiteboard")
		let loaded = await Document.load(doc.$jazz.id, {
			resolve: { content: true, assets: true },
		})
		if (!loaded.$isLoaded) throw new Error("Document did not load")
		let preview = new Blob([Uint8Array.from([1])], { type: "image/png" })

		await expect(
			updateTldrawAsset(loaded, "missing", {
				json: createSnapshot(),
				lightPreview: preview,
				darkPreview: preview,
			}),
		).rejects.toThrow("Whiteboard asset is no longer available")
	})
})

function createBackup(overrides: Partial<Backup> = {}) {
	let png = "data:image/png;base64,iVBORw0KGgo="
	let backup: Backup = {
		format: "alkalye-tldraw-v1",
		snapshot: createSnapshot(),
		lightPreview: png,
		darkPreview: png,
		...overrides,
	}
	let text = JSON.stringify(backup)
	return { size: text.length, text: async () => text }
}

interface Backup {
	format: "alkalye-tldraw-v1"
	snapshot: string
	lightPreview: string
	darkPreview: string
}

function createSnapshot() {
	return JSON.stringify({
		tldrawFileFormatVersion: 1,
		schema: createTLStore().schema.serialize(),
		records: [
			{
				meta: {},
				id: "page:page",
				name: "Page",
				index: "a1",
				typeName: "page",
			},
			{
				gridSize: 10,
				name: "",
				meta: {},
				id: "document:document",
				typeName: "document",
			},
		],
	})
}

async function blobBytes(blob: Blob) {
	return [...new Uint8Array(await readBlobAsArrayBuffer(blob))]
}

async function decodeBlobBackup(blob: Blob) {
	let text = await readBlobAsText(blob)
	return decodeTldrawBackupBundle({ size: blob.size, text: async () => text })
}

function readBlobAsArrayBuffer(blob: Blob) {
	return new Promise<ArrayBuffer>((resolve, reject) => {
		let reader = new FileReader()
		reader.onload = () => {
			if (reader.result instanceof ArrayBuffer) resolve(reader.result)
			else reject(new Error("Could not read blob"))
		}
		reader.onerror = () => reject(reader.error)
		reader.readAsArrayBuffer(blob)
	})
}

function readBlobAsText(blob: Blob) {
	return new Promise<string>((resolve, reject) => {
		let reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result === "string") resolve(reader.result)
			else reject(new Error("Could not read blob"))
		}
		reader.onerror = () => reject(reader.error)
		reader.readAsText(blob)
	})
}
