import { createTLStore, parseTldrawJsonFile, type TLStore } from "tldraw"

export { createTldrawStore, validateTldrawFile, TldrawFileError }

type TldrawFileErrorCode = "invalid" | "multiple-pages" | "embedded-media"

class TldrawFileError extends Error {
	readonly code: TldrawFileErrorCode

	constructor(code: TldrawFileErrorCode) {
		super(code)
		this.name = "TldrawFileError"
		this.code = code
	}
}

let unsupportedShapeTypes = new Set(["bookmark", "embed", "image", "video"])

function validateTldrawFile(json: string) {
	createTldrawStore(json)
}

function createTldrawStore(initialJson?: string): TLStore {
	let emptyStore = createTLStore()
	if (!initialJson) return emptyStore

	let result = parseTldrawJsonFile({
		json: initialJson,
		schema: emptyStore.schema,
	})
	if (!result.ok) throw new TldrawFileError("invalid")
	if (result.value.query.ids("page").get().size !== 1) {
		throw new TldrawFileError("multiple-pages")
	}
	for (let record of result.value.allRecords()) {
		if (record.typeName === "asset") {
			throw new TldrawFileError("embedded-media")
		}
		if (record.typeName === "shape" && unsupportedShapeTypes.has(record.type)) {
			throw new TldrawFileError("embedded-media")
		}
	}
	return result.value
}
