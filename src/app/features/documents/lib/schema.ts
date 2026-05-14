import { co, z } from "jazz-tools"
import { Asset } from "@/app/features/assets/lib/schema"

export { Document, CursorEntry, CursorFeed, HighlightRange }

let CursorEntry = z.object({
	position: z.number(),
	selectionEnd: z.number().optional(),
})

let CursorFeed = co.feed(CursorEntry)

let HighlightRange = z.object({
	start: z.number(),
	end: z.number(),
})

let Document = co.map({
	version: z.literal(1),
	content: co.plainText(),
	assets: co.optional(co.list(Asset)),
	cursors: co.optional(CursorFeed),
	deletedAt: z.date().optional(),
	presentationLine: z.number().optional(),
	highlightRange: HighlightRange.optional(),
	spaceId: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
})
