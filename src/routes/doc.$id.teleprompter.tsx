import { useEffect, useRef, useState } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { type ID, type ResolveQuery, type co } from "jazz-tools"
import { Document } from "@/schema"
import {
	parsePresentation,
	type VisualBlock,
	type SlideContent,
	type PresentationItem,
	type TextSegment,
} from "@/lib/presentation"
import { WikilinkProvider, useWikilinkResolver } from "@/lib/wikilink-context"
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
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
import { cn } from "@/lib/utils"
import { Loader2, FileText } from "lucide-react"

export { Route }

let Route = createFileRoute("/doc/$id/teleprompter")({
	loader: async ({ params }) => {
		let doc = await Document.load(params.id as ID<typeof Document>, {
			resolve,
		})
		if (!doc.$isLoaded) {
			return {
				doc: null,
				loadingState: doc.$jazz.loadingState as "unauthorized" | "unavailable",
			}
		}
		return { doc, loadingState: null }
	},
	component: TeleprompterPage,
})

let resolve = {
	content: true,
} as const satisfies ResolveQuery<typeof Document>

function TeleprompterPage() {
	let { id } = Route.useParams()
	let data = Route.useLoaderData()

	let doc = useCoState(Document, id, { resolve })

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

	let content = doc.content?.toString() ?? ""
	let items = content ? parsePresentation(content) : []
	let slideGroups = groupBySlide(items)

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
						render={<Link to="/doc/$id" params={{ id }} />}
					>
						Back to Editor
					</Button>
				</EmptyContent>
			</Empty>
		)
	}

	let presentationIndex = doc.presentationLine
	let currentSlideNumber =
		presentationIndex !== undefined && items[presentationIndex]
			? items[presentationIndex].slideNumber
			: 0
	let currentSlideIdx = slideGroups.findIndex(
		s => s.slideNumber === currentSlideNumber,
	)

	function setIndex(index: number) {
		if (!doc.$isLoaded) return
		doc.$jazz.set("presentationLine", index)
	}

	return (
		<WikilinkProvider>
			<div className="bg-background fixed inset-0 flex flex-col">
				<TopBar
					id={id}
					currentSlideIdx={currentSlideIdx}
					totalSlides={slideGroups.length}
				/>
				<ProgressBar
					presentationIndex={presentationIndex}
					currentSlideIdx={currentSlideIdx}
					slideGroups={slideGroups}
					items={items}
				/>
				<div
					className="flex-1 overflow-auto"
					style={{
						paddingLeft: "env(safe-area-inset-left)",
						paddingRight: "env(safe-area-inset-right)",
					}}
				>
					<div className="mx-auto max-w-2xl py-4 pb-20 text-2xl leading-relaxed">
						{presentationIndex === undefined && items.length > 0 && (
							<div className="flex flex-col items-center gap-4 py-8">
								<p className="text-muted-foreground text-sm">
									Press any arrow key or click an item to start
								</p>
								<Button onClick={() => setIndex(0)}>Start Presentation</Button>
							</div>
						)}
						{slideGroups.map(group => (
							<SlideSection
								key={group.slideNumber}
								slideNumber={group.slideNumber}
							>
								{group.items.map(item => {
									let idx = items.indexOf(item)
									let isCurrent = presentationIndex === idx
									if (item.type === "block") {
										return (
											<VisualBlockView
												key={`block-${item.block.startLine}`}
												block={item.block}
												isCurrent={isCurrent}
												onClick={() => setIndex(idx)}
											/>
										)
									}
									return (
										<TeleprompterLineView
											key={`line-${item.lineNumber}`}
											lineNumber={item.lineNumber}
											text={item.text}
											isCurrent={isCurrent}
											onClick={() => setIndex(idx)}
										/>
									)
								})}
							</SlideSection>
						))}
					</div>
				</div>
				<BottomToolbar
					id={id}
					doc={doc}
					items={items}
					slideGroups={slideGroups}
				/>
			</div>
		</WikilinkProvider>
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

function ProgressBar({
	presentationIndex,
	currentSlideIdx,
	slideGroups,
	items,
}: {
	presentationIndex: number | undefined
	currentSlideIdx: number
	slideGroups: SlideGroup[]
	items: PresentationItem[]
}) {
	let totalSlides = slideGroups.length
	let progress = 0

	if (presentationIndex !== undefined && totalSlides > 0) {
		let currentGroup = slideGroups[currentSlideIdx]
		if (currentGroup) {
			let currentItem = items[presentationIndex]
			let itemIndexInSlide = currentGroup.items.indexOf(currentItem)
			let itemsInSlide = currentGroup.items.length
			let slideBase = (currentSlideIdx / totalSlides) * 100
			let slideWidth = 100 / totalSlides
			let itemProgress =
				itemsInSlide > 1
					? ((itemIndexInSlide + 1) / itemsInSlide) * slideWidth
					: slideWidth
			progress = slideBase + itemProgress
		}
	}

	return (
		<div className="bg-muted h-1 shrink-0">
			<div
				className="bg-brand h-full transition-all duration-200"
				style={{ width: `${progress}%` }}
			/>
		</div>
	)
}

type LoadedDocument = co.loaded<typeof Document, typeof resolve>

function BottomToolbar({
	id,
	doc,
	items,
	slideGroups,
}: {
	id: string
	doc: LoadedDocument
	items: PresentationItem[]
	slideGroups: SlideGroup[]
}) {
	let navigate = useNavigate()

	let presentationIndex = doc.presentationLine
	let currentSlideNumber =
		presentationIndex !== undefined && items[presentationIndex]
			? items[presentationIndex].slideNumber
			: 0
	let currentSlideIdx = slideGroups.findIndex(
		s => s.slideNumber === currentSlideNumber,
	)

	function setIndex(index: number) {
		doc.$jazz.set("presentationLine", index)
	}

	function goToSlide(slideNumber: number) {
		let idx = items.findIndex(
			i => i.slideNumber === slideNumber && i.type === "block",
		)
		if (idx >= 0) setIndex(idx)
	}

	function goToPrevSlide() {
		if (currentSlideIdx > 0) {
			goToSlide(slideGroups[currentSlideIdx - 1].slideNumber)
		}
	}

	function goToNextSlide() {
		if (currentSlideIdx < slideGroups.length - 1) {
			goToSlide(slideGroups[currentSlideIdx + 1].slideNumber)
		}
	}

	function goToPrevItem() {
		if (presentationIndex !== undefined && presentationIndex > 0) {
			setIndex(presentationIndex - 1)
		}
	}

	function goToNextItem() {
		if (
			presentationIndex !== undefined &&
			presentationIndex < items.length - 1
		) {
			setIndex(presentationIndex + 1)
		}
	}

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.preventDefault()
				navigate({ to: "/doc/$id", params: { id } })
				return
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault()
				goToPrevSlide()
				return
			}
			if (e.key === "ArrowRight") {
				e.preventDefault()
				goToNextSlide()
				return
			}
			if (e.key === "ArrowUp") {
				e.preventDefault()
				goToPrevItem()
				return
			}
			if (e.key === "ArrowDown" || e.key === " ") {
				e.preventDefault()
				goToNextItem()
				return
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	})

	let canPrevSlide = currentSlideIdx > 0
	let canNextSlide = currentSlideIdx < slideGroups.length - 1
	let canPrevItem = presentationIndex !== undefined && presentationIndex > 0
	let canNextItem =
		presentationIndex !== undefined && presentationIndex < items.length - 1

	return (
		<TooltipProvider>
			<div
				className="border-border bg-background flex shrink-0 flex-col border-t px-4 py-2 md:flex-row md:items-center md:justify-between"
				style={{
					paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
					paddingLeft: "max(1rem, env(safe-area-inset-left))",
					paddingRight: "max(1rem, env(safe-area-inset-right))",
				}}
			>
				<div className="flex items-center justify-between md:hidden">
					<Clock />
					<PresentationTimer />
				</div>
				<div className="mt-2 flex items-center justify-center gap-4 md:hidden">
					<NavButton
						icon={<ChevronLeft />}
						tooltip="Prev Slide (←)"
						onClick={goToPrevSlide}
						disabled={!canPrevSlide}
						mobile
					/>
					<NavButton
						icon={<ArrowUp />}
						tooltip="Prev Item (↑)"
						onClick={goToPrevItem}
						disabled={!canPrevItem}
						mobile
					/>
					<NavButton
						icon={<ArrowDown />}
						tooltip="Next Item (↓)"
						onClick={goToNextItem}
						disabled={!canNextItem}
						mobile
					/>
					<NavButton
						icon={<ChevronRight />}
						tooltip="Next Slide (→)"
						onClick={goToNextSlide}
						disabled={!canNextSlide}
						mobile
					/>
				</div>

				<div className="hidden md:block">
					<Clock />
				</div>
				<div className="hidden items-center gap-2 md:flex">
					<NavButton
						icon={<ChevronLeft />}
						tooltip="Prev Slide (←)"
						onClick={goToPrevSlide}
						disabled={!canPrevSlide}
					/>
					<NavButton
						icon={<ArrowUp />}
						tooltip="Prev Item (↑)"
						onClick={goToPrevItem}
						disabled={!canPrevItem}
					/>
					<NavButton
						icon={<ArrowDown />}
						tooltip="Next Item (↓)"
						onClick={goToNextItem}
						disabled={!canNextItem}
					/>
					<NavButton
						icon={<ChevronRight />}
						tooltip="Next Slide (→)"
						onClick={goToNextSlide}
						disabled={!canNextSlide}
					/>
				</div>
				<div className="hidden md:block">
					<PresentationTimer />
				</div>
			</div>
		</TooltipProvider>
	)
}

