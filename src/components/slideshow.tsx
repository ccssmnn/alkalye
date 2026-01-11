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

	let slideshowBaseCss = getSlideshowBaseCss()

	// Combine base + theme CSS (theme last so it wins)
	let injectedStyles = themeStyles
		? [
				transitionStyles,
				themeStyles.fontFaceRules,
				themeStyles.presetVariables,
				slideshowBaseCss,
				themeStyles.css,
			]
				.filter(Boolean)
				.join("\n")
		: [transitionStyles, slideshowBaseCss].filter(Boolean).join("\n")

	return (
		<AssetContext.Provider value={assets}>
			<WikilinkContext.Provider value={wikilinks}>
				<ThemeContext.Provider value={appearanceTheme}>
					{/* Inject theme styles */}
					{injectedStyles && <style>{injectedStyles}</style>}

					<div
						data-mode="slideshow"
						data-theme={documentTheme.theme?.name ?? undefined}
						data-appearance={effectiveAppearance}
						className="fixed inset-0 flex flex-col"
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

						<article className="flex flex-1 flex-col">
							<ScaledSlideContainer
								blocks={visibleBlocks}
								size={size}
								slideNumber={currentSlideNumber}
								onClick={goToNextSlide}
								measureKey={getThemeMeasureKey(documentTheme, themeStyles)}
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

type SlideContainerStyle = React.CSSProperties & {
	"--slide-h1-size": string
	"--slide-body-size": string
	"--slide-scale": string
}

function ScaledSlideContainer({
	blocks,
	size,
	slideNumber,
	onClick,
	measureKey,
}: {
	blocks: VisualBlock[]
	size: PresentationSize
	slideNumber: number
	onClick: () => void
	measureKey: string
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
	let depsKey = `${slideNumber}-${blocks.length}-${isPortrait}-${baseSize.h1}-${measureKey}`
	let [prevDepsKey, setPrevDepsKey] = useState(depsKey)
	if (depsKey !== prevDepsKey) {
		setPrevDepsKey(depsKey)
		setVisible(false)
		setScale(1)
	}

	useLayoutEffect(() => {
		let initialContainer = containerRef.current
		let initialContent = contentRef.current
		if (!initialContainer || !initialContent) return

		let cancelled = false
		let isMeasuring = false
		let isScheduled = false

		function scheduleMeasure() {
			if (cancelled) return
			if (isScheduled) return

			let container = containerRef.current
			let content = contentRef.current
			if (!container || !content) return

			isScheduled = true
			const capturedContainer = container
			const capturedContent = content
			requestAnimationFrame(() => {
				isScheduled = false
				void measure(capturedContainer, capturedContent)
			})
		}

		async function measure(container: HTMLDivElement, content: HTMLDivElement) {
			if (cancelled) return
			if (isMeasuring) return
			isMeasuring = true
			setVisible(false)

			try {
				await new Promise(r => requestAnimationFrame(r))
				if (cancelled) return

				let containerStyle = getComputedStyle(container)
				let paddingX =
					Number.parseFloat(containerStyle.paddingLeft) +
					Number.parseFloat(containerStyle.paddingRight)
				let paddingY =
					Number.parseFloat(containerStyle.paddingTop) +
					Number.parseFloat(containerStyle.paddingBottom)

				let availableW = Math.max(0, container.clientWidth - paddingX)
				let availableH = Math.max(0, container.clientHeight - paddingY)

				let maxW = availableW * 0.9
				let maxH = availableH * 0.9

				let previousWidth = content.style.width
				let previousHeight = content.style.height
				let previousMaxWidth = content.style.maxWidth
				let previousMaxHeight = content.style.maxHeight
				let previousGridTemplateRows = content.style.gridTemplateRows
				let previousGridTemplateColumns = content.style.gridTemplateColumns

				content.style.width = `${maxW}px`
				content.style.height = `${maxH}px`
				content.style.maxWidth = "none"
				content.style.maxHeight = "none"
				content.style.gridTemplateRows = gridTemplate.rows
				content.style.gridTemplateColumns = gridTemplate.cols

				let overflowSensitiveElements = Array.from(
					content.querySelectorAll<HTMLElement>("pre, table"),
				)
				let overflowMeasurementElements = Array.from(
					content.querySelectorAll<HTMLElement>(
						"h1,h2,h3,h4,h5,h6,p,pre,table,blockquote,ol,ul,img",
					),
				)

				function fits(s: number): boolean {
					content.style.setProperty("--slide-h1-size", `${baseSize.h1 * s}px`)
					content.style.setProperty(
						"--slide-body-size",
						`${baseSize.body * s}px`,
					)
					content.style.setProperty("--slide-scale", `${s}`)
					void content.offsetHeight

					if (content.scrollWidth > maxW + 1) return false
					if (content.scrollHeight > maxH + 1) return false

					let cells = Array.from(content.children).flatMap(child =>
						child instanceof HTMLElement ? [child] : [],
					)
					for (let cell of cells) {
						if (cell.scrollWidth > cell.clientWidth + 1) return false
						if (cell.scrollHeight > cell.clientHeight + 1) return false
					}

					for (let el of overflowSensitiveElements) {
						if (el.scrollWidth > el.clientWidth + 1) return false
						if (el.scrollHeight > el.clientHeight + 1) return false
					}

					// scrollWidth/scrollHeight ignore margins; themes can add huge margins.
					// Measure block element boxes + margins against container bounds.
					let contentRect = content.getBoundingClientRect()
					for (let el of overflowMeasurementElements) {
						let rect = el.getBoundingClientRect()
						let style = getComputedStyle(el)
						let marginTop = Number.parseFloat(style.marginTop) || 0
						let marginRight = Number.parseFloat(style.marginRight) || 0
						let marginBottom = Number.parseFloat(style.marginBottom) || 0
						let marginLeft = Number.parseFloat(style.marginLeft) || 0

						if (rect.right + marginRight > contentRect.right + 1) return false
						if (rect.bottom + marginBottom > contentRect.bottom + 1)
							return false
						if (rect.left - marginLeft < contentRect.left - 1) return false
						if (rect.top - marginTop < contentRect.top - 1) return false
					}

					return true
				}

				let low = 5
				let high = 100
				while (low <= high) {
					let mid = Math.floor((low + high) / 2)
					if (fits(mid / 100)) {
						low = mid + 1
					} else {
						high = mid - 1
					}
				}

				let finalScale = Math.max(5, Math.min(high, 100)) / 100

				content.style.width = previousWidth
				content.style.height = previousHeight
				content.style.maxWidth = previousMaxWidth
				content.style.maxHeight = previousMaxHeight
				content.style.gridTemplateRows = previousGridTemplateRows
				content.style.gridTemplateColumns = previousGridTemplateColumns

				if (cancelled) return

				setScale(finalScale)
				await new Promise(r => requestAnimationFrame(r))
				if (cancelled) return
				setVisible(true)
			} finally {
				isMeasuring = false
			}
		}

		scheduleMeasure()

		let mutationObserver = new MutationObserver(() => {
			scheduleMeasure()
		})
		mutationObserver.observe(initialContent, {
			childList: true,
			subtree: true,
			characterData: true,
		})

		let resizeObserver = new ResizeObserver(() => {
			scheduleMeasure()
		})
		resizeObserver.observe(initialContainer)

		let fontSet = document.fonts
		function handleFontsDone() {
			scheduleMeasure()
		}

		if (fontSet) {
			fontSet.ready.then(() => {
				if (cancelled) return
				handleFontsDone()
			})
			fontSet.addEventListener?.("loadingdone", handleFontsDone)
			fontSet.addEventListener?.("loadingerror", handleFontsDone)
		}

		return () => {
			cancelled = true
			mutationObserver.disconnect()
			resizeObserver.disconnect()
			fontSet?.removeEventListener?.("loadingdone", handleFontsDone)
			fontSet?.removeEventListener?.("loadingerror", handleFontsDone)
		}
	}, [
		slideNumber,
		blocks,
		isPortrait,
		baseSize,
		gridTemplate.cols,
		gridTemplate.rows,
		measureKey,
	])

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

	let contentStyle: SlideContainerStyle = {
		"--slide-h1-size": `${baseSize.h1 * scale}px`,
		"--slide-body-size": `${baseSize.body * scale}px`,
		"--slide-scale": `${scale}`,
		gridTemplateColumns: gridTemplate.cols,
		gridTemplateRows: gridTemplate.rows,
		opacity: visible ? 1 : 0,
		transition: visible ? "opacity 150ms ease-in" : "none",
		width: "90%",
		height: "90%",
	}

	return (
		<div
			ref={containerRef}
			className="flex flex-1 cursor-pointer items-center justify-center overflow-hidden p-8"
			onClick={onClick}
		>
			<div
				ref={contentRef}
				className="slideshow-grid grid gap-8"
				style={contentStyle}
			>
				{blocks.map((block, i) => (
					<div key={i} className="slideshow-cell">
						{block.content.map((item, j) => (
							<SlideContentItem key={j} item={item} />
						))}
					</div>
				))}
			</div>
		</div>
	)
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
				<strong>
					<RenderSegments segments={segment.segments} />
				</strong>
			)
		case "em":
			return (
				<em>
					<RenderSegments segments={segment.segments} />
				</em>
			)
		case "codespan":
			return <code>{segment.text}</code>
		case "del":
			return (
				<del>
					<RenderSegments segments={segment.segments} />
				</del>
			)
	}
}

