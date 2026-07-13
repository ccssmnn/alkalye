import { describe, expect, test } from "vitest"
import { AssetRecordType, createShapeId, createTLStore } from "tldraw"
import {
	createTldrawStore,
	TldrawFileError,
	validateTldrawFile,
} from "./tldraw-file"

describe("tldraw files", () => {
	test("accepts a single empty page", () => {
		let json = createFile()

		expect(() => validateTldrawFile(json)).not.toThrow()
		expect(createTldrawStore(json).query.ids("page").get().size).toBe(1)
	})

	test("rejects multiple pages", () => {
		let json = createFile([
			createPage("page:page", "a1"),
			createPage("page:second", "a2"),
		])

		expectErrorCode(json, "multiple-pages")
	})

	test("rejects embedded media", () => {
		let image = AssetRecordType.create({
			id: AssetRecordType.createId("test"),
			type: "image",
			props: {
				name: "test.png",
				src: "data:image/png;base64,",
				w: 1,
				h: 1,
				mimeType: "image/png",
				isAnimated: false,
			},
		})

		let imageShape = {
			id: createShapeId("image"),
			typeName: "shape" as const,
			type: "image",
			x: 0,
			y: 0,
			rotation: 0,
			index: "a1",
			parentId: "page:page",
			isLocked: false,
			opacity: 1,
			props: {
				w: 1,
				h: 1,
				playing: false,
				url: "",
				assetId: image.id,
				crop: null,
				flipX: false,
				flipY: false,
				altText: "",
			},
			meta: {},
		}

		expectErrorCode(
			createFile([createPage("page:page", "a1"), image, imageShape]),
			"embedded-media",
		)
	})

	test("rejects invalid JSON", () => {
		expectErrorCode("not json", "invalid")
	})
})

function createFile(records: unknown[] = [createPage("page:page", "a1")]) {
	return JSON.stringify({
		tldrawFileFormatVersion: 1,
		schema: createTLStore().schema.serialize(),
		records: [
			...records,
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

function createPage(id: `page:${string}`, index: string) {
	return { meta: {}, id, name: "Page", index, typeName: "page" as const }
}

function expectErrorCode(json: string, code: TldrawFileError["code"]) {
	try {
		validateTldrawFile(json)
		expect.fail("Expected validation to fail")
	} catch (error) {
		expect(error).toBeInstanceOf(TldrawFileError)
		if (error instanceof TldrawFileError) expect(error.code).toBe(code)
	}
}
