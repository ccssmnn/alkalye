import { useState, useRef, useEffect } from "react"
import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { useNavigate, useLocation, Link } from "@tanstack/react-router"
import { co } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { Image as JazzImage, useAccount, useCoState } from "jazz-tools/react"
import { Asset, Document, UserAccount } from "@/schema"
import {
	parseFrontmatter,
	getFrontmatterRange,
	togglePinned,
} from "@/editor/frontmatter"
import { getDocumentTitle } from "@/lib/document-utils"
import { unfoldEffect } from "@codemirror/language"
import { getPresentationMode } from "@/lib/presentation"
import type { MarkdownEditorRef } from "@/editor/editor"
import { Button } from "@/components/ui/button"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
	useSidebar,
} from "@/components/ui/sidebar"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"

import {
	Image as ImageIcon,
	Pencil,
	Trash2,
	Plus,
	Globe,
	Lock,
	Settings,
	Undo2,
	Type,
	FileText,
	Users,
	HelpCircle,
	Eye,
	Presentation,
	ScrollText,
} from "lucide-react"
import { useTheme, ThemeToggle } from "@/lib/theme"
import { usePWA } from "@/lib/pwa"
import { ShareDialog } from "@/components/share-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { HelpMenu } from "@/components/help-menu"
import {
	getDocumentGroup,
	leaveDocument,
	getCollaborators,
	isDocumentPublic,
	type Collaborator,
} from "@/lib/sharing"
import { exportDocument, saveDocumentAs, type ExportAsset } from "@/lib/export"
import { MoveToFolderDialog } from "@/components/move-to-folder-dialog"
import { WikiLinkDialog } from "@/components/floating-actions"
import { getPath } from "@/editor/frontmatter"
import { isMac, modKey, altModKey } from "@/lib/platform"

export { DocumentSidebar }

interface DocumentSidebarProps {
	doc: co.loaded<typeof Document, { assets: { $each: { image: true } } }>
	docId: string
	onInsertAsset: (assetId: string, name: string) => void
	readOnly?: boolean
	editor?: React.RefObject<MarkdownEditorRef | null>
	focusMode: boolean
	onFocusModeToggle: () => void
}

