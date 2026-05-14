import { Link } from "@tanstack/react-router"
import { co } from "jazz-tools"
import { SidebarMenuButton, SidebarMenuItem } from "@/app/components/ui/sidebar"
import { Presentation, ScrollText } from "lucide-react"
import { Document } from "@/schema"
import { canEdit } from "@/app/features/documents"
import { getPresentationMode } from "../lib/presentation"

export { SidebarPresentationLinks }

type LoadedDocument = co.loaded<typeof Document, { content: true }>

interface SidebarPresentationLinksProps {
	doc: LoadedDocument
}

function SidebarPresentationLinks({ doc }: SidebarPresentationLinksProps) {
	let docId = doc.$jazz.id
	let content = doc.content?.toString() ?? ""
	let isPresentation = getPresentationMode(content)
	let readOnly = !canEdit(doc)

	if (!isPresentation) return null

	return (
		<>
			<SidebarMenuItem>
				<SidebarMenuButton
					render={<Link to="/doc/$id/slideshow" params={{ id: docId }} />}
				>
					<Presentation className="size-4" />
					Slideshow
				</SidebarMenuButton>
			</SidebarMenuItem>
			<SidebarMenuItem>
				{readOnly ? (
					<SidebarMenuButton disabled>
						<ScrollText className="size-4" />
						Teleprompter
					</SidebarMenuButton>
				) : (
					<SidebarMenuButton
						render={<Link to="/doc/$id/teleprompter" params={{ id: docId }} />}
					>
						<ScrollText className="size-4" />
						Teleprompter
					</SidebarMenuButton>
				)}
			</SidebarMenuItem>
		</>
	)
}
