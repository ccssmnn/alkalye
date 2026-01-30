import { useEffect, useRef, useState } from "react"
import {
	createFileRoute,
	useNavigate,
	useBlocker,
	Link,
	useLocation,
} from "@tanstack/react-router"
import { co, Group } from "jazz-tools"
import { useCoState, useAccount, useIsAuthenticated } from "jazz-tools/react"
import { Document, Space, UserAccount, createSpaceDocument } from "@/schema"
import {
	makeUploadImage,
	makeUploadVideo,
	makeUploadAssets,
	makeRenameAsset,
	makeIsAssetUsed,
	makeDeleteAsset,
	makeDownloadAsset,
	handleSaveCopy,
	setupKeyboardShortcuts,
	resolve,
	canEncodeVideo,
	type LoadedDocument,
} from "@/lib/editor-utils"
import {
	MarkdownEditor,
	useMarkdownEditorRef,
	type WikilinkDoc,
} from "@/editor/editor"
import "@/editor/editor.css"
import { useEditorSettings } from "@/lib/editor-settings"
import { getDocumentTitle, addCopyToTitle } from "@/lib/document-utils"
import { getPath, getTags } from "@/editor/frontmatter"
import { EditorToolbar } from "@/components/editor-toolbar"
import { DocumentSidebar } from "@/components/document-sidebar"
import { ListSidebar } from "@/components/list-sidebar"
import { SidebarDocumentList } from "@/components/sidebar-document-list"
import { SpaceSelector } from "@/components/space-selector"
import { SidebarSyncStatus } from "@/components/sidebar-sync-status"

import {
	SidebarImportExport,
	handleImportFiles,
} from "@/components/sidebar-import-export"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/components/document-error-states"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
} from "@/components/ui/sidebar"
import { canEdit, isDocumentPublic, getDocumentGroup } from "@/lib/documents"
import { deletePersonalDocument } from "@/lib/documents"
import { useBacklinkSync } from "@/lib/backlink-sync"
import { usePresence } from "@/lib/presence"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { HelpCircle, Loader2, Search, Settings, Plus } from "lucide-react"

import { SidebarViewLinks } from "@/components/sidebar-view-links"
import { SidebarFileMenu } from "@/components/sidebar-file-menu"
import { SidebarEditMenu } from "@/components/sidebar-edit-menu"
import { SidebarFormatMenu } from "@/components/sidebar-format-menu"
import { SidebarCollaboration } from "@/components/sidebar-collaboration"
import { SidebarAssets, type SidebarAsset } from "@/components/sidebar-assets"
import { ThemeToggle, useTheme } from "@/lib/theme"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { usePWA } from "@/lib/pwa"
import { HelpMenu } from "@/components/help-menu"
import { useTrackLastOpened } from "@/lib/use-track-last-opened"
export { Route }

let Route = createFileRoute("/doc/$id/")({
	loader: async ({ params }) => {
		let doc = await Document.load(params.id, { resolve })
		if (!doc.$isLoaded) {
			return { doc: null, loadingState: doc.$jazz.loadingState }
		}
		return { doc, loadingState: null }
	},
	component: EditorPage,
})

