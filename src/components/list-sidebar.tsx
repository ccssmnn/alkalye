import { useState, useRef, useDeferredValue, useEffect } from "react"
import {
	Link,
	useLocation,
	useNavigate,
	useParams,
} from "@tanstack/react-router"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Group, co, type ResolveQuery } from "jazz-tools"
import { useAccount, useIsAuthenticated } from "jazz-tools/react"
import { createImage } from "jazz-tools/media"
import { UserAccount, Document, Asset } from "@/schema"
import { togglePinned, getTags, getPath } from "@/editor/frontmatter"
import {
	getDocumentTitle,
	isDocumentPinned,
	formatRelativeDate,
	countContentMatches,
	getDaysUntilPermanentDelete,
} from "@/lib/document-utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Plus,
	FileText,
	Search,
	Users,
	Globe,
	Presentation,
	Eye,
	Download,
	Trash2,
	LogOut,
	ScrollText,
	Copy,
	HelpCircle,
	MoreHorizontal,
	Upload,
	Cloud,
	CloudOff,
	RotateCcw,
	SlidersHorizontal,
	Pin,
	Folder,
	List,
	FolderInput,
} from "lucide-react"
import { TextHighlight, parseSearchTerms } from "@/components/ui/text-highlight"
import { Spinner } from "@/components/ui/spinner"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import {
	getSharingStatus,
	isDocumentPublic,
	getDocumentGroup,
	leaveDocument,
} from "@/lib/sharing"
import { useFolderStore, FolderRow } from "@/components/folder"
import { getPresentationMode } from "@/lib/presentation"
import {
	exportDocument,
	exportDocumentsAsZip,
	importMarkdownFiles,
	importFolderFiles,
	readFolderEntries,
	type ExportAsset,
	type ImportedFile,
} from "@/lib/file-io"
import { ShareDialog } from "@/components/share-dialog"
import { MoveToFolderDialog } from "@/components/move-to-folder-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { HelpMenu } from "@/components/help-menu"
import { usePWA } from "@/lib/pwa"

export { ListSidebar }

type LoadedDocument = co.loaded<typeof Document, { content: true }>
type SortMode = "latest" | "alphabetical"
type TypeFilter = "all" | "document" | "presentation" | "deleted"

