import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
} from "@/components/ui/sidebar"

export { DocumentSidebar }

function DocumentSidebar({
	header,
	footer,
	children,
}: {
	header?: React.ReactNode
	footer?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<Sidebar side="right" collapsible="offcanvas">
			<SidebarHeader
				className="border-border flex-row items-center justify-between border-b p-0 px-3"
				style={{ height: "calc(48px + 1px)" }}
			>
				<span className="text-sm font-medium">Document</span>
				<div className="flex items-center gap-1">{header}</div>
			</SidebarHeader>
			<SidebarContent>{children}</SidebarContent>
			<SidebarFooter className="border-border border-t">{footer}</SidebarFooter>
		</Sidebar>
	)
}
