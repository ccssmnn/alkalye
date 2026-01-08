import { useEffect, useRef, useState } from "react"
import {
	createFileRoute,
	useNavigate,
	useBlocker,
	Link,
} from "@tanstack/react-router"
import { co, Group, type ResolveQuery } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { useCoState, useAccount, useIsAuthenticated } from "jazz-tools/react"
import {
	Asset,
	Document,
	Space,
	UserAccount,
	createSpaceDocument,
} from "@/schema"
import {
	MarkdownEditor,
	useMarkdownEditorRef,
	type WikilinkDoc,
} from "@/editor/editor"
import "@/editor/editor.css"
import { useEditorSettings } from "@/lib/editor-settings"
import { getDocumentTitle } from "@/lib/document-utils"
import { getPath, getTags } from "@/editor/frontmatter"
import { EditorToolbar } from "@/components/editor-toolbar"
import { DocumentSidebar } from "@/components/document-sidebar"
import { ListSidebar } from "@/components/list-sidebar"
import { SidebarDocumentList } from "@/components/sidebar-document-list"
import { SpaceSelector } from "@/components/space-selector"
import { SidebarSyncStatus } from "@/components/sidebar-sync-status"
import { ImportDropZone } from "@/components/import-drop-zone"
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
	SidebarSeparator,
} from "@/components/ui/sidebar"
import {
	canEdit,
	isDocumentPublic,
	copyDocumentToMyList,
	getDocumentGroup,
} from "@/lib/documents"
import { deletePersonalDocument } from "@/lib/documents"
import { useBacklinkSync } from "@/lib/backlink-sync"
import { usePresence } from "@/lib/presence"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { HelpCircle, Loader2, Settings, Plus } from "lucide-react"
import { saveDocumentAs } from "@/lib/export"
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

export { Route }

let Route = createFileRoute("/doc/$id/")({
	loader: async ({ params, context }) => {
		let doc = await Document.load(params.id, { resolve: loaderResolve })
		if (!doc.$isLoaded) {
			return { doc: null, loadingState: doc.$jazz.loadingState, me: null }
		}

		let me = context.me
			? await context.me.$jazz.ensureLoaded({ resolve: settingsResolve })
			: null

		return { doc, loadingState: null, me }
	},
	component: EditorPage,
})

