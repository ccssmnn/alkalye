import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { type ResolveQuery, co } from "jazz-tools"
import { Document, Space } from "@/schema"
import {
	DocumentNotFound,
	DocumentUnauthorized,
	SpaceDeleted,
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

let spaceResolve = {
	documents: true,
} as const satisfies ResolveQuery<typeof Space>

let Route = createFileRoute("/spaces/$spaceId/doc/$id/slideshow")({
	loader: async ({ params }) => {
		let [space, doc] = await Promise.all([
			Space.load(params.spaceId, { resolve: spaceResolve }),
			Document.load(params.id, { resolve }),
		])

		if (!space.$isLoaded) {
			return {
				space: null,
				doc: null,
				loadingState: space.$jazz.loadingState as
					| "unauthorized"
					| "unavailable",
				wikilinkCache: new Map<string, ResolvedDoc>(),
			}
		}

		if (!doc.$isLoaded) {
			return {
				space,
				doc: null,
				loadingState: doc.$jazz.loadingState as "unauthorized" | "unavailable",
				wikilinkCache: new Map<string, ResolvedDoc>(),
			}
		}

		let content = doc.content?.toString() ?? ""
		let wikilinks = parseWikiLinks(content)
		let wikilinkIds = wikilinks.map(w => w.id)
		let wikilinkCache = await resolveDocTitles(wikilinkIds)

		return { space, doc, loadingState: null, wikilinkCache }
	},
	component: SpaceSlideshowPage,
})

function SpaceSlideshowPage() {
	let { spaceId, id } = Route.useParams()
	let data = Route.useLoaderData()
	let navigate = useNavigate()

	let space = useCoState(Space, spaceId, { resolve: spaceResolve })
	let doc = useCoState(Document, id, { resolve })

	let content = doc.$isLoaded ? (doc.content?.toString() ?? "") : ""
	let wikilinkIds = parseWikiLinks(content).map(w => w.id)
	let wikilinks = useDocTitles(wikilinkIds, data.wikilinkCache)

	// Space not found or unauthorized
	if (!data.space) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Space deleted
	if (space.$isLoaded && space.deletedAt) {
		return <SpaceDeleted />
	}

	// Doc not found or unauthorized
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
						render={
							<Link to="/spaces/$spaceId/doc/$id" params={{ spaceId, id }} />
						}
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
					? () =>
							navigate({
								to: "/spaces/$spaceId/doc/$id",
								params: { spaceId, id },
							})
					: undefined
			}
			onGoToTeleprompter={() =>
				navigate({
					to: "/spaces/$spaceId/doc/$id/teleprompter",
					params: { spaceId, id },
				})
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
