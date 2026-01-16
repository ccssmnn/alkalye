import { useRef, useState } from "react"
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
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import { Type } from "lucide-react"
import { modKey, altModKey } from "@/lib/platform"
import { WikiLinkDialog } from "@/components/floating-actions"
import type { MarkdownEditorRef } from "@/editor/editor"

export { SidebarFormatMenu }

interface SidebarFormatMenuProps {
	editor?: React.RefObject<MarkdownEditorRef | null>
	disabled?: boolean
	readOnly?: boolean
	documents?: { id: string; title: string }[]
	onCreateDocument?: (title: string) => Promise<string>
}

function SidebarFormatMenu({
	editor,
	disabled,
	readOnly,
	documents = [],
	onCreateDocument,
}: SidebarFormatMenuProps) {
	let { isMobile } = useSidebar()
	let savedSelection = useRef<{ from: number; to: number } | null>(null)
	let insertRangeRef = useRef<{ from: number; to: number } | null>(null)
	let [wikiLinkDialogOpen, setWikiLinkDialogOpen] = useState(false)
	let [inputValue, setInputValue] = useState("")

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
							<Type className="size-4" />
							<span>Format</span>
						</SidebarMenuButton>
					}
				/>
				<DropdownMenuContent
					align={isMobile ? "end" : "start"}
					side={isMobile ? "bottom" : "left"}
				>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger disabled={readOnly}>
							Headings
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{([1, 2, 3, 4, 5, 6] as const).map(level => (
								<DropdownMenuItem
									key={level}
									disabled={readOnly}
									onClick={() =>
										runAction(() => editor?.current?.setHeading(level))
									}
								>
									Heading {level}
									<DropdownMenuShortcut>
										{altModKey}
										{level}
									</DropdownMenuShortcut>
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger disabled={readOnly}>
							Lists
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() =>
									runAction(() => editor?.current?.toggleBulletList())
								}
							>
								Unordered
								<DropdownMenuShortcut>{altModKey}L</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() =>
									runAction(() => editor?.current?.toggleOrderedList())
								}
							>
								Ordered
								<DropdownMenuShortcut>{altModKey}O</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() =>
									runAction(() => editor?.current?.toggleTaskList())
								}
							>
								Task List
								<DropdownMenuShortcut>{altModKey}⇧L</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() =>
									runAction(() => editor?.current?.toggleTaskComplete())
								}
							>
								Toggle Complete
								<DropdownMenuShortcut>{altModKey}X</DropdownMenuShortcut>
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.toggleBlockquote())}
					>
						Blockquote
						<DropdownMenuShortcut>{altModKey}Q</DropdownMenuShortcut>
					</DropdownMenuItem>

					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.setBody())}
					>
						Body
						<DropdownMenuShortcut>{altModKey}0</DropdownMenuShortcut>
					</DropdownMenuItem>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger disabled={readOnly}>
							Structure
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() => runAction(() => editor?.current?.indent())}
							>
								Indent
								<DropdownMenuShortcut>Tab</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() => runAction(() => editor?.current?.outdent())}
							>
								Outdent
								<DropdownMenuShortcut>⇧Tab</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() => runAction(() => editor?.current?.moveLineUp())}
							>
								Move Line Up
								<DropdownMenuShortcut>{altModKey}↑</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() => runAction(() => editor?.current?.moveLineDown())}
							>
								Move Line Down
								<DropdownMenuShortcut>{altModKey}↓</DropdownMenuShortcut>
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.toggleBold())}
					>
						Bold
						<DropdownMenuShortcut>{modKey}B</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.toggleItalic())}
					>
						Italic
						<DropdownMenuShortcut>{modKey}I</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() =>
							runAction(() => editor?.current?.toggleStrikethrough())
						}
					>
						Strikethrough
						<DropdownMenuShortcut>{modKey}⇧X</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />

					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.toggleInlineCode())}
					>
						Code
						<DropdownMenuShortcut>{modKey}E</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.insertCodeBlock())}
					>
						Code Block
						<DropdownMenuShortcut>{altModKey}C</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.insertLink())}
					>
						Add Link
						<DropdownMenuShortcut>{modKey}K</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.insertImage())}
					>
						Add Image
						<DropdownMenuShortcut>{altModKey}K</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => {
							let view = editor?.current?.getEditor()
							if (!view) return
							let pos = view.state.selection.main.head
							insertRangeRef.current = { from: pos, to: pos }
							setWikiLinkDialogOpen(true)
						}}
					>
						Add Wikilink
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<WikiLinkDialog
				open={wikiLinkDialogOpen}
				onOpenChange={open => {
					setWikiLinkDialogOpen(open)
					if (!open) setInputValue("")
				}}
				title="Link to document"
				filteredDocs={documents.filter(d =>
					d.title.toLowerCase().includes(inputValue.toLowerCase()),
				)}
				showCreateOption={
					!!inputValue.trim() &&
					!documents.some(
						d => d.title.toLowerCase() === inputValue.toLowerCase(),
					)
				}
				inputValue={inputValue}
				onInputValueChange={setInputValue}
				onSelectDoc={docId => {
					if (!docId) return
					let view = editor?.current?.getEditor()
					let range = insertRangeRef.current
					if (!view || !range) return

					view.dispatch({
						changes: { from: range.from, to: range.to, insert: `[[${docId}]]` },
					})
					setWikiLinkDialogOpen(false)
					setInputValue("")
					view.focus()
				}}
				onCreateAndLink={async () => {
					if (!inputValue.trim() || !onCreateDocument) return
					let view = editor?.current?.getEditor()
					let range = insertRangeRef.current
					if (!view || !range) return

					let newDocId = await onCreateDocument(inputValue.trim())
					view.dispatch({
						changes: {
							from: range.from,
							to: range.to,
							insert: `[[${newDocId}]]`,
						},
					})
					setWikiLinkDialogOpen(false)
					setInputValue("")
					view.focus()
				}}
			/>
		</SidebarMenuItem>
	)
}
