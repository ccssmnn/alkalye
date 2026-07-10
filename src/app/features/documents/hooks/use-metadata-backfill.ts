import { useEffect } from "react"
import { co } from "jazz-tools"
import { Document } from "../lib/schema"
import {
	backfillDocumentMetadata,
	needsMetadataBackfill,
} from "../lib/metadata"
import { canEdit } from "@/app/features/sharing"

export { useMetadataBackfill }

type MetadataBackfillDocument = co.loaded<typeof Document>

function useMetadataBackfill(doc: MetadataBackfillDocument) {
	useEffect(() => {
		if (!needsMetadataBackfill(doc) || !canEdit(doc)) return

		let timer = setTimeout(() => void backfillMetadata(doc), 800)
		return () => clearTimeout(timer)
	}, [
		doc,
		doc.title,
		doc.tags,
		doc.pinned,
		doc.isPresentation,
		doc.contentUpdatedAt,
		doc.metadataUpdatedAt,
		doc.updatedAt,
	])
}

async function backfillMetadata(doc: MetadataBackfillDocument) {
	if (!needsMetadataBackfill(doc) || !canEdit(doc)) return

	let loaded = await doc.$jazz.ensureLoaded({ resolve: { content: true } })
	if (!needsMetadataBackfill(loaded) || !canEdit(loaded)) return

	backfillDocumentMetadata(loaded)
}