function NavButton({
	icon,
	tooltip,
	onClick,
	disabled,
	mobile,
}: {
	icon: React.ReactNode
	tooltip: string
	onClick: () => void
	disabled: boolean
	mobile?: boolean
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size={mobile ? "lg" : "icon"}
						className={mobile ? "h-14 w-14" : undefined}
						onClick={onClick}
						disabled={disabled}
					>
						{icon}
					</Button>
				}
			/>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	)
}

function SlideSection({
	slideNumber,
	children,
}: {
	slideNumber: number
	children: React.ReactNode
}) {
	return (
		<div className="border-border mb-6 border-b pb-6 last:border-0">
			<div className="text-muted-foreground mb-2 px-4 text-xs">
				Slide {slideNumber}
			</div>
			{children}
		</div>
	)
}

function VisualBlockView({
	block,
	isCurrent,
	onClick,
}: {
	block: VisualBlock
	isCurrent: boolean
	onClick: () => void
}) {
	let ref = useScrollIntoView(isCurrent)

	let baseClass = cn(
		"cursor-pointer rounded-r px-4 py-2 transition-colors hover:bg-muted border-l-4 border-foreground",
		isCurrent && "bg-brand text-white",
	)

	return (
		<div
			ref={ref}
			data-line={block.startLine}
			onClick={onClick}
			className={baseClass}
		>
			{block.content.map((item, i) => (
				<ContentItemView key={i} item={item} isOnSlide isCurrent={isCurrent} />
			))}
		</div>
	)
}