function ListSidebar() {
	let navigate = useNavigate()
	let { id: currentDocId } = useParams({ strict: false })
	let [search, setSearch] = useState("")
	let deferredSearch = useDeferredValue(search)
	let [sort, setSort] = useState<SortMode>("latest")
	let [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
	let deferredSort = useDeferredValue(sort)
	let deferredType = useDeferredValue(typeFilter)
	let { isMobile, setLeftOpenMobile } = useSidebar()

	let me = useAccount(UserAccount, { resolve: documentsQuery })
	let isLoading =
		!me.$isLoaded || me.root?.documents?.$jazz.loadingState === "loading"
	let docs = me.$isLoaded ? me.root?.documents : null
	let allLoadedDocs = (docs?.$isLoaded ? [...docs] : []).filter(
		d => d?.$isLoaded === true && !d.permanentlyDeletedAt,
	)

	let activeDocs = allLoadedDocs.filter(d => !d.deletedAt)
	let deletedDocs = allLoadedDocs.filter(d => d.deletedAt)

	let typeFilteredDocs =
		deferredType === "deleted"
			? deletedDocs
			: deferredType === "document"
				? activeDocs.filter(
						d => !getPresentationMode(d.content?.toString() ?? ""),
					)
				: deferredType === "presentation"
					? activeDocs.filter(d =>
							getPresentationMode(d.content?.toString() ?? ""),
						)
					: activeDocs

	let sortedDocs =
		deferredType === "deleted"
			? [...typeFilteredDocs].sort(
					(a, b) =>
						new Date(b.deletedAt!).getTime() - new Date(a.deletedAt!).getTime(),
				)
			: deferredSort === "alphabetical"
				? [...typeFilteredDocs].sort((a, b) => {
						let aPinned = isDocumentPinned(a)
						let bPinned = isDocumentPinned(b)
						if (aPinned !== bPinned) return bPinned ? 1 : -1
						return getDocumentTitle(a)
							.toLowerCase()
							.localeCompare(getDocumentTitle(b).toLowerCase())
					})
				: [...typeFilteredDocs].sort((a, b) => {
						let aPinned = isDocumentPinned(a)
						let bPinned = isDocumentPinned(b)
						if (aPinned !== bPinned) return bPinned ? 1 : -1
						return (
							new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
						)
					})

	let filteredDocs = deferredSearch.trim()
		? sortedDocs.filter(d => {
				let terms = parseSearchTerms(deferredSearch).map(t => t.toLowerCase())
				if (terms.length === 0) return true
				let title = getDocumentTitle(d).toLowerCase()
				let content = (d.content?.toString() ?? "").toLowerCase()
				return terms.every(q => title.includes(q) || content.includes(q))
			})
		: sortedDocs

	let isFiltered =
		Boolean(deferredSearch.trim()) || sort !== "latest" || typeFilter !== "all"
	let hasNonDefaultFilters = sort !== "latest" || typeFilter !== "all"

	function handleDocClick() {
		if (isMobile) setLeftOpenMobile(false)
	}

	return (
		<Sidebar side="left" collapsible="offcanvas">
			<DropZone onImport={files => handleImportFiles(files, me)}>
				<SidebarHeader
					className="border-border flex-row items-center justify-between border-b p-2"
					style={{ height: "calc(48px + 1px)" }}
				>
					<span className="text-foreground px-2 text-sm font-semibold">
						Alkalye
					</span>
					<div className="flex items-center gap-1">
						<ImportExportMenu
							activeDocs={activeDocs}
							filteredDocs={filteredDocs}
							isFiltered={isFiltered}
							typeFilter={typeFilter}
							onImport={files => handleImportFiles(files, me)}
						/>
						<Button
							size="sm"
							render={
								<Link
									to="/new"
									onClick={() => isMobile && setLeftOpenMobile(false)}
								/>
							}
						>
							<Plus />
							New
						</Button>
					</div>
				</SidebarHeader>

				<SearchFilterBar
					search={search}
					onSearchChange={setSearch}
					sort={sort}
					onSortChange={setSort}
					typeFilter={typeFilter}
					onTypeChange={setTypeFilter}
					deletedCount={deletedDocs.length}
					hasNonDefaultFilters={hasNonDefaultFilters}
				/>

				<SidebarContent>
					<SidebarGroup className="flex-1">
						<SidebarGroupContent className="flex min-h-0 flex-1 flex-col">
							<DocumentList
								docs={filteredDocs}
								currentDocId={currentDocId}
								searchQuery={deferredSearch}
								typeFilter={deferredType}
								isLoading={isLoading}
								onDocClick={handleDocClick}
								onDuplicate={doc =>
									handleDuplicateDocument(
										doc,
										me,
										isMobile,
										setLeftOpenMobile,
										navigate,
									)
								}
								onDelete={doc => {
									doc.$jazz.set("deletedAt", new Date())
									if (doc.$jazz.id === currentDocId) {
										navigate({ to: "/" })
									}
								}}
							/>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>

				<SidebarFooter className="border-border flex flex-row gap-2 border-t">
					<SyncStatus />
					<HelpDropdown />
				</SidebarFooter>
			</DropZone>
		</Sidebar>
	)
}

function DropZone({
	onImport,
	children,
}: {
	onImport: (files: ImportedFile[]) => Promise<void>
	children: React.ReactNode
}) {
	let [isDragging, setIsDragging] = useState(false)

	async function handleDrop(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(false)

		let dataTransfer = e.dataTransfer
		let hasDirectories = Array.from(dataTransfer.items).some(
			item => item.webkitGetAsEntry?.()?.isDirectory,
		)

		let imported: ImportedFile[]
		if (hasDirectories) {
			let filesWithPaths = await readFolderEntries(dataTransfer)
			imported = await importFolderFiles(filesWithPaths)
		} else if (dataTransfer.files.length > 0) {
			imported = await importMarkdownFiles(dataTransfer.files)
		} else {
			return
		}

		await onImport(imported)
	}

	return (
		<div
			className="relative flex h-full flex-col"
			onDragOver={e => {
				e.preventDefault()
				setIsDragging(true)
			}}
			onDragLeave={e => {
				e.preventDefault()
				if (!e.currentTarget.contains(e.relatedTarget as Node))
					setIsDragging(false)
			}}
			onDrop={handleDrop}
		>
			{isDragging && (
				<div className="bg-background/90 absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
					<div className="border-primary rounded-lg border-2 border-dashed p-6 text-center">
						<Upload className="text-primary mx-auto mb-2 size-8" />
						<p className="text-sm font-medium">
							Drop .md, .txt files or folders
						</p>
					</div>
				</div>
			)}
			{children}
		</div>
	)
}

function ImportExportMenu({
	activeDocs,
	filteredDocs,
	isFiltered,
	typeFilter,
	onImport,
}: {
	activeDocs: LoadedDocument[]
	filteredDocs: LoadedDocument[]
	isFiltered: boolean
	typeFilter: TypeFilter
	onImport: (files: ImportedFile[]) => Promise<void>
}) {
	let fileInputRef = useRef<HTMLInputElement>(null)

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		if (e.target.files) {
			let imported = await importMarkdownFiles(e.target.files)
			await onImport(imported)
		}
		e.target.value = ""
	}

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept=".md,.markdown,.txt,.zip"
				multiple
				className="hidden"
				onChange={handleFileChange}
			/>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger
						render={
							<DropdownMenuTrigger
								render={
									<Button size="icon-sm" variant="ghost">
										<MoreHorizontal className="size-4" />
									</Button>
								}
							/>
						}
					/>
					<TooltipContent side="bottom">Import & Export</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
						<Download />
						Import
					</DropdownMenuItem>
					{activeDocs.length > 0 && (
						<DropdownMenuItem onClick={() => handleExportDocs(activeDocs)}>
							<Upload />
							Export all
						</DropdownMenuItem>
					)}
					{isFiltered &&
						filteredDocs.length > 0 &&
						typeFilter !== "deleted" && (
							<DropdownMenuItem onClick={() => handleExportDocs(filteredDocs)}>
								<Upload />
								Export filtered ({filteredDocs.length})
							</DropdownMenuItem>
						)}
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	)
}

