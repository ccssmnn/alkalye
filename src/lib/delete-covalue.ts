import { deleteCoValues, type ID, type CoValue } from "jazz-tools"
import { Document, Space, Theme } from "@/schema"

export {
	permanentlyDeleteDocument,
	permanentlyDeleteSpace,
	permanentlyDeleteTheme,
}

export type { Deletable }

/** Minimal interface for items that can be permanently deleted */
type Deletable = { $jazz: { id: ID<CoValue> } }

/**
 * Permanently deletes a document and all its nested data:
 * - Content (PlainText)
 * - Assets (images/videos with their files)
 * - Cursors feed
 */
async function permanentlyDeleteDocument(doc: Deletable): Promise<void> {
	await deleteCoValues(Document, doc.$jazz.id as ID<typeof Document>, {
		resolve: {
			content: true,
			assets: {
				$each: {
					image: true,
					video: true,
				},
			},
			cursors: true,
		},
	})
}

/**
 * Permanently deletes a space and all its documents with nested data
 */
async function permanentlyDeleteSpace(space: Deletable): Promise<void> {
	await deleteCoValues(Space, space.$jazz.id as ID<typeof Space>, {
		resolve: {
			avatar: true,
			documents: {
				$each: {
					content: true,
					assets: {
						$each: {
							image: true,
							video: true,
						},
					},
					cursors: true,
				},
			},
		},
	})
}

/**
 * Permanently deletes a theme and all its assets
 */
async function permanentlyDeleteTheme(theme: Deletable): Promise<void> {
	await deleteCoValues(Theme, theme.$jazz.id as ID<typeof Theme>, {
		resolve: {
			css: true,
			template: true,
			assets: {
				$each: {
					data: true,
				},
			},
			thumbnail: true,
		},
	})
}