function TeleprompterLineView({
	lineNumber,
	text,
	isCurrent,
	onClick,
}: {
	lineNumber: number
	text: string
	isCurrent: boolean
	onClick: () => void
}) {
	let ref = useScrollIntoView(isCurrent)

	let baseClass = cn(
		"cursor-pointer rounded px-4 py-1 transition-colors hover:bg-muted text-muted-foreground",
		isCurrent && "bg-brand text-white",
	)

	return (
		<div
			ref={ref}
			data-line={lineNumber}
			onClick={onClick}
			className={baseClass}
		>
			{text}
		</div>
	)
}

function useScrollIntoView(isCurrent: boolean) {
	let ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!isCurrent || !ref.current) return
		let el = ref.current
		let container = el.closest(".overflow-auto")
		if (!container) return

		let elRect = el.getBoundingClientRect()
		let containerRect = container.getBoundingClientRect()
		let scrollTop = container.scrollTop + (elRect.top - containerRect.top) - 48
		container.scrollTo({ top: scrollTop, behavior: "smooth" })
	}, [isCurrent])

	return ref
}

function RenderSegments({ segments }: { segments: TextSegment[] }) {
	let resolver = useWikilinkResolver()
	return (
		<>
			{segments.map((seg, i) => {
				if (seg.type === "link") {
					return (
						<a
							key={i}
							href={seg.href}
							target="_blank"
							rel="noopener noreferrer"
							className="text-brand underline"
							onClick={e => e.stopPropagation()}
						>
							{seg.text}
						</a>
					)
				}
				if (seg.type === "strong") {
					return (
						<strong key={i}>
							<RenderSegments segments={seg.segments} />
						</strong>
					)
				}
				if (seg.type === "em") {
					return (
						<em key={i}>
							<RenderSegments segments={seg.segments} />
						</em>
					)
				}
				if (seg.type === "del") {
					return (
						<del key={i}>
							<RenderSegments segments={seg.segments} />
						</del>
					)
				}
				if (seg.type === "codespan") {
					return (
						<code key={i} className="bg-muted rounded px-1">
							{seg.text}
						</code>
					)
				}
				if (seg.type === "wikilink") {
					let resolved = resolver(seg.docId)
					return (
						<span
							key={i}
							className={
								resolved.exists ? "wikilink" : "wikilink wikilink-broken"
							}
						>
							{resolved.title}
						</span>
					)
				}
				return <span key={i}>{seg.text}</span>
			})}
		</>
	)
}

