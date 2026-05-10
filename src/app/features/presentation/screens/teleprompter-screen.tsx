import { Link, useNavigate } from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { type ResolveQuery, co } from "jazz-tools"
import { FileText } from "lucide-react"
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
import { parseWikiLinks } from "@/editor/wikilink-parser"
import {
	resolveDocTitles,
	useDocTitles,
	type ResolvedDoc,
} from "@/lib/doc-resolver"
import { Teleprompter, groupBySlide } from "../widgets/teleprompter"
import { parsePresentation } from "../lib/presentation"
import { useScreenWakeLock } from "../lib/screen-wake-lock"

export { TeleprompterScreen, resolve, loadWikilinkCache }
export type { LoaderData }

let resolve = {
	content: true,
} as const satisfies ResolveQuery<typeof Document>

type LoadedDoc = co.loaded<typeof Document, typeof resolve>

interface LoaderData {
	doc: LoadedDoc | null
	loadingState: "unauthorized" | "unavailable" | null
	wikilinkCache: Map<string, ResolvedDoc>
}

async function loadWikilinkCache(
	doc: LoadedDoc,
): Promise<Map<string, ResolvedDoc>> {
	let content = doc.content?.toString() ?? ""
	let wikilinks = parseWikiLinks(content)
	let wikilinkIds = wikilinks.map(w => w.id)
	return resolveDocTitles(wikilinkIds)
}

interface TeleprompterScreenProps {
	id: string
	loaderData: LoaderData
}

function TeleprompterScreen({ id, loaderData }: TeleprompterScreenProps) {
	let navigate = useNavigate()

	useScreenWakeLock()

	let subscribedDoc = useCoState(Document, id, { resolve })

	let content =
		(subscribedDoc.$isLoaded
			? subscribedDoc
			: loaderData.doc
		)?.content?.toString() ?? ""
	let wikilinkIds = parseWikiLinks(content).map(w => w.id)
	let wikilinks = useDocTitles(wikilinkIds, loaderData.wikilinkCache)

	if (!loaderData.doc) {
		if (loaderData.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	if (
		!subscribedDoc.$isLoaded &&
		subscribedDoc.$jazz.loadingState !== "loading"
	) {
		if (subscribedDoc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	let doc = subscribedDoc.$isLoaded ? subscribedDoc : loaderData.doc
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
				content={content}
				wikilinks={wikilinks}
				presentationIndex={doc.presentationLine}
				onIndexChange={index => doc.$jazz.set("presentationLine", index)}
				onHighlightChange={range =>
					doc.$jazz.set("highlightRange", range ?? undefined)
				}
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
