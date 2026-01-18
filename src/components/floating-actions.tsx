import { useEffect, useState, useRef, useImperativeHandle } from "react"
import { createPortal } from "react-dom"
import { useSidebar } from "@/components/ui/sidebar"
import { syntaxTree } from "@codemirror/language"
import type { EditorView } from "@codemirror/view"
import type { MarkdownEditorRef } from "@/editor/editor"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Check,
	ExternalLink,
	ImagePlus,
	Upload,
	Image as ImageIcon,
	Command,
	FileText,
	Link2,
	Trash2,
	Plus,
	FileSymlinkIcon,
} from "lucide-react"
import { parseWikiLinks } from "@/editor/wikilink-parser"
import { useNavigate } from "@tanstack/react-router"
import { Combobox } from "@base-ui/react/combobox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { isMac } from "@/lib/platform"

export {
	FloatingActions,
	TaskAction,
	LinkAction,
	ImageAction,
	WikiLinkAction,
	WikiLinkDialog,
}
export type { FloatingActionsProps, FloatingActionsRef }

type Range = { from: number; to: number }

interface FloatingActionsRef {
	triggerContextAction: () => void
}

interface FloatingActionsProps {
	editor: React.RefObject<MarkdownEditorRef | null>
	focused: boolean
	readOnly?: boolean
	assets?: { id: string; name: string }[]
	docs?: { id: string; title: string }[]
	onUploadAndInsert?: (file: File, replaceRange: Range) => Promise<void>
	children: (ctx: FloatingActionsContext) => React.ReactNode
	actionsRef?: React.RefObject<FloatingActionsRef | null>
}

interface FloatingActionsContext {
	task: { isTask: boolean; taskChecked: boolean; taskRange: Range | null }
	link: { linkUrl: string | null; linkRange: Range | null }
	image: {
		isImage: boolean
		imageRange: Range | null
		imageDialogOpen: boolean
		setImageDialogOpen: (open: boolean) => void
		imageRangeRef: React.RefObject<Range | null>
	}
	wikiLink: {
		wikiLinkId: string | null
		wikiLinkRange: Range | null
		wikiLinkMenuOpen: boolean
		setWikiLinkMenuOpen: (open: boolean) => void
		wikiLinkDialogOpen: boolean
		setWikiLinkDialogOpen: (open: boolean) => void
		wikiLinkRangeRef: React.RefObject<Range | null>
		wikilinkPrefill: string
		setWikilinkPrefill: (value: string) => void
	}
}

interface EditorContext {
	isTask: boolean
	taskChecked: boolean
	taskRange: Range | null
	linkUrl: string | null
	linkRange: Range | null
	isImage: boolean
	imageRange: Range | null
	wikiLinkId: string | null
	wikiLinkRange: Range | null
}

let SIDEBAR_WIDTH = 224 // 14rem = 224px

