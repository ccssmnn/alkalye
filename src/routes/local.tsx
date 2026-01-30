import { useEffect, useRef, useState } from "react"
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router"
import { useAccount } from "jazz-tools/react"
import { UserAccount } from "@/schema"
import {
	MarkdownEditor,
	useMarkdownEditorRef,
	type WikilinkDoc,
} from "@/editor/editor"
import "@/editor/editor.css"
import { useEditorSettings } from "@/lib/editor-settings"
import { getDocumentTitle } from "@/lib/document-utils"
import { EditorToolbar } from "@/components/editor-toolbar"
import { DocumentSidebar } from "@/components/document-sidebar"
import { ListSidebar } from "@/components/list-sidebar"
import { SidebarSyncStatus } from "@/components/sidebar-sync-status"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from "@/components/ui/sidebar"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import {
	HelpCircle,
	FileUp,
	Search,
	Settings,
	Check,
	AlertCircle,
	FileText,
	Plus,
	Download,
	Cloud,
	ChevronRight,
	Eye,
	Pencil,
	EllipsisIcon,
} from "lucide-react"
import {
	ThemeToggle,
	useTheme,
	type Theme,
	useResolvedTheme,
	ThemeSubmenu,
} from "@/lib/theme"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { HelpMenu } from "@/components/help-menu"
import { SidebarEditMenu } from "@/components/sidebar-edit-menu"
import { SidebarFormatMenu } from "@/components/sidebar-format-menu"
import {
	useLocalFileStore,
	openLocalFile,
	saveLocalFile,
	saveLocalFileAs,
	consumeLaunchQueue,
	isFileSystemAccessSupported,
} from "@/lib/local-file"
import { CopyToSyncedDialog } from "@/components/copy-to-synced-dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { modKey, altModKey } from "@/lib/platform"
import { Preview } from "@/components/preview"
import { parseWikiLinks } from "@/editor/wikilink-parser"
import { useDocTitles, type ResolvedDoc } from "@/lib/doc-resolver"

export { Route }

let Route = createFileRoute("/local")({
	component: LocalFilePage,
})

