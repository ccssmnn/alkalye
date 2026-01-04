import { useRef } from "react"
import {
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import { Undo2 } from "lucide-react"
import { isMac, modKey } from "@/lib/platform"
import type { MarkdownEditorRef } from "@/editor/editor"

export { SidebarEditMenu }

interface SidebarEditMenuProps {
	editor?: React.RefObject<MarkdownEditorRef | null>
	disabled?: boolean
}

function SidebarEditMenu({ editor, disabled }: SidebarEditMenuProps) {
	let { isMobile } = useSidebar()
	let savedSelection = useRef<{ from: number; to: number } | null>(null)

	function handleOpenChange(open: boolean) {
		if (open) {
			savedSelection.current = editor?.current?.getSelection() ?? null
		}
	}

	function runAction(action: () => void) {
		if (savedSelection.current) {
			editor?.current?.restoreSelection(savedSelection.current)
		}
		action()
	}

	return (
		<SidebarMenuItem>
			<DropdownMenu onOpenChange={handleOpenChange}>
				<DropdownMenuTrigger
					disabled={disabled}
					render={
						<SidebarMenuButton disabled={disabled}>
							<Undo2 className="size-4" />
							<span>Edit</span>
						</SidebarMenuButton>
					}
				/>
				<DropdownMenuContent
					align={isMobile ? "center" : "start"}
					side={isMobile ? "bottom" : "left"}
				>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.undo())}
					>
						Undo
						<DropdownMenuShortcut>{modKey}Z</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.redo())}
					>
						Redo
						<DropdownMenuShortcut>
							{modKey}
							{isMac ? "⇧Z" : "Y"}
						</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.cut())}
					>
						Cut
						<DropdownMenuShortcut>{modKey}X</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.copy())}
					>
						Copy
						<DropdownMenuShortcut>{modKey}C</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.paste())}
					>
						Paste
						<DropdownMenuShortcut>{modKey}V</DropdownMenuShortcut>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	)
}
