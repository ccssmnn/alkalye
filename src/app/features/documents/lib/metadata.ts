import { co } from "jazz-tools"
import { Document } from "./schema"
import { getDocumentTitle, isDocumentPinned } from "./title"
import { getPath, getTags } from "@/app/features/editor"
import { getPresentationMode } from "@/app/features/presentation"

export {
	syncDocumentMetadata,
	backfillDocumentMetadata,
	extractDocumentMetadata,
	createDocumentMetadata,
	needsMetadataBackfill,
}

type DocumentWithContent = co.loaded<typeof Document, { content: true }>
type SyncMetadataOptions = {
	contentChanged?: boolean
}
type MetadataBackfillCandidate = {
	title?: string
	tags?: string[]
	pinned?: boolean
	isPresentation?: boolean
	contentUpdatedAt?: Date
	metadataUpdatedAt?: Date
	updatedAt?: Date
}

function extractDocumentMetadata(content: string) {
	return {
		title: getDocumentTitle(content),
		pinned: isDocumentPinned({ content: { toString: () => content } }),
		path: getPath(content) ?? undefined,
		tags: getTags(content),
		isPresentation: getPresentationMode(content),
	}
}

function createDocumentMetadata(content: string, updatedAt: Date) {
	return {
		...extractDocumentMetadata(content),
		contentUpdatedAt: updatedAt,
		metadataUpdatedAt: updatedAt,
	}
}

function syncDocumentMetadata(
	doc: DocumentWithContent,
	options: SyncMetadataOptions = {},
) {
	let contentChanged = options.contentChanged ?? true
	let contentUpdatedAt =
		contentChanged || !doc.contentUpdatedAt
			? doc.updatedAt
			: doc.contentUpdatedAt

	syncMetadata(doc, contentUpdatedAt, doc.updatedAt)
}

function backfillDocumentMetadata(doc: DocumentWithContent) {
	let contentChanged =
		doc.metadataUpdatedAt !== undefined &&
		doc.updatedAt.getTime() > doc.metadataUpdatedAt.getTime()
	let contentUpdatedAt =
		contentChanged || !doc.contentUpdatedAt
			? doc.updatedAt
			: doc.contentUpdatedAt

	syncMetadata(doc, contentUpdatedAt, doc.updatedAt)
}

function needsMetadataBackfill(doc: MetadataBackfillCandidate) {
	let contentUpdatedAt = doc.contentUpdatedAt
	let metadataUpdatedAt = doc.metadataUpdatedAt
	let updatedAt = doc.updatedAt

	return (
		doc.title === undefined ||
		doc.pinned === undefined ||
		doc.isPresentation === undefined ||
		doc.tags === undefined ||
		metadataUpdatedAt === undefined ||
		contentUpdatedAt === undefined ||
		(contentUpdatedAt !== undefined &&
			metadataUpdatedAt.getTime() < contentUpdatedAt.getTime()) ||
		(updatedAt !== undefined &&
			metadataUpdatedAt.getTime() < updatedAt.getTime())
	)
}

function syncMetadata(
	doc: DocumentWithContent,
	contentUpdatedAt: Date,
	metadataUpdatedAt: Date,
) {
	let content = doc.content.toString()
	let meta = extractDocumentMetadata(content)

	if (doc.title !== meta.title) {
		doc.$jazz.set("title", meta.title)
	}
	if (doc.pinned !== meta.pinned) {
		doc.$jazz.set("pinned", meta.pinned)
	}
	if (doc.path !== meta.path) {
		doc.$jazz.set("path", meta.path)
	}
	if (doc.tags === undefined || !stringArraysEqual(doc.tags, meta.tags)) {
		doc.$jazz.set("tags", meta.tags)
	}
	if (doc.isPresentation !== meta.isPresentation) {
		doc.$jazz.set("isPresentation", meta.isPresentation)
	}

	if (!sameDate(doc.contentUpdatedAt, contentUpdatedAt)) {
		doc.$jazz.set("contentUpdatedAt", contentUpdatedAt)
	}
	if (!sameDate(doc.metadataUpdatedAt, metadataUpdatedAt)) {
		doc.$jazz.set("metadataUpdatedAt", metadataUpdatedAt)
	}
}
function stringArraysEqual(left: string[], right: string[]) {
	if (left.length !== right.length) return false
	return left.every((value, index) => value === right[index])
}

function sameDate(left: Date | undefined, right: Date) {
	return left?.getTime() === right.getTime()
}