function DocumentSidebar({
	doc,
	docId,
	onInsertAsset,
	readOnly,
	editor,
	focusMode,
	onFocusModeToggle,
}: DocumentSidebarProps) {
	let navigate = useNavigate()
	let location = useLocation()
	let { theme, setTheme } = useTheme()
	let { isMobile, setRightOpenMobile } = useSidebar()
	let [renameAssetOpen, setRenameAssetOpen] = useState(false)
	let [renamingAsset, setRenamingAsset] = useState<co.loaded<
		typeof Asset
	> | null>(null)

	let [shareOpen, setShareOpen] = useState(false)
	let [deleteOpen, setDeleteOpen] = useState(false)
	let [leaveOpen, setLeaveOpen] = useState(false)
	let [moveOpen, setMoveOpen] = useState(false)
	let [assetDeleteOpen, setAssetDeleteOpen] = useState(false)
	let [deletingAsset, setDeletingAsset] = useState<co.loaded<
		typeof Asset
	> | null>(null)

	let [collaborators, setCollaborators] = useState<Collaborator[]>([])
	let fileInputRef = useRef<HTMLInputElement>(null)
	let me = useAccount(UserAccount, { resolve: { root: { documents: true } } })

	let docWithContent = useCoState(
		Document,
		docId as Parameters<typeof useCoState>[1],
		{
			resolve: { content: true },
		},
	)

	let docGroup = docWithContent?.$isLoaded
		? getDocumentGroup(docWithContent)
		: null
	let isAdmin = docGroup?.myRole() === "admin"
	let docIsPublic = docWithContent?.$isLoaded
		? isDocumentPublic(docWithContent)
		: false
	let isPinned = docWithContent?.$isLoaded
		? parseFrontmatter(docWithContent.content?.toString() ?? "").frontmatter
				?.pinned === true
		: false

	let existingFolders = getExistingFoldersFromAccount(me)

	useEffect(() => {
		async function loadCollaborators() {
			if (!docWithContent?.$isLoaded) return
			let result = await getCollaborators(docWithContent)
			setCollaborators(result.collaborators)
		}
		loadCollaborators()
	}, [docWithContent])

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault()
				handleSaveAs()
			}
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [docWithContent])

	async function handleUpload(files: FileList | null) {
		if (!files || files.length === 0) return

		for (let file of Array.from(files)) {
			if (!file.type.startsWith("image/")) continue

			let image = await createImage(file, {
				owner: doc.$jazz.owner,
				maxSize: 2048,
			})

			if (!doc.assets) {
				doc.$jazz.set("assets", co.list(Asset).create([], doc.$jazz.owner))
			}

			let asset = Asset.create(
				{
					type: "image",
					name: file.name.replace(/\.[^.]+$/, ""),
					image,
					createdAt: new Date(),
				},
				doc.$jazz.owner,
			)

			doc.assets!.$jazz.push(asset)
		}

		doc.$jazz.set("updatedAt", new Date())
	}

	function isAssetUsed(asset: co.loaded<typeof Asset>): boolean {
		if (!docWithContent?.$isLoaded || !docWithContent.content) return false
		let content = docWithContent.content.toString()
		let regex = new RegExp(`!\\[[^\\]]*\\]\\(asset:${asset.$jazz.id}\\)`)
		return regex.test(content)
	}

	function handleDeleteAsset(asset: co.loaded<typeof Asset>) {
		if (isAssetUsed(asset)) {
			setDeletingAsset(asset)
			setAssetDeleteOpen(true)
		} else {
			performDeleteAsset(asset)
		}
	}

	function performDeleteAsset(asset: co.loaded<typeof Asset>) {
		if (!doc.assets) return

		if (docWithContent?.$isLoaded && docWithContent.content) {
			let content = docWithContent.content.toString()
			let regex = new RegExp(`!\\[[^\\]]*\\]\\(asset:${asset.$jazz.id}\\)`, "g")
			let newContent = content.replace(regex, "")
			if (newContent !== content) {
				docWithContent.content.$jazz.applyDiff(newContent)
			}
		}

		let idx = doc.assets.findIndex(a => a?.$jazz.id === asset.$jazz.id)
		if (idx !== -1) {
			doc.assets.$jazz.splice(idx, 1)
			doc.$jazz.set("updatedAt", new Date())
		}
	}

	function handleRenameAsset(asset: co.loaded<typeof Asset>) {
		setRenamingAsset(asset)
		setRenameAssetOpen(true)
	}

	function handleSaveAssetRename(newName: string) {
		if (renamingAsset) {
			renamingAsset.$jazz.set("name", newName)
			doc.$jazz.set("updatedAt", new Date())
		}
		setRenameAssetOpen(false)
		setRenamingAsset(null)
	}

	function handleInsert(asset: co.loaded<typeof Asset>) {
		onInsertAsset(asset.$jazz.id, asset.name)
	}

	function handleDeleteDoc() {
		if (!doc?.$isLoaded) return
		doc.$jazz.set("deletedAt", new Date())
		navigate({ to: "/" })
	}

	async function handleLeave() {
		if (!docWithContent?.$isLoaded || !me.$isLoaded) return
		await leaveDocument(docWithContent, me)
		let idx = me.root?.documents?.findIndex(d => d?.$jazz.id === doc.$jazz.id)
		if (idx !== undefined && idx !== -1 && me.root?.documents?.$isLoaded) {
			me.root.documents.$jazz.splice(idx, 1)
		}
		navigate({ to: "/" })
	}

	async function handleDownload() {
		if (!docWithContent?.$isLoaded) return
		let docAssets: ExportAsset[] = []
		if (doc.assets?.$isLoaded) {
			for (let asset of [...doc.assets]) {
				if (!asset?.$isLoaded || !asset.image?.$isLoaded) continue
				let original = asset.image.original
				if (!original?.$isLoaded) continue
				let blob = original.toBlob()
				if (blob) {
					docAssets.push({
						id: asset.$jazz.id,
						name: asset.name,
						blob,
					})
				}
			}
		}
		let title = getDocumentTitle(docWithContent)
		await exportDocument(
			docWithContent.content?.toString() ?? "",
			title,
			docAssets.length > 0 ? docAssets : undefined,
		)
	}

	async function handleSaveAs() {
		if (!docWithContent?.$isLoaded) return
		let title = getDocumentTitle(docWithContent)
		await saveDocumentAs(docWithContent.content?.toString() ?? "", title)
	}

	function handleTogglePin() {
		if (!docWithContent?.$isLoaded || !docWithContent.content) return
		let content = docWithContent.content.toString()
		let newContent = togglePinned(content)
		docWithContent.content.$jazz.applyDiff(newContent)
		docWithContent.$jazz.set("updatedAt", new Date())
	}

	let assets = doc.assets?.filter(a => a?.$isLoaded) ?? []
	let myId = me.$isLoaded ? me.$jazz.id : null
	let otherCollaborators = collaborators.filter(c => c.id !== myId)
	let hasCollaborators = otherCollaborators.length > 0 || docIsPublic

	// Build docs list for wikilink dialog
	let wikiLinkDocs: { id: string; title: string }[] = []
	if (me.$isLoaded && me.root?.documents?.$isLoaded) {
		for (let d of [...me.root.documents]) {
			if (!d?.$isLoaded || d.deletedAt || d.$jazz.id === docId) continue
			let title = getDocumentTitle(d)
			wikiLinkDocs.push({ id: d.$jazz.id, title })
		}
	}

	async function handleCreateDocForWikilink(title: string): Promise<string> {
		if (!me.$isLoaded || !me.root?.documents?.$isLoaded) {
			throw new Error("Not ready")
		}
		let now = new Date()
		let newDoc = Document.create(
			{
				version: 1,
				content: co.plainText().create(`# ${title}\n\n`, doc.$jazz.owner),
				createdAt: now,
				updatedAt: now,
			},
			doc.$jazz.owner,
		)
		me.root.documents.$jazz.push(newDoc)
		return newDoc.$jazz.id
	}

	return (
		<>
			<Sidebar side="right" collapsible="offcanvas">
				<SidebarHeader
					className="border-border flex-row items-center justify-between border-b p-0 px-3"
					style={{ height: "calc(48px + 1px)" }}
				>
					<span className="text-sm font-medium">Document</span>
					<div className="flex items-center gap-1">
						<ThemeToggle theme={theme} setTheme={setTheme} />
						<SettingsButton pathname={location.pathname} />
					</div>
				</SidebarHeader>

				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu>
								<ViewActions
									docId={docId}
									isPresentation={
										docWithContent?.$isLoaded
											? getPresentationMode(
													docWithContent.content?.toString() ?? "",
												)
											: false
									}
									readOnly={readOnly}
								/>
								<SidebarSeparator />
								<FileMenu
									readOnly={readOnly}
									isAdmin={isAdmin}
									isMobile={isMobile}
									isPinned={isPinned}
									focusMode={focusMode}
									onFocusModeToggle={onFocusModeToggle}
									onShare={() => setShareOpen(true)}
									onDownload={handleDownload}
									onSaveAs={handleSaveAs}
									onRename={() => {
										if (isMobile) {
											setRightOpenMobile(false, () => handleRename(editor))
										} else {
											requestAnimationFrame(() => handleRename(editor))
										}
									}}
									onTurnIntoPresentation={() => {
										if (isMobile) {
											setRightOpenMobile(false, () =>
												handleTurnIntoPresentation(editor),
											)
										} else {
											requestAnimationFrame(() =>
												handleTurnIntoPresentation(editor),
											)
										}
									}}
									onTogglePin={handleTogglePin}
									onAddTag={() => {
										if (isMobile) {
											setRightOpenMobile(false, () => handleAddTag(editor))
										} else {
											requestAnimationFrame(() => handleAddTag(editor))
										}
									}}
									onMoveToFolder={() => setMoveOpen(true)}
									onDelete={() => setDeleteOpen(true)}
									onLeave={() => setLeaveOpen(true)}
								/>
								<EditMenu
									editor={editor}
									isMobile={isMobile}
									disabled={readOnly}
								/>
								<FormatMenu
									editor={editor}
									isMobile={isMobile}
									disabled={readOnly}
									docs={wikiLinkDocs}
									onCreateDoc={handleCreateDocForWikilink}
								/>
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>

					<SidebarSeparator />

					<SidebarGroup>
						<SidebarGroupLabel>Collaboration</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{!hasCollaborators && !docIsPublic && (
									<SidebarMenuItem>
										<SidebarMenuButton
											onClick={() => setShareOpen(true)}
											className="gap-2"
										>
											<Lock className="size-4" />
											<span>Private</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								)}

								{hasCollaborators && (
									<SidebarMenuItem>
										<SidebarMenuButton
											onClick={() => setShareOpen(true)}
											className="gap-2"
										>
											<Users className="size-4" />
											<span>Shared</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								)}

								{otherCollaborators.map(c => (
									<div
										key={c.id}
										className="text-muted-foreground flex items-center justify-between px-2 py-1 text-xs"
									>
										<span className="truncate">{c.name}</span>
										<span className="shrink-0 opacity-60">
											{c.role === "writer" ? "edit" : "view"}
										</span>
									</div>
								))}

								{docIsPublic && (
									<SidebarMenuItem>
										<SidebarMenuButton
											onClick={() => setShareOpen(true)}
											className="gap-2"
										>
											<Globe className="size-4 text-green-600 dark:text-green-400" />
											<span>Public</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								)}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>

					<SidebarSeparator />

					<SidebarGroup>
						<SidebarGroupLabel className="flex items-center justify-between pr-2">
							<span>Assets</span>
							<Tooltip>
								<TooltipTrigger
									render={
										<button
											onClick={() => fileInputRef.current?.click()}
											disabled={readOnly}
											className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent flex size-5 items-center justify-center rounded disabled:pointer-events-none disabled:opacity-50"
										>
											<Plus className="size-4" />
										</button>
									}
								/>
								<TooltipContent>Add asset</TooltipContent>
							</Tooltip>
						</SidebarGroupLabel>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							multiple
							className="hidden"
							onChange={e => handleUpload(e.target.files)}
						/>
						<SidebarGroupContent>
							{assets.length === 0 ? (
								<div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-8 text-xs">
									<ImageIcon className="size-6 opacity-50" />
									<p>No assets yet</p>
								</div>
							) : (
								<SidebarMenu>
									{assets.map(asset => {
										if (!asset?.$isLoaded) return null

										return (
											<SidebarMenuItem key={asset.$jazz.id}>
												<DropdownMenu>
													<DropdownMenuTrigger
														disabled={readOnly}
														render={
															<SidebarMenuButton disabled={readOnly}>
																<div className="bg-muted size-8 shrink-0 overflow-hidden rounded">
																	{asset.image ? (
																		<JazzImage
																			imageId={asset.image.$jazz.id}
																			className="size-full object-cover"
																		/>
																	) : (
																		<div className="flex size-full items-center justify-center">
																			<ImageIcon className="text-muted-foreground size-4" />
																		</div>
																	)}
																</div>
																<span className="truncate">{asset.name}</span>
															</SidebarMenuButton>
														}
													/>
													<DropdownMenuContent
														side={isMobile ? "bottom" : "left"}
														align={isMobile ? "center" : "start"}
													>
														<DropdownMenuItem
															onClick={() => handleInsert(asset)}
														>
															<Plus className="size-4" />
															Insert
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => handleRenameAsset(asset)}
														>
															<Pencil className="size-4" />
															Rename
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => handleDeleteAsset(asset)}
															className="text-destructive focus:text-destructive"
														>
															<Trash2 className="size-4" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</SidebarMenuItem>
										)
									})}
								</SidebarMenu>
							)}
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>

				<SidebarFooter className="border-border border-t">
					<HelpMenu
						trigger={
							<Button
								variant="ghost"
								size="sm"
								className="w-full"
								nativeButton={false}
							>
								<HelpCircle />
								<span>Help</span>
							</Button>
						}
						align={isMobile ? "center" : "end"}
						side={isMobile ? "top" : "left"}
					/>
				</SidebarFooter>
			</Sidebar>

			{docWithContent?.$isLoaded && (
				<>
					<ShareDialog
						doc={
							docWithContent as co.loaded<typeof Document, { content: true }>
						}
						open={shareOpen}
						onOpenChange={setShareOpen}
					/>
					<MoveToFolderDialog
						doc={
							docWithContent as co.loaded<typeof Document, { content: true }>
						}
						existingFolders={existingFolders}
						open={moveOpen}
						onOpenChange={setMoveOpen}
					/>
				</>
			)}
			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title="Delete document?"
				description="This will move the document to trash. You can restore it later."
				confirmLabel="Delete"
				variant="destructive"
				onConfirm={handleDeleteDoc}
			/>
			<ConfirmDialog
				open={leaveOpen}
				onOpenChange={setLeaveOpen}
				title="Leave document?"
				description="You will lose access to this shared document."
				confirmLabel="Leave"
				variant="destructive"
				onConfirm={handleLeave}
			/>
			<ConfirmDialog
				open={assetDeleteOpen}
				onOpenChange={setAssetDeleteOpen}
				title="Delete asset?"
				description="This image is used in the document. Deleting it will remove it from the content."
				confirmLabel="Delete"
				variant="destructive"
				onConfirm={() => {
					if (deletingAsset) {
						performDeleteAsset(deletingAsset)
						setDeletingAsset(null)
					}
				}}
			/>
			<RenameAssetDialog
				open={renameAssetOpen}
				onOpenChange={open => {
					setRenameAssetOpen(open)
					if (!open) setRenamingAsset(null)
				}}
				currentName={renamingAsset?.name ?? ""}
				onRename={handleSaveAssetRename}
			/>
		</>
	)
}

