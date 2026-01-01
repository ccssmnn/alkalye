import { useEffect, useRef, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { co, Group, type ID, type ResolveQuery } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { useCoState, useAccount, useIsAuthenticated } from "jazz-tools/react"
import { Asset, Document, UserAccount, DEFAULT_EDITOR_SETTINGS } from "@/schema"
import { MarkdownEditor, useMarkdownEditorRef } from "@/editor/editor"
import "@/editor/editor.css"
import { createBracketsExtension } from "@/editor/autocomplete-brackets"
import {
	createWikilinkDecorations,
	createWikilinkAutocomplete,
	type WikilinkDoc,
} from "@/editor/extensions"
import { applyEditorSettings } from "@/lib/editor-settings"
import { getDocumentTitle } from "@/lib/document-utils"
import { getPath, getTags } from "@/editor/frontmatter"
import { EditorToolbar } from "@/components/editor-toolbar"
import { DocumentSidebar } from "@/components/document-sidebar"
import { ListSidebar } from "@/components/list-sidebar"
import {
	FloatingActions,
	TaskAction,
	LinkAction,
	ImageAction,
	WikiLinkAction,
} from "@/components/floating-actions"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/components/document-error-states"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
	canEdit,
	isGroupOwned,
	isDocumentPublic,
	copyDocumentToMyList,
	getDocumentGroup,
} from "@/lib/sharing"
import {
	usePresence,
	createPresenceExtension,
	dispatchRemoteCursors,
} from "@/lib/presence"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { Loader2 } from "lucide-react"

export { Route }

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

let Route = createFileRoute("/doc/$id/")({
	loader: async ({ params }) => {
		let doc = await Document.load(params.id as ID<typeof Document>, {
			resolve: loaderResolve,
		})
		if (!doc.$isLoaded) {
			return {
				doc: null,
				loadingState: doc.$jazz.loadingState as "unauthorized" | "unavailable",
			}
		}
		return { doc, loadingState: null }
	},
	component: EditorPage,
})

type LoadedDocument = co.loaded<typeof Document, typeof resolve>