function SearchFilterBar({
	search,
	onSearchChange,
	sort,
	onSortChange,
	typeFilter,
	onTypeChange,
	deletedCount,
	hasNonDefaultFilters,
}: {
	search: string
	onSearchChange: (value: string) => void
	sort: SortMode
	onSortChange: (value: SortMode) => void
	typeFilter: TypeFilter
	onTypeChange: (value: TypeFilter) => void
	deletedCount: number
	hasNonDefaultFilters: boolean
}) {
	let { viewMode, setViewMode } = useFolderStore()

	return (
		<div className="border-border flex items-center gap-1 border-b p-2">
			<div className="relative flex-1">
				<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
				<Input
					placeholder="Search..."
					value={search}
					onChange={e => onSearchChange(e.target.value)}
					className="h-8 pl-8"
				/>
			</div>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							size="icon-sm"
							variant="ghost"
							onClick={() =>
								setViewMode(viewMode === "folders" ? "flat" : "folders")
							}
						>
							{viewMode === "folders" ? (
								<Folder className="size-4" />
							) : (
								<List className="size-4" />
							)}
						</Button>
					}
				/>
				<TooltipContent side="bottom">
					{viewMode === "folders"
						? "Switch to flat view"
						: "Switch to folder view"}
				</TooltipContent>
			</Tooltip>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							size="icon-sm"
							variant={hasNonDefaultFilters ? "secondary" : "ghost"}
						>
							<SlidersHorizontal className="size-4" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end" className="w-48">
					<div className="px-2 py-1.5 text-xs font-medium">Sort</div>
					<DropdownMenuItem
						onClick={() => onSortChange("latest")}
						className={sort === "latest" ? "bg-accent" : ""}
					>
						Latest
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => onSortChange("alphabetical")}
						className={sort === "alphabetical" ? "bg-accent" : ""}
					>
						Alphabetical
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<div className="px-2 py-1.5 text-xs font-medium">Type</div>
					<DropdownMenuItem
						onClick={() => onTypeChange("all")}
						className={typeFilter === "all" ? "bg-accent" : ""}
					>
						All
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => onTypeChange("document")}
						className={typeFilter === "document" ? "bg-accent" : ""}
					>
						<FileText className="size-4" />
						Documents
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => onTypeChange("presentation")}
						className={typeFilter === "presentation" ? "bg-accent" : ""}
					>
						<Presentation className="size-4" />
						Presentations
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => onTypeChange("deleted")}
						className={typeFilter === "deleted" ? "bg-accent" : ""}
					>
						<Trash2 className="size-4" />
						Deleted{deletedCount > 0 ? ` (${deletedCount})` : ""}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

type ListItem =
	| { type: "doc"; doc: LoadedDocument; depth: number }
	| { type: "folder"; path: string; depth: number; docCount: number }