function LocalFilePage() {
	let store = useLocalFileStore()
	let [initialized, setInitialized] = useState(false)
	let [isPreview, setIsPreview] = useState(false)

	useEffect(() => {
		consumeLaunchQueue().then(result => {
			if (result) {
				store.setFileHandle(result.handle)
				store.setFilename(result.filename)
				store.setContent(result.content)
				store.setLastSavedContent(result.content)
			}
			setInitialized(true)
		})
	}, [])

	if (!initialized) {
		return (
			<Empty className="h-screen">
				<EmptyHeader>
					<EmptyTitle>Loading...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	if (!store.fileHandle && !store.content) {
		return <LocalFileEmptyState />
	}

	return (
		<SidebarProvider>
			<LocalEditorContent isPreview={isPreview} setIsPreview={setIsPreview} />
		</SidebarProvider>
	)
}

function LocalFileEmptyState() {
	let store = useLocalFileStore()

	async function handleOpenFile() {
		let result = await openLocalFile()
		if (result) {
			store.setFileHandle(result.handle)
			store.setFilename(result.filename)
			store.setContent(result.content)
			store.setLastSavedContent(result.content)
		}
	}

	async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
		let file = e.target.files?.[0]
		if (!file) return

		let content = await file.text()
		store.setFilename(file.name)
		store.setContent(content)
		store.setLastSavedContent(content)
	}

	let supportsFileSystem = isFileSystemAccessSupported()

	return (
		<Empty className="h-screen">
			<EmptyHeader>
				<FileText className="text-muted-foreground size-12" />
				<EmptyTitle>Open a Local File</EmptyTitle>
			</EmptyHeader>
			<p className="text-muted-foreground max-w-md text-center text-sm">
				Edit a markdown file from your computer without syncing it to cloud.
				Changes are saved directly to the file.
			</p>
			<div className="mt-6 flex flex-col gap-3">
				{supportsFileSystem ? (
					<Button onClick={handleOpenFile} size="lg" nativeButton>
						<FileUp className="mr-2 size-4" />
						Open File
					</Button>
				) : (
					<>
						<label className="cursor-pointer">
							<span className="bg-primary text-primary-foreground inline-flex h-11 items-center justify-center gap-1.5 rounded-none border border-transparent px-3 text-sm font-medium transition-all active:scale-97 md:h-9 md:px-2.5 md:text-xs">
								<FileUp className="mr-2 size-4" />
								Upload File
							</span>
							<input
								type="file"
								accept=".md,.markdown,.txt"
								className="hidden"
								onChange={handleUploadFile}
							/>
						</label>
						<p className="text-muted-foreground text-center text-xs">
							For auto-save support, use Chrome or Edge
						</p>
					</>
				)}
			</div>
			<div className="mt-8 flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					nativeButton={false}
					render={<Link to="/" />}
				>
					<Cloud className="mr-1.5 size-4" />
					Go to synced documents
				</Button>
			</div>
		</Empty>
	)
}

let meResolve = {
	root: {
		documents: { $each: { content: true } },
		settings: true,
	},
} as const

function LocalEditorContent({
	isPreview,
	setIsPreview,
}: {
	isPreview: boolean
	setIsPreview: (value: boolean) => void
}) {
	let editor = useMarkdownEditorRef()
	let containerRef = useRef<HTMLDivElement>(null)
	let saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	let store = useLocalFileStore()
	let { theme, setTheme } = useTheme()
	let resolvedTheme = useResolvedTheme()
	let {
		toggleLeft,
		toggleRight,
		isMobile,
		setLeftOpenMobile,
		setRightOpenMobile,
	} = useSidebar()
	let [copyDialogOpen, setCopyDialogOpen] = useState(false)

	let me = useAccount(UserAccount, { resolve: meResolve })
	let editorSettings =
		me.$isLoaded && me.root?.settings?.$isLoaded ? me.root.settings : undefined

	useEditorSettings(editorSettings)

	let content = store.content
	let isDirty = content !== store.lastSavedContent
	let docTitle = getDocumentTitle(content) || store.filename || "Untitled"

	let documents: WikilinkDoc[] = []
	if (me.$isLoaded && me.root?.documents?.$isLoaded) {
		documents = [...me.root.documents]
			.filter(d => d?.$isLoaded && !d.deletedAt)
			.map(d => ({
				id: d.$jazz.id,
				title: getDocumentTitle(d.content?.toString() ?? ""),
			}))
	}

	useBlocker({
		shouldBlockFn: () => isDirty,
		enableBeforeUnload: isDirty,
	})

	let fileHandle = store.fileHandle
	useEffect(() => {
		if (!fileHandle || !isDirty) return

		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current)
		}

		saveTimeoutRef.current = setTimeout(async () => {
			useLocalFileStore.getState().setSaveStatus("saving")
			let success = await saveLocalFile(fileHandle, content)
			if (success) {
				useLocalFileStore.getState().setLastSavedContent(content)
				useLocalFileStore.getState().setSaveStatus("saved")
				setTimeout(
					() => useLocalFileStore.getState().setSaveStatus("idle"),
					1500,
				)
			} else {
				useLocalFileStore.getState().setSaveStatus("error")
				useLocalFileStore
					.getState()
					.setErrorMessage("Failed to save. Check file permissions.")
			}
		}, 1000)

		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current)
			}
		}
	}, [content, fileHandle, isDirty])

	async function handleSaveAs() {
		let suggestedName = store.filename || docTitle + ".md"
		let newHandle = await saveLocalFileAs(content, suggestedName)
		if (newHandle) {
			store.setFileHandle(newHandle)
			store.setFilename(suggestedName)
			store.setLastSavedContent(content)
			store.setSaveStatus("saved")
			setTimeout(() => store.setSaveStatus("idle"), 1500)
		}
	}

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			let isMod = e.metaKey || e.ctrlKey

			if (isMod && e.key === "s") {
				e.preventDefault()
				handleSaveAs()
			}

			if (isMod && e.shiftKey && e.key.toLowerCase() === "e") {
				e.preventDefault()
				toggleLeft()
			}

			if (isMod && e.key === ".") {
				e.preventDefault()
				toggleRight()
			}

			if (
				isMod &&
				e.altKey &&
				(e.key.toLowerCase() === "r" || e.code === "KeyR")
			) {
				e.preventDefault()
				setIsPreview(!isPreview)
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [handleSaveAs, toggleLeft, toggleRight, isPreview, setIsPreview])

	function handleChange(newContent: string) {
		store.setContent(newContent)
	}

	async function handleOpenFile() {
		if (isDirty) {
			let confirmed = window.confirm(
				"You have unsaved changes. Open a new file anyway?",
			)
			if (!confirmed) return
		}

		let result = await openLocalFile()
		if (result) {
			useLocalFileStore.getState().setFileHandle(result.handle)
			useLocalFileStore.getState().setFilename(result.filename)
			useLocalFileStore.getState().setContent(result.content)
			useLocalFileStore.getState().setLastSavedContent(result.content)
			useLocalFileStore.getState().setSaveStatus("idle")
			useLocalFileStore.getState().setErrorMessage(null)
		}
	}

	function handleDownload() {
		let filename = store.filename || docTitle + ".md"
		let blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
		let url = URL.createObjectURL(blob)
		let a = document.createElement("a")
		a.href = url
		a.download = filename
		a.click()
		URL.revokeObjectURL(url)
	}

	let wikilinkIds = parseWikiLinks(content).map(w => w.id)
	let wikilinkCache = useDocTitles(wikilinkIds)

	if (isPreview) {
		return (
			<LocalPreviewView
				filename={store.filename}
				docTitle={docTitle}
				content={content}
				wikilinks={wikilinkCache}
				theme={resolvedTheme}
				setTheme={setTheme}
				onExit={() => setIsPreview(false)}
			/>
		)
	}

	return (
		<>
			<title>{isDirty ? `* ${docTitle}` : docTitle}</title>
			<ListSidebar
				header={
					<Button
						size="sm"
						variant="ghost"
						nativeButton={false}
						render={<Link to="/local" />}
					>
						<Plus className="size-4" />
						New Local File
					</Button>
				}
				footer={<SidebarSyncStatus />}
			>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									nativeButton={false}
									render={<Link to="/" />}
									onClick={() => isMobile && setLeftOpenMobile(false)}
								>
									<Cloud className="size-4" />
									Synced Documents
									<ChevronRight className="ml-auto size-4" />
								</SidebarMenuButton>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
				<SidebarSeparator />
				<SidebarGroup className="flex-1">
					<SidebarGroupContent>
						<div className="text-muted-foreground px-2 py-4 text-center text-sm">
							<FileText className="mx-auto mb-2 size-8 opacity-50" />
							<p>Editing local file</p>
							<p className="mt-1 font-medium">{store.filename || "Untitled"}</p>
						</div>
					</SidebarGroupContent>
				</SidebarGroup>
			</ListSidebar>

			<div className="markdown-editor flex-1" ref={containerRef}>
				<MarkdownEditor
					ref={editor}
					value={content}
					onChange={handleChange}
					placeholder="Start writing..."
					documents={documents}
					autoSortTasks={editorSettings?.editor?.autoSortTasks}
				/>
				<EditorToolbar
					editor={editor}
					containerRef={containerRef}
					onToggleLeftSidebar={toggleLeft}
					onToggleRightSidebar={toggleRight}
					content={content}
					onThemeChange={handleChange}
				/>
			</div>

			<DocumentSidebar
				header={
					<>
						<ThemeToggle theme={theme} setTheme={setTheme} />
						<SettingsButton />
					</>
				}
				footer={
					<HelpMenu
						trigger={
							<Button variant="ghost" size="sm" className="w-full" nativeButton>
								<HelpCircle />
								<span>Help</span>
							</Button>
						}
						align={isMobile ? "center" : "end"}
						side={isMobile ? "top" : "left"}
						onNavigate={() => setRightOpenMobile(false)}
					/>
				}
			>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									onClick={() =>
										setRightOpenMobile(false, () => editor.current?.openFind())
									}
									nativeButton
								>
									<Search className="size-4" />
									Find
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarSeparator />
							<SidebarMenuItem>
								<SidebarMenuButton
									onClick={() => setIsPreview(true)}
									nativeButton
								>
									<Eye className="size-4" />
									Preview
								</SidebarMenuButton>
							</SidebarMenuItem>
							<SidebarSeparator />
							<LocalFileMenu
								onOpen={handleOpenFile}
								onSaveAs={handleSaveAs}
								onDownload={handleDownload}
								onCopyToSynced={() => setCopyDialogOpen(true)}
								isMobile={isMobile}
							/>
							<SidebarEditMenu
								editor={editor}
								disabled={false}
								readOnly={false}
							/>
							<SidebarFormatMenu
								editor={editor}
								disabled={false}
								readOnly={false}
								documents={documents.map(d => ({ id: d.id, title: d.title }))}
							/>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup className="flex-1">
					<SidebarGroupContent>
						<LocalFileSaveStatus />
					</SidebarGroupContent>
				</SidebarGroup>
			</DocumentSidebar>
			<CopyToSyncedDialog
				content={content}
				filename={store.filename}
				open={copyDialogOpen}
				onOpenChange={setCopyDialogOpen}
			/>
		</>
	)
}

