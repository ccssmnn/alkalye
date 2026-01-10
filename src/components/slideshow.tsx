import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useState,
	useLayoutEffect,
} from "react"
import { Image as JazzImage } from "jazz-tools/react"
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
import {
	tryCachedThemeStylesAsync,
	type ThemeStyles,
} from "@/lib/theme-renderer"

export { Slideshow }
export type { Slide }

type ResolvedWikilink = {
	title: string
	exists: boolean
	isPresentation: boolean
}

let ThemeContext = createContext<PresentationTheme | null>(null)
let WikilinkContext = createContext<Map<string, ResolvedWikilink>>(new Map())

type Asset = {
	$jazz: { id: string }
	$isLoaded?: boolean
	image?: { $jazz: { id: string } }
}

let AssetContext = createContext<Asset[] | undefined>(undefined)

type Slide = { slideNumber: number; blocks: VisualBlock[] }

interface SlideshowProps {
	content: string
	slides: Slide[]
	assets?: Asset[]
	wikilinks: Map<string, ResolvedWikilink>
	currentSlideNumber: number
	onSlideChange?: (slideNumber: number) => void
	onExit?: () => void
	onGoToTeleprompter?: () => void
}

function Slideshow({
	content,
	slides,
	assets,
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
	console.log("[Slideshow] Document theme resolved:", {
		themeName: documentTheme.theme?.name,
		presetName: documentTheme.preset?.name,
		warning: documentTheme.warning,
		appearance: effectiveAppearance,
	})

	let themeStylesResult = useThemeStyles(documentTheme)
	let themeStyles = themeStylesResult.styles
	console.log("[Slideshow] Theme styles result:", {
		hasStyles: !!themeStyles,
		error: themeStylesResult.error,
		isLoading: themeStylesResult.isLoading,
		hasFontFace: !!themeStyles?.fontFaceRules,
		hasPresetVars: !!themeStyles?.presetVariables,
		hasCss: !!themeStyles?.css,
	})

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
		<AssetContext.Provider value={assets}>
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
										Theme error: {themeStylesResult.error}. Using default
										styles.
									</span>
								</div>
							</div>
						)}

						<article
							data-theme={documentTheme.theme?.name ?? undefined}
							className="flex flex-1 flex-col"
						>
							<ScaledSlideContainer
								blocks={visibleBlocks}
								size={size}
								slideNumber={currentSlideNumber}
								onClick={goToNextSlide}
							/>
						</article>
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
		</AssetContext.Provider>
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

	// Calculate grid template based on block count and orientation
	let gridTemplate: { cols: string; rows: string }
	if (blockCount === 1) {
		gridTemplate = { cols: "1fr", rows: "1fr" }
	} else if (blockCount === 2) {
		gridTemplate = isPortrait
			? { cols: "1fr", rows: "1fr 1fr" }
			: { cols: "1fr 1fr", rows: "1fr" }
	} else if (blockCount === 3) {
		gridTemplate = isPortrait
			? { cols: "1fr", rows: "1fr 1fr 1fr" }
			: { cols: "1fr 1fr 1fr", rows: "1fr" }
	} else {
		gridTemplate = { cols: "1fr 1fr", rows: "1fr 1fr" }
	}

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

			// Temporarily remove size constraints for measuring
			// Replace 1fr with auto so cells can expand to natural size
			content!.style.width = "auto"
			content!.style.height = "auto"
			content!.style.maxHeight = "none"
			content!.style.gridTemplateRows = gridTemplate.rows.replace(
				/1fr/g,
				"auto",
			)
			content!.style.gridTemplateColumns = gridTemplate.cols.replace(
				/1fr/g,
				"auto",
			)

			function fits(s: number): boolean {
				content!.style.setProperty("--slide-h1-size", `${baseSize.h1 * s}px`)
				content!.style.setProperty(
					"--slide-body-size",
					`${baseSize.body * s}px`,
				)
				content!.style.setProperty("--slide-scale", `${s}`)
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

			// Restore constraints
			content!.style.width = "90%"
			content!.style.height = ""
			content!.style.maxHeight = "90%"
			content!.style.gridTemplateRows = gridTemplate.rows
			content!.style.gridTemplateColumns = gridTemplate.cols

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
				className="grid gap-8"
				style={
					{
						"--slide-h1-size": `${baseSize.h1 * scale}px`,
						"--slide-body-size": `${baseSize.body * scale}px`,
						"--slide-scale": `${scale}`,
						gridTemplateColumns: gridTemplate.cols,
						gridTemplateRows: gridTemplate.rows,
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
		let Tag = `h${item.depth}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
		return (
			<Tag
				className="font-semibold"
				style={{
					fontSize: `calc(var(--slide-h1-size) * ${scale})`,
					marginBottom: "0.3em",
					lineHeight: 1.2,
				}}
			>
				<RenderSegments segments={item.segments} />
			</Tag>
		)
	}

	if (item.type === "code") {
		return <HighlightedCode code={item.text} language={item.language} />
	}

	if (item.type === "image") {
		return <SlideImage src={item.src} alt={item.alt} />
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
		let borderStyle = {
			borderBottomWidth: "calc(1px * var(--slide-scale, 1))",
			borderBottomStyle: "solid" as const,
			borderBottomColor: "var(--border)",
		}
		return (
			<table
				className="text-left"
				style={{
					fontSize: "calc(var(--slide-body-size) * 0.8)",
					margin: "0.5em 0",
					lineHeight: 1.2,
				}}
			>
				{header && (
					<thead>
						<tr style={borderStyle}>
							{header.map((cell, i) => (
								<th
									key={i}
									className="font-semibold"
									style={{ padding: "0.3em 0.5em" }}
								>
									{cell}
								</th>
							))}
						</tr>
					</thead>
				)}
				<tbody>
					{body.map((row, i) => (
						<tr key={i} style={borderStyle}>
							{row.map((cell, j) => (
								<td key={j} style={{ padding: "0.3em 0.5em" }}>
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
		<p
			style={{
				fontSize: "var(--slide-body-size)",
				marginBottom: "0.3em",
				lineHeight: 1.4,
			}}
		>
			<RenderSegments segments={item.segments} />
		</p>
	)
}

// Base image size at scale=1 (400px), scales with --slide-scale
let IMAGE_BASE_SIZE = 400

function SlideImage({ src, alt }: { src: string; alt: string }) {
	let assets = useContext(AssetContext)

	let sizeStyle = {
		maxWidth: `calc(${IMAGE_BASE_SIZE}px * var(--slide-scale, 1))`,
		maxHeight: `calc(${IMAGE_BASE_SIZE}px * var(--slide-scale, 1))`,
	}

	// Check if this is a Jazz asset reference
	let assetMatch = src.match(/^asset:(.+)$/)
	if (assetMatch) {
		let assetId = assetMatch[1]
		let asset = assets?.find(a => a?.$jazz.id === assetId)

		if (asset?.$isLoaded && asset.image) {
			return (
				<JazzImage
					imageId={asset.image.$jazz.id}
					alt={alt}
					className="rounded-lg"
					style={sizeStyle}
				/>
			)
		}

		// Asset not loaded yet, show placeholder
		return (
			<div
				className="bg-muted flex aspect-video items-center justify-center rounded-lg"
				style={sizeStyle}
			>
				<span className="text-muted-foreground text-sm">Loading...</span>
			</div>
		)
	}

	// Regular URL image
	return <img src={src} alt={alt} className="rounded-lg" style={sizeStyle} />
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
	let [styles, setStyles] = useState<ThemeStyles | null>(null)
	let [error, setError] = useState<string | null>(null)
	let [isLoading, setIsLoading] = useState(!!documentTheme.theme)

	useEffect(() => {
		// Get styles from cache asynchronously (builds and caches if needed)
		if (documentTheme.theme) {
			let cancelled = false
			setIsLoading(true)

			tryCachedThemeStylesAsync(documentTheme.theme, documentTheme.preset).then(
				buildResult => {
					if (cancelled) return
					if (buildResult.ok) {
						setStyles(buildResult.styles)
						setError(null)
					} else {
						setStyles(null)
						setError(buildResult.error)
					}
					setIsLoading(false)
				},
			)

			return () => {
				cancelled = true
			}
		} else {
			setStyles(null)
			setError(null)
			setIsLoading(false)
		}
	}, [documentTheme.theme, documentTheme.preset])

	return { styles, error, isLoading }
}