function FloatingActions({
	editor,
	focused,
	readOnly,
	docs,
	children,
	actionsRef,
}: FloatingActionsProps) {
	let { rightOpen, isMobile } = useSidebar()
	let [context, setContext] = useState<EditorContext>({
		isTask: false,
		taskChecked: false,
		taskRange: null,
		linkUrl: null,
		linkRange: null,
		isImage: false,
		imageRange: null,
		wikiLinkId: null,
		wikiLinkRange: null,
	})
	let [bottomOffset, setBottomOffset] = useState(16)
	let [imageDialogOpen, setImageDialogOpen] = useState(false)
	let [wikiLinkMenuOpen, setWikiLinkMenuOpen] = useState(false)
	let [wikiLinkDialogOpen, setWikiLinkDialogOpen] = useState(false)
	let [isInteracting, setIsInteracting] = useState(false)
	let [wikilinkPrefill, setWikilinkPrefill] = useState("")

	let imageRangeRef = useRef<Range | null>(null)
	let wikiLinkRangeRef = useRef<Range | null>(null)

	let rightOffset = !isMobile && rightOpen ? SIDEBAR_WIDTH + 16 : 16

	// Track viewport height for keyboard avoidance
	useEffect(() => {
		let viewport = window.visualViewport
		if (!viewport) return

		function updatePosition() {
			if (!viewport) return
			let keyboardHeight = window.innerHeight - viewport.height
			setBottomOffset(Math.max(16, keyboardHeight + 16))
		}

		updatePosition()
		viewport.addEventListener("resize", updatePosition)
		viewport.addEventListener("scroll", updatePosition)
		return () => {
			viewport.removeEventListener("resize", updatePosition)
			viewport.removeEventListener("scroll", updatePosition)
		}
	}, [])

	// Reset context when focus lost and not interacting
	let shouldResetContext =
		!focused &&
		!isInteracting &&
		!imageDialogOpen &&
		!wikiLinkMenuOpen &&
		!wikiLinkDialogOpen

	let emptyContext: EditorContext = {
		isTask: false,
		taskChecked: false,
		taskRange: null,
		linkUrl: null,
		linkRange: null,
		isImage: false,
		imageRange: null,
		wikiLinkId: null,
		wikiLinkRange: null,
	}

	// Reset context during render when conditions change (adjust state during render pattern)
	let [prevShouldReset, setPrevShouldReset] = useState(shouldResetContext)
	if (shouldResetContext !== prevShouldReset) {
		setPrevShouldReset(shouldResetContext)
		if (shouldResetContext) {
			setContext(emptyContext)
		}
	}

	// Subscribe to editor selection changes and compute context
	useEffect(() => {
		if (shouldResetContext) return

		let view = editor.current?.getEditor()
		if (!view || !focused) return

		function getEditorContext(v: EditorView): EditorContext {
			let state = v.state
			let pos = state.selection.main.head
			let tree = syntaxTree(state)
			let node = tree.resolveInner(pos, -1)

			let result: EditorContext = {
				isTask: false,
				taskChecked: false,
				taskRange: null,
				linkUrl: null,
				linkRange: null,
				isImage: false,
				imageRange: null,
				wikiLinkId: null,
				wikiLinkRange: null,
			}

			let current: typeof node | null = node
			while (current) {
				if (current.name === "Task" || current.name === "TaskMarker") {
					result.isTask = true
					let taskNode = current.name === "Task" ? current : current.parent
					if (taskNode) {
						let taskText = state.sliceDoc(taskNode.from, taskNode.to)
						result.taskChecked =
							taskText.includes("[x]") || taskText.includes("[X]")
						result.taskRange = { from: taskNode.from, to: taskNode.to }
					}
				}

				if (current.name === "ListItem") {
					let child = current.firstChild
					while (child) {
						if (child.name === "Task") {
							result.isTask = true
							let taskText = state.sliceDoc(child.from, child.to)
							result.taskChecked =
								taskText.includes("[x]") || taskText.includes("[X]")
							result.taskRange = { from: child.from, to: child.to }
							break
						}
						child = child.nextSibling
					}
				}

				if (current.name === "Link") {
					let urlNode = current.getChild("URL")
					if (urlNode) {
						let url = state.sliceDoc(urlNode.from, urlNode.to)
						if (!url.startsWith("asset:")) {
							result.linkUrl = url
							result.linkRange = { from: current.from, to: current.to }
						}
					}
				}

				if (current.name === "Image") {
					result.isImage = true
					result.imageRange = { from: current.from, to: current.to }
				}

				current = current.parent
			}

			// Check for wikilinks via text-based detection (not in syntax tree)
			let content = state.doc.toString()
			let wikilinks = parseWikiLinks(content)
			for (let link of wikilinks) {
				if (pos >= link.from && pos <= link.to) {
					result.wikiLinkId = link.id
					result.wikiLinkRange = { from: link.from, to: link.to }
					break
				}
			}

			// Also detect incomplete wikilinks: [[ or [[text without closing ]]
			if (!result.wikiLinkId) {
				let line = state.doc.lineAt(pos)
				let textBefore = line.text.slice(0, pos - line.from)
				let textAfter = line.text.slice(pos - line.from)
				let match = textBefore.match(/\[\[([^\][]*)$/)
				if (match) {
					let from = line.from + textBefore.lastIndexOf("[[")
					// Check if closing brackets exist after cursor
					let closingMatch = textAfter.match(/^([^\][]*)]]/)
					let to = closingMatch
						? pos + closingMatch[0].length
						: pos + (textAfter.match(/^[^\][]*/) ?? [""])[0].length
					result.wikiLinkId = match[1] || "" // empty string for [[]]
					result.wikiLinkRange = { from, to }
				}
			}

			return result
		}

		let rafId: number | null = null
		let lastPos = -1

		function checkSelection() {
			if (!focused) {
				rafId = null
				return
			}
			let v = editor.current?.getEditor()
			if (v) {
				let pos = v.state.selection.main.head
				if (pos !== lastPos) {
					lastPos = pos
					setContext(getEditorContext(v))
				}
			}
			rafId = requestAnimationFrame(checkSelection)
		}

		rafId = requestAnimationFrame(() => {
			setContext(getEditorContext(view))
			checkSelection()
		})

		return () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId)
			}
		}
	}, [editor, focused, shouldResetContext])

	// Expose triggerContextAction to parent via ref
	useImperativeHandle(actionsRef, () => ({
		triggerContextAction: () => {
			let view = editor.current?.getEditor()
			if (!view) return

			// Detect wikilink at cursor
			let state = view.state
			let pos = state.selection.main.head
			let content = state.doc.toString()
			let wikilinks = parseWikiLinks(content)

			for (let link of wikilinks) {
				if (pos >= link.from && pos <= link.to) {
					wikiLinkRangeRef.current = { from: link.from, to: link.to }
					// Check if link ID resolves to an existing doc
					let isValidLink = docs?.some(d => d.id === link.id)
					if (isValidLink) {
						setWikiLinkMenuOpen(true)
					} else {
						setWikilinkPrefill(link.id)
						setWikiLinkDialogOpen(true)
					}
					return
				}
			}

			// Check for incomplete wikilink
			let line = state.doc.lineAt(pos)
			let textBefore = line.text.slice(0, pos - line.from)
			let textAfter = line.text.slice(pos - line.from)
			let match = textBefore.match(/\[\[([^\][]*)$/)
			if (match) {
				let from = line.from + textBefore.lastIndexOf("[[")
				let closingMatch = textAfter.match(/^([^\][]*)]]/)
				let to = closingMatch
					? pos + closingMatch[0].length
					: pos + (textAfter.match(/^[^\][]*/) ?? [""])[0].length
				wikiLinkRangeRef.current = { from, to }
				setWikilinkPrefill((match[1] ?? "").trim())
				setWikiLinkDialogOpen(true)
				return
			}

			// Check for image
			let tree = syntaxTree(state)
			let node = tree.resolveInner(pos, -1)
			let current: typeof node | null = node
			while (current) {
				if (current.name === "Image") {
					imageRangeRef.current = { from: current.from, to: current.to }
					setImageDialogOpen(true)
					return
				}
				current = current.parent
			}
		},
	}))

	function handleImageDialogOpenChange(open: boolean) {
		if (open && context.imageRange) {
			imageRangeRef.current = context.imageRange
		}
		setImageDialogOpen(open)
	}

	function handlePointerDown() {
		setIsInteracting(true)
	}

	function handlePointerUp() {
		setTimeout(() => {
			setIsInteracting(false)
		}, 100)
	}

	let shouldShow =
		focused ||
		imageDialogOpen ||
		wikiLinkMenuOpen ||
		wikiLinkDialogOpen ||
		isInteracting
	if (readOnly || !shouldShow) return null

	let ctx: FloatingActionsContext = {
		task: {
			isTask: context.isTask,
			taskChecked: context.taskChecked,
			taskRange: context.taskRange,
		},
		link: {
			linkUrl: context.linkUrl,
			linkRange: context.linkRange,
		},
		image: {
			isImage: context.isImage,
			imageRange: context.imageRange,
			imageDialogOpen,
			setImageDialogOpen: handleImageDialogOpenChange,
			imageRangeRef,
		},
		wikiLink: {
			wikiLinkId: context.wikiLinkId,
			wikiLinkRange: context.wikiLinkRange,
			wikiLinkMenuOpen,
			setWikiLinkMenuOpen: handleWikiLinkMenuOpenChange,
			wikiLinkDialogOpen,
			setWikiLinkDialogOpen,
			wikiLinkRangeRef,
			wikilinkPrefill,
			setWikilinkPrefill,
		},
	}

	function handleWikiLinkMenuOpenChange(open: boolean) {
		if (open && context.wikiLinkRange) {
			wikiLinkRangeRef.current = context.wikiLinkRange
		}
		setWikiLinkMenuOpen(open)
	}

	return createPortal(
		<div
			className={cn(
				"fixed z-50 flex flex-col gap-1",
				"pr-[env(safe-area-inset-right)]",
				bottomOffset === 16 && "pb-[env(safe-area-inset-bottom)]",
			)}
			style={{ bottom: bottomOffset, right: rightOffset }}
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
		>
			{children(ctx)}
		</div>,
		document.body,
	)
}