function EditorPage() {
	let { id } = Route.useParams()
	let data = Route.useLoaderData()
	let navigate = useNavigate()

	let subscribedDoc = useCoState(Document, id, { resolve })

	// Get spaceId for redirect (from either source, safely)
	let spaceId = subscribedDoc.$isLoaded
		? subscribedDoc.spaceId
		: data.doc?.spaceId

	let isDeleted = subscribedDoc.$jazz.loadingState === "deleted"

	// Redirect space docs to their proper route (must call useEffect unconditionally)
	useEffect(() => {
		if (spaceId) {
			navigate({
				to: "/spaces/$spaceId/doc/$id",
				params: { spaceId, id },
				replace: true,
			})
		}
	}, [spaceId, id, navigate])

	// Navigate away when document is deleted
	useEffect(() => {
		if (isDeleted) {
			navigate({ to: "/", replace: true })
		}
	}, [isDeleted, navigate])

	// Error states from loader
	if (!data.doc) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Handle live access revocation or deletion
	if (
		!subscribedDoc.$isLoaded &&
		subscribedDoc.$jazz.loadingState !== "loading"
	) {
		if (subscribedDoc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		if (isDeleted) {
			// Show nothing while navigating away
			return null
		}
		return <DocumentNotFound />
	}

	// Fall back to preloaded data while subscription is loading
	let doc = subscribedDoc.$isLoaded ? subscribedDoc : data.doc

	if (doc.spaceId) {
		return (
			<Empty className="h-screen">
				<EmptyHeader>
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<EmptyTitle>Loading document...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	return (
		<SidebarProvider>
			<EditorContent doc={doc} docId={id} />
		</SidebarProvider>
	)
}

interface EditorContentProps {
	doc: LoadedDocument
	docId: string
}

let personalMeResolve = {
	root: {
		documents: { $each: { content: true } },
		settings: true,
	},
} as const

type LoadedMe = ReturnType<
	typeof useAccount<typeof UserAccount, typeof personalMeResolve>
>

function EditorContent({ doc, docId }: EditorContentProps) {
	let navigate = useNavigate()
	let editor = useMarkdownEditorRef()
	let containerRef = useRef<HTMLDivElement>(null)
	let [saveCopyState, setSaveCopyState] = useState<"idle" | "saving" | "saved">(
		"idle",
	)
	let pendingSave = useRef<{
		timeoutId: ReturnType<typeof setTimeout>
		content: string
		cursor: { from: number; to?: number } | null
	} | null>(null)

	let { theme, setTheme } = useTheme()
	let {
		toggleLeft,
		toggleRight,
		isMobile,
		setLeftOpenMobile,
		setRightOpenMobile,
	} = useSidebar()

	let isAuthenticated = useIsAuthenticated()
	let me = useAccount(UserAccount, { resolve: personalMeResolve })

	let editorSettings =
		me.$isLoaded && me.root?.settings?.$isLoaded ? me.root.settings : undefined

	let readOnly = !canEdit(doc)
	let canSaveCopy =
		isAuthenticated &&
		isDocumentPublic(doc) &&
		getDocumentGroup(doc)?.myRole() !== "admin"

	let [canUploadVideo, setCanUploadVideo] = useState(false)
	useEffect(() => {
		canEncodeVideo().then(setCanUploadVideo)
	}, [])

	let { updateCursor, remoteCursors } = usePresence({ doc })
	let assets =
		doc.assets?.map(a => ({
			id: a.$jazz.id,
			name: a.name,
			type: a.type,
			imageId: a.type === "image" ? a.image?.$jazz.id : undefined,
			video: a.type === "video" ? a.video : undefined,
			muteAudio: a.type === "video" ? a.muteAudio : undefined,
		})) ?? []

	// Get documents for wikilink autocomplete - personal docs only
	let documents: WikilinkDoc[] = []
	if (me.$isLoaded && me.root.documents?.$isLoaded) {
		documents = [...me.root.documents]
			.filter(d => d?.$isLoaded && !d.deletedAt && d.$jazz.id !== docId)
			.map(d => {
				let content = d.content?.toString() ?? ""
				return {
					id: d.$jazz.id,
					title: getDocumentTitle(content),
					path: getPath(content),
					tags: getTags(content),
				}
			})
	}

	let { syncBacklinks } = useBacklinkSync(docId, readOnly)
	useEditorSettings(editorSettings)
	useTrackLastOpened(me, doc)

	let content = doc.content.toString()
	let docTitle = getDocumentTitle(content)

	// Flush pending save when content changes (remote update arrived)
	// This prevents visual flicker where local changes disappear briefly
	useEffect(() => {
		if (!pendingSave.current) return
		clearTimeout(pendingSave.current.timeoutId)
		let pendingContent = pendingSave.current.content
		let cursor = pendingSave.current.cursor
		pendingSave.current = null
		doc.content.$jazz.applyDiff(pendingContent)
		doc.$jazz.set("updatedAt", new Date())
		if (cursor) {
			updateCursor(cursor.from, cursor.to)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [content])

	let docWithContent = useCoState(Document, docId, {
		resolve: { content: true },
	})

	let sidebarAssets: SidebarAsset[] =
		doc.assets
			?.filter(a => a?.$isLoaded)
			.map(a => ({
				id: a.$jazz.id,
				name: a.name,
				type: a.type,
				imageId: a.type === "image" ? a.image?.$jazz.id : undefined,
				getVideoBlob:
					a.type === "video" && a.video?.$isLoaded
						? () => a.video?.toBlob()
						: undefined,
				muteAudio: a.type === "video" ? a.muteAudio : undefined,
			})) ?? []

	// Get documents for wikilink insertion menu - personal docs only
	let wikiLinkDocs: { id: string; title: string }[] = []
	if (me.$isLoaded && me.root.documents?.$isLoaded) {
		for (let d of [...me.root.documents]) {
			if (!d?.$isLoaded || d.deletedAt || d.$jazz.id === docId) continue
			let title = getDocumentTitle(d)
			wikiLinkDocs.push({ id: d.$jazz.id, title })
		}
	}

	useBlocker({
		shouldBlockFn: () => {
			if (content !== "" || !me.$isLoaded || !me.root) return false
			let docs = me.root.documents
			if (!docs.$isLoaded) return false
			let idx = docs.findIndex(d => d?.$jazz.id === doc.$jazz.id)
			if (idx >= 0) docs.$jazz.splice(idx, 1)
			return false
		},
		enableBeforeUnload: content === "",
	})

	useEffect(() => {
		return setupKeyboardShortcuts({
			navigate,
			docId,
			toggleLeft,
			toggleRight,
			toggleFocusMode: () => {
				let current = document.documentElement.dataset.focusMode === "true"
				document.documentElement.dataset.focusMode = String(!current)
			},
			openFind: () => editor.current?.openFind(),
			docWithContent,
		})
	}, [navigate, docId, toggleLeft, toggleRight, docWithContent, editor])

	let allDocs = getPersonalDocs(me)

	let personalDocs =
		me.$isLoaded && me.root?.documents?.$isLoaded ? me.root.documents : null

	function handleChange(newContent: string) {
		if (pendingSave.current) {
			clearTimeout(pendingSave.current.timeoutId)
		}
		pendingSave.current = {
			content: newContent,
			cursor: null,
			timeoutId: setTimeout(() => {
				let cursor = pendingSave.current?.cursor
				pendingSave.current = null
				doc.content.$jazz.applyDiff(newContent)
				doc.$jazz.set("updatedAt", new Date())
				if (cursor) {
					updateCursor(cursor.from, cursor.to)
				}
			}, 250),
		}
		syncBacklinks(newContent)
	}

	function handleCursorChange(from: number, to?: number) {
		if (pendingSave.current) {
			pendingSave.current.cursor = { from, to }
		} else {
			updateCursor(from, to)
		}
	}

	return (
		<>
			<title>{docTitle}</title>
			<ListSidebar
				header={
					<>
						<SidebarImportExport
							docs={allDocs.filter(d => !d.deletedAt)}
							onImport={async files => {
								if (personalDocs) await handleImportFiles(files, personalDocs)
							}}
						/>
						<Button
							size="sm"
							nativeButton={false}
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
					</>
				}
				footer={<SidebarSyncStatus />}
				onImport={async files => {
					if (personalDocs) await handleImportFiles(files, personalDocs)
				}}
			>
				<SpaceSelector />
				<SidebarDocumentList
					docs={allDocs}
					currentDocId={docId}
					isLoading={!me.$isLoaded}
					onDocClick={() => isMobile && setLeftOpenMobile(false)}
					onDuplicate={docToDuplicate =>
						handleDuplicateDocument(
							docToDuplicate,
							me,
							isMobile,
							setLeftOpenMobile,
							navigate,
						)
					}
					onDelete={docToDelete => {
						deletePersonalDocument(docToDelete)
						if (docToDelete.$jazz.id === docId) {
							navigate({ to: "/" })
						}
					}}
				/>
			</ListSidebar>
			<div className="markdown-editor flex-1" ref={containerRef}>
				<MarkdownEditor
					key={docId}
					ref={editor}
					value={content}
					onChange={handleChange}
					onCursorChange={handleCursorChange}
					placeholder="Start writing..."
					readOnly={readOnly}
					assets={assets}
					documents={documents}
					remoteCursors={remoteCursors}
					onCreateDocument={makeCreateDocument(me)}
					onUploadImage={makeUploadImage(doc)}
					autoSortTasks={editorSettings?.editor?.autoSortTasks}
				/>
				<EditorToolbar
					editor={editor}
					readOnly={readOnly}
					containerRef={containerRef}
					onToggleLeftSidebar={toggleLeft}
					onToggleRightSidebar={toggleRight}
					onSaveCopy={
						canSaveCopy && me.$isLoaded
							? () => handleSaveCopy(doc, me, setSaveCopyState, navigate)
							: undefined
					}
					saveCopyState={saveCopyState}
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
							<SidebarViewLinks doc={doc} />
							<SidebarSeparator />
							<SidebarFileMenu
								doc={doc}
								editor={editor}
								me={me.$isLoaded ? me : undefined}
							/>
							<SidebarEditMenu
								editor={editor}
								disabled={!canEdit(doc)}
								readOnly={readOnly}
							/>
							<SidebarFormatMenu
								editor={editor}
								disabled={!canEdit(doc)}
								readOnly={readOnly}
								documents={wikiLinkDocs}
								onCreateDocument={makeCreateDocument(me)}
							/>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup>
					<SidebarCollaboration docId={docId} />
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup className="flex-1">
					<SidebarAssets
						assets={sidebarAssets}
						readOnly={readOnly}
						onUploadImages={makeUploadAssets(doc)}
						onUploadVideo={async (file, opts) => {
							await makeUploadVideo(doc)(file, opts)
						}}
						onRename={makeRenameAsset(doc)}
						onDelete={makeDeleteAsset(doc, docWithContent)}
						onDownload={makeDownloadAsset(doc)}
						onInsert={(assetId, name) => {
							editor.current?.insertText(`![${name}](asset:${assetId})`)
						}}
						onToggleMute={assetId => {
							let asset = doc.assets?.find(a => a?.$jazz.id === assetId)
							if (asset?.$isLoaded && asset.type === "video") {
								asset.$jazz.applyDiff({ muteAudio: !asset.muteAudio })
							}
						}}
						isAssetUsed={makeIsAssetUsed(docWithContent)}
						canUploadVideo={canUploadVideo}
					/>
				</SidebarGroup>
			</DocumentSidebar>
		</>
	)
}

function SettingsButton() {
	let { needRefresh } = usePWA()
	let location = useLocation()
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						nativeButton={false}
						render={
							<Link to="/settings" search={{ from: location.pathname }} />
						}
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

type SpaceWithDocuments = co.loaded<
	typeof Space,
	{ documents: { $each: { content: true } } }
>

function makeCreateDocument(me: LoadedMe, space?: SpaceWithDocuments) {
	return async function handleCreateDocument(title: string): Promise<string> {
		if (!me.$isLoaded || !me.root?.documents)
			throw new Error("Not authenticated")

		if (space?.documents?.$isLoaded) {
			// Space context: create doc with its own group (space group as admin)
			let newDoc = createSpaceDocument(space.$jazz.owner, `# ${title}\n\n`)
			space.documents.$jazz.push(newDoc)
			return newDoc.$jazz.id
		}

		// Personal context: create new group per document
		let now = new Date()
		let group = Group.create()
		let newDoc = Document.create(
			{
				version: 1,
				content: co.plainText().create(`# ${title}\n\n`, group),
				createdAt: now,
				updatedAt: now,
			},
			group,
		)
		me.root.documents.$jazz.push(newDoc)
		return newDoc.$jazz.id
	}
}

function handleDuplicateDocument(
	doc: co.loaded<typeof Document, { content: true }>,
	me: LoadedMe,
	isMobile: boolean,
	setLeftOpenMobile: (open: boolean) => void,
	navigate: ReturnType<typeof useNavigate>,
) {
	if (!me.$isLoaded || !me.root?.documents?.$isLoaded) return
	let content = doc.content?.toString() ?? ""
	let newContent = addCopyToTitle(content)
	let now = new Date()
	let group = Group.create()
	let newDoc = Document.create(
		{
			version: 1,
			content: co.plainText().create(newContent, group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)
	me.root.documents.$jazz.push(newDoc)
	if (isMobile) setLeftOpenMobile(false)
	navigate({ to: "/doc/$id", params: { id: newDoc.$jazz.id } })
}

function getPersonalDocs(
	me: LoadedMe,
): co.loaded<typeof Document, { content: true }>[] {
	if (!me.$isLoaded) return []
	return [...me.root.documents].filter(d => d?.$isLoaded === true)
}