function EditorPage() {
	let { id } = Route.useParams()
	let data = Route.useLoaderData()
	let navigate = useNavigate()

	let doc = useCoState(Document, id, { resolve })

	// Redirect to space route if doc belongs to a space
	useEffect(() => {
		if (data.doc?.spaceId) {
			navigate({
				to: "/spaces/$spaceId/doc/$id",
				params: { spaceId: data.doc.spaceId, id },
				replace: true,
			})
		}
	}, [data.doc?.spaceId, id, navigate])

	if (!data.doc) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Show loading while redirecting to space route
	if (data.doc.spaceId) {
		return (
			<Empty className="h-screen">
				<EmptyHeader>
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<EmptyTitle>Loading document...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	if (!doc.$isLoaded && doc.$jazz.loadingState !== "loading") {
		if (doc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	if (!doc.$isLoaded) {
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

function EditorContent({ doc, docId }: { doc: LoadedDocument; docId: string }) {
	let navigate = useNavigate()
	let data = Route.useLoaderData()
	let editor = useMarkdownEditorRef()
	let containerRef = useRef<HTMLDivElement>(null)
	let [saveCopyState, setSaveCopyState] = useState<"idle" | "saving" | "saved">(
		"idle",
	)

	let { theme, setTheme } = useTheme()
	let { toggleLeft, toggleRight, isMobile, setLeftOpenMobile } = useSidebar()

	let isAuthenticated = useIsAuthenticated()
	let me = useAccount(UserAccount, { resolve: meResolve })

	let editorSettings =
		me.$isLoaded && me.root?.settings?.$isLoaded
			? me.root.settings
			: data.me?.root?.settings

	let readOnly = !canEdit(doc)
	let canSaveCopy =
		isAuthenticated &&
		isDocumentPublic(doc) &&
		getDocumentGroup(doc)?.myRole() !== "admin"

	let { updateCursor, remoteCursors } = usePresence({ doc })
	let assets = doc.assets?.map(a => ({ id: a.$jazz.id, name: a.name })) ?? []

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

	let content = doc.content?.toString() ?? ""
	let docTitle = getDocumentTitle(content)

	let docWithContent = useCoState(Document, docId, {
		resolve: { content: true },
	})

	let sidebarAssets: SidebarAsset[] =
		doc.assets
			?.filter(a => a?.$isLoaded)
			.map(a => ({
				id: a.$jazz.id,
				name: a.name,
				imageId: a.image?.$jazz.id,
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
			docWithContent,
		})
	}, [navigate, docId, toggleLeft, toggleRight, docWithContent])

	let allDocs = getPersonalDocs(me)

	let personalDocs =
		me.$isLoaded && me.root?.documents?.$isLoaded ? me.root.documents : null

	return (
		<>
			<title>{docTitle}</title>
			<ImportDropZone
				onImport={async files => {
					if (personalDocs) await handleImportFiles(files, personalDocs)
				}}
			>
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
			</ImportDropZone>
			<div className="markdown-editor flex-1" ref={containerRef}>
				<MarkdownEditor
					ref={editor}
					value={content}
					onChange={newContent => {
						handleChange(doc, newContent)
						syncBacklinks(newContent)
					}}
					onCursorChange={(from, to) =>
						updateCursor(from, from !== to ? to : undefined)
					}
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
						canSaveCopy
							? () => handleSaveCopy(doc, me, setSaveCopyState, navigate)
							: undefined
					}
					saveCopyState={saveCopyState}
				/>
			</div>
			<DocumentSidebar
				header={
					<>
						<ThemeToggle theme={theme} setTheme={setTheme} />
						<SettingsButton pathname={location.pathname} />
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
							/>
							<SidebarEditMenu editor={editor} disabled={readOnly} />
							<SidebarFormatMenu
								editor={editor}
								disabled={readOnly}
								documents={wikiLinkDocs}
								onCreateDocument={makeCreateDocForWikilink(me, doc)}
							/>
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup>
					<SidebarCollaboration docId={docId} />
				</SidebarGroup>

				<SidebarSeparator />

				<SidebarGroup>
					<SidebarAssets
						assets={sidebarAssets}
						readOnly={readOnly}
						onUpload={makeUploadAssets(doc)}
						onRename={makeRenameAsset(doc)}
						onDelete={makeDeleteAsset(doc, docWithContent)}
						onInsert={(assetId, name) => {
							editor.current?.insertText(`![${name}](asset:${assetId})`)
						}}
						isAssetUsed={makeIsAssetUsed(docWithContent)}
					/>
				</SidebarGroup>
			</DocumentSidebar>
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

function makeUploadImage(doc: LoadedDocument) {
	return async function handleUploadImage(
		file: File,
	): Promise<{ id: string; name: string }> {
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
		doc.$jazz.set("updatedAt", new Date())

		return { id: asset.$jazz.id, name: asset.name }
	}
}

function makeUploadAssets(doc: LoadedDocument) {
	return async function handleUploadAssets(files: FileList) {
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
}

function makeRenameAsset(doc: LoadedDocument) {
	return function handleRenameAsset(assetId: string, newName: string) {
		let asset = doc.assets?.find(a => a?.$jazz.id === assetId)
		if (asset?.$isLoaded) {
			asset.$jazz.set("name", newName)
			doc.$jazz.set("updatedAt", new Date())
		}
	}
}

function makeCreateDocForWikilink(me: LoadedMe, doc: LoadedDocument) {
	return async function handleCreateDocForWikilink(
		title: string,
	): Promise<string> {
		if (!me.$isLoaded || !me.root?.documents?.$isLoaded)
			throw new Error("Not ready")
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
}

function makeIsAssetUsed(docWithContent: MaybeDocWithContent) {
	return function isAssetUsed(assetId: string): boolean {
		if (!docWithContent?.$isLoaded || !docWithContent.content) return false
		let content = docWithContent.content.toString()
		let regex = new RegExp(`!\\[[^\\]]*\\]\\(asset:${assetId}\\)`)
		return regex.test(content)
	}
}

function makeDeleteAsset(
	doc: LoadedDocument,
	docWithContent: MaybeDocWithContent,
) {
	return function handleDeleteAsset(assetId: string) {
		if (!doc.assets) return

		if (docWithContent?.$isLoaded && docWithContent.content) {
			let content = docWithContent.content.toString()
			let regex = new RegExp(`!\\[[^\\]]*\\]\\(asset:${assetId}\\)`, "g")
			let newContent = content.replace(regex, "")
			if (newContent !== content) {
				docWithContent.content.$jazz.applyDiff(newContent)
			}
		}

		let idx = doc.assets.findIndex(a => a?.$jazz.id === assetId)
		if (idx !== -1) {
			doc.assets.$jazz.splice(idx, 1)
			doc.$jazz.set("updatedAt", new Date())
		}
	}
}

function handleChange(doc: LoadedDocument, newContent: string) {
	if (!doc.content) return
	doc.content.$jazz.applyDiff(newContent)
	doc.$jazz.set("updatedAt", new Date())
}

async function handleSaveCopy(
	doc: LoadedDocument,
	me: LoadedMe,
	setSaveCopyState: (state: "idle" | "saving" | "saved") => void,
	navigate: ReturnType<typeof useNavigate>,
) {
	if (!me.$isLoaded) return
	setSaveCopyState("saving")

	try {
		let newDoc = await copyDocumentToMyList(doc, me)
		setSaveCopyState("saved")
		setTimeout(() => {
			navigate({ to: "/doc/$id", params: { id: newDoc.$jazz.id } })
		}, 1000)
	} catch (e) {
		console.error("Failed to save copy:", e)
		setSaveCopyState("idle")
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

function setupKeyboardShortcuts(opts: {
	navigate: ReturnType<typeof useNavigate>
	docId: string
	toggleLeft: () => void
	toggleRight: () => void
	toggleFocusMode: () => void
	docWithContent: MaybeDocWithContent
}) {
	function handleKeyDown(e: KeyboardEvent) {
		// Cmd+Alt+R: Preview
		if (
			(e.metaKey || e.ctrlKey) &&
			e.altKey &&
			(e.key.toLowerCase() === "r" || e.code === "KeyR")
		) {
			e.preventDefault()
			opts.navigate({
				to: "/doc/$id/preview",
				params: { id: opts.docId },
				search: { from: undefined },
			})
			return
		}
		// Cmd+Shift+E: Toggle left sidebar
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
			e.preventDefault()
			opts.toggleLeft()
			return
		}
		// Cmd+.: Toggle right sidebar
		if ((e.metaKey || e.ctrlKey) && e.key === ".") {
			e.preventDefault()
			opts.toggleRight()
			return
		}
		// Cmd+Shift+F: Toggle focus mode
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
			e.preventDefault()
			opts.toggleFocusMode()
			return
		}
		// Cmd+S: Save as
		if ((e.metaKey || e.ctrlKey) && e.key === "s") {
			e.preventDefault()
			if (!opts.docWithContent?.$isLoaded) return
			let title = getDocumentTitle(opts.docWithContent)
			saveDocumentAs(opts.docWithContent.content?.toString() ?? "", title)
		}
	}

	document.addEventListener("keydown", handleKeyDown)
	return () => document.removeEventListener("keydown", handleKeyDown)
}
type LoadedDocument = co.loaded<typeof Document, typeof resolve>
type MaybeDocWithContent = ReturnType<
	typeof useCoState<typeof Document, { content: true }>
>
type LoadedMe = ReturnType<
	typeof useAccount<typeof UserAccount, typeof meResolve>
>

let loaderResolve = {
	content: true,
	cursors: true,
	assets: true,
} as const satisfies ResolveQuery<typeof Document>

let resolve = {
	content: true,
	cursors: true,
	assets: { $each: { image: true } },
} as const satisfies ResolveQuery<typeof Document>

let settingsResolve = {
	root: { settings: true },
} as const satisfies ResolveQuery<typeof UserAccount>

let meResolve = {
	root: {
		documents: { $each: { content: true } },
		spaces: { $each: { documents: { $each: { content: true } } } },
		settings: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

function getPersonalDocs(
	me: LoadedMe,
): co.loaded<typeof Document, { content: true }>[] {
	if (!me.$isLoaded) return []
	return [...me.root.documents].filter(
		d => d?.$isLoaded === true && !d.permanentlyDeletedAt,
	)
}