interface TaskActionProps {
	editor: React.RefObject<MarkdownEditorRef | null>
	isTask: boolean
	taskChecked: boolean
	taskRange: Range | null
}

function TaskAction({ editor, isTask, taskChecked }: TaskActionProps) {
	if (!isTask) return null

	function toggleTask() {
		editor.current?.toggleTaskComplete()
	}

	return (
		<ActionButton
			icon={<Check />}
			label={taskChecked ? "Mark incomplete" : "Mark complete"}
			shortcut="X"
			onClick={toggleTask}
		/>
	)
}

interface LinkActionProps {
	linkUrl: string | null
}

function LinkAction({ linkUrl }: LinkActionProps) {
	if (!linkUrl) return null

	let url = linkUrl
	function openLink() {
		window.open(url, "_blank", "noopener,noreferrer")
	}

	return (
		<ActionButton
			icon={<ExternalLink />}
			label="Open link"
			onClick={openLink}
		/>
	)
}

interface WikiLinkActionProps {
	editor: React.RefObject<MarkdownEditorRef | null>
	wikiLinkId: string | null
	wikiLinkMenuOpen: boolean
	setWikiLinkMenuOpen: (open: boolean) => void
	wikiLinkDialogOpen: boolean
	setWikiLinkDialogOpen: (open: boolean) => void
	wikiLinkRangeRef: React.RefObject<Range | null>
	wikilinkPrefill: string
	setWikilinkPrefill: (value: string) => void
	docs: { id: string; title: string }[]
	onCreateDoc?: (title: string) => Promise<string>
}

