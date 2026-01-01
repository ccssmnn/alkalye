import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	useLayoutEffect,
} from "react"
import { codeToHtml } from "shiki"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { type ID, type ResolveQuery, type co } from "jazz-tools"
import { Document } from "@/schema"
import {
	parsePresentation,
	parsePresentationSize,
	parsePresentationTheme,
	type SlideContent,
	type VisualBlock,
	type PresentationItem,
	type PresentationSize,
	type PresentationTheme,
	type TextSegment,
} from "@/lib/presentation"
import { WikilinkProvider, useWikilinkResolver } from "@/lib/wikilink-context"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/components/document-error-states"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
} from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import { canEdit } from "@/lib/sharing"
import { cn } from "@/lib/utils"
import { EllipsisIcon, Loader2, FileText } from "lucide-react"

export { Route }

let ThemeContext = createContext<PresentationTheme | null>(null)

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
			}
		}
		return { doc, loadingState: null }
	},
	component: ShowPage,
})

type LoadedDocument = co.loaded<typeof Document, typeof resolve>

function ShowPage() {
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
					<EmptyTitle>Loading presentation...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	let content = doc.content?.toString() ?? ""
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

	let size = parsePresentationSize(content)
	let theme = parsePresentationTheme(content)

	let presentationIndex = doc.presentationLine
	let currentSlideNumber =
		presentationIndex !== undefined && items[presentationIndex]
			? items[presentationIndex].slideNumber
			: 1
	let currentSlide = slides.find(s => s.slideNumber === currentSlideNumber)
	let currentSlideIdx = slides.findIndex(
		s => s.slideNumber === currentSlideNumber,
	)

	function goToNextSlide() {
		if (!doc.$isLoaded) return
		if (currentSlideIdx < slides.length - 1) {
			let nextSlideNumber = slides[currentSlideIdx + 1].slideNumber
			let idx = items.findIndex(
				i => i.slideNumber === nextSlideNumber && i.type === "block",
			)
			if (idx >= 0) {
				doc.$jazz.set("presentationLine", idx)
			}
		}
	}

	let visibleBlocks = currentSlide?.blocks ?? []
	let blockCount = visibleBlocks.length

	let gridClass = cn(
		"grid gap-8 w-full h-full",
		blockCount === 1 && "grid-cols-1 grid-rows-1",
		blockCount === 2 && "grid-cols-2 grid-rows-1",
		blockCount === 3 && "grid-cols-3 grid-rows-1",
		blockCount >= 4 && "grid-cols-2 grid-rows-2",
	)

	return (
		<WikilinkProvider>
			<ThemeContext.Provider value={theme}>
				<div
					className={cn(
						"fixed inset-0 flex flex-col",
						theme === "light" && "bg-white text-black",
						theme === "dark" && "bg-black text-white",
						!theme && "bg-background text-foreground",
					)}
				>
					<ScaledSlideContainer
						gridClass={gridClass}
						blocks={visibleBlocks}
						size={size}
						slideNumber={currentSlideNumber}
						onClick={goToNextSlide}
					/>
					<SlideControls id={id} doc={doc} items={items} slides={slides} />
				</div>
			</ThemeContext.Provider>
		</WikilinkProvider>
	)
}

