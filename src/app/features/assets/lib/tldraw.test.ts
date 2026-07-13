import { Blob } from "node:buffer"
import { describe, expect, test } from "vitest"
import { createTLStore } from "tldraw"
import { decodeTldrawBackupBundle } from "./tldraw"

describe("tldraw backups", () => {
	test("decodes a bounded local backup", async () => {
		let save = await decodeTldrawBackupBundle(createBackup())

		expect(save.json).toBe(createSnapshot())
		expect(save.lightPreview.type).toBe("image/png")
		expect(save.darkPreview.size).toBeGreaterThan(0)
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
	return new Blob([JSON.stringify(backup)])
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