function DocumentList({
	docs,
	currentDocId,
	searchQuery,
	typeFilter,
	isLoading,
	onDocClick,
	onDuplicate,
	onDelete,
}: {
	docs: LoadedDocument[]
	currentDocId: string | undefined
	searchQuery: string
	typeFilter: TypeFilter
	isLoading: boolean
	onDocClick: () => void
	onDuplicate: (doc: LoadedDocument) => void
	onDelete: (doc: LoadedDocument) => void
}) {
	let parentRef = useRef<HTMLDivElement>(null)
	let { viewMode, isCollapsed, toggleFolder } = useFolderStore()

	// Build list items based on view mode
	let listItems: ListItem[] = buildListItems(docs, viewMode, isCollapsed)

	// Collect all unique folder paths for move-to-folder dialog
	let existingFolders = getExistingFolders(docs)

	let virtualizer = useVirtualizer({
		count: listItems.length,
		getScrollElement: () => parentRef.current,
		estimateSize: index => (listItems[index]?.type === "folder" ? 36 : 60),
		overscan: 5,
	})

	if (isLoading) {
		return (
			<div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-8 text-xs">
				<Spinner className="size-6" />
				<p>Loading documents...</p>
			</div>
		)
	}

	if (docs.length === 0) {
		return (
			<div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-8 text-xs">
				<FileText className="size-6 opacity-50" />
				<p>
					{searchQuery
						? "No matches"
						: typeFilter === "deleted"
							? "No deleted documents"
							: "No documents"}
				</p>
			</div>
		)
	}

	return (
		<div ref={parentRef} className="min-h-0 flex-1 overflow-auto">
			<ul
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualizer.getVirtualItems().map(virtualRow => {
					let item = listItems[virtualRow.index]
					if (!item) return null

					return (
						<li
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="absolute top-0 left-0 w-full"
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{item.type === "folder" ? (
								<FolderRow
									path={item.path}
									depth={item.depth}
									docCount={item.docCount}
									isCollapsed={isCollapsed(item.path)}
									onToggle={() => toggleFolder(item.path)}
									docsInFolder={getDocsInFolder(docs, item.path)}
									existingFolders={existingFolders}
								/>
							) : typeFilter === "deleted" ? (
								<DeletedDocumentItem doc={item.doc} searchQuery={searchQuery} />
							) : (
								<DocumentItem
									doc={item.doc}
									isActive={item.doc.$jazz.id === currentDocId}
									onClick={onDocClick}
									searchQuery={searchQuery}
									onDuplicate={onDuplicate}
									onDelete={onDelete}
									showPath={viewMode === "flat"}
									existingFolders={existingFolders}
									depth={item.depth}
								/>
							)}
						</li>
					)
				})}
			</ul>
		</div>
	)
}

