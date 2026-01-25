import { useEffect, useRef, useState } from "react"
import {
	createFileRoute,
	useNavigate,
	useBlocker,
	Link,
	useLocation,
} from "@tanstack/react-router"
import { co, type ResolveQuery } from "jazz-tools"
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
	settingsResolve,
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
	SpaceDeleted,
	SpaceNotFound,
	SpaceUnauthorized,
} from "@/components/document-error-states"

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarSeparator,
} from "@/components/ui/sidebar"
import { canEdit, isDocumentPublic, getDocumentGroup } from "@/lib/documents"
import { useBacklinkSync } from "@/lib/backlink-sync"
import { usePresence } from "@/lib/presence"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { HelpCircle, Settings, Plus } from "lucide-react"

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

let Route = createFileRoute("/spaces/$spaceId/doc/$id/")({
	loader: async ({ params, context }) => {
		let [space, doc] = await Promise.all([
			Space.load(params.spaceId, { resolve: spaceResolve }),
			Document.load(params.id, { resolve }),
		])

		if (!space.$isLoaded) {
			return {
				space: null,
				doc: null,
				loadingState: space.$jazz.loadingState,
				me: null,
			}
		}

		if (!doc.$isLoaded) {
			return {
				space,
				doc: null,
				loadingState: doc.$jazz.loadingState,
				me: null,
			}
		}

		let me = context.me
			? await context.me.$jazz.ensureLoaded({ resolve: settingsResolve })
			: null

		return { space, doc, loadingState: null, me }
	},
	component: SpaceEditorPage,
})

function SpaceEditorPage() {
	let { spaceId, id } = Route.useParams()
	let data = Route.useLoaderData()
	let navigate = useNavigate()

	let space = useCoState(Space, spaceId, { resolve: spaceResolve })
	let doc = useCoState(Document, id, { resolve })

	let isSpaceDeleted = space.$jazz.loadingState === "deleted"
	let isDocDeleted = doc.$jazz.loadingState === "deleted"

	// Navigate away when space is deleted
	useEffect(() => {
		if (isSpaceDeleted) {
			navigate({ to: "/", replace: true })
		}
	}, [isSpaceDeleted, navigate])

	// Navigate away when doc is deleted
	useEffect(() => {
		if (isDocDeleted) {
			navigate({ to: `/spaces/${spaceId}`, replace: true })
		}
	}, [isDocDeleted, spaceId, navigate])

	// Space not found or unauthorized (from loader)
	if (!data.space) {
		if (data.loadingState === "unauthorized") return <SpaceUnauthorized />
		return <SpaceNotFound />
	}

	// Handle live access revocation or deletion (ignore "loading" state - use loader data as fallback)
	if (!space.$isLoaded && space.$jazz.loadingState !== "loading") {
		if (space.$jazz.loadingState === "unauthorized")
			return <SpaceUnauthorized />
		if (isSpaceDeleted) return null
		return <SpaceNotFound />
	}

	// Doc not found or unauthorized (from loader)
	if (!data.doc) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Handle live access revocation or deletion for doc
	if (!doc.$isLoaded && doc.$jazz.loadingState !== "loading") {
		if (doc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		if (isDocDeleted) return null
		return <DocumentNotFound />
	}

	// Space deleted
	if (space.$isLoaded && space.deletedAt) {
		return <SpaceDeleted />
	}

	// Use loader data as fallback while subscription is loading
	let loadedSpace = space.$isLoaded ? space : data.space
	let loadedDoc = doc.$isLoaded ? doc : data.doc

	return (
		<SidebarProvider>
			<SpaceEditorContent
				space={loadedSpace}
				doc={loadedDoc}
				spaceId={spaceId}
				docId={id}
			/>
		</SidebarProvider>
	)
}

function SpaceEditorContent({
	space,
	doc,
	spaceId,
	docId,
}: {
	space: LoadedSpace
	doc: LoadedDocument
	spaceId: string
	docId: string
}) {
	let navigate = useNavigate()
	let data = Route.useLoaderData()
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
	let me = useAccount(UserAccount, { resolve: spaceMeResolve })

	let editorSettings =
		me.$isLoaded && me.root?.settings?.$isLoaded
			? me.root.settings
			: data.me?.root?.settings

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

	// Get documents from the space for wikilinks
	let documents: WikilinkDoc[] = []
	if (space.documents?.$isLoaded) {
		documents = [...space.documents]
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

	let { syncBacklinks } = useBacklinkSync(docId, readOnly, { spaceId })
	useEditorSettings(editorSettings)
	useTrackLastOpened(me, doc)

	let content = doc.content?.toString() ?? ""
	let docTitle = getDocumentTitle(content)

	// Flush pending save when content changes (remote update arrived)
	// This prevents visual flicker where local changes disappear briefly
	useEffect(() => {
		if (!pendingSave.current || !doc.content) return
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

	let wikiLinkDocs: { id: string; title: string }[] = []
	if (space.documents?.$isLoaded) {
		for (let d of [...space.documents]) {
			if (!d?.$isLoaded || d.deletedAt || d.$jazz.id === docId) continue
			let title = getDocumentTitle(d)
			wikiLinkDocs.push({ id: d.$jazz.id, title })
		}
	}

	useBlocker({
		shouldBlockFn: () => {
			if (content !== "" || !space.documents?.$isLoaded) return false
			let docs = space.documents
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
			docWithContent,
		})
	}, [navigate, docId, toggleLeft, toggleRight, docWithContent])

	let allDocs = getSpaceDocs(space)
	let spaceDocs = space.documents?.$isLoaded ? space.documents : null

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
				doc.content?.$jazz.applyDiff(newContent)
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
								if (spaceDocs) await handleImportFiles(files, spaceDocs)
							}}
						/>
						<Button
							size="sm"
							nativeButton={false}
							render={
								<Link
									to="/new"
									search={{ spaceId }}
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
					if (spaceDocs) await handleImportFiles(files, spaceDocs)
				}}
			>
				<SpaceSelector />
				<SidebarDocumentList
					docs={allDocs}
					currentDocId={docId}
					isLoading={!space.documents?.$isLoaded}
					onDocClick={() => isMobile && setLeftOpenMobile(false)}
					onDuplicate={docToDuplicate =>
						handleDuplicateDocument(
							docToDuplicate,
							space,
							isMobile,
							setLeftOpenMobile,
							navigate,
							spaceId,
						)
					}
					onDelete={docToDelete => {
						docToDelete.$jazz.set("deletedAt", new Date())
						if (docToDelete.$jazz.id === docId) {
							navigate({ to: "/" })
						}
					}}
					spaceId={spaceId}
					spaceGroupId={space.$jazz.owner.$jazz.id}
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
					onCreateDocument={makeCreateDocument(space)}
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
						onNavigate={() => setRightOpenMobile(false)}
					/>
				}
			>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							<SidebarViewLinks doc={doc} />
							<SidebarSeparator />
							<SidebarFileMenu
								doc={doc}
								editor={editor}
								me={me.$isLoaded ? me : undefined}
								spaceId={spaceId}
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
								onCreateDocument={makeCreateDocument(space)}
							/>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup>
					<SidebarCollaboration
						docId={docId}
						spaceGroupId={space.$jazz.owner.$jazz.id}
					/>
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

