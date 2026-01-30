import { useEffect } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { EllipsisIcon, Pencil } from "lucide-react"
import { getDocumentTitle } from "@/lib/document-utils"
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
import { useDocTitles } from "@/lib/doc-resolver"
import { altModKey } from "@/lib/platform"
import { useLocalFileStore } from "@/lib/local-file"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { FileText } from "lucide-react"

export { Route }

let Route = createFileRoute("/local/preview")({
	component: LocalPreviewPage,
})

function LocalPreviewPage() {
	let store = useLocalFileStore()
	let navigate = useNavigate()

	let content = store.content
	let filename = store.filename

	// Parse wikilinks from content (must be before early return for hooks rules)
	let wikilinkIds = parseWikiLinks(content).map(w => w.id)
	let wikilinkCache = useDocTitles(wikilinkIds)

	// Redirect to editor if no content
	useEffect(() => {
		if (!content) {
			navigate({ to: "/local" as "/" })
		}
	}, [content, navigate])

	if (!content) {
		return (
			<Empty className="h-screen">
				<EmptyHeader>
					<FileText className="text-muted-foreground size-12" />
					<EmptyTitle>No file open</EmptyTitle>
				</EmptyHeader>
				<Button nativeButton={false} render={<Link to={"/local" as "/"} />}>
					Open a file
				</Button>
			</Empty>
		)
	}

	let docTitle = getDocumentTitle(content) || filename || "Untitled"

	return (
		<div className="bg-background fixed inset-0 flex flex-col">
			<TopBar filename={filename} docTitle={docTitle} />
			<Preview
				content={content}
				wikilinks={wikilinkCache}
				onExit={() => navigate({ to: "/local" as "/" })}
			/>
		</div>
	)
}

function TopBar({
	filename,
	docTitle,
}: {
	filename: string | null
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
				render={<a href="/local" />}
			>
				{filename || "Local File"}
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
					<DropdownMenuItem render={<a href="/local" />}>
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