interface FileMenuProps {
	readOnly?: boolean
	isAdmin: boolean
	isMobile: boolean
	isPinned: boolean
	focusMode: boolean
	onFocusModeToggle: () => void
	onShare: () => void
	onDownload: () => void
	onSaveAs: () => void
	onRename: () => void
	onTurnIntoPresentation: () => void
	onTogglePin: () => void
	onAddTag: () => void
	onMoveToFolder: () => void
	onDelete: () => void
	onLeave: () => void
}

function FileMenu({
	readOnly,
	isAdmin,
	isMobile,
	isPinned,
	focusMode,
	onFocusModeToggle,
	onShare,
	onDownload,
	onSaveAs,
	onRename,
	onTurnIntoPresentation,
	onTogglePin,
	onAddTag,
	onMoveToFolder,
	onDelete,
	onLeave,
}: FileMenuProps): React.ReactNode {
	return (
		<SidebarMenuItem>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<SidebarMenuButton>
							<FileText className="size-4" />
							<span>File</span>
						</SidebarMenuButton>
					}
				/>
				<DropdownMenuContent
					align={isMobile ? "center" : "start"}
					side={isMobile ? "bottom" : "left"}
				>
					<DropdownMenuItem onClick={onFocusModeToggle}>
						{focusMode ? "Exit Focus Mode" : "Focus Mode"}
						<DropdownMenuShortcut>{modKey}⇧F</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={onShare} disabled={readOnly}>
						Share
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onRename} disabled={readOnly}>
						Rename
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onTogglePin} disabled={readOnly}>
						{isPinned ? "Unpin" : "Pin"}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onAddTag} disabled={readOnly}>
						Add Tag
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onMoveToFolder} disabled={readOnly}>
						Move to Folder
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={onTurnIntoPresentation}
						disabled={readOnly}
					>
						Turn into Presentation
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onDownload}>Download</DropdownMenuItem>
					<DropdownMenuItem onClick={onSaveAs}>
						Save as...
						<DropdownMenuShortcut>{modKey}S</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{isAdmin ? (
						<DropdownMenuItem
							onClick={onDelete}
							className="text-destructive focus:text-destructive"
						>
							Delete
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							onClick={onLeave}
							className="text-destructive focus:text-destructive"
						>
							Leave
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	)
}

