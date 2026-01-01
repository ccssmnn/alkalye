import { useEffect, useState, useRef } from "react"
import {
	createFileRoute,
	useNavigate,
	Navigate,
	Link,
} from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { Image as JazzImage } from "jazz-tools/react"
import { type ID, type ResolveQuery } from "jazz-tools"
import { Document } from "@/schema"
import { getPresentationMode } from "@/lib/presentation"
import { getDocumentTitle } from "@/lib/document-utils"
import { altModKey } from "@/lib/platform"
import { Loader2, EllipsisIcon, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/components/document-error-states"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { useTheme, ThemeSubmenu } from "@/lib/theme"
import { Marked } from "marked"
import markedShiki from "marked-shiki"
import { createHighlighter, type Highlighter } from "shiki"
import {
	createWikilinkExtension,
	type WikilinkTitleResolver,
} from "@/lib/marked-wikilink"
import { parseFrontmatter } from "@/editor/frontmatter"
import { parseWikiLinks } from "@/editor/wikilink-parser"
import { resolveDocTitles, type ResolvedDoc } from "@/lib/doc-resolver"

export { Route }

let loaderResolve = {
	content: true,
	assets: true,
} as const satisfies ResolveQuery<typeof Document>

let resolve = {
	content: true,
	assets: { $each: { image: true } },
} as const satisfies ResolveQuery<typeof Document>

let Route = createFileRoute("/doc/$id/preview")({
	loader: async ({ params }) => {
		let doc = await Document.load(params.id as ID<typeof Document>, {
			resolve: loaderResolve,
		})
		if (!doc.$isLoaded) {
			return {
				doc: null,
				loadingState: doc.$jazz.loadingState as "unauthorized" | "unavailable",
				wikilinkCache: new Map<string, ResolvedDoc>(),
			}
		}

		// Parse wikilinks and resolve titles
		let content = doc.content?.toString() ?? ""
		let wikilinks = parseWikiLinks(content)
		let wikilinkIds = wikilinks.map(w => w.id)
		let wikilinkCache = await resolveDocTitles(wikilinkIds)

		return { doc, loadingState: null, wikilinkCache }
	},
	component: PreviewPage,
	validateSearch: (search: Record<string, unknown>) => ({
		from: search.from as "list" | undefined,
	}),
})

function PreviewPage() {
	let { id } = Route.useParams()
	Route.useSearch()
	let data = Route.useLoaderData()

	let doc = useCoState(Document, id, { resolve })

	// Wikilink cache: start with loader data, expand as new links appear
	let [wikilinkCache, setWikilinkCache] = useState(data.wikilinkCache)
	let pendingRef = useRef(new Set<string>())

	let wikilinkResolver: WikilinkTitleResolver = docId => {
		let resolved = wikilinkCache.get(docId)
		if (resolved) return resolved

		// Resolve unknown links in background
		if (!pendingRef.current.has(docId)) {
			pendingRef.current.add(docId)
			resolveDocTitles([docId]).then(result => {
				let doc = result.get(docId)
				if (doc) {
					setWikilinkCache(prev => new Map(prev).set(docId, doc))
				}
				pendingRef.current.delete(docId)
			})
		}

		return { title: docId, exists: false }
	}

	let marked = useMarked(wikilinkResolver)

	if (!data.doc) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	if (!doc.$isLoaded && doc.$jazz.loadingState !== "loading") {
		if (doc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	if (!doc.$isLoaded || !marked) {
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
	let isPresentation = getPresentationMode(content)
	if (isPresentation) {
		return <Navigate to="/doc/$id/slideshow" params={{ id }} />
	}

	let docTitle = getDocumentTitle(content)

	return (
		<div className="bg-background fixed inset-0 flex flex-col">
			<TopBar id={id} docTitle={docTitle} />
			<PreviewContent
				id={id}
				content={content}
				doc={doc}
				marked={marked}
				cacheVersion={wikilinkCache.size}
			/>
		</div>
	)
}

function TopBar({ id, docTitle }: { id: string; docTitle: string }) {
	let { theme, setTheme } = useTheme()

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
				render={<Link to="/" />}
			>
				Alkalye
			</Button>
			<span className="text-muted-foreground absolute left-1/2 -translate-x-1/2 truncate text-sm font-medium">
				{docTitle}
			</span>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="icon" nativeButton={false}>
							<EllipsisIcon className="size-4" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					<DropdownMenuItem render={<Link to="/doc/$id" params={{ id }} />}>
						<Pencil className="size-4" />
						Editor
						<DropdownMenuShortcut>{altModKey}R</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<ThemeSubmenu theme={theme} setTheme={setTheme} />
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

type Segment =
	| { type: "text"; html: string }
	| { type: "image"; imageId: string; alt: string }

function PreviewContent({
	id,
	content,
	doc,
	marked,
	cacheVersion,
}: {
	id: string
	content: string
	doc: { $isLoaded: true; assets: unknown }
	marked: Marked
	cacheVersion: number
}) {
	let navigate = useNavigate()
	let [segments, setSegments] = useState<Segment[]>([])

	useEffect(() => {
		if (!content) {
			setSegments([])
			return
		}

		// Strip frontmatter before rendering
		let { body } = parseFrontmatter(content)
		let contentToRender = body

		let cancelled = false

		async function parseSegments() {
			let rawSegments: Array<
				| { type: "text"; content: string }
				| { type: "image"; imageId: string; alt: string }
			> = []
			let lastIndex = 0
			let regex = /!\[([^\]]*)\]\(asset:([^)]+)\)/g
			let match

			while ((match = regex.exec(contentToRender)) !== null) {
				if (match.index > lastIndex) {
					rawSegments.push({
						type: "text",
						content: contentToRender.slice(lastIndex, match.index),
					})
				}

				let alt = match[1]
				let assetId = match[2]
				let assets = (
					doc as {
						assets?: Array<{
							$jazz: { id: string }
							$isLoaded?: boolean
							image?: { $jazz: { id: string } }
						}>
					}
				).assets
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

			if (lastIndex < contentToRender.length) {
				rawSegments.push({
					type: "text",
					content: contentToRender.slice(lastIndex),
				})
			}

			let result: Segment[] = await Promise.all(
				rawSegments.map(async seg => {
					if (seg.type === "image") return seg
					let html = await marked.parse(seg.content)
					return { type: "text" as const, html }
				}),
			)

			if (!cancelled) setSegments(result)
		}

		parseSegments()

		return () => {
			cancelled = true
		}
	}, [content, doc, marked, cacheVersion])

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
				navigate({ to: "/doc/$id", params: { id } })
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [navigate, id])

	return (
		<div
			className="flex-1 overflow-auto"
			style={{
				paddingLeft: "env(safe-area-inset-left)",
				paddingRight: "env(safe-area-inset-right)",
				paddingBottom: "env(safe-area-inset-bottom)",
			}}
		>
			<div className="mx-auto max-w-[65ch] px-6 py-8">
				<article className="prose prose-neutral dark:prose-invert prose-headings:font-semibold prose-a:text-foreground prose-code:before:content-none prose-code:after:content-none [&_pre]:shadow-inset [&_pre]:border-border [&_pre]:rounded-lg [&_pre]:border [&_pre]:p-4">
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
									className="w-full rounded"
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

function useMarked(wikilinkResolver: WikilinkTitleResolver) {
	let [marked, setMarked] = useState<Marked | null>(null)
	let resolverRef = useRef(wikilinkResolver)
	resolverRef.current = wikilinkResolver

	useEffect(() => {
		let cancelled = false
		getHighlighter().then(highlighter => {
			if (cancelled) return
			let instance = new Marked()
			instance.use(
				markedShiki({
					highlight(code, lang) {
						let isDark = document.documentElement.classList.contains("dark")
						return highlighter.codeToHtml(code, {
							lang: lang || "text",
							theme: isDark ? "vesper" : "github-light",
						})
					},
				}),
			)
			instance.use(createWikilinkExtension(id => resolverRef.current(id)))
			instance.setOptions({ gfm: true, breaks: true })
			setMarked(instance)
		})
		return () => {
			cancelled = true
		}
	}, [])

	return marked
}
