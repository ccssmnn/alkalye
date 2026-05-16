import { Link } from "@tanstack/react-router"
import { co } from "jazz-tools"
import { SidebarMenuButton, SidebarMenuItem } from "@/app/components/ui/sidebar"
import { Eye } from "lucide-react"
import { Document } from "@/schema"
import { useIntl } from "@/shared/intl/setup"

export { SidebarViewLinks }

type LoadedDocument = co.loaded<typeof Document, { content: true }>

interface SidebarViewLinksProps {
	doc: LoadedDocument
}

function SidebarViewLinks({ doc }: SidebarViewLinksProps) {
	let t = useIntl()
	let docId = doc.$jazz.id
	return (
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
				{t("doc.preview")}
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}
