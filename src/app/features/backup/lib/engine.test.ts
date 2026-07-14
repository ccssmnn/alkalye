import { describe, it, expect } from "vitest"
import { co } from "jazz-tools"
import { createJazzTestAccount, setupJazzTestSync } from "jazz-tools/testing"
import { Asset, TldrawAsset, TldrawRevision, UserAccount } from "@/schema"
import { createPersonalDocument } from "@/app/features/documents/lib/documents"
import {
	hashContent,
	prepareBackupDocs,
	prepareBackupSelection,
	syncFromBackup,
} from "./engine"
import { selectActiveBackupDocuments } from "./subscriber-state"

describe("hashContent", () => {
	it("returns consistent hash for same content", async () => {
		let content = "Hello, World!"
		let hash1 = await hashContent(content)
		let hash2 = await hashContent(content)

		expect(hash1).toBe(hash2)
		expect(hash1).toHaveLength(16)
	})

	it("returns different hash for different content", async () => {
		let hash1 = await hashContent("Content A")
		let hash2 = await hashContent("Content B")

		expect(hash1).not.toBe(hash2)
	})

	it("handles empty string", async () => {
		let hash = await hashContent("")

		expect(hash).toHaveLength(16)
		expect(hash).toMatch(/^[a-f0-9]+$/)
	})

	it("handles unicode content", async () => {
		let content = "Hello 👋 World 🌍"
		let hash1 = await hashContent(content)
		let hash2 = await hashContent(content)

		expect(hash1).toBe(hash2)
	})

	it("changes hash when only one character changes", async () => {
		let hash1 = await hashContent("abc")
		let hash2 = await hashContent("abd")

		expect(hash1).not.toBe(hash2)
	})
})

describe("bidirectional sync exports", () => {
	it("exports hashContent for testing", () => {
		expect(typeof hashContent).toBe("function")
	})

	it("exports syncFromBackup for integration tests", () => {
		expect(typeof syncFromBackup).toBe("function")
	})
})

describe("backup snapshot preparation", () => {
	it("rejects a selection changed before preparation", async () => {
		let doc = backupDocument("doc-a", "2026-07-10T12:00:00Z")
		let selection = selectActiveBackupDocuments([doc])
		doc.updatedAt = new Date("2026-07-10T12:01:00Z")
		let prepared = false

		await expect(
			prepareBackupSelection(selection, async () => {
				prepared = true
				return []
			}),
		).rejects.toThrow("selection changed")
		expect(prepared).toBe(false)
	})

	it("rejects without returning a snapshot changed during preparation", async () => {
		let doc = backupDocument("doc-a", "2026-07-10T12:00:00Z")
		let selection = selectActiveBackupDocuments([doc])

		await expect(
			prepareBackupSelection(selection, async () => {
				doc.deletedAt = new Date("2026-07-10T12:01:00Z")
				return ["prepared"]
			}),
		).rejects.toThrow("selection changed")
	})

	it("backs up healthy documents when stored assets cannot export", async () => {
		await setupJazzTestSync()
		let account = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})
		let oversized = await createPersonalDocument(account, "# Oversized")
		let corrupt = await createPersonalDocument(account, "# Corrupt")
		let healthy = await createPersonalDocument(account, "# Healthy")
		let oversizedRevision = await createTestRevision(
			account,
			"x".repeat(8 * 1024 * 1024 + 1),
		)
		let oversizedAsset = TldrawAsset.create(
			{
				type: "tldraw",
				name: "Huge diagram",
				revision: oversizedRevision,
				createdAt: new Date(),
			},
			account,
		)
		oversized.$jazz.set(
			"assets",
			co.list(Asset).create([oversizedAsset], account),
		)
		let corruptRevision = await createTestRevision(account, "invalid")
		let corruptAsset = TldrawAsset.create(
			{
				type: "tldraw",
				name: "Old diagram",
				revision: corruptRevision,
				createdAt: new Date(),
			},
			account,
		)
		corrupt.$jazz.set("assets", co.list(Asset).create([corruptAsset], account))

		let prepared = await prepareBackupDocs(
			selectActiveBackupDocuments([oversized, corrupt, healthy]),
		)

		expect(prepared.documents.map(doc => doc.id)).toEqual([healthy.$jazz.id])
		expect(prepared.errors).toEqual([
			'Could not back up "Oversized": Could not export asset "Huge diagram": Whiteboard snapshot is too large',
			'Could not back up "Corrupt": Could not export asset "Old diagram": Whiteboard data is invalid or unsupported',
		])
	})
})

function backupDocument(
	id: string,
	updatedAt: string,
): {
	$isLoaded: boolean
	$jazz: { id: string }
	updatedAt: Date
	deletedAt?: Date
} {
	return {
		$isLoaded: true,
		$jazz: { id },
		updatedAt: new Date(updatedAt),
	}
}

async function createTestRevision(
	owner: co.loaded<typeof UserAccount>,
	content: string,
) {
	let snapshot = await co
		.fileStream()
		.createFromBlob(new ReadableBlob(content), { owner })
	let original = await co
		.fileStream()
		.createFromBlob(new ReadableBlob("preview", "image/png"), { owner })
	let preview = co.image().create(
		{
			original,
			originalSize: [1, 1],
			progressive: false,
		},
		owner,
	)
	return TldrawRevision.create(
		{
			snapshot,
			lightPreview: preview,
			darkPreview: preview,
			createdAt: new Date(),
		},
		owner,
	)
}

class ReadableBlob extends Blob {
	readonly content: string

	constructor(content: string, type = "application/octet-stream") {
		super([content], { type })
		this.content = content
	}

	async arrayBuffer() {
		let bytes = new TextEncoder().encode(this.content)
		let buffer = new ArrayBuffer(bytes.byteLength)
		new Uint8Array(buffer).set(bytes)
		return buffer
	}
}
