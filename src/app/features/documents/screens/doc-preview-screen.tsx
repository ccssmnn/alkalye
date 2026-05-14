import { useEffect } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useCoState, useAccount } from "jazz-tools/react"
import { type ResolveQuery } from "jazz-tools"
import { Document, UserAccount } from "@/schema"
import { getDocumentTitle } from "../lib/title"
import { altModKey } from "@/app/lib/platform"
import { EllipsisIcon, Pencil } from "lucide-react"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/app/components/error-states"

import { Button } from "@/app/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { useTheme, ThemeSubmenu } from "@/app/components/appearance"
import { Preview } from "../widgets/preview"
import { parseWikiLinks } from "@/app/features/editor"
import {
	resolveDocTitles,
	useDocTitles,
	type ResolvedDoc,
} from "../lib/wikilink-titles"
import { printToPdf } from "@/app/features/import-export"

export { DocPreviewScreen, previewResolve, resolveDocTitles }

let previewResolve = {
	content: true,
	assets: { $each: { image: true } },
} as const satisfies ResolveQuery<typeof Document>

let themesResolve = {
	root: {
		settings: true,
		themes: {
			$each: { css: true, template: true, assets: { $each: { data: true } } },
		},
	},
} as const

interface DocPreviewScreenProps {
	id: string
	loaderData: {
		doc:
			| import("jazz-tools").co.loaded<typeof Document, typeof previewResolve>
			| null
		loadingState: string | null
		wikilinkCache: Map<string, ResolvedDoc>
	}
}

function DocPreviewScreen({ id, loaderData }: DocPreviewScreenProps) {
	let navigate = useNavigate()

	let subscribedDoc = useCoState(Document, id, { resolve: previewResolve })
	let meWithThemes = useAccount(UserAccount, { resolve: themesResolve })

	// Extract content for wikilinks (use loader data as fallback, empty if neither)
	let content =
		(subscribedDoc.$isLoaded
			? subscribedDoc
			: loaderData.doc
		)?.content?.toString() ?? ""
	let wikilinkIds = parseWikiLinks(content).map(w => w.id)
	let wikilinkCache = useDocTitles(wikilinkIds, loaderData.wikilinkCache)

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
			if (e.key.toLowerCase() !== "p") return
			e.preventDefault()
			void printToPdf({
				content,
				themes: meWithThemes.$isLoaded ? meWithThemes.root?.themes : undefined,
				defaultPreviewTheme: meWithThemes.$isLoaded
					? (meWithThemes.root?.settings?.defaultPreviewTheme ?? null)
					: null,
			})
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [content, meWithThemes])

	// Error states from loader
	if (!loaderData.doc) {
		if (loaderData.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Handle live access revocation
	if (
		!subscribedDoc.$isLoaded &&
		subscribedDoc.$jazz.loadingState !== "loading"
	) {
		if (subscribedDoc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Fall back to preloaded data while subscription is loading
	let doc = subscribedDoc.$isLoaded ? subscribedDoc : loaderData.doc
	let assets = doc.assets?.filter(a => a?.$isLoaded) ?? []
	let docTitle = getDocumentTitle(content)

	return (
		<div className="bg-background fixed inset-0 flex flex-col">
			<TopBar id={id} docTitle={docTitle} />
			<Preview
				content={content}
				assets={assets}
				wikilinks={wikilinkCache}
				onExit={() => navigate({ to: "/doc/$id", params: { id } })}
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
