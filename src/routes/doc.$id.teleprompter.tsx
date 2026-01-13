import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { type ResolveQuery } from "jazz-tools"
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
import { Teleprompter, groupBySlide } from "@/components/teleprompter"
import { parsePresentation } from "@/lib/presentation"
import { parseWikiLinks } from "@/editor/wikilink-parser"
import {
	resolveDocTitles,
	useDocTitles,
	type ResolvedDoc,
} from "@/lib/doc-resolver"
import { useScreenWakeLock } from "@/lib/screen-wake-lock"
import { Loader2, FileText } from "lucide-react"

export { Route }

let resolve = {
	content: true,
} as const satisfies ResolveQuery<typeof Document>

let Route = createFileRoute("/doc/$id/teleprompter")({
	loader: async ({ params }) => {
		let doc = await Document.load(params.id, { resolve })
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
	component: TeleprompterPage,
})

function TeleprompterPage() {
	let { id } = Route.useParams()
	let data = Route.useLoaderData()
	let navigate = useNavigate()

	useScreenWakeLock()

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
					<EmptyTitle>Loading document...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	let items = content ? parsePresentation(content) : []

	if (items.length === 0) {
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

	let slideGroups = groupBySlide(items)
	let currentSlideNumber =
		doc.presentationLine !== undefined && items[doc.presentationLine]
			? items[doc.presentationLine].slideNumber
			: 0
	let currentSlideIdx = slideGroups.findIndex(
		s => s.slideNumber === currentSlideNumber,
	)

	return (
		<div className="bg-background fixed inset-0 flex flex-col">
			<TopBar
				id={id}
				currentSlideIdx={currentSlideIdx}
				totalSlides={slideGroups.length}
			/>
			<Teleprompter
				items={items}
				wikilinks={wikilinks}
				presentationIndex={doc.presentationLine}
				onIndexChange={index => doc.$jazz.set("presentationLine", index)}
				onExit={() => navigate({ to: "/doc/$id", params: { id } })}
			/>
		</div>
	)
}

function TopBar({
	id,
	currentSlideIdx,
	totalSlides,
}: {
	id: string
	currentSlideIdx: number
	totalSlides: number
}) {
	return (
		<div
			className="border-border relative flex shrink-0 items-center justify-between border-b px-4 py-2"
			style={{
				paddingTop: "max(0.5rem, env(safe-area-inset-top))",
				paddingLeft: "max(1rem, env(safe-area-inset-left))",
				paddingRight: "max(1rem, env(safe-area-inset-right))",
			}}
		>
			<Button
				variant="ghost"
				size="sm"
				nativeButton={false}
				render={<Link to="/doc/$id" params={{ id }} />}
			>
				Editor
			</Button>
			<span className="text-muted-foreground absolute left-1/2 -translate-x-1/2 text-sm">
				Slide {currentSlideIdx + 1} / {totalSlides}
			</span>
			<Button
				variant="ghost"
				size="sm"
				nativeButton={false}
				render={
					<a
						href={`/doc/${id}/slideshow`}
						target="_blank"
						rel="noopener noreferrer"
					/>
				}
			>
				Slideshow
			</Button>
		</div>
	)
}