function EditorPage() {
	let { id } = Route.useParams()
	let data = Route.useLoaderData()

	let doc = useCoState(Document, id, { resolve })

	if (!data.doc) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
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
	let editor = useMarkdownEditorRef()
	let containerRef = useRef<HTMLDivElement>(null)
	let [isFocused, setIsFocused] = useState(false)
	let [focusMode, setFocusMode] = useState(false)
	let [saveCopyState, setSaveCopyState] = useState<"idle" | "saving" | "saved">(
		"idle",
	)

	let { toggleLeft, toggleRight } = useSidebar()

	let isAuthenticated = useIsAuthenticated()
	let me = useAccount(UserAccount, {
		resolve: {
			root: {
				documents: { $each: { content: true } },
				settings: true,
			},
		},
	})

	let isShared = isGroupOwned(doc)
	let readOnly = !canEdit(doc)

	let canSaveCopy =
		isAuthenticated &&
		isDocumentPublic(doc) &&
		getDocumentGroup(doc)?.myRole() !== "admin"

	let { updateCursor, remoteCursors } = usePresence({
		doc,
		enabled: isShared,
	})

	let assets = doc.assets
		? doc.assets
				.filter(a => a?.$isLoaded)
				.map(a => ({ id: a!.$jazz.id, name: a!.name }))
		: []

	let editorSettings =
		me.$isLoaded && me.root?.settings?.$isLoaded
			? me.root.settings.editor
			: DEFAULT_EDITOR_SETTINGS

	// Get documents for wikilink autocomplete - use ref so closures get fresh data
	let wikilinkDocsRef = useRef<WikilinkDoc[]>([])
	let titleCacheRef = useRef<Map<string, { title: string; exists: boolean }>>(
		new Map(),
	)

	// Track if docs are loaded for wikilink resolution
	let docsLoaded = me.$isLoaded && me.root?.documents?.$isLoaded

	// Update refs when me changes
	if (me.$isLoaded) {
		let documents = me.root?.documents
		if (documents?.$isLoaded) {
			let docs = documents
				.filter(
					(d): d is co.loaded<typeof Document, { content: true }> =>
						d?.$isLoaded === true &&
						d.content !== undefined &&
						!d.deletedAt &&
						d.$jazz.id !== docId,
				)
				.map(d => {
					let content = d.content?.toString() ?? ""
					return {
						id: d.$jazz.id,
						title: getDocumentTitle(content),
						path: getPath(content),
						tags: getTags(content),
					}
				})
			wikilinkDocsRef.current = docs

			let cache = new Map<string, { title: string; exists: boolean }>()
			for (let d of docs) {
				cache.set(d.id, { title: d.title, exists: true })
			}
			titleCacheRef.current = cache
		}
	}

	// Force editor to rebuild decorations when docs load
	useEffect(() => {
		if (docsLoaded) {
			let view = editor.current?.getEditor()
			if (view) {
				// Trigger a no-op selection change to rebuild decorations
				view.dispatch({ selection: view.state.selection })
			}
		}
	}, [docsLoaded, editor])

	let wikilinkResolver = (id: string) => {
		return titleCacheRef.current.get(id) ?? null
	}

	let handleWikilinkNavigate = (id: string, newTab: boolean) => {
		if (newTab) {
			window.open(`/doc/${id}`, "_blank")
		} else {
			navigate({ to: "/doc/$id", params: { id } })
		}
	}

	let handleCreateDoc = async (title: string): Promise<string> => {
		if (!me.$isLoaded || !me.root?.documents) {
			throw new Error("Not authenticated")
		}
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

	let editorExtensions = [
		createPresenceExtension(),
		createBracketsExtension(),
		createWikilinkDecorations(wikilinkResolver, handleWikilinkNavigate),
		createWikilinkAutocomplete(() => wikilinkDocsRef.current, handleCreateDoc),
	]

	// Apply editor settings to CSS variables
	useEffect(() => {
		applyEditorSettings(editorSettings)
	}, [editorSettings])

	// Apply focus mode to document
	useEffect(() => {
		document.documentElement.dataset.focusMode = String(focusMode)
	}, [focusMode])

	function toggleFocusMode() {
		setFocusMode(prev => !prev)
	}

	let content = doc.content?.toString() ?? ""
	let docTitle = getDocumentTitle(content)

	useEffect(() => {
		document.title = docTitle
	}, [docTitle])

	useEffect(() => {
		let view = editor.current?.getEditor()
		if (!view || !isShared) return
		dispatchRemoteCursors(view, remoteCursors)
	}, [remoteCursors, isShared])

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Cmd+Alt+R: Preview
			if (
				(e.metaKey || e.ctrlKey) &&
				e.altKey &&
				(e.key.toLowerCase() === "r" || e.code === "KeyR")
			) {
				e.preventDefault()
				navigate({
					to: "/doc/$id/preview",
					params: { id: docId },
					search: { from: undefined },
				})
				return
			}

			// Cmd+Shift+E: Toggle left sidebar
			if (
				(e.metaKey || e.ctrlKey) &&
				e.shiftKey &&
				e.key.toLowerCase() === "e"
			) {
				e.preventDefault()
				toggleLeft()
				return
			}

			// Cmd+.: Toggle right sidebar
			if ((e.metaKey || e.ctrlKey) && e.key === ".") {
				e.preventDefault()
				toggleRight()
				return
			}

			// Cmd+Shift+F: Toggle focus mode
			if (
				(e.metaKey || e.ctrlKey) &&
				e.shiftKey &&
				e.key.toLowerCase() === "f"
			) {
				e.preventDefault()
				toggleFocusMode()
				return
			}

			if (readOnly) return
			if (isFocused) return
			if (e.metaKey || e.ctrlKey || e.altKey) return
			if (e.key.length !== 1) return
			let tag = (e.target as HTMLElement).tagName
			if (tag === "INPUT" || tag === "TEXTAREA") return

			let view = editor.current?.getEditor()
			if (view) {
				view.dispatch({ selection: { anchor: view.state.doc.length } })
				view.focus()
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [
		isFocused,
		readOnly,
		navigate,
		docId,
		toggleLeft,
		toggleRight,
		toggleFocusMode,
	])

	return (
		<>
			<ListSidebar />
			<div className="markdown-editor flex-1" ref={containerRef}>
				<MarkdownEditor
					ref={editor}
					value={content}
					onChange={newContent => handleChange(doc, newContent)}
					onSelectionChange={(from, to) =>
						handleSelectionChange(from, to, isShared, updateCursor)
					}
					onFocusChange={setIsFocused}
					placeholder="Start writing..."
					readOnly={readOnly}
					extensions={editorExtensions}
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
				<FloatingActions
					editor={editor}
					focused={isFocused}
					readOnly={readOnly}
				>
					{ctx => (
						<>
							<TaskAction editor={editor} {...ctx.task} />
							<LinkAction {...ctx.link} />
							<WikiLinkAction
								editor={editor}
								{...ctx.wikiLink}
								docs={wikilinkDocsRef.current}
								onCreateDoc={handleCreateDoc}
							/>
							<ImageAction
								editor={editor}
								{...ctx.image}
								assets={assets}
								onUploadAndInsert={(file, range) =>
									handleUploadAndInsert(doc, editor, file, range)
								}
							/>
						</>
					)}
				</FloatingActions>
			</div>
			<DocumentSidebar
				doc={doc}
				docId={docId}
				onInsertAsset={(assetId, name) =>
					handleInsertAsset(editor, assetId, name)
				}
				readOnly={readOnly}
				editor={editor}
				focusMode={focusMode}
				onFocusModeToggle={toggleFocusMode}
			/>
		</>
	)
}

function handleChange(doc: LoadedDocument, newContent: string) {
	if (!doc.content) return
	doc.content.$jazz.applyDiff(newContent)
	doc.$jazz.set("updatedAt", new Date())
}

function handleSelectionChange(
	from: number,
	to: number,
	isShared: boolean,
	updateCursor: (from: number, to?: number) => void,
) {
	if (isShared) {
		updateCursor(from, from !== to ? to : undefined)
	}
}

function handleInsertAsset(
	editor: ReturnType<typeof useMarkdownEditorRef>,
	assetId: string,
	name: string,
) {
	let markdown = `![${name}](asset:${assetId})`
	editor.current?.insertText(markdown)
}

async function handleUploadAndInsert(
	doc: LoadedDocument,
	editor: ReturnType<typeof useMarkdownEditorRef>,
	file: File,
	replaceRange: { from: number; to: number },
) {
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

	let view = editor.current?.getEditor()
	if (view) {
		let newText = `![${asset.name}](asset:${asset.$jazz.id})`
		view.dispatch({
			changes: {
				from: replaceRange.from,
				to: replaceRange.to,
				insert: newText,
			},
		})
	}
}

async function handleSaveCopy(
	doc: LoadedDocument,
	me: ReturnType<
		typeof useAccount<typeof UserAccount, { root: { documents: true } }>
	>,
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
