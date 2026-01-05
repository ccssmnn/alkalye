import {
	createFileRoute,
	Navigate,
	Link,
	useNavigate,
} from "@tanstack/react-router"
import { useCoState } from "jazz-tools/react"
import { type ResolveQuery } from "jazz-tools"
import { Document, Space } from "@/schema"
import { getPresentationMode } from "@/lib/presentation"
import { getDocumentTitle } from "@/lib/document-utils"
import { altModKey } from "@/lib/platform"
import { Loader2, EllipsisIcon, Pencil } from "lucide-react"
import {
	DocumentNotFound,
	DocumentUnauthorized,
	SpaceDeleted,
	SpaceNotFound,
	SpaceUnauthorized,
} from "@/components/document-error-states"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTheme, ThemeSubmenu } from "@/lib/theme"
import { Preview } from "@/components/preview"
import { parseWikiLinks } from "@/editor/wikilink-parser"
import {
	resolveDocTitles,
	useDocTitles,
	type ResolvedDoc,
} from "@/lib/doc-resolver"

export { Route }

let loaderResolve = {
	content: true,
	assets: true,
} as const satisfies ResolveQuery<typeof Document>

let resolve = {
	content: true,
	assets: { $each: { image: true } },
} as const satisfies ResolveQuery<typeof Document>

let spaceLoaderResolve = {
	documents: true,
} as const satisfies ResolveQuery<typeof Space>

let Route = createFileRoute("/spaces/$spaceId/doc/$id/preview")({
	loader: async ({ params }) => {
		let [space, doc] = await Promise.all([
			Space.load(params.spaceId, { resolve: spaceLoaderResolve }),
			Document.load(params.id, { resolve: loaderResolve }),
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
	component: SpacePreviewPage,
})

function SpacePreviewPage() {
	let { spaceId, id } = Route.useParams()
	let data = Route.useLoaderData()
	let navigate = useNavigate()

	let space = useCoState(Space, spaceId, { resolve: spaceLoaderResolve })
	let doc = useCoState(Document, id, { resolve })

	let content = doc.$isLoaded ? (doc.content?.toString() ?? "") : ""
	let wikilinkIds = parseWikiLinks(content).map(w => w.id)
	let wikilinkCache = useDocTitles(wikilinkIds, data.wikilinkCache)

	// Space not found or unauthorized
	if (!data.space) {
		if (data.loadingState === "unauthorized") return <SpaceUnauthorized />
		return <SpaceNotFound />
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
					<EmptyTitle>Loading document...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	let isPresentation = getPresentationMode(content)
	if (isPresentation) {
		return (
			<Navigate
				to="/spaces/$spaceId/doc/$id/slideshow"
				params={{ spaceId, id }}
			/>
		)
	}

	let assets = doc.assets?.filter(a => a?.$isLoaded) ?? []
	let docTitle = getDocumentTitle(content)

	return (
		<div className="bg-background fixed inset-0 flex flex-col">
			<TopBar spaceId={spaceId} id={id} docTitle={docTitle} />
			<Preview
				content={content}
				assets={assets}
				wikilinks={wikilinkCache}
				onExit={() =>
					navigate({ to: "/spaces/$spaceId/doc/$id", params: { spaceId, id } })
				}
			/>
		</div>
	)
}

function TopBar({
	spaceId,
	id,
	docTitle,
}: {
	spaceId: string
	id: string
	docTitle: string
}) {
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
					<DropdownMenuItem
						render={
							<Link to="/spaces/$spaceId/doc/$id" params={{ spaceId, id }} />
						}
					>
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