function SlideControls({
	id,
	doc,
	items,
	slides,
}: {
	id: string
	doc: LoadedDocument
	items: PresentationItem[]
	slides: Slide[]
}) {
	let navigate = useNavigate()

	let presentationIndex = doc.presentationLine
	let currentSlideNumber =
		presentationIndex !== undefined && items[presentationIndex]
			? items[presentationIndex].slideNumber
			: 1
	let currentSlideIdx = slides.findIndex(
		s => s.slideNumber === currentSlideNumber,
	)

	function goToSlide(slideNumber: number) {
		let idx = items.findIndex(
			i => i.slideNumber === slideNumber && i.type === "block",
		)
		if (idx >= 0) {
			doc.$jazz.set("presentationLine", idx)
		}
	}

	function goToPrevSlide() {
		if (currentSlideIdx > 0) {
			goToSlide(slides[currentSlideIdx - 1].slideNumber)
		}
	}

	function goToNextSlide() {
		if (currentSlideIdx < slides.length - 1) {
			goToSlide(slides[currentSlideIdx + 1].slideNumber)
		}
	}

	function handleFullscreen() {
		if (document.fullscreenElement) {
			document.exitFullscreen()
		} else {
			document.documentElement.requestFullscreen()
		}
	}

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				if (document.fullscreenElement) {
					document.exitFullscreen()
				} else {
					navigate({ to: "/doc/$id", params: { id } })
				}
				return
			}
			if (e.key === "ArrowLeft") {
				e.preventDefault()
				goToPrevSlide()
				return
			}
			if (e.key === "ArrowRight" || e.key === " ") {
				e.preventDefault()
				goToNextSlide()
				return
			}
			if (e.key === "f" || e.key === "F") {
				e.preventDefault()
				handleFullscreen()
				return
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	})

	let hasPrev = currentSlideIdx > 0
	let hasNext = currentSlideIdx < slides.length - 1
	let canEditDoc = canEdit(doc)

	return (
		<div
			className="fixed right-4 bottom-4 z-50"
			style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
		>
			<DropdownMenu>
				<DropdownMenuTrigger className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex size-8 items-center justify-center rounded-sm opacity-40 transition-opacity hover:opacity-100">
					<EllipsisIcon className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" side="top" sideOffset={8}>
					<DropdownMenuItem onClick={goToPrevSlide} disabled={!hasPrev}>
						Previous slide
						<DropdownMenuShortcut>←</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem onClick={goToNextSlide} disabled={!hasNext}>
						Next slide
						<DropdownMenuShortcut>→</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={handleFullscreen}>
						Toggle fullscreen
						<DropdownMenuShortcut>F</DropdownMenuShortcut>
					</DropdownMenuItem>
					{canEditDoc && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem render={<Link to="/doc/$id" params={{ id }} />}>
								Go to editor
								<DropdownMenuShortcut>Esc</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem render={<a href={`/doc/${id}/teleprompter`} />}>
								Go to teleprompter
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

let baseSizes: Record<PresentationSize, { h1: number; body: number }> = {
	S: { h1: 72, body: 36 },
	M: { h1: 96, body: 48 },
	L: { h1: 120, body: 60 },
}

function ScaledSlideContainer({
	gridClass,
	blocks,
	size,
	slideNumber,
	onClick,
}: {
	gridClass: string
	blocks: VisualBlock[]
	size: PresentationSize
	slideNumber: number
	onClick: () => void
}) {
	let containerRef = useRef<HTMLDivElement>(null)
	let measuringRef = useRef<HTMLDivElement>(null)
	let [measuringScale, setMeasuringScale] = useState(1)
	let [ready, setReady] = useState(false)
	let [fadingOut, setFadingOut] = useState(false)
	let [displayedBlocks, setDisplayedBlocks] = useState(blocks)
	let [displayedGridClass, setDisplayedGridClass] = useState(gridClass)
	let [displayedScale, setDisplayedScale] = useState(1)
	let prevSlideRef = useRef(slideNumber)

	let baseSize = baseSizes[size]

	useLayoutEffect(() => {
		let container = containerRef.current
		let measuring = measuringRef.current
		if (!container || !measuring) return

		let cancelled = false
		let isSlideChange = prevSlideRef.current !== slideNumber
		prevSlideRef.current = slideNumber

		// Start fade out of old content
		if (isSlideChange) {
			setFadingOut(true)
		}

		setMeasuringScale(1)

		function fits() {
			if (!container || !measuring) return true
			let cells = measuring.children
			for (let cell of cells) {
				if (cell.scrollWidth > cell.clientWidth + 1) return false
				if (cell.scrollHeight > cell.clientHeight + 1) return false
			}
			if (measuring.scrollWidth > container.clientWidth + 1) return false
			if (measuring.scrollHeight > container.clientHeight + 1) return false
			return true
		}

		async function binarySearch() {
			let low = 10
			let high = 100

			while (low <= high) {
				if (cancelled) return
				let mid = Math.floor((low + high) / 2)
				setMeasuringScale(mid / 100)
				await new Promise(r => requestAnimationFrame(r))
				await new Promise(r => requestAnimationFrame(r))
				if (cancelled) return
				if (fits()) {
					low = mid + 1
				} else {
					high = mid - 1
				}
			}

			return Math.max(10, Math.min(high, 100))
		}

		async function animate() {
			let fadeOutPromise = isSlideChange
				? new Promise(r => setTimeout(r, 100))
				: Promise.resolve()

			let [finalScale] = await Promise.all([binarySearch(), fadeOutPromise])
			if (cancelled || finalScale === undefined) return

			setDisplayedBlocks(blocks)
			setDisplayedGridClass(gridClass)
			setDisplayedScale(finalScale / 100)
			setFadingOut(false)
			setReady(true)
		}

		animate()

		return () => {
			cancelled = true
		}
	}, [slideNumber, baseSize, blocks, gridClass])

	useEffect(() => {
		let container = containerRef.current
		if (!container) return

		let observer = new ResizeObserver(() => {
			setReady(false)
			setMeasuringScale(1)
		})

		observer.observe(container)
		return () => observer.disconnect()
	}, [])

	return (
		<div
			ref={containerRef}
			className="flex flex-1 cursor-pointer items-center justify-center overflow-hidden p-8"
			onClick={onClick}
		>
			{ready && (
				<div
					className={displayedGridClass}
					style={
						{
							"--slide-h1-size": `${baseSize.h1 * displayedScale}px`,
							"--slide-body-size": `${baseSize.body * displayedScale}px`,
							opacity: fadingOut ? 0 : 1,
							transition: "opacity 100ms ease-in",
							maxWidth: "100%",
							maxHeight: "100%",
						} as React.CSSProperties
					}
				>
					{displayedBlocks.map((block, i) => (
						<div
							key={i}
							className="flex min-h-0 min-w-0 flex-col items-center justify-center text-center"
						>
							{block.content.map((item, j) => (
								<SlideContentItem key={j} item={item} />
							))}
						</div>
					))}
				</div>
			)}
			<div
				ref={measuringRef}
				className={gridClass}
				style={
					{
						"--slide-h1-size": `${baseSize.h1 * measuringScale}px`,
						"--slide-body-size": `${baseSize.body * measuringScale}px`,
						position: "absolute",
						visibility: "hidden",
						pointerEvents: "none",
						maxWidth: "100%",
						maxHeight: "100%",
					} as React.CSSProperties
				}
			>
				{blocks.map((block, i) => (
					<div
						key={i}
						className="flex min-h-0 min-w-0 flex-col items-center justify-center text-center"
					>
						{block.content.map((item, j) => (
							<SlideContentItem key={j} item={item} />
						))}
					</div>
				))}
			</div>
		</div>
	)
}

let headingScales: Record<number, number> = {
	1: 1,
	2: 0.85,
	3: 0.7,
	4: 0.6,
	5: 0.5,
	6: 0.45,
}

function RenderSegments({ segments }: { segments: TextSegment[] }) {
	return (
		<>
			{segments.map((seg, i) => (
				<RenderSegment key={i} segment={seg} />
			))}
		</>
	)
}

function RenderSegment({ segment }: { segment: TextSegment }) {
	let wikilinkResolver = useWikilinkResolver()

	switch (segment.type) {
		case "text":
			return <>{segment.text}</>
		case "link":
			return (
				<a
					href={segment.href}
					target="_blank"
					rel="noopener noreferrer"
					className="text-brand underline"
					onClick={e => e.stopPropagation()}
				>
					{segment.text}
				</a>
			)
		case "wikilink": {
			let resolved = wikilinkResolver(segment.docId)
			let href = resolved.isPresentation
				? `/doc/${segment.docId}/slideshow`
				: `/doc/${segment.docId}/preview`
			return (
				<a
					href={href}
					className={resolved.exists ? "wikilink" : "wikilink wikilink-broken"}
					onClick={e => e.stopPropagation()}
				>
					{resolved.title}
				</a>
			)
		}
		case "strong":
			return (
				<strong className="font-bold">
					<RenderSegments segments={segment.segments} />
				</strong>
			)
		case "em":
			return (
				<em className="italic">
					<RenderSegments segments={segment.segments} />
				</em>
			)
		case "codespan":
			return (
				<code className="bg-muted rounded px-[0.3em] py-[0.1em] font-mono text-[0.85em]">
					{segment.text}
				</code>
			)
		case "del":
			return (
				<del className="line-through">
					<RenderSegments segments={segment.segments} />
				</del>
			)
	}
}

function SlideContentItem({ item }: { item: SlideContent }) {
	if (item.type === "heading") {
		let scale = headingScales[item.depth] ?? 0.6
		return (
			<div
				className="font-semibold"
				style={{
					fontSize: `calc(var(--slide-h1-size) * ${scale})`,
					marginBottom: "0.3em",
					lineHeight: 1.2,
				}}
			>
				<RenderSegments segments={item.segments} />
			</div>
		)
	}

	if (item.type === "code") {
		return <HighlightedCode code={item.text} language={item.language} />
	}

	if (item.type === "image") {
		return (
			<div style={{ margin: "0.5em 0" }}>
				<img
					src={item.src}
					alt={item.alt}
					className="mx-auto max-h-[60vh] rounded-lg"
				/>
			</div>
		)
	}

	if (item.type === "list") {
		let listClass = `text-left ${item.ordered ? "list-decimal" : "list-disc"}`
		let items = item.items.map((listItem, i) => (
			<li key={i} style={{ marginBottom: "0.2em" }}>
				<RenderSegments segments={listItem.segments} />
			</li>
		))
		return item.ordered ? (
			<ol
				className={listClass}
				style={{
					fontSize: "var(--slide-body-size)",
					margin: "0.5em 0",
					paddingLeft: "1.2em",
					lineHeight: 1.4,
				}}
			>
				{items}
			</ol>
		) : (
			<ul
				className={listClass}
				style={{
					fontSize: "var(--slide-body-size)",
					margin: "0.5em 0",
					paddingLeft: "1.2em",
					lineHeight: 1.4,
				}}
			>
				{items}
			</ul>
		)
	}

	if (item.type === "blockquote") {
		return (
			<blockquote
				className="border-brand border-l-4 text-left italic"
				style={{
					fontSize: "var(--slide-body-size)",
					margin: "0.5em 0",
					paddingLeft: "0.5em",
					lineHeight: 1.4,
				}}
			>
				<RenderSegments segments={item.segments} />
			</blockquote>
		)
	}

	if (item.type === "table") {
		let [header, ...body] = item.rows
		return (
			<table
				className="w-full text-left"
				style={{
					fontSize: "calc(var(--slide-body-size) * 0.8)",
					margin: "0.5em 0",
				}}
			>
				{header && (
					<thead>
						<tr className="border-border border-b">
							{header.map((cell, i) => (
								<th
									key={i}
									className="font-semibold"
									style={{ padding: "0.4em 0.6em" }}
								>
									{cell}
								</th>
							))}
						</tr>
					</thead>
				)}
				<tbody>
					{body.map((row, i) => (
						<tr key={i} className="border-border border-b">
							{row.map((cell, j) => (
								<td key={j} style={{ padding: "0.4em 0.6em" }}>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		)
	}

	return (
		<div
			style={{
				fontSize: "var(--slide-body-size)",
				marginBottom: "0.3em",
				lineHeight: 1.4,
			}}
		>
			<RenderSegments segments={item.segments} />
		</div>
	)
}

function HighlightedCode({
	code,
	language,
}: {
	code: string
	language?: string
}) {
	let theme = useContext(ThemeContext)
	let [html, setHtml] = useState<string | null>(null)

	let shikiTheme = theme === "light" ? "github-light" : "vesper"

	useEffect(() => {
		let cancelled = false
		codeToHtml(code, {
			lang: language || "text",
			theme: shikiTheme,
		})
			.then(result => {
				if (!cancelled) setHtml(result)
			})
			.catch(() => {
				if (!cancelled) setHtml(null)
			})
		return () => {
			cancelled = true
		}
	}, [code, language, shikiTheme])

	let style = {
		fontSize: "calc(var(--slide-body-size) * 0.6)",
		margin: "0.5em 0",
		padding: "0.6em",
	}

	if (html) {
		return (
			<div
				className="overflow-x-auto rounded-lg text-left [&_pre]:bg-transparent! [&_pre]:p-0!"
				style={style}
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		)
	}

	return (
		<pre
			className="bg-muted overflow-x-auto rounded-lg text-left"
			style={style}
		>
			<code className="text-foreground font-mono">{code}</code>
		</pre>
	)
}

type Slide = { slideNumber: number; blocks: VisualBlock[] }

function getSlides(items: PresentationItem[]): Slide[] {
	let slideMap = new Map<number, VisualBlock[]>()
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