function DocumentItem({
	doc,
	isActive,
	onClick,
	searchQuery,
	onDuplicate,
	onDelete,
	showPath = false,
	existingFolders,
	depth = 0,
}: {
	doc: LoadedDocument
	isActive: boolean
	onClick: () => void
	searchQuery: string
	onDuplicate: (doc: LoadedDocument) => void
	onDelete: (doc: LoadedDocument) => void
	showPath?: boolean
	existingFolders: string[]
	depth?: number
}) {
	let me = useAccount(UserAccount, { resolve: { root: { documents: true } } })
	let [shareOpen, setShareOpen] = useState(false)
	let [deleteOpen, setDeleteOpen] = useState(false)
	let [leaveOpen, setLeaveOpen] = useState(false)
	let [moveOpen, setMoveOpen] = useState(false)

	let content = doc.content?.toString() ?? ""
	let title = getDocumentTitle(doc)
	let date = formatRelativeDate(doc.updatedAt)
	let isPublic = isDocumentPublic(doc)
	let status = getSharingStatus(doc)
	let hasIndicator = isPublic || status !== "none"
	let isPresentation = getPresentationMode(content)
	let isPinned = isDocumentPinned(doc)
	let tags = getTags(content)
	let path = showPath ? getPath(content) : null
	let docGroup = getDocumentGroup(doc)
	let isAdmin = docGroup?.myRole() === "admin"
	let contentMatchCount = searchQuery.trim()
		? countContentMatches(content, searchQuery)
		: 0
	let docId = doc.$jazz.id

	return (
		<SidebarMenuItem>
			<ContextMenu>
				<ContextMenuTrigger
					render={
						<Link to="/doc/$id" params={{ id: docId }} onClick={onClick}>
							<SidebarMenuButton
								isActive={isActive}
								className="h-auto py-2"
								style={
									depth > 0 ? { paddingLeft: `${8 + depth * 12}px` } : undefined
								}
							>
								<div className="flex min-w-0 flex-1 flex-col gap-0.5">
									<div className="flex items-center gap-1.5">
										<span
											className={
												isActive
													? "text-xs opacity-70"
													: "text-muted-foreground text-xs"
											}
										>
											{date}
										</span>
										{isPinned && (
											<span className={isActive ? "opacity-70" : "text-brand"}>
												<Pin className="size-3" />
											</span>
										)}
										{isPresentation && (
											<span className={isActive ? "opacity-70" : "text-brand"}>
												<Presentation className="size-3" />
											</span>
										)}
										{hasIndicator && (
											<span className={isActive ? "opacity-70" : "text-brand"}>
												{isPublic ? (
													<Globe className="size-3" />
												) : (
													<Users className="size-3" />
												)}
											</span>
										)}
										{path && (
											<span
												className={
													isActive
														? "bg-background/20 inline-flex items-center gap-1 rounded px-1 text-xs"
														: "bg-muted text-muted-foreground inline-flex items-center gap-1 rounded px-1 text-xs"
												}
											>
												<Folder className="size-3" />
												{path}
											</span>
										)}
									</div>
									<span className="truncate text-sm font-medium">
										<TextHighlight text={title} query={searchQuery} />
									</span>
									{tags.length > 0 && (
										<TagsRow
											tags={tags}
											isActive={isActive}
											searchQuery={searchQuery}
										/>
									)}
									{contentMatchCount > 0 && (
										<span
											className={
												isActive
													? "bg-background/20 inline-flex rounded px-1 text-xs"
													: "bg-brand/20 text-brand inline-flex rounded px-1 text-xs"
											}
										>
											{contentMatchCount}{" "}
											{contentMatchCount === 1 ? "match" : "matches"} in content
										</span>
									)}
								</div>
							</SidebarMenuButton>
						</Link>
					}
				/>
				<ContextMenuContent>
					<ContextMenuItem
						render={
							<Link
								to="/doc/$id/preview"
								params={{ id: docId }}
								search={{ from: "list" }}
							/>
						}
					>
						<Eye />
						Preview
					</ContextMenuItem>
					{isPresentation && (
						<>
							<ContextMenuItem
								render={<Link to="/doc/$id/slideshow" params={{ id: docId }} />}
							>
								<Presentation />
								Slideshow
							</ContextMenuItem>
							<ContextMenuItem
								render={
									<Link to="/doc/$id/teleprompter" params={{ id: docId }} />
								}
							>
								<ScrollText />
								Teleprompter
							</ContextMenuItem>
						</>
					)}
					<ContextMenuItem onClick={() => handleDownloadDocument(doc, title)}>
						<Download />
						Download
					</ContextMenuItem>
					<ContextMenuItem onClick={() => setShareOpen(true)}>
						<Users />
						Share
					</ContextMenuItem>
					<ContextMenuItem onClick={() => onDuplicate(doc)}>
						<Copy />
						Duplicate
					</ContextMenuItem>
					<ContextMenuItem onClick={() => handleTogglePin(doc)}>
						<Pin />
						{isPinned ? "Unpin" : "Pin"}
					</ContextMenuItem>
					<ContextMenuItem onClick={() => setMoveOpen(true)}>
						<FolderInput />
						Move to folder
					</ContextMenuItem>
					{isAdmin ? (
						<ContextMenuItem
							onClick={() => setDeleteOpen(true)}
							variant="destructive"
						>
							<Trash2 />
							Delete
						</ContextMenuItem>
					) : (
						<ContextMenuItem
							onClick={() => setLeaveOpen(true)}
							variant="destructive"
						>
							<LogOut />
							Leave
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>
			<ShareDialog doc={doc} open={shareOpen} onOpenChange={setShareOpen} />
			<MoveToFolderDialog
				doc={doc}
				existingFolders={existingFolders}
				open={moveOpen}
				onOpenChange={setMoveOpen}
			/>
			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title="Delete document?"
				description="This will move the document to trash. You can restore it later."
				confirmLabel="Delete"
				variant="destructive"
				onConfirm={() => onDelete(doc)}
			/>
			<ConfirmDialog
				open={leaveOpen}
				onOpenChange={setLeaveOpen}
				title="Leave document?"
				description="You will lose access to this shared document."
				confirmLabel="Leave"
				variant="destructive"
				onConfirm={() => handleLeaveDocument(doc, me)}
			>
				{(doc.content?.toString() ?? "").length > 0 && (
					<div className="bg-muted/50 text-muted-foreground max-h-32 overflow-auto rounded border p-3 text-sm whitespace-pre-wrap">
						{(doc.content?.toString() ?? "").slice(0, 200)}
						{(doc.content?.toString() ?? "").length > 200 ? "..." : ""}
					</div>
				)}
			</ConfirmDialog>
		</SidebarMenuItem>
	)
}

function DeletedDocumentItem({
	doc,
	searchQuery,
}: {
	doc: LoadedDocument
	searchQuery: string
}) {
	let [deleteOpen, setDeleteOpen] = useState(false)

	let title = getDocumentTitle(doc)
	let daysLeft = doc.deletedAt ? getDaysUntilPermanentDelete(doc.deletedAt) : 0
	let content = doc.content?.toString() ?? ""
	let preview = content.slice(0, 200) + (content.length > 200 ? "..." : "")
	let contentMatchCount = searchQuery.trim()
		? countContentMatches(content, searchQuery)
		: 0

	return (
		<SidebarMenuItem>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<SidebarMenuButton className="h-auto py-2">
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<div className="flex items-center gap-1.5">
									<span className="text-destructive text-xs">
										{daysLeft}d until deleted permanently
									</span>
								</div>
								<span className="text-muted-foreground truncate text-sm">
									<TextHighlight text={title} query={searchQuery} />
								</span>
								{contentMatchCount > 0 && (
									<span className="bg-brand/20 text-brand inline-flex rounded px-1 text-xs">
										{contentMatchCount}{" "}
										{contentMatchCount === 1 ? "match" : "matches"} in content
									</span>
								)}
							</div>
						</SidebarMenuButton>
					}
				/>
				<DropdownMenuContent align="center">
					<DropdownMenuItem
						onClick={() => doc.$jazz.set("deletedAt", undefined)}
					>
						<RotateCcw />
						Restore
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setDeleteOpen(true)}
						className="text-destructive focus:text-destructive"
					>
						<Trash2 />
						Delete permanently
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title="Delete permanently?"
				description="This cannot be undone."
				confirmLabel="Delete permanently"
				variant="destructive"
				onConfirm={() => doc.$jazz.set("permanentlyDeletedAt", new Date())}
			>
				{preview && (
					<div className="bg-muted/50 text-muted-foreground max-h-32 overflow-auto rounded border p-3 text-sm whitespace-pre-wrap">
						{preview}
					</div>
				)}
			</ConfirmDialog>
		</SidebarMenuItem>
	)
}

