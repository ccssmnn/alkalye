import { useRef, useState } from "react"
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
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@/app/components/ui/dropdown-menu"
import { Type } from "lucide-react"
import { modKey, altModKey } from "@/app/lib/platform"
import { WikiLinkDialog } from "./floating-actions"
import type { MarkdownEditorRef } from "./editor"
import { useIntl, T } from "@/shared/intl/setup"

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
	let t = useIntl()
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
							<span>
								<T k="editor.menu.format" />
							</span>
						</SidebarMenuButton>
					}
				/>
				<DropdownMenuContent
					align={isMobile ? "end" : "start"}
					side={isMobile ? "bottom" : "left"}
				>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger disabled={readOnly}>
							<T k="editor.menu.headings" />
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
									<T k="editor.menu.heading" /> {level}
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
							<T k="editor.menu.lists" />
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() =>
									runAction(() => editor?.current?.toggleBulletList())
								}
							>
								<T k="editor.menu.unordered" />
								<DropdownMenuShortcut>{altModKey}L</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() =>
									runAction(() => editor?.current?.toggleOrderedList())
								}
							>
								<T k="editor.menu.ordered" />
								<DropdownMenuShortcut>{altModKey}O</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() =>
									runAction(() => editor?.current?.toggleTaskList())
								}
							>
								<T k="editor.menu.taskListLabel" />
								<DropdownMenuShortcut>{altModKey}⇧L</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() =>
									runAction(() => editor?.current?.toggleTaskComplete())
								}
							>
								<T k="editor.menu.toggleComplete" />
								<DropdownMenuShortcut>{altModKey}X</DropdownMenuShortcut>
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.toggleBlockquote())}
					>
						<T k="editor.menu.blockquote" />
						<DropdownMenuShortcut>{altModKey}Q</DropdownMenuShortcut>
					</DropdownMenuItem>

					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.setBody())}
					>
						<T k="editor.menu.body" />
						<DropdownMenuShortcut>{altModKey}0</DropdownMenuShortcut>
					</DropdownMenuItem>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger disabled={readOnly}>
							<T k="editor.menu.structure" />
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() => runAction(() => editor?.current?.indent())}
							>
								<T k="editor.menu.indent" />
								<DropdownMenuShortcut>Tab</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() => runAction(() => editor?.current?.outdent())}
							>
								<T k="editor.menu.outdent" />
								<DropdownMenuShortcut>⇧Tab</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() => runAction(() => editor?.current?.moveLineUp())}
							>
								<T k="editor.menu.moveLineUp" />
								<DropdownMenuShortcut>{altModKey}↑</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								disabled={readOnly}
								onClick={() => runAction(() => editor?.current?.moveLineDown())}
							>
								<T k="editor.menu.moveLineDown" />
								<DropdownMenuShortcut>{altModKey}↓</DropdownMenuShortcut>
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.toggleBold())}
					>
						<T k="editor.menu.bold" />
						<DropdownMenuShortcut>{modKey}B</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.toggleItalic())}
					>
						<T k="editor.menu.italic" />
						<DropdownMenuShortcut>{modKey}I</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() =>
							runAction(() => editor?.current?.toggleStrikethrough())
						}
					>
						<T k="editor.menu.strikethrough" />
						<DropdownMenuShortcut>{modKey}⇧X</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />

					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.toggleInlineCode())}
					>
						<T k="editor.menu.code" />
						<DropdownMenuShortcut>{modKey}E</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.insertCodeBlock())}
					>
						<T k="editor.menu.codeBlock" />
						<DropdownMenuShortcut>{altModKey}C</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.insertLink())}
					>
						<T k="editor.menu.addLink" />
						<DropdownMenuShortcut>{modKey}K</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={readOnly}
						onClick={() => runAction(() => editor?.current?.insertImage())}
					>
						<T k="editor.menu.addImage" />
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
						<T k="editor.menu.addWikilink" />
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<WikiLinkDialog
				open={wikiLinkDialogOpen}
				onOpenChange={open => {
					setWikiLinkDialogOpen(open)
					if (!open) setInputValue("")
				}}
				title={t("editor.dialog.linkToDocument")}
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
