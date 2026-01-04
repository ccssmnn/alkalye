import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { type ID, type ResolveQuery, co } from "jazz-tools"
import { Document } from "@/schema"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/components/document-error-states"
import {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { Slideshow, type Slide } from "@/components/slideshow"
import { parsePresentation, type PresentationItem } from "@/lib/presentation"
import { parseWikiLinks } from "@/editor/wikilink-parser"
import {
	resolveDocTitles,
	useDocTitles,
	type ResolvedDoc,
} from "@/lib/doc-resolver"
import { canEdit } from "@/lib/sharing"
import { Loader2, FileText } from "lucide-react"

export { Route }

let resolve = {
	content: true,
} as const satisfies ResolveQuery<typeof Document>

let Route = createFileRoute("/doc/$id/slideshow")({
	loader: async ({ params }) => {
		let doc = await Document.load(params.id as ID<typeof Document>, {
			resolve,
		})
		if (!doc.$isLoaded) {
			return {
				doc: null,
				loadingState: doc.$jazz.loadingState as "unauthorized" | "unavailable",
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

	let doc = useCoState(Document, id, { resolve })

	let content = doc.$isLoaded ? (doc.content?.toString() ?? "") : ""
	let wikilinkIds = parseWikiLinks(content).map(w => w.id)
	let wikilinks = useDocTitles(wikilinkIds, data.wikilinkCache)

	if (!data.doc) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	if (!doc.$isLoaded && doc.$jazz.loadingState !== "loading") {
		if (doc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	if (!doc.$isLoaded) {
		return (
			<Empty className="h-screen">
				<EmptyHeader>
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<EmptyTitle>Loading presentation...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	let items = content ? parsePresentation(content) : []
	let slides = getSlides(items)

	if (slides.length === 0) {
		return (
			<Empty className="h-screen">
				<EmptyHeader>
					<FileText className="text-muted-foreground size-8" />
					<EmptyTitle>No slides found</EmptyTitle>
					<EmptyDescription>
						Add headings (# or ##) to create slides
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button
						variant="outline"
						nativeButton={false}
						render={<Link to="/doc/$id" params={{ id }} />}
					>
						Back to Editor
					</Button>
				</EmptyContent>
			</Empty>
		)
	}

	let currentSlideNumber =
		doc.presentationLine !== undefined && items[doc.presentationLine]
			? items[doc.presentationLine].slideNumber
			: 1

	let canEditDoc = canEdit(doc)

	return (
		<Slideshow
			content={content}
			slides={slides}
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
