import { Link } from "@tanstack/react-router"
import { co } from "jazz-tools"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Eye, Presentation, ScrollText } from "lucide-react"
import { Document } from "@/schema"
import { canEdit } from "@/lib/documents"
import { getPresentationMode } from "@/lib/presentation"

export { SidebarViewLinks }

type LoadedDocument = co.loaded<typeof Document, { content: true }>

interface SidebarViewLinksProps {
	doc: LoadedDocument
}

function SidebarViewLinks({ doc }: SidebarViewLinksProps) {
	let docId = doc.$jazz.id
	let content = doc.content?.toString() ?? ""
	let isPresentation = getPresentationMode(content)
	let readOnly = !canEdit(doc)
	return (
		<>
			<SidebarMenuItem>
				<SidebarMenuButton
					render={
						<Link
							to="/doc/$id/preview"
							params={{ id: docId }}
							search={{ from: undefined }}
						/>
					}
				>
					<Eye className="size-4" />
					Preview
				</SidebarMenuButton>
			</SidebarMenuItem>
			{isPresentation && (
				<>
					<SidebarMenuItem>
						<SidebarMenuButton
							render={
								<a
									href={`/doc/${docId}/slideshow`}
									target="_blank"
									rel="noopener noreferrer"
								/>
							}
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
								render={
									<Link to="/doc/$id/teleprompter" params={{ id: docId }} />
								}
							>
								<ScrollText className="size-4" />
								Teleprompter
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
				</>
			)}
		</>
	)
}