function SyncStatus() {
	let location = useLocation()
	let isAuthenticated = useIsAuthenticated()
	let { needRefresh } = usePWA()

	if (isAuthenticated) {
		return (
			<Button
				variant="ghost"
				size="sm"
				render={<Link to="/settings" search={{ from: location.pathname }} />}
				className="relative flex-1"
			>
				<Cloud className="text-green-600 dark:text-green-400" />
				<span>Syncing</span>
				{needRefresh && (
					<span className="bg-destructive absolute top-1 right-1 size-2 rounded-full" />
				)}
			</Button>
		)
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			className="relative w-full flex-1"
			render={<Link to="/settings" search={{ from: location.pathname }} />}
		>
			<CloudOff className="text-destructive" />
			Local Only - Sign in
			{needRefresh && (
				<span className="bg-destructive absolute top-1 right-1 size-2 rounded-full" />
			)}
		</Button>
	)
}

function HelpDropdown() {
	let { isMobile, setLeftOpenMobile } = useSidebar()

	return (
		<HelpMenu
			trigger={
				<Button variant="ghost" size="icon-sm">
					<HelpCircle />
				</Button>
			}
			align="start"
			side="top"
			onNavigate={() => isMobile && setLeftOpenMobile(false)}
		/>
	)
}

function TagsRow({
	tags,
	isActive,
	searchQuery,
}: {
	tags: string[]
	isActive: boolean
	searchQuery: string
}) {
	let containerRef = useRef<HTMLDivElement>(null)
	let [visibleCount, setVisibleCount] = useState(tags.length)

	useEffect(() => {
		let container = containerRef.current
		if (!container) return

		let measure = () => {
			let containerWidth = container.offsetWidth
			let children = Array.from(container.children) as HTMLElement[]
			let totalWidth = 0
			let count = 0

			for (let i = 0; i < children.length; i++) {
				let child = children[i]
				let childWidth = child.offsetWidth + 4 // gap
				if (totalWidth + childWidth > containerWidth && i > 0) break
				totalWidth += childWidth
				count++
			}

			setVisibleCount(count || 1)
		}

		measure()
		let observer = new ResizeObserver(measure)
		observer.observe(container)
		return () => observer.disconnect()
	}, [tags])

	let hiddenCount = tags.length - visibleCount

	return (
		<div
			ref={containerRef}
			className="flex min-w-0 items-center gap-1 overflow-hidden"
		>
			{tags.slice(0, visibleCount).map((tag, i) => (
				<span
					key={i}
					className={
						isActive
							? "bg-background/20 shrink-0 rounded px-1 text-xs"
							: "bg-muted shrink-0 rounded px-1 text-xs"
					}
				>
					<TextHighlight text={tag} query={searchQuery} />
				</span>
			))}
			{hiddenCount > 0 && (
				<span
					className={
						isActive
							? "shrink-0 text-xs opacity-70"
							: "text-muted-foreground shrink-0 text-xs"
					}
				>
					+{hiddenCount} more
				</span>
			)}
		</div>
	)
}