interface EditMenuProps {
	editor?: React.RefObject<MarkdownEditorRef | null>
	isMobile: boolean
	disabled?: boolean
}

function EditMenu({ editor, isMobile, disabled }: EditMenuProps) {
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

interface FormatMenuProps {
	editor?: React.RefObject<MarkdownEditorRef | null>
	isMobile: boolean
	disabled?: boolean
	docs: { id: string; title: string }[]
	onCreateDoc?: (title: string) => Promise<string>
}

function FormatMenu({
	editor,
	isMobile,
	disabled,
	docs,
	onCreateDoc,
}: FormatMenuProps) {
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
						<SidebarMenuButton disabled={disabled}>
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
						<DropdownMenuSubTrigger>Headings</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{([1, 2, 3, 4, 5, 6] as const).map(level => (
								<DropdownMenuItem
									key={level}
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
						<DropdownMenuSubTrigger>Lists</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								onClick={() =>
									runAction(() => editor?.current?.toggleBulletList())
								}
							>
								Unordered
								<DropdownMenuShortcut>{altModKey}L</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									runAction(() => editor?.current?.toggleOrderedList())
								}
							>
								Ordered
								<DropdownMenuShortcut>{altModKey}O</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() =>
									runAction(() => editor?.current?.toggleTaskList())
								}
							>
								Task List
								<DropdownMenuShortcut>{altModKey}⇧L</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
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
						onClick={() => runAction(() => editor?.current?.toggleBlockquote())}
					>
						Blockquote
						<DropdownMenuShortcut>{altModKey}Q</DropdownMenuShortcut>
					</DropdownMenuItem>

					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.setBody())}
					>
						Body
						<DropdownMenuShortcut>{altModKey}0</DropdownMenuShortcut>
					</DropdownMenuItem>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger>Structure</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuItem
								onClick={() => runAction(() => editor?.current?.indent())}
							>
								Indent
								<DropdownMenuShortcut>Tab</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => runAction(() => editor?.current?.outdent())}
							>
								Outdent
								<DropdownMenuShortcut>⇧Tab</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => runAction(() => editor?.current?.moveLineUp())}
							>
								Move Line Up
								<DropdownMenuShortcut>{altModKey}↑</DropdownMenuShortcut>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => runAction(() => editor?.current?.moveLineDown())}
							>
								Move Line Down
								<DropdownMenuShortcut>{altModKey}↓</DropdownMenuShortcut>
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSeparator />

					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.toggleBold())}
					>
						Bold
						<DropdownMenuShortcut>{modKey}B</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.toggleItalic())}
					>
						Italic
						<DropdownMenuShortcut>{modKey}I</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() =>
							runAction(() => editor?.current?.toggleStrikethrough())
						}
					>
						Strikethrough
						<DropdownMenuShortcut>{modKey}⇧X</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />

					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.toggleInlineCode())}
					>
						Code
						<DropdownMenuShortcut>{modKey}E</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.insertCodeBlock())}
					>
						Code Block
						<DropdownMenuShortcut>{altModKey}C</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.insertLink())}
					>
						Add Link
						<DropdownMenuShortcut>{modKey}K</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => runAction(() => editor?.current?.insertImage())}
					>
						Add Image
						<DropdownMenuShortcut>{altModKey}K</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem
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
				filteredDocs={docs.filter(d =>
					d.title.toLowerCase().includes(inputValue.toLowerCase()),
				)}
				showCreateOption={
					!!inputValue.trim() &&
					!docs.some(d => d.title.toLowerCase() === inputValue.toLowerCase())
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
					if (!inputValue.trim() || !onCreateDoc) return
					let view = editor?.current?.getEditor()
					let range = insertRangeRef.current
					if (!view || !range) return

					let newDocId = await onCreateDoc(inputValue.trim())
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

interface ViewActionsProps {
	docId: string
	isPresentation: boolean
	readOnly?: boolean
}

function ViewActions({ docId, isPresentation, readOnly }: ViewActionsProps) {
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

function SettingsButton({ pathname }: { pathname: string }) {
	let { needRefresh } = usePWA()

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						nativeButton={false}
						render={<Link to="/settings" search={{ from: pathname }} />}
						className="relative"
					>
						<Settings />
						{needRefresh && (
							<span className="bg-destructive absolute top-1 right-1 size-2 rounded-full" />
						)}
					</Button>
				}
			/>
			<TooltipContent>
				{needRefresh ? "Settings (Update available)" : "Settings"}
			</TooltipContent>
		</Tooltip>
	)
}

