import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	useLayoutEffect,
} from "react"
import { codeToHtml } from "shiki"
import {
	parsePresentationSize,
	parsePresentationTheme,
	type SlideContent,
	type VisualBlock,
	type PresentationSize,
	type PresentationTheme,
	type TextSegment,
} from "@/lib/presentation"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { cn } from "@/lib/utils"
import { useResolvedTheme } from "@/lib/theme"
import { EllipsisIcon, TriangleAlert } from "lucide-react"
import { useDocumentTheme, type ResolvedTheme } from "@/lib/document-theme"
import { tryCachedThemeStylesAsync, type ThemeStyles } from "@/lib/theme-renderer"

export { Slideshow }
export type { Slide }

type ResolvedWikilink = {
	title: string
	exists: boolean
	isPresentation: boolean
}

let ThemeContext = createContext<PresentationTheme | null>(null)
let WikilinkContext = createContext<Map<string, ResolvedWikilink>>(new Map())

type Slide = { slideNumber: number; blocks: VisualBlock[] }

interface SlideshowProps {
	content: string
	slides: Slide[]
	wikilinks: Map<string, ResolvedWikilink>
	currentSlideNumber: number
	onSlideChange?: (slideNumber: number) => void
	onExit?: () => void
	onGoToTeleprompter?: () => void
}

function Slideshow({
	content,
	slides,
	wikilinks,
	currentSlideNumber,
	onSlideChange,
	onExit,
	onGoToTeleprompter,
}: SlideshowProps) {
	let size = parsePresentationSize(content)
	let appearanceTheme = parsePresentationTheme(content)
	let systemTheme = useResolvedTheme()

	// Effective appearance: frontmatter override takes precedence, then system theme
	let effectiveAppearance = appearanceTheme ?? systemTheme

	// Pass appearance to useDocumentTheme for auto-selecting light/dark presets
	let documentTheme = useDocumentTheme(
		content,
		"slideshow",
		effectiveAppearance,
	)
	let themeStylesResult = useThemeStyles(documentTheme)
	let themeStyles = themeStylesResult.styles

	let currentSlide = slides.find(s => s.slideNumber === currentSlideNumber)
	let currentSlideIdx = slides.findIndex(
		s => s.slideNumber === currentSlideNumber,
	)

	let visibleBlocks = currentSlide?.blocks ?? []

	function goToNextSlide() {
		if (currentSlideIdx < slides.length - 1 && onSlideChange) {
			onSlideChange(slides[currentSlideIdx + 1].slideNumber)
		}
	}

	// Base transition styles to prevent layout shift when theme loads
	// These provide smooth transitions for common properties theme CSS might change
	let transitionStyles = documentTheme.theme
		? `[data-theme] { transition: color 150ms ease-out, background-color 150ms ease-out; }`
		: ""

	// Combine all theme CSS with transitions first
	let injectedStyles = themeStyles
		? [
				transitionStyles,
				themeStyles.fontFaceRules,
				themeStyles.presetVariables,
				themeStyles.css,
			]
				.filter(Boolean)
				.join("\n")
		: transitionStyles

	// Determine if custom theme provides background/foreground via preset
	let hasThemeColors = documentTheme.preset != null

	return (
		<WikilinkContext.Provider value={wikilinks}>
			<ThemeContext.Provider value={appearanceTheme}>
				{/* Inject theme styles */}
				{injectedStyles && <style>{injectedStyles}</style>}

				<div
					className={cn(
						"fixed inset-0 flex flex-col",
						// Only use hardcoded colors if no custom theme preset provides colors
						!hasThemeColors &&
							appearanceTheme === "light" &&
							"bg-white text-black",
						!hasThemeColors &&
							appearanceTheme === "dark" &&
							"bg-black text-white",
						!hasThemeColors &&
							!appearanceTheme &&
							"bg-background text-foreground",
					)}
					style={
						hasThemeColors
							? {
									backgroundColor: "var(--preset-background)",
									color: "var(--preset-foreground)",
								}
							: undefined
					}
					data-theme={documentTheme.theme?.name ?? undefined}
				>
					{/* Theme warning banner */}
					{documentTheme.warning && (
						<div className="absolute top-4 left-1/2 z-50 -translate-x-1/2">
							<div className="bg-warning/90 text-warning-foreground flex items-center gap-2 rounded-lg px-4 py-2 text-sm shadow-lg">
								<TriangleAlert className="size-4 shrink-0" />
								<span>{documentTheme.warning}</span>
							</div>
						</div>
					)}

					{/* Theme error banner (corrupted theme data) */}
					{themeStylesResult.error && (
						<div className="absolute top-4 left-1/2 z-50 -translate-x-1/2">
							<div className="bg-destructive/90 text-destructive-foreground flex items-center gap-2 rounded-lg px-4 py-2 text-sm shadow-lg">
								<TriangleAlert className="size-4 shrink-0" />
								<span>
									Theme error: {themeStylesResult.error}. Using default styles.
								</span>
							</div>
						</div>
					)}

					<ScaledSlideContainer
						blocks={visibleBlocks}
						size={size}
						slideNumber={currentSlideNumber}
						onClick={goToNextSlide}
					/>
					<SlideControls
						slides={slides}
						currentSlideNumber={currentSlideNumber}
						onSlideChange={onSlideChange}
						onExit={onExit}
						onGoToTeleprompter={onGoToTeleprompter}
					/>
				</div>
			</ThemeContext.Provider>
		</WikilinkContext.Provider>
	)
}