async function handleImportFiles(
	imported: ImportedFile[],
	me: ReturnType<typeof useAccount<typeof UserAccount, typeof documentsQuery>>,
) {
	if (!me.$isLoaded || !me.root?.documents?.$isLoaded) return

	for (let { name, content, assets: importedAssets, path } of imported) {
		let now = new Date()
		let group = Group.create()

		let processedContent = content
		let hasFrontmatter = content.trimStart().startsWith("---")
		if (!hasFrontmatter) {
			let title = name.replace(/\.(md|markdown|txt)$/i, "")
			let pathLine = path ? `path: ${path}\n` : ""
			processedContent = `---\ntitle: ${title}\n${pathLine}---\n\n${content}`
		} else if (path) {
			let existingPath = getPath(content)
			if (!existingPath) {
				processedContent = content.replace(/^(---\r?\n)/, `$1path: ${path}\n`)
			}
		}

		let docAssets: co.loaded<typeof Asset>[] = []
		for (let importedAsset of importedAssets) {
			let image = await createImage(importedAsset.file, {
				owner: group,
				maxSize: 2048,
			})
			let asset = Asset.create(
				{ type: "image", name: importedAsset.name, image, createdAt: now },
				group,
			)
			docAssets.push(asset)

			let escapedRef = importedAsset.refName.replace(
				/[.*+?^${}()|[\]\\]/g,
				"\\$&",
			)
			processedContent = processedContent.replace(
				new RegExp(`!\\[([^\\]]*)\\]\\(${escapedRef}\\)`, "g"),
				`![$1](asset:${asset.$jazz.id})`,
			)
		}

		let newDoc = Document.create(
			{
				version: 1,
				content: co.plainText().create(processedContent, group),
				assets:
					docAssets.length > 0
						? co.list(Asset).create(docAssets, group)
						: undefined,
				createdAt: now,
				updatedAt: now,
			},
			group,
		)
		me.root.documents.$jazz.push(newDoc)
	}
}