function getInferredTitle(body: string): string {
	let line = body.split("\n").find(l => l.trim()) ?? ""
	return (
		line
			.replace(/^#{1,6}\s+/, "")
			.replace(/\*\*([^*]+)\*\*/g, "$1")
			.replace(/\*([^*]+)\*/g, "$1")
			.replace(/__([^_]+)__/g, "$1")
			.replace(/_([^_]+)_/g, "$1")
			.replace(/`([^`]+)`/g, "$1")
			.trim()
			.slice(0, 80) || "Untitled"
	)
}

function handleRename(
	editorRef: React.RefObject<MarkdownEditorRef | null> | undefined,
) {
	let view = editorRef?.current?.getEditor()
	if (!view) return

	let content = view.state.doc.toString()
	let { frontmatter, body } = parseFrontmatter(content)

	// If no frontmatter, create one with inferred title
	if (!frontmatter) {
		let inferredTitle = getInferredTitle(content)
		let newFrontmatter = `---\ntitle: ${inferredTitle}\n---\n\n`
		view.dispatch({
			changes: { from: 0, to: 0, insert: newFrontmatter },
		})
		// Focus on title value (after "title: ")
		let titleStart = 4 + 7 // "---\n" + "title: "
		let titleEnd = titleStart + inferredTitle.length
		view.dispatch({ selection: { anchor: titleStart, head: titleEnd } })
		view.focus()
		return
	}

	// If frontmatter exists but no title, add one
	if (!frontmatter.title) {
		let inferredTitle = getInferredTitle(body)
		// Find where to insert title (after first ---)
		let insertPos = 4 // after "---\n"
		let titleLine = `title: ${inferredTitle}\n`
		view.dispatch({
			changes: { from: insertPos, to: insertPos, insert: titleLine },
		})
		// Unfold frontmatter if folded
		let range = getFrontmatterRange(view.state)
		if (range) {
			view.dispatch({
				effects: unfoldEffect.of({ from: range.from, to: range.to }),
			})
		}
		// Focus on title value
		let titleStart = insertPos + 7 // "title: "
		let titleEnd = titleStart + inferredTitle.length
		view.dispatch({ selection: { anchor: titleStart, head: titleEnd } })
		view.focus()
		return
	}

	// Frontmatter exists with title - unfold and focus title
	let range = getFrontmatterRange(view.state)
	if (range) {
		view.dispatch({
			effects: unfoldEffect.of({ from: range.from, to: range.to }),
		})
	}
	// Find title position in content
	let titleMatch = content.match(/^---\r?\n[\s\S]*?^title:\s*(.*)$/m)
	if (titleMatch) {
		let titleValueStart = content.indexOf(
			titleMatch[1],
			content.indexOf("title:"),
		)
		let titleValueEnd = titleValueStart + titleMatch[1].length
		view.dispatch({
			selection: { anchor: titleValueStart, head: titleValueEnd },
		})
	}
	view.focus()
}

function handleTurnIntoPresentation(
	editorRef: React.RefObject<MarkdownEditorRef | null> | undefined,
) {
	let view = editorRef?.current?.getEditor()
	if (!view) return

	let content = view.state.doc.toString()
	let { frontmatter } = parseFrontmatter(content)

	// If no frontmatter, create one with mode: present
	if (!frontmatter) {
		let newFrontmatter = `---\nmode: present\n---\n\n`
		view.dispatch({
			changes: { from: 0, to: 0, insert: newFrontmatter },
		})
		view.focus()
		return
	}

	// Frontmatter exists - add mode: present after opening ---
	let insertPos = 4 // after "---\n"
	let modeLine = `mode: present\n`
	view.dispatch({
		changes: { from: insertPos, to: insertPos, insert: modeLine },
	})
	view.focus()
}

function handleAddTag(
	editorRef: React.RefObject<MarkdownEditorRef | null> | undefined,
) {
	let view = editorRef?.current?.getEditor()
	if (!view) return

	let content = view.state.doc.toString()
	let { frontmatter } = parseFrontmatter(content)

	let tag = "your_tag"

	// If no frontmatter, create one with tags
	if (!frontmatter) {
		let newFrontmatter = `---\ntags: ${tag}\n---\n\n`
		view.dispatch({
			changes: { from: 0, to: 0, insert: newFrontmatter },
		})
		let tagStart = 4 + 6 // "---\n" + "tags: "
		let tagEnd = tagStart + tag.length
		view.dispatch({ selection: { anchor: tagStart, head: tagEnd } })
		view.focus()
		return
	}

	// If frontmatter exists but no tags, add tags line
	if (!frontmatter.tags) {
		let insertPos = 4 // after "---\n"
		let tagsLine = `tags: ${tag}\n`
		view.dispatch({
			changes: { from: insertPos, to: insertPos, insert: tagsLine },
		})
		// Unfold frontmatter if folded
		let range = getFrontmatterRange(view.state)
		if (range) {
			view.dispatch({
				effects: unfoldEffect.of({ from: range.from, to: range.to }),
			})
		}
		let tagStart = insertPos + 6 // "tags: "
		let tagEnd = tagStart + tag.length
		view.dispatch({ selection: { anchor: tagStart, head: tagEnd } })
		view.focus()
		return
	}

	// Tags line exists - append new tag
	let tagsMatch = content.match(/^(tags:\s*)(.*)$/m)
	if (tagsMatch) {
		let lineStart = content.indexOf(tagsMatch[0])
		let existingTags = tagsMatch[2]
		let insertPos = lineStart + tagsMatch[1].length + existingTags.length
		let insertText = existingTags ? `, ${tag}` : tag
		view.dispatch({
			changes: { from: insertPos, to: insertPos, insert: insertText },
		})
		// Unfold frontmatter if folded
		let range = getFrontmatterRange(view.state)
		if (range) {
			view.dispatch({
				effects: unfoldEffect.of({ from: range.from, to: range.to }),
			})
		}
		let tagStart = insertPos + (existingTags ? 2 : 0) // ", " prefix if existing
		let tagEnd = tagStart + tag.length
		view.dispatch({ selection: { anchor: tagStart, head: tagEnd } })
		view.focus()
	}
}

let assetNameSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name too long"),
})

interface RenameAssetDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	currentName: string
	onRename: (name: string) => void
}

function RenameAssetDialog({
	open,
	onOpenChange,
	currentName,
	onRename,
}: RenameAssetDialogProps) {
	let form = useForm({
		defaultValues: { name: currentName },
		validators: { onSubmit: assetNameSchema },
		onSubmit: ({ value }) => {
			onRename(value.name.trim())
			onOpenChange(false)
		},
	})

	function handleOpenChangeComplete(isOpen: boolean) {
		if (isOpen) {
			form.reset({ name: currentName })
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={handleOpenChangeComplete}
		>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Rename asset</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={e => {
						e.preventDefault()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<form.Field
						name="name"
						children={field => {
							let isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Name</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
										placeholder="Asset name"
										autoFocus
									/>
									{isInvalid && (
										<FieldError>
											{field.state.meta.errors.join(", ")}
										</FieldError>
									)}
								</Field>
							)
						}}
					/>
					<DialogFooter>
						<Button type="submit">Save</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

function getExistingFoldersFromAccount(
	me: ReturnType<
		typeof useAccount<typeof UserAccount, { root: { documents: true } }>
	>,
): string[] {
	if (!me.$isLoaded || !me.root?.documents?.$isLoaded) return []

	let folders = new Set<string>()
	let docs = [...me.root.documents]
	for (let doc of docs) {
		if (!doc?.$isLoaded || !doc.content?.$isLoaded) continue
		let path = getPath(doc.content.toString())
		if (path) {
			folders.add(path)
			let parts = path.split("/")
			for (let i = 1; i < parts.length; i++) {
				folders.add(parts.slice(0, i).join("/"))
			}
		}
	}

	return [...folders].sort()
}