function SlideContentItem({ item }: { item: SlideContent }) {
	if (item.type === "heading") {
		let content = <RenderSegments segments={item.segments} />
		if (item.depth <= 1) return <h1>{content}</h1>
		if (item.depth === 2) return <h2>{content}</h2>
		if (item.depth === 3) return <h3>{content}</h3>
		if (item.depth === 4) return <h4>{content}</h4>
		if (item.depth === 5) return <h5>{content}</h5>
		return <h6>{content}</h6>
	}

	if (item.type === "code") {
		return <HighlightedCode code={item.text} language={item.language} />
	}

	if (item.type === "image") {
		return <SlideImage src={item.src} alt={item.alt} />
	}

	if (item.type === "list") {
		let items = item.items.map((listItem, i) => (
			<li key={i}>
				<RenderSegments segments={listItem.segments} />
			</li>
		))
		return item.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
	}

	if (item.type === "blockquote") {
		return (
			<blockquote>
				<RenderSegments segments={item.segments} />
			</blockquote>
		)
	}

	if (item.type === "table") {
		let [header, ...body] = item.rows
		return (
			<table>
				{header && (
					<thead>
						<tr>
							{header.map((cell, i) => (
								<th key={i}>{cell}</th>
							))}
						</tr>
					</thead>
				)}
				<tbody>
					{body.map((row, i) => (
						<tr key={i}>
							{row.map((cell, j) => (
								<td key={j}>{cell}</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		)
	}

	return (
		<p>
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
				<JazzImage imageId={asset.image.$jazz.id} alt={alt} style={sizeStyle} />
			)
		}

		// Asset not loaded yet, show placeholder
		return (
			<div
				className="slideshow-image-placeholder flex aspect-video items-center justify-center"
				style={sizeStyle}
			>
				<span className="text-sm opacity-60">Loading...</span>
			</div>
		)
	}

	// Regular URL image
	return <img src={src} alt={alt} style={sizeStyle} />
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

	if (html) {
		return (
			<div
				className="slideshow-codeblock"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		)
	}

	return (
		<pre className="slideshow-codeblock">
			<code>{code}</code>
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
	// Track the theme ID we've loaded styles for to derive loading state
	let [loadedThemeId, setLoadedThemeId] = useState<string | null>(null)

	let currentThemeId = documentTheme.theme?.$jazz.id ?? null
	let isLoading = currentThemeId !== null && currentThemeId !== loadedThemeId

	// Clear state when theme is removed (adjust state during render pattern)
	let [prevThemeId, setPrevThemeId] = useState<string | null>(currentThemeId)
	if (currentThemeId !== prevThemeId) {
		setPrevThemeId(currentThemeId)
		if (currentThemeId === null) {
			setStyles(null)
			setError(null)
			setLoadedThemeId(null)
		}
	}

	useEffect(() => {
		// Get styles from cache asynchronously (builds and caches if needed)
		if (!documentTheme.theme) return

		let cancelled = false
		let themeId = documentTheme.theme.$jazz.id

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
				setLoadedThemeId(themeId)
			},
		)

		return () => {
			cancelled = true
		}
	}, [documentTheme.theme, documentTheme.preset])

	return { styles, error, isLoading }
}

function getThemeMeasureKey(
	documentTheme: ResolvedTheme,
	styles: ThemeStyles | null,
): string {
	let themeId = documentTheme.theme?.$jazz.id ?? "__none__"
	let preset = documentTheme.preset?.name ?? "__none__"
	if (!styles) return `${themeId}:${preset}:__loading__`
	let stylesKey = `${styles.presetVariables.length}:${styles.fontFaceRules.length}:${styles.css.length}`
	return `${themeId}:${preset}:${stylesKey}`
}

function getSlideshowBaseCss(): string {
	return `
:where([data-mode="slideshow"]) {
	background: var(--preset-background, var(--background));
	color: var(--preset-foreground, var(--foreground));
}

:where([data-mode="slideshow"][data-appearance="light"]) {
	background: var(--preset-background, #ffffff);
	color: var(--preset-foreground, #000000);
}

:where([data-mode="slideshow"][data-appearance="dark"]) {
	background: var(--preset-background, #000000);
	color: var(--preset-foreground, #ffffff);
}

:where([data-mode="slideshow"] .slideshow-grid) {
	font-size: var(--slide-body-size);
}

:where([data-mode="slideshow"] .slideshow-cell) {
	display: flex;
	min-height: 0;
	min-width: 0;
	max-width: 100%;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	text-align: center;
	overflow-wrap: normal;
	word-break: normal;
}

:where([data-mode="slideshow"] a) {
	color: var(--preset-link, var(--preset-accent, currentColor));
	text-decoration: underline;
}

:where([data-mode="slideshow"] code) {
	font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
	font-size: 0.85em;
	background: var(--preset-code-background, rgba(127, 127, 127, 0.15));
	padding: 0.15em 0.4em;
	border-radius: 0.25rem;
}

:where([data-mode="slideshow"] pre code) {
	background: none;
	padding: 0;
}

:where([data-mode="slideshow"] h1) {
	font-size: calc(var(--slide-h1-size) * 1);
	margin: 0 0 0.3em;
	line-height: 1.2;
}

:where([data-mode="slideshow"] h2) {
	font-size: calc(var(--slide-h1-size) * 0.85);
	margin: 0 0 0.3em;
	line-height: 1.2;
}

:where([data-mode="slideshow"] h3) {
	font-size: calc(var(--slide-h1-size) * 0.7);
	margin: 0 0 0.3em;
	line-height: 1.2;
}

:where([data-mode="slideshow"] h4) {
	font-size: calc(var(--slide-h1-size) * 0.6);
	margin: 0 0 0.3em;
	line-height: 1.2;
}

:where([data-mode="slideshow"] h5) {
	font-size: calc(var(--slide-h1-size) * 0.5);
	margin: 0 0 0.3em;
	line-height: 1.2;
}

:where([data-mode="slideshow"] h6) {
	font-size: calc(var(--slide-h1-size) * 0.45);
	margin: 0 0 0.3em;
	line-height: 1.2;
}

:where([data-mode="slideshow"] p) {
	font-size: var(--slide-body-size);
	margin: 0 0 0.3em;
	line-height: 1.4;
}

:where([data-mode="slideshow"] ol) {
	list-style: decimal;
	list-style-position: outside;
}

:where([data-mode="slideshow"] ul) {
	list-style: disc;
	list-style-position: outside;
}

:where([data-mode="slideshow"] :is(ol, ul)) {
	font-size: var(--slide-body-size);
	margin: 0.5em 0;
	padding-left: 1.2em;
	line-height: 1.4;
	text-align: left;
}

:where([data-mode="slideshow"] li) {
	margin: 0 0 0.2em;
}

:where([data-mode="slideshow"] blockquote) {
	font-size: var(--slide-body-size);
	margin: 0.5em 0;
	padding-left: 0.5em;
	line-height: 1.4;
	text-align: left;
	font-style: italic;
	border-left: calc(4px * var(--slide-scale, 1)) solid var(--preset-accent, currentColor);
}

:where([data-mode="slideshow"] table) {
	width: 100%;
	border-collapse: collapse;
	text-align: left;
	font-size: calc(var(--slide-body-size) * 0.8);
	margin: 0.5em 0;
	line-height: 1.2;
	white-space: nowrap;
}

:where([data-mode="slideshow"] table tr) {
	border-bottom-width: calc(1px * var(--slide-scale, 1));
	border-bottom-style: solid;
	border-bottom-color: var(--border);
}

:where([data-mode="slideshow"] table :is(th, td)) {
	padding: 0.3em 0.5em;
	white-space: nowrap;
	word-break: normal;
	vertical-align: top;
}

:where([data-mode="slideshow"] th) {
	font-weight: 600;
}

:where([data-mode="slideshow"] .slideshow-codeblock) {
	font-size: calc(var(--slide-body-size) * 0.6);
	margin: 0.5em 0;
	max-width: 100%;
	overflow: hidden;
	text-align: left;
}

:where([data-mode="slideshow"] .slideshow-codeblock pre) {
	margin: 0;
	max-width: 100%;
	overflow: hidden;
	white-space: pre;
	padding: 0.6em;
	border-radius: 0.5rem;
	background: var(--preset-code-background, rgba(127, 127, 127, 0.15));
}

:where([data-mode="slideshow"] pre.slideshow-codeblock) {
	max-width: 100%;
	overflow: hidden;
	white-space: pre;
	padding: 0.6em;
	border-radius: 0.5rem;
	background: var(--preset-code-background, rgba(127, 127, 127, 0.15));
}

:where([data-mode="slideshow"] .slideshow-image-placeholder) {
	background: var(--preset-code-background, rgba(127, 127, 127, 0.15));
}
`
}