function SlideControls({
	slides,
	currentSlideNumber,
	onSlideChange,
	onExit,
	onGoToTeleprompter,
}: {
	slides: Slide[]
	currentSlideNumber: number
	onSlideChange?: (slideNumber: number) => void
	onExit?: () => void
	onGoToTeleprompter?: () => void
}) {
	let currentSlideIdx = slides.findIndex(
		s => s.slideNumber === currentSlideNumber,
	)

	function goToPrevSlide() {
		if (currentSlideIdx > 0 && onSlideChange) {
			onSlideChange(slides[currentSlideIdx - 1].slideNumber)
		}
	}

	function goToNextSlide() {
		if (currentSlideIdx < slides.length - 1 && onSlideChange) {
			onSlideChange(slides[currentSlideIdx + 1].slideNumber)
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
				} else if (onExit) {
					onExit()
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
					{onExit && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={onExit}>
								Go to editor
								<DropdownMenuShortcut>Esc</DropdownMenuShortcut>
							</DropdownMenuItem>
						</>
					)}
					{onGoToTeleprompter && (
						<DropdownMenuItem onClick={onGoToTeleprompter}>
							Go to teleprompter
						</DropdownMenuItem>
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
	blocks,
	size,
	slideNumber,
	onClick,
}: {
	blocks: VisualBlock[]
	size: PresentationSize
	slideNumber: number
	onClick: () => void
}) {
	let containerRef = useRef<HTMLDivElement>(null)
	let contentRef = useRef<HTMLDivElement>(null)
	let [visible, setVisible] = useState(false)
	let [scale, setScale] = useState(1)
	let [isPortrait, setIsPortrait] = useState(
		() => window.innerHeight > window.innerWidth,
	)
	let blockCount = blocks.length
	let gridClass = cn(
		"grid gap-8",
		blockCount === 1 && "grid-cols-1 grid-rows-1",
		blockCount === 2 &&
			(isPortrait ? "grid-cols-1 grid-rows-2" : "grid-cols-2 grid-rows-1"),
		blockCount === 3 &&
			(isPortrait ? "grid-cols-1 grid-rows-3" : "grid-cols-3 grid-rows-1"),
		blockCount >= 4 && "grid-cols-2 grid-rows-2",
	)

	let baseSize = baseSizes[size]

	// Reset visibility when deps change using adjust-state-during-render pattern
	let depsKey = `${slideNumber}-${blocks.length}-${isPortrait}-${baseSize.h1}`
	let [prevDepsKey, setPrevDepsKey] = useState(depsKey)
	if (depsKey !== prevDepsKey) {
		setPrevDepsKey(depsKey)
		setVisible(false)
		setScale(1)
	}

	useLayoutEffect(() => {
		let container = containerRef.current
		let content = contentRef.current
		if (!container || !content) return

		let cancelled = false

		async function measure() {
			// Wait for DOM to update with scale=1
			await new Promise(r => requestAnimationFrame(r))
			if (cancelled) return

			let maxW = container!.clientWidth * 0.9
			let maxH = container!.clientHeight * 0.9

			// Temporarily remove width constraint for measuring
			content!.style.width = "auto"

			function fits(s: number): boolean {
				content!.style.setProperty("--slide-h1-size", `${baseSize.h1 * s}px`)
				content!.style.setProperty(
					"--slide-body-size",
					`${baseSize.body * s}px`,
				)
				// Force reflow
				void content!.offsetHeight
				let w = content!.scrollWidth
				let h = content!.scrollHeight
				return w <= maxW && h <= maxH
			}

			// Binary search for optimal scale
			let low = 10
			let high = 100
			while (low <= high) {
				let mid = Math.floor((low + high) / 2)
				if (fits(mid / 100)) {
					low = mid + 1
				} else {
					high = mid - 1
				}
			}

			let finalScale = Math.max(10, Math.min(high, 100)) / 100

			// Restore width constraint
			content!.style.width = "90%"

			if (cancelled) return

			// Apply final scale and fade in
			setScale(finalScale)
			await new Promise(r => requestAnimationFrame(r))
			if (cancelled) return
			setVisible(true)
		}

		measure()

		return () => {
			cancelled = true
		}
	}, [slideNumber, blocks, isPortrait, baseSize])

	useEffect(() => {
		function handleResize() {
			let portrait = window.innerHeight > window.innerWidth
			setIsPortrait(portrait)
			setVisible(false)
			setScale(1)
		}
		window.addEventListener("resize", handleResize)
		return () => window.removeEventListener("resize", handleResize)
	}, [])

	return (
		<div
			ref={containerRef}
			className="flex flex-1 cursor-pointer items-center justify-center overflow-hidden p-8"
			onClick={onClick}
		>
			<div
				ref={contentRef}
				className={gridClass}
				style={
					{
						"--slide-h1-size": `${baseSize.h1 * scale}px`,
						"--slide-body-size": `${baseSize.body * scale}px`,
						opacity: visible ? 1 : 0,
						transition: visible ? "opacity 150ms ease-in" : "none",
						width: "90%",
						maxHeight: "90%",
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
	let wikilinks = useContext(WikilinkContext)

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
			let resolved = wikilinks.get(segment.docId) ?? {
				title: segment.docId,
				exists: false,
				isPresentation: false,
			}
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
	let presentationTheme = useContext(ThemeContext)
	let systemTheme = useResolvedTheme()
	let [html, setHtml] = useState<string | null>(null)

	let effectiveTheme = presentationTheme ?? systemTheme
	let shikiTheme =
		effectiveTheme === "light" ? "github-light-default" : "vesper"

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
				className="overflow-x-auto rounded-lg text-left [&_pre]:rounded-lg [&_pre]:p-[0.6em]"
				style={{ ...style, padding: 0 }}
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

type ThemeStylesResult = {
	styles: ThemeStyles | null
	error: string | null
	isLoading: boolean
}

// Hook to get theme styles using the global cache with async loading
// Styles are loaded asynchronously to prevent blocking rendering of large themes
// Cache handles blob URL lifecycle, so no cleanup needed here
function useThemeStyles(documentTheme: ResolvedTheme): ThemeStylesResult {
	let [result, setResult] = useState<ThemeStylesResult>({
		styles: null,
		error: null,
		isLoading: false,
	})
	let prevThemeRef = useRef<typeof documentTheme.theme>(null)
	let prevPresetRef = useRef<typeof documentTheme.preset>(null)

	// Track if theme or preset changed
	let themeChanged =
		documentTheme.theme !== prevThemeRef.current ||
		documentTheme.preset !== prevPresetRef.current

	// Update refs during render (adjust state pattern)
	if (themeChanged) {
		prevThemeRef.current = documentTheme.theme
		prevPresetRef.current = documentTheme.preset
	}

	useEffect(() => {
		if (!themeChanged) return

		// Get styles from cache asynchronously (builds and caches if needed)
		if (documentTheme.theme) {
			let cancelled = false
			setResult(prev => ({ ...prev, isLoading: true }))

			tryCachedThemeStylesAsync(documentTheme.theme, documentTheme.preset).then(
				buildResult => {
					if (cancelled) return
					if (buildResult.ok) {
						setResult({ styles: buildResult.styles, error: null, isLoading: false })
					} else {
						setResult({ styles: null, error: buildResult.error, isLoading: false })
					}
				},
			)

			return () => {
				cancelled = true
			}
		} else {
			setResult({ styles: null, error: null, isLoading: false })
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [documentTheme.theme, documentTheme.preset])

	return result
}