function makeCreateDocument(space: LoadedSpace) {
	return async function handleCreateDocument(title: string): Promise<string> {
		if (!space.documents?.$isLoaded) throw new Error("Space not loaded")
		let newDoc = createSpaceDocument(space.$jazz.owner, `# ${title}\n\n`)
		space.documents.$jazz.push(newDoc)
		return newDoc.$jazz.id
	}
}

function handleDuplicateDocument(
	doc: co.loaded<typeof Document, { content: true }>,
	space: LoadedSpace,
	isMobile: boolean,
	setLeftOpenMobile: (open: boolean) => void,
	navigate: ReturnType<typeof useNavigate>,
	spaceId: string,
) {
	if (!space.documents?.$isLoaded) return
	let content = doc.content?.toString() ?? ""
	let newContent = addCopyToTitle(content)
	let newDoc = createSpaceDocument(space.$jazz.owner, newContent)
	space.documents.$jazz.push(newDoc)
	if (isMobile) setLeftOpenMobile(false)
	navigate({
		to: "/spaces/$spaceId/doc/$id",
		params: { spaceId, id: newDoc.$jazz.id },
	})
}

type LoadedSpace = co.loaded<typeof Space, typeof spaceResolve>

let spaceResolve = {
	documents: { $each: { content: true } },
} as const satisfies ResolveQuery<typeof Space>

// For space route: load personal docs (for SidebarFileMenu) but NOT spaces
// Space docs come from spaceResolve
let spaceMeResolve = {
	root: {
		documents: { $each: { content: true } },
		settings: true,
	},
} as const

function getSpaceDocs(
	space: LoadedSpace,
): co.loaded<typeof Document, { content: true }>[] {
	if (!space.documents?.$isLoaded) return []
	return [...space.documents].filter(d => d?.$isLoaded === true)
}