function handleDuplicateDocument(
	doc: LoadedDocument,
	me: ReturnType<typeof useAccount<typeof UserAccount, typeof documentsQuery>>,
	isMobile: boolean,
	setLeftOpenMobile: (open: boolean) => void,
	navigate: ReturnType<typeof useNavigate>,
) {
	if (!me.$isLoaded || !me.root?.documents?.$isLoaded) return
	let now = new Date()
	let group = Group.create()
	let newDoc = Document.create(
		{
			version: 1,
			content: co.plainText().create(doc.content?.toString() ?? "", group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)
	me.root.documents.$jazz.push(newDoc)
	if (isMobile) setLeftOpenMobile(false)
	navigate({ to: "/doc/$id", params: { id: newDoc.$jazz.id } })
}

async function handleExportDocs(docs: LoadedDocument[]) {
	if (docs.length === 0) return

	let exportDocs: {
		title: string
		content: string
		assets?: ExportAsset[]
		path?: string | null
	}[] = []
	for (let d of docs) {
		let content = d.content?.toString() ?? ""
		let docAssets = await loadDocumentAssets(d)
		exportDocs.push({
			title: getDocumentTitle(d),
			content,
			assets: docAssets.length > 0 ? docAssets : undefined,
			path: getPath(content),
		})
	}

	if (exportDocs.length > 0) {
		await exportDocumentsAsZip(exportDocs)
	}
}

async function handleDownloadDocument(doc: LoadedDocument, title: string) {
	let docAssets = await loadDocumentAssets(doc)
	await exportDocument(
		doc.content?.toString() ?? "",
		title,
		docAssets.length > 0 ? docAssets : undefined,
	)
}

async function handleLeaveDocument(
	doc: LoadedDocument,
	me: ReturnType<
		typeof useAccount<typeof UserAccount, { root: { documents: true } }>
	>,
) {
	if (!doc?.$isLoaded || !me.$isLoaded) return
	let idx = me.root?.documents?.findIndex(d => d?.$jazz.id === doc.$jazz.id)
	if (idx !== undefined && idx !== -1 && me.root?.documents?.$isLoaded) {
		me.root.documents.$jazz.splice(idx, 1)
	}
	await leaveDocument(doc, me)
}

function handleTogglePin(doc: LoadedDocument) {
	if (!doc.content) return
	let content = doc.content.toString()
	let newContent = togglePinned(content)
	doc.content.$jazz.applyDiff(newContent)
	doc.$jazz.set("updatedAt", new Date())
}

let documentsQuery = {
	root: {
		documents: {
			$each: { content: true },
			$onError: "catch",
		},
	},
} as const satisfies ResolveQuery<typeof UserAccount>

let assetsQuery = {
	assets: { $each: { image: true } },
} as const satisfies ResolveQuery<typeof Document>

async function loadDocumentAssets(
	doc: co.loaded<typeof Document>,
): Promise<ExportAsset[]> {
	let loaded = await doc.$jazz.ensureLoaded({ resolve: assetsQuery })
	let docAssets: ExportAsset[] = []

	if (loaded.assets?.$isLoaded) {
		for (let asset of [...loaded.assets]) {
			if (!asset?.$isLoaded || !asset.image?.$isLoaded) continue
			let original = asset.image.original
			if (!original?.$isLoaded) continue
			let blob = original.toBlob()
			if (blob) {
				docAssets.push({ id: asset.$jazz.id, name: asset.name, blob })
			}
		}
	}

	return docAssets
}

function buildListItems(
	docs: LoadedDocument[],
	viewMode: "folders" | "flat",
	isCollapsed: (path: string) => boolean,
): ListItem[] {
	if (viewMode === "flat") {
		return docs.map(doc => ({ type: "doc" as const, doc, depth: 0 }))
	}

	let rootDocs: LoadedDocument[] = []
	let folderDocs = new Map<string, LoadedDocument[]>()

	for (let doc of docs) {
		let path = getPath(doc.content?.toString() ?? "")
		if (!path) {
			rootDocs.push(doc)
		} else {
			let existing = folderDocs.get(path) ?? []
			existing.push(doc)
			folderDocs.set(path, existing)
		}
	}

	let allPaths = [...folderDocs.keys()].sort()
	let folderTree = buildFolderTree(allPaths)

	function getMostRecentInTree(node: FolderNode, currentPath: string): Date {
		let fullPath = currentPath ? `${currentPath}/${node.name}` : node.name
		let docsHere = folderDocs.get(fullPath) ?? []
		let mostRecent =
			docsHere.length > 0
				? Math.max(...docsHere.map(d => new Date(d.updatedAt).getTime()))
				: 0

		for (let child of node.children) {
			let childRecent = getMostRecentInTree(child, fullPath)
			mostRecent = Math.max(mostRecent, childRecent.getTime())
		}

		return new Date(mostRecent)
	}

	type SortableItem =
		| { type: "rootDoc"; doc: LoadedDocument; sortDate: Date }
		| { type: "topFolder"; node: FolderNode; sortDate: Date }

	let sortableItems: SortableItem[] = []

	for (let doc of rootDocs) {
		sortableItems.push({
			type: "rootDoc",
			doc,
			sortDate: new Date(doc.updatedAt),
		})
	}

	for (let node of folderTree) {
		let mostRecent = getMostRecentInTree(node, "")
		sortableItems.push({ type: "topFolder", node, sortDate: mostRecent })
	}

	sortableItems.sort((a, b) => {
		let aPinned = a.type === "rootDoc" && isDocumentPinned(a.doc)
		let bPinned = b.type === "rootDoc" && isDocumentPinned(b.doc)
		if (aPinned !== bPinned) return bPinned ? 1 : -1

		return b.sortDate.getTime() - a.sortDate.getTime()
	})

	let items: ListItem[] = []

	function addFolderItems(
		node: FolderNode,
		currentPath: string,
		depth: number,
	) {
		let fullPath = currentPath ? `${currentPath}/${node.name}` : node.name
		let docsInFolder = folderDocs.get(fullPath) ?? []
		let totalDocs = countDocsInTree(node, fullPath, folderDocs)

		items.push({
			type: "folder",
			path: fullPath,
			depth,
			docCount: totalDocs,
		})

		if (!isCollapsed(fullPath)) {
			for (let doc of docsInFolder) {
				items.push({ type: "doc", doc, depth: depth + 1 })
			}
			let sortedChildren = [...node.children].sort((a, b) => {
				let aRecent = getMostRecentInTree(a, fullPath)
				let bRecent = getMostRecentInTree(b, fullPath)
				return bRecent.getTime() - aRecent.getTime()
			})
			for (let child of sortedChildren) {
				addFolderItems(child, fullPath, depth + 1)
			}
		}
	}

	for (let item of sortableItems) {
		if (item.type === "rootDoc") {
			items.push({ type: "doc", doc: item.doc, depth: 0 })
		} else {
			addFolderItems(item.node, "", 0)
		}
	}

	return items
}

interface FolderNode {
	name: string
	children: FolderNode[]
}

function buildFolderTree(paths: string[]): FolderNode[] {
	let root: FolderNode[] = []

	for (let path of paths) {
		let parts = path.split("/")
		let current = root

		for (let i = 0; i < parts.length; i++) {
			let part = parts[i]
			let existing = current.find(n => n.name === part)

			if (!existing) {
				existing = { name: part, children: [] }
				current.push(existing)
			}

			current = existing.children
		}
	}

	return root
}

function countDocsInTree(
	node: FolderNode,
	fullPath: string,
	folderDocs: Map<string, LoadedDocument[]>,
): number {
	let count = folderDocs.get(fullPath)?.length ?? 0

	for (let child of node.children) {
		let childPath = `${fullPath}/${child.name}`
		count += countDocsInTree(child, childPath, folderDocs)
	}

	return count
}

function getExistingFolders(docs: LoadedDocument[]): string[] {
	let folders = new Set<string>()

	for (let doc of docs) {
		let path = getPath(doc.content?.toString() ?? "")
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

function getDocsInFolder(
	docs: LoadedDocument[],
	folderPath: string,
): LoadedDocument[] {
	return docs.filter(doc => {
		let path = getPath(doc.content?.toString() ?? "")
		if (!path) return false
		return path === folderPath || path.startsWith(folderPath + "/")
	})
}
