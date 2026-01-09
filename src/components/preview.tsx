import { useEffect, useState, useRef } from "react"
import { Image as JazzImage } from "jazz-tools/react"
import { getDocumentTitle } from "@/lib/document-utils"
import { Marked } from "marked"
import markedShiki from "marked-shiki"
import { createHighlighter, type Highlighter } from "shiki"
import {
	createWikilinkExtension,
	type WikilinkTitleResolver,
} from "@/lib/marked-wikilink"
import { parseFrontmatter } from "@/editor/frontmatter"
import { type ResolvedDoc } from "@/lib/doc-resolver"
import { useResolvedTheme } from "@/lib/theme"
import { useDocumentTheme, type ResolvedTheme } from "@/lib/document-theme"
import { buildThemeStyles, type ThemeStyles } from "@/lib/theme-renderer"
import { TriangleAlert } from "lucide-react"

export { Preview }

type Asset = {
	$jazz: { id: string }
	$isLoaded?: boolean
	image?: { $jazz: { id: string } }
}

interface PreviewProps {
	content: string
	assets?: Asset[]
	wikilinks: Map<string, ResolvedDoc>
	onExit?: () => void
}

function Preview({ content, assets, wikilinks, onExit }: PreviewProps) {
	let resolvedTheme = useResolvedTheme()
	let documentTheme = useDocumentTheme(content)

	let wikilinkResolver: WikilinkTitleResolver = docId => {
		return wikilinks.get(docId) ?? { title: docId, exists: false }
	}

	let marked = useMarked(wikilinkResolver, resolvedTheme)

	if (!marked) return null

	return (
		<PreviewContent
			content={content}
			assets={assets}
			marked={marked}
			cacheVersion={wikilinks.size}
			onExit={onExit}
			documentTheme={documentTheme}
		/>
	)
}

type Segment =
	| { type: "text"; html: string }
	| { type: "image"; imageId: string; alt: string }

function PreviewContent({
	content,
	assets,
	marked,
	cacheVersion,
	onExit,
	documentTheme,
}: {
	content: string
	assets?: Asset[]
	marked: Marked
	cacheVersion: number
	onExit?: () => void
	documentTheme: ResolvedTheme
}) {
	let [segments, setSegments] = useState<Segment[]>([])
	let [prevContent, setPrevContent] = useState(content)
	let themeStyles = useThemeStyles(documentTheme)

	// Reset segments when content becomes empty (adjust state during render pattern)
	if (content !== prevContent) {
		setPrevContent(content)
		if (!content) {
			setSegments([])
		}
	}

	useEffect(() => {
		if (!content) return

		let { body } = parseFrontmatter(content)
		let cancelled = false

		parseSegments(body, assets, marked).then(result => {
			if (!cancelled) setSegments(result)
		})

		return () => {
			cancelled = true
		}
	}, [content, assets, marked, cacheVersion])

	useEffect(() => {
		document.title = getDocumentTitle(content)
	}, [content])

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (
				(e.metaKey || e.ctrlKey) &&
				e.altKey &&
				(e.key.toLowerCase() === "r" || e.code === "KeyR")
			) {
				e.preventDefault()
				onExit?.()
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [onExit])

	// Combine all theme CSS
	let injectedStyles = themeStyles
		? [themeStyles.fontFaceRules, themeStyles.presetVariables, themeStyles.css]
				.filter(Boolean)
				.join("\n")
		: ""

	return (
		<div
			className="flex-1 overflow-auto"
			style={{
				paddingLeft: "env(safe-area-inset-left)",
				paddingRight: "env(safe-area-inset-right)",
				paddingBottom: "env(safe-area-inset-bottom)",
			}}
		>
			{/* Inject theme styles */}
			{injectedStyles && <style>{injectedStyles}</style>}

			{/* Theme warning banner */}
			{documentTheme.warning && (
				<div className="bg-warning/10 text-warning-foreground border-warning/20 mx-auto mt-4 flex max-w-[65ch] items-center gap-2 rounded-lg border px-4 py-2 text-sm">
					<TriangleAlert className="size-4 shrink-0" />
					<span>{documentTheme.warning}</span>
				</div>
			)}

			<div className="mx-auto max-w-[65ch] px-6 py-8">
				<article
					className="prose prose-neutral dark:prose-invert prose-headings:font-semibold prose-a:text-foreground prose-code:before:content-none prose-code:after:content-none [&_pre]:shadow-inset [&_pre]:border-border [&_pre]:rounded-lg [&_pre]:border [&_pre]:p-4"
					data-theme={documentTheme.theme?.name ?? undefined}
				>
					{segments.map((segment, i) => {
						if (segment.type === "text") {
							return (
								<div
									key={i}
									dangerouslySetInnerHTML={{ __html: segment.html }}
								/>
							)
						}
						return (
							<figure key={i} className="my-4">
								<JazzImage
									imageId={segment.imageId}
									alt={segment.alt}
									className="w-full rounded-lg"
								/>
								{segment.alt && (
									<figcaption className="text-muted-foreground mt-2 text-center text-sm">
										{segment.alt}
									</figcaption>
								)}
							</figure>
						)
					})}
				</article>
			</div>
		</div>
	)
}