function WikiLinkAction({
	editor,
	wikiLinkId,
	wikiLinkMenuOpen,
	setWikiLinkMenuOpen,
	wikiLinkDialogOpen,
	setWikiLinkDialogOpen,
	wikiLinkRangeRef,
	wikilinkPrefill,
	setWikilinkPrefill,
	docs,
	onCreateDoc,
}: WikiLinkActionProps) {
	let navigate = useNavigate()
	let [inputValue, setInputValue] = useState(wikilinkPrefill)

	// Sync inputValue with wikilinkPrefill when dialog opens via Ctrl+Space
	let [prevPrefill, setPrevPrefill] = useState(wikilinkPrefill)
	if (wikilinkPrefill !== prevPrefill) {
		setPrevPrefill(wikilinkPrefill)
		setInputValue(wikilinkPrefill)
	}

	if (wikiLinkId === null) return null

	// Check if this is a valid existing doc (not empty/incomplete wikilink)
	let isValidLink = wikiLinkId && docs.some(d => d.id === wikiLinkId)
	// Extract text from incomplete wikilink to prefill search
	let prefillText = !isValidLink ? wikiLinkId.trim() : ""

	let filteredDocs = docs.filter(
		doc =>
			doc.id !== wikiLinkId &&
			doc.title.toLowerCase().includes(inputValue.toLowerCase()),
	)
	let showCreateOption =
		!!inputValue.trim() &&
		!docs.some(d => d.title.toLowerCase() === inputValue.toLowerCase())

	function openLinkedDoc() {
		setWikiLinkMenuOpen(false)
		navigate({ to: "/doc/$id", params: { id: wikiLinkId! } })
	}

	function handleChangeLink() {
		setWikiLinkMenuOpen(false)
		setWikiLinkDialogOpen(true)
	}

	function handleRemoveLink() {
		let view = editor.current?.getEditor()
		let range = wikiLinkRangeRef.current
		if (!view || !range) return

		view.dispatch({
			changes: { from: range.from, to: range.to, insert: "" },
		})
		setWikiLinkMenuOpen(false)
		view.focus()
	}

	function handleSelectDoc(docId: string | null) {
		if (!docId) return
		let view = editor.current?.getEditor()
		let range = wikiLinkRangeRef.current
		if (!view || !range) return

		view.dispatch({
			changes: { from: range.from, to: range.to, insert: `[[${docId}]]` },
		})
		setWikiLinkDialogOpen(false)
		setInputValue("")
		setWikilinkPrefill("")
		view.focus()
	}

	async function handleCreateAndLink() {
		if (!inputValue.trim() || !onCreateDoc) return
		let view = editor.current?.getEditor()
		let range = wikiLinkRangeRef.current
		if (!view || !range) return

		let newDocId = await onCreateDoc(inputValue.trim())
		view.dispatch({
			changes: { from: range.from, to: range.to, insert: `[[${newDocId}]]` },
		})
		setWikiLinkDialogOpen(false)
		setInputValue("")
		setWikilinkPrefill("")
		view.focus()
	}

	// For incomplete/empty wikilinks, show dialog directly instead of dropdown
	if (!isValidLink) {
		return (
			<>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								size="icon"
								variant="brand"
								className="shadow-md"
								nativeButton={false}
								onClick={() => {
									wikiLinkRangeRef.current =
										editor.current?.getEditor()?.state.selection.main.head !==
										undefined
											? ((): Range | null => {
													let view = editor.current?.getEditor()
													if (!view) return null
													let pos = view.state.selection.main.head
													let line = view.state.doc.lineAt(pos)
													let textBefore = line.text.slice(0, pos - line.from)
													let textAfter = line.text.slice(pos - line.from)
													let match = textBefore.match(/\[\[([^\][]*)$/)
													if (!match) return null
													let from = line.from + textBefore.lastIndexOf("[[")
													let closingMatch = textAfter.match(/^([^\][]*)]]/)
													let to = closingMatch
														? pos + closingMatch[0].length
														: pos +
															(textAfter.match(/^[^\][]*/) ?? [""])[0].length
													return { from, to }
												})()
											: null
									setInputValue(prefillText)
									setWikiLinkDialogOpen(true)
								}}
							>
								<FileSymlinkIcon />
							</Button>
						}
					/>
					<TooltipContent side="top" className="flex items-center gap-2">
						Select document
						<Kbd>Ctrl Space</Kbd>
					</TooltipContent>
				</Tooltip>

				<WikiLinkDialog
					open={wikiLinkDialogOpen}
					onOpenChange={setWikiLinkDialogOpen}
					title="Link to document"
					filteredDocs={filteredDocs}
					showCreateOption={showCreateOption}
					inputValue={inputValue}
					onInputValueChange={setInputValue}
					onSelectDoc={handleSelectDoc}
					onCreateAndLink={handleCreateAndLink}
				/>
			</>
		)
	}

	return (
		<>
			<DropdownMenu open={wikiLinkMenuOpen} onOpenChange={setWikiLinkMenuOpen}>
				<Tooltip>
					<DropdownMenuTrigger
						render={
							<TooltipTrigger
								render={
									<Button
										size="icon"
										variant="brand"
										className="shadow-md"
										nativeButton={false}
									>
										<FileSymlinkIcon />
									</Button>
								}
							/>
						}
					/>
					<TooltipContent side="top" className="flex items-center gap-2">
						Wiki link
						<Kbd>Ctrl Space</Kbd>
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" side="top">
					<DropdownMenuItem onClick={openLinkedDoc}>
						<ExternalLink className="mr-2 size-4" />
						Open linked doc
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleChangeLink}>
						<Link2 className="mr-2 size-4" />
						Change linked doc
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={handleRemoveLink}
						className="text-destructive"
					>
						<Trash2 className="mr-2 size-4" />
						Remove link
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<WikiLinkDialog
				open={wikiLinkDialogOpen}
				onOpenChange={setWikiLinkDialogOpen}
				title="Change linked document"
				filteredDocs={filteredDocs}
				showCreateOption={showCreateOption}
				inputValue={inputValue}
				onInputValueChange={setInputValue}
				onSelectDoc={handleSelectDoc}
				onCreateAndLink={handleCreateAndLink}
			/>
		</>
	)
}