function LocalPreviewView({
	filename,
	docTitle,
	content,
	wikilinks,
	theme,
	setTheme,
	onExit,
}: {
	filename: string | null
	docTitle: string
	content: string
	wikilinks: Map<string, ResolvedDoc>
	theme: "light" | "dark"
	setTheme: (theme: Theme) => void
	onExit: () => void
}) {
	return (
		<div className="bg-background fixed inset-0 flex flex-col">
			<LocalPreviewTopBar
				filename={filename}
				docTitle={docTitle}
				theme={theme}
				setTheme={setTheme}
				onExit={onExit}
			/>
			<Preview content={content} wikilinks={wikilinks} />
		</div>
	)
}

function LocalPreviewTopBar({
	filename,
	docTitle,
	theme,
	setTheme,
	onExit,
}: {
	filename: string | null
	docTitle: string
	theme: "light" | "dark"
	setTheme: (theme: Theme) => void
	onExit: () => void
}) {
	return (
		<div
			className="border-border relative flex shrink-0 items-center justify-between border-b px-4 py-2"
			style={{
				paddingTop: "max(0.5rem, env(safe-area-inset-top))",
				paddingLeft: "max(1rem, env(safe-area-inset-left))",
				paddingRight: "max(1rem, env(safe-area-inset-right))",
			}}
		>
			<span className="text-muted-foreground">{filename || "Local File"}</span>
			<span className="text-muted-foreground absolute left-1/2 -translate-x-1/2 truncate text-sm font-medium">
				{docTitle}
			</span>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="icon" nativeButton={false}>
							<EllipsisIcon className="size-4" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={onExit}>
						<Pencil className="size-4" />
						Editor
						<DropdownMenuShortcut>{altModKey}R</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<ThemeSubmenu theme={theme} setTheme={setTheme} />
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

function LocalFileSaveStatus() {
	let store = useLocalFileStore()
	let hasHandle = !!store.fileHandle
	let supportsFileSystem = isFileSystemAccessSupported()

	return (
		<div className="px-2 py-4">
			<div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
				Save Status
			</div>
			<div className="flex items-center gap-2">
				{store.saveStatus === "saving" && (
					<>
						<Check className="text-muted-foreground size-4 animate-pulse" />
						<span className="text-muted-foreground text-sm">Saving...</span>
					</>
				)}
				{store.saveStatus === "saved" && (
					<>
						<Check className="size-4 text-green-600" />
						<span className="text-sm text-green-600">Saved</span>
					</>
				)}
				{store.saveStatus === "error" && (
					<>
						<AlertCircle className="text-destructive size-4" />
						<span className="text-destructive text-sm">
							{store.errorMessage}
						</span>
					</>
				)}
				{store.saveStatus === "idle" && hasHandle && (
					<>
						<Check className="text-muted-foreground size-4" />
						<span className="text-muted-foreground text-sm">
							Auto-saving enabled
						</span>
					</>
				)}
				{store.saveStatus === "idle" && !hasHandle && (
					<>
						<AlertCircle className="text-warning size-4" />
						<span className="text-muted-foreground text-sm">
							{supportsFileSystem
								? 'Use "Save As" to enable auto-save'
								: "Download to save changes"}
						</span>
					</>
				)}
			</div>
		</div>
	)
}

function LocalFileMenu({
	onOpen,
	onSaveAs,
	onDownload,
	onCopyToSynced,
	isMobile,
}: {
	onOpen: () => void
	onSaveAs: () => void
	onDownload: () => void
	onCopyToSynced: () => void
	isMobile: boolean
}) {
	let supportsFileSystem = isFileSystemAccessSupported()

	return (
		<SidebarMenuItem>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<SidebarMenuButton nativeButton>
							<FileText className="size-4" />
							<span>File</span>
						</SidebarMenuButton>
					}
				/>
				<DropdownMenuContent
					align={isMobile ? "center" : "start"}
					side={isMobile ? "bottom" : "left"}
				>
					<DropdownMenuItem onClick={onOpen}>
						<FileUp className="size-4" />
						Open Local File
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					{supportsFileSystem && (
						<DropdownMenuItem onClick={onSaveAs}>
							<Check className="size-4" />
							Save As...
							<DropdownMenuShortcut>{modKey}S</DropdownMenuShortcut>
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={onDownload}>
						<Download className="size-4" />
						Download
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={onCopyToSynced}>
						<Cloud className="size-4" />
						Copy to Synced Documents
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	)
}

function SettingsButton() {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						nativeButton={false}
						render={<Link to="/settings" search={{ from: "/local" }} />}
					>
						<Settings />
					</Button>
				}
			/>
			<TooltipContent>Settings</TooltipContent>
		</Tooltip>
	)
}
