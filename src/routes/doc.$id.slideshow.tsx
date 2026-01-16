import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { type ResolveQuery, co } from "jazz-tools"
import { Document } from "@/schema"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/components/document-error-states"

import { Slideshow, type Slide } from "@/components/slideshow"
import { parsePresentation, type PresentationItem } from "@/lib/presentation"
import { parseWikiLinks } from "@/editor/wikilink-parser"
import {
	resolveDocTitles,
	useDocTitles,
	type ResolvedDoc,
} from "@/lib/doc-resolver"
import { canEdit } from "@/lib/documents"
import { useScreenWakeLock } from "@/lib/screen-wake-lock"

export { Route }

let resolve = {
	content: true,
	assets: { $each: { image: true } },
} as const satisfies ResolveQuery<typeof Document>

let Route = createFileRoute("/doc/$id/slideshow")({
	loader: async ({ params }) => {
		let doc = await Document.load(params.id, {
			resolve,
		})
		if (!doc.$isLoaded) {
			return {
				doc: null,
				loadingState: doc.$jazz.loadingState,
				wikilinkCache: new Map<string, ResolvedDoc>(),
			}
		}

		let content = doc.content?.toString() ?? ""
		let wikilinks = parseWikiLinks(content)
		let wikilinkIds = wikilinks.map(w => w.id)
		let wikilinkCache = await resolveDocTitles(wikilinkIds)

		return { doc, loadingState: null, wikilinkCache }
	},
	component: SlideshowPage,
})

function SlideshowPage() {
	let { id } = Route.useParams()
	let data = Route.useLoaderData()
	let navigate = useNavigate()

	useScreenWakeLock()

	let subscribedDoc = useCoState(Document, id, { resolve })

	// Extract content for wikilinks (use loader data as fallback, empty if neither)
	let content =
		(subscribedDoc.$isLoaded ? subscribedDoc : data.doc)?.content?.toString() ??
		""
	let wikilinkIds = parseWikiLinks(content).map(w => w.id)
	let wikilinks = useDocTitles(wikilinkIds, data.wikilinkCache)

	// Error states from loader
	if (!data.doc) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Handle live access revocation
	if (
		!subscribedDoc.$isLoaded &&
		subscribedDoc.$jazz.loadingState !== "loading"
	) {
		if (subscribedDoc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Fall back to preloaded data while subscription is loading
	let doc = subscribedDoc.$isLoaded ? subscribedDoc : data.doc
	let items = content ? parsePresentation(content) : []
	let slides = getSlides(items)

	let currentSlideNumber =
		doc.presentationLine !== undefined && items[doc.presentationLine]
			? items[doc.presentationLine].slideNumber
			: 1

	let assets = doc.assets?.filter(a => a?.$isLoaded) ?? []
	let canEditDoc = canEdit(doc)

	return (
		<Slideshow
			content={content}
			slides={slides}
			assets={assets}
			wikilinks={wikilinks}
			currentSlideNumber={currentSlideNumber}
			onSlideChange={canEditDoc ? makeSlideChange(doc, items) : undefined}
			onExit={
				canEditDoc
					? () => navigate({ to: "/doc/$id", params: { id } })
					: undefined
			}
			onGoToTeleprompter={
				canEditDoc
					? () => navigate({ to: "/doc/$id/teleprompter", params: { id } })
					: undefined
			}
		/>
	)
}

type LoadedDoc = co.loaded<typeof Document, typeof resolve>

function makeSlideChange(doc: LoadedDoc, items: PresentationItem[]) {
	return function handleSlideChange(slideNumber: number) {
		let idx = items.findIndex(
			i => i.slideNumber === slideNumber && i.type === "block",
		)
		if (idx >= 0) {
			doc.$jazz.set("presentationLine", idx)
		}
	}
}

function getSlides(items: PresentationItem[]): Slide[] {
	let slideMap = new Map<number, Slide["blocks"]>()
	for (let item of items) {
		if (item.type === "block") {
			let blocks = slideMap.get(item.slideNumber) ?? []
			blocks.push(item.block)
			slideMap.set(item.slideNumber, blocks)
		}
	}
	return Array.from(slideMap.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([slideNumber, blocks]) => ({ slideNumber, blocks }))
}