function ContentItemView({
	item,
	isOnSlide,
	isCurrent,
}: {
	item: SlideContent
	isOnSlide: boolean
	isCurrent?: boolean
}) {
	let textClass = isCurrent
		? "text-inherit"
		: isOnSlide
			? "text-foreground"
			: "text-muted-foreground"

	if (item.type === "heading") {
		return (
			<div className={cn("font-semibold", textClass)}>
				<RenderSegments segments={item.segments} />
			</div>
		)
	}

	if (item.type === "code") {
		return (
			<pre className="bg-muted/50 overflow-x-auto rounded p-2">
				<code className={cn("font-mono", textClass)}>{item.text}</code>
			</pre>
		)
	}

	if (item.type === "list") {
		let listClass = cn(
			"space-y-1",
			item.ordered ? "list-decimal" : "list-disc",
			"pl-6",
			textClass,
		)
		let listItems = item.items.map((listItem, i) => (
			<li key={i}>
				<RenderSegments segments={listItem.segments} />
			</li>
		))
		return item.ordered ? (
			<ol className={listClass}>{listItems}</ol>
		) : (
			<ul className={listClass}>{listItems}</ul>
		)
	}

	if (item.type === "blockquote") {
		return (
			<blockquote
				className={cn("border-brand border-l-4 pl-4 italic", textClass)}
			>
				<RenderSegments segments={item.segments} />
			</blockquote>
		)
	}

	if (item.type === "table") {
		return (
			<table className="w-full text-left">
				<tbody>
					{item.rows.map((row, i) => (
						<tr key={i} className="border-border border-b">
							{row.map((cell, j) => (
								<td key={j} className={cn("px-2 py-1", textClass)}>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		)
	}

	if (item.type === "image") {
		return <span className={textClass}>[Image: {item.alt || item.src}]</span>
	}

	return (
		<div className={textClass}>
			<RenderSegments segments={item.segments} />
		</div>
	)
}

function Clock() {
	let [time, setTime] = useState(() => Date.now())

	useEffect(() => {
		let interval = setInterval(() => setTime(Date.now()), 1000)
		return () => clearInterval(interval)
	}, [])

	let display = new Date(time).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	})

	return (
		<span className="text-muted-foreground w-16 text-sm tabular-nums">
			{display}
		</span>
	)
}

function PresentationTimer() {
	let [startTime, setStartTime] = useState(() => Date.now())
	let [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		let interval = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(interval)
	}, [])

	let elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000))
	let minutes = Math.floor(elapsedSeconds / 60)
	let seconds = elapsedSeconds % 60
	let display = `${minutes}:${seconds.toString().padStart(2, "0")}`

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<button
						className="text-muted-foreground hover:text-foreground w-16 text-right text-sm tabular-nums transition-colors"
						onClick={() => setStartTime(Date.now())}
					>
						{display}
					</button>
				}
			/>
			<TooltipContent>Click to reset timer</TooltipContent>
		</Tooltip>
	)
}

type SlideGroup = { slideNumber: number; items: PresentationItem[] }

function groupBySlide(items: PresentationItem[]): SlideGroup[] {
	let slideMap = new Map<number, PresentationItem[]>()
	for (let item of items) {
		let arr = slideMap.get(item.slideNumber) ?? []
		arr.push(item)
		slideMap.set(item.slideNumber, arr)
	}
	return Array.from(slideMap.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([slideNumber, items]) => ({ slideNumber, items }))
}