// Hook to build and manage theme styles with proper blob URL cleanup
function useThemeStyles(documentTheme: ResolvedTheme): ThemeStyles | null {
	let [styles, setStyles] = useState<ThemeStyles | null>(null)
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

		// Cleanup old blob URLs
		if (styles) {
			for (let url of styles.blobUrls) {
				URL.revokeObjectURL(url)
			}
		}

		// Build new styles
		if (documentTheme.theme) {
			let newStyles = buildThemeStyles(
				documentTheme.theme,
				documentTheme.preset,
			)
			setStyles(newStyles)
		} else {
			setStyles(null)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [documentTheme.theme, documentTheme.preset])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (styles) {
				for (let url of styles.blobUrls) {
					URL.revokeObjectURL(url)
				}
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return styles
}

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighter({
			themes: ["github-light", "vesper"],
			langs: [
				"javascript",
				"typescript",
				"jsx",
				"tsx",
				"html",
				"css",
				"json",
				"markdown",
				"bash",
				"shell",
				"python",
				"rust",
				"go",
				"sql",
				"yaml",
				"toml",
			],
		})
	}
	return highlighterPromise
}

function useMarked(
	wikilinkResolver: WikilinkTitleResolver,
	resolvedTheme: "light" | "dark",
) {
	let [marked, setMarked] = useState<Marked | null>(null)
	let resolverRef = useRef(wikilinkResolver)
	useEffect(() => {
		resolverRef.current = wikilinkResolver
	})

	useEffect(() => {
		let cancelled = false
		getHighlighter().then(highlighter => {
			if (cancelled) return
			let instance = createMarkedInstance(highlighter, resolvedTheme, id =>
				resolverRef.current(id),
			)
			setMarked(instance)
		})
		return () => {
			cancelled = true
		}
	}, [resolvedTheme])

	return marked
}

function createMarkedInstance(
	highlighter: Highlighter,
	theme: "light" | "dark",
	wikilinkResolver: WikilinkTitleResolver,
) {
	let instance = new Marked()
	instance.use(
		markedShiki({
			highlight(code, lang) {
				return highlighter.codeToHtml(code, {
					lang: lang || "text",
					theme: theme === "dark" ? "vesper" : "github-light",
				})
			},
		}),
	)
	instance.use(createWikilinkExtension(wikilinkResolver))
	instance.use({
		renderer: {
			image({ href, title, text }) {
				let titleAttr = title ? ` title="${title}"` : ""
				let caption = text
					? `<figcaption class="text-muted-foreground mt-2 text-center text-sm">${text}</figcaption>`
					: ""
				return `<figure class="my-4"><img src="${href}" alt="${text || ""}"${titleAttr} class="w-full rounded-lg" />${caption}</figure>`
			},
		},
	})
	instance.setOptions({ gfm: true, breaks: true })
	return instance
}

type RawSegment =
	| { type: "text"; content: string }
	| { type: "image"; imageId: string; alt: string }

async function parseSegments(
	content: string,
	assets: Asset[] | undefined,
	marked: Marked,
): Promise<Segment[]> {
	let rawSegments: RawSegment[] = []
	let lastIndex = 0
	let regex = /!\[([^\]]*)\]\(asset:([^)]+)\)/g
	let match

	while ((match = regex.exec(content)) !== null) {
		if (match.index > lastIndex) {
			rawSegments.push({
				type: "text",
				content: content.slice(lastIndex, match.index),
			})
		}

		let alt = match[1]
		let assetId = match[2]
		let asset = assets?.find(a => a?.$jazz.id === assetId)

		if (asset?.$isLoaded && asset.image) {
			rawSegments.push({
				type: "image",
				imageId: asset.image.$jazz.id,
				alt,
			})
		} else {
			rawSegments.push({
				type: "text",
				content: match[0],
			})
		}

		lastIndex = match.index + match[0].length
	}

	if (lastIndex < content.length) {
		rawSegments.push({
			type: "text",
			content: content.slice(lastIndex),
		})
	}

	return Promise.all(
		rawSegments.map(async seg => {
			if (seg.type === "image") return seg
			let html = await marked.parse(seg.content)
			return { type: "text" as const, html }
		}),
	)
}
