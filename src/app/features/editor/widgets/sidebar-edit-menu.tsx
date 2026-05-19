import { useRef } from "react"
import {
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/app/components/ui/sidebar"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@/app/components/ui/dropdown-menu"
import { Undo2 } from "lucide-react"
import { isMac, modKey, altModKey } from "@/app/lib/platform"
import type { MarkdownEditorRef } from "./editor"
import { T } from "@/shared/intl/setup"

export { SidebarEditMenu }

interface SidebarEditMenuProps {
	editor?: React.RefObject<MarkdownEditorRef | null>
	disabled?: boolean
	readOnly?: boolean
}

function SidebarEditMenu({ editor, disabled, readOnly }: SidebarEditMenuProps) {
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
						<SidebarMenuButton disabled={disabled} nativeButton>
							<Undo2 className="size-4" />
							<span>
								<T k="editor.menu.edit" />
							</span>
						</SidebarMenuButton>
					}
				/>
				<DropdownMenuContent
					align={isMobile ? "center" : "start"}
					side={isMobile ? "bottom" : "left"}
				>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.undo())}
					>
						<T k="editor.menu.undo" />
						<DropdownMenuShortcut>{modKey}Z</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.redo())}
					>
						<T k="editor.menu.redo" />
						<DropdownMenuShortcut>
							{modKey}
							{isMac ? "⇧Z" : "Y"}
						</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.cut())}
					>
						<T k="editor.menu.cut" />
						<DropdownMenuShortcut>{modKey}X</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.copy())}
					>
						<T k="editor.menu.copy" />
						<DropdownMenuShortcut>{modKey}C</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.paste())}
					>
						<T k="editor.menu.paste" />
						<DropdownMenuShortcut>{modKey}V</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() =>
							runAction(() => editor?.current?.toggleTaskComplete())
						}
					>
						<T k="editor.menu.toggleComplete" />
						<DropdownMenuShortcut>{altModKey}X</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.sortTasks())}
					>
						<T k="editor.menu.sortTasks" />
						<DropdownMenuShortcut>{altModKey}⇧X</DropdownMenuShortcut>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	)
}