interface WikiLinkDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	filteredDocs: { id: string; title: string }[]
	showCreateOption: boolean
	inputValue: string
	onInputValueChange: (value: string) => void
	onSelectDoc: (docId: string | null) => void
	onCreateAndLink: () => void
}

function WikiLinkDialog({
	open,
	onOpenChange,
	title,
	filteredDocs,
	showCreateOption,
	inputValue,
	onInputValueChange,
	onSelectDoc,
	onCreateAndLink,
}: WikiLinkDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						Search for a document to link to
					</DialogDescription>
				</DialogHeader>

				<Combobox.Root
					value={null}
					inputValue={inputValue}
					onValueChange={onSelectDoc}
					onInputValueChange={onInputValueChange}
				>
					<div className="relative">
						<Combobox.Input
							placeholder="Search documents..."
							className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-none border px-3 py-1 text-sm focus-visible:ring-1 focus-visible:outline-none"
						/>
					</div>

					<Combobox.Portal>
						<Combobox.Positioner sideOffset={4} className="z-50">
							<Combobox.Popup className="bg-popover text-popover-foreground ring-foreground/10 max-h-60 w-(--anchor-width) overflow-auto rounded-none shadow-md ring-1">
								{filteredDocs.length === 0 && !showCreateOption && (
									<div className="text-muted-foreground px-3 py-2 text-sm">
										No documents found
									</div>
								)}

								{filteredDocs.map(doc => (
									<Combobox.Item
										key={doc.id}
										value={doc.id}
										className="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none"
									>
										<FileText className="text-muted-foreground size-4" />
										<span className="flex-1 truncate">{doc.title}</span>
									</Combobox.Item>
								))}

								{showCreateOption && (
									<button
										type="button"
										onClick={onCreateAndLink}
										className="hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none"
									>
										<Plus className="text-muted-foreground size-4" />
										<span>
											Create &ldquo;
											<span className="font-medium">{inputValue}</span>&rdquo;
										</span>
									</button>
								)}
							</Combobox.Popup>
						</Combobox.Positioner>
					</Combobox.Portal>
				</Combobox.Root>

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

interface ImageActionProps {
	editor: React.RefObject<MarkdownEditorRef | null>
	isImage: boolean
	imageRange: Range | null
	imageDialogOpen: boolean
	setImageDialogOpen: (open: boolean) => void
	imageRangeRef: React.RefObject<Range | null>
	assets: { id: string; name: string }[]
	onUploadAndInsert?: (file: File, replaceRange: Range) => Promise<void>
}

function ImageAction({
	editor,
	isImage,
	imageDialogOpen,
	setImageDialogOpen,
	imageRangeRef,
	assets,
	onUploadAndInsert,
}: ImageActionProps) {
	let fileInputRef = useRef<HTMLInputElement>(null)
	let [inputValue, setInputValue] = useState("")

	if (!isImage) return null

	let filteredAssets = assets.filter(asset =>
		asset.name.toLowerCase().includes(inputValue.toLowerCase()),
	)

	function handleSelectAsset(assetId: string | null) {
		if (!assetId) return
		let asset = assets.find(a => a.id === assetId)
		if (!asset) return

		let view = editor.current?.getEditor()
		let range = imageRangeRef.current
		if (!view || !range) return

		view.dispatch({
			changes: {
				from: range.from,
				to: range.to,
				insert: `![${asset.name}](asset:${assetId})`,
			},
		})
		setImageDialogOpen(false)
		setInputValue("")
		view.focus()
	}

	function handleUploadClick() {
		fileInputRef.current?.click()
	}

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		let file = e.target.files?.[0]
		let range = imageRangeRef.current
		if (!file || !range || !onUploadAndInsert) return

		e.target.value = ""
		setImageDialogOpen(false)
		setInputValue("")
		await onUploadAndInsert(file, range)
		editor.current?.focus()
	}

	return (
		<>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							size="icon"
							variant="brand"
							className="shadow-md"
							nativeButton={false}
							onClick={() => {
								if (editor.current?.getEditor()) {
									imageRangeRef.current =
										editor.current.getSelection() as Range | null
								}
								setImageDialogOpen(true)
							}}
						>
							<ImagePlus />
						</Button>
					}
				/>
				<TooltipContent side="top" className="flex items-center gap-2">
					Select image
					<Kbd>Ctrl Space</Kbd>
				</TooltipContent>
			</Tooltip>

			<Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Select image</DialogTitle>
						<DialogDescription>
							Search for an existing image or upload a new one
						</DialogDescription>
					</DialogHeader>

					<Combobox.Root
						value={null}
						inputValue={inputValue}
						onValueChange={handleSelectAsset}
						onInputValueChange={setInputValue}
					>
						<div className="relative">
							<Combobox.Input
								placeholder="Search images..."
								className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-none border px-3 py-1 text-sm focus-visible:ring-1 focus-visible:outline-none"
							/>
						</div>

						<Combobox.Portal>
							<Combobox.Positioner sideOffset={4} className="z-50">
								<Combobox.Popup className="bg-popover text-popover-foreground ring-foreground/10 max-h-60 w-(--anchor-width) overflow-auto rounded-none shadow-md ring-1">
									{filteredAssets.length === 0 && (
										<div className="text-muted-foreground px-3 py-2 text-sm">
											No images found
										</div>
									)}

									{filteredAssets.map(asset => (
										<Combobox.Item
											key={asset.id}
											value={asset.id}
											className="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none"
										>
											<ImageIcon className="text-muted-foreground size-4" />
											<span className="flex-1 truncate">{asset.name}</span>
										</Combobox.Item>
									))}
								</Combobox.Popup>
							</Combobox.Positioner>
						</Combobox.Portal>
					</Combobox.Root>

					<div className="flex justify-between gap-2 pt-2">
						{onUploadAndInsert && (
							<Button
								variant="outline"
								size="sm"
								onClick={handleUploadClick}
								className="gap-2"
							>
								<Upload className="size-4" />
								Upload
							</Button>
						)}
						<div className="flex-1" />
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setImageDialogOpen(false)}
						>
							Cancel
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={handleFileChange}
			/>
		</>
	)
}

interface ActionButtonProps {
	icon: React.ReactNode
	label: string
	shortcut?: string
	onClick: () => void
}

function ActionButton({ icon, label, shortcut, onClick }: ActionButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						size="icon"
						variant="brand"
						onClick={onClick}
						className="shadow-md"
						nativeButton={false}
					>
						{icon}
					</Button>
				}
			/>
			<TooltipContent side="top" className="flex items-center gap-2">
				{label}
				{shortcut && (
					<Kbd>
						{isMac ? (
							<>
								⌥
								<Command className="size-3" />
							</>
						) : (
							"Ctrl+Alt+"
						)}
						{shortcut}
					</Kbd>
				)}
			</TooltipContent>
		</Tooltip>
	)
}
