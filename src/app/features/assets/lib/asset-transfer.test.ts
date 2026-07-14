import { describe, expect, test } from "vitest"
import {
	TLDRAW_BACKUP_MIME_TYPE,
	assetExtensionFromMimeType,
	assetMimeTypeFromFileName,
	classifyAssetFile,
	isAssetFileName,
} from "./asset-transfer"

describe("asset file transfer", () => {
	test.each([
		["photo.png", "", "image"],
		["recording", "video/webm", "video"],
		["board.alkalye-tldraw", "", "tldraw"],
		["board", TLDRAW_BACKUP_MIME_TYPE, "tldraw"],
	] as const)("classifies %s", (name, type, expected) => {
		expect(classifyAssetFile({ name, type })).toBe(expected)
	})

	test("rejects unsupported files", () => {
		expect(classifyAssetFile({ name: "notes.pdf", type: "" })).toBeNull()
		expect(isAssetFileName("notes.pdf")).toBe(false)
	})

	test("owns asset mime and extension mappings", () => {
		expect(assetMimeTypeFromFileName("clip.mov")).toBe("video/quicktime")
		expect(assetMimeTypeFromFileName("board.alkalye-tldraw")).toBe(
			TLDRAW_BACKUP_MIME_TYPE,
		)
		expect(assetExtensionFromMimeType(TLDRAW_BACKUP_MIME_TYPE)).toBe(
			".alkalye-tldraw",
		)
	})
})
