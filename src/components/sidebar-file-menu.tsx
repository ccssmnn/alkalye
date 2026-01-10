import { useState, useSyncExternalStore } from "react"
import { useNavigate } from "@tanstack/react-router"
import { co, Group } from "jazz-tools"
import { useCoState } from "jazz-tools/react"
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
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { MoveToFolderDialog } from "@/components/move-to-folder-dialog"
import { MoveToSpaceDialog } from "@/components/move-to-space-dialog"
import { FileText } from "lucide-react"
import { modKey } from "@/lib/platform"
import { Document, UserAccount } from "@/schema"
import { canEdit, getDocumentGroup } from "@/lib/documents"
import { leavePersonalDocument } from "@/lib/documents"
import {
	parseFrontmatter,
	togglePinned,
	getFrontmatterRange,
	getPath,
} from "@/editor/frontmatter"
import { unfoldEffect } from "@codemirror/language"
import { getPresentationMode } from "@/lib/presentation"
import { getDocumentTitle, addCopyToTitle } from "@/lib/document-utils"
import { exportDocument, saveDocumentAs, type ExportAsset } from "@/lib/export"
import type { MarkdownEditorRef } from "@/editor/editor"

export { SidebarFileMenu }

// --- Types ---

type LoadedDocument = co.loaded<
	typeof Document,
	{ content: true; assets: { $each: { image: true } } }
>
type LoadedMe = co.loaded<
	typeof UserAccount,
	{ root: { documents: { $each: { content: true } }; settings: true } }
>
type MaybeDocWithContent = ReturnType<
	typeof useCoState<typeof Document, { content: true }>
>
type EditorRef = React.RefObject<MarkdownEditorRef | null>

interface SidebarFileMenuProps {
	doc: LoadedDocument
	editor: EditorRef
	me?: LoadedMe
	spaceId?: string
}

// --- Component ---

function SidebarFileMenu({ doc, editor, me, spaceId }: SidebarFileMenuProps) {
	let navigate = useNavigate()
	let { isMobile, setRightOpenMobile, setLeftOpenMobile } = useSidebar()

	let focusMode = useFocusMode()
	let [deleteOpen, setDeleteOpen] = useState(false)
	let [leaveOpen, setLeaveOpen] = useState(false)
	let [moveOpen, setMoveOpen] = useState(false)
	let [moveSpaceOpen, setMoveSpaceOpen] = useState(false)

	let docWithContent = useCoState(Document, doc.$jazz.id, {
		resolve: { content: true },
	})

	let content = doc.content?.toString() ?? ""
	let readOnly = !canEdit(doc)
	let docGroup = getDocumentGroup(doc)
	let isAdmin = docGroup?.myRole() === "admin"
	let isPinned = parseFrontmatter(content).frontmatter?.pinned === true
	let isPresentation = getPresentationMode(content)

	return (
		<>
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
						<DropdownMenuItem onClick={makeToggleFocusMode(focusMode)}>
							{focusMode ? "Exit Focus Mode" : "Focus Mode"}
							<DropdownMenuShortcut>{modKey}⇧F</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={makeOpenTimeMachine(
								doc,
								navigate,
								setLeftOpenMobile,
								setRightOpenMobile,
							)}
						>
							Time Machine
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={makeRename(editor, isMobile, setRightOpenMobile)}
							disabled={readOnly}
						>
							Rename
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={makeTogglePin(docWithContent)}
							disabled={readOnly}
						>
							{isPinned ? "Unpin" : "Pin"}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={makeAddTag(editor, isMobile, setRightOpenMobile)}
							disabled={readOnly}
						>
							Add Tag
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setMoveOpen(true)}
							disabled={readOnly || !me}
						>
							Move to Folder
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setMoveSpaceOpen(true)}
							disabled={!me}
						>
							Move to Space
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={makeTurnIntoPresentation(
								editor,
								isMobile,
								setRightOpenMobile,
							)}
							disabled={readOnly || isPresentation}
						>
							Turn into Presentation
						</DropdownMenuItem>
						<DropdownMenuItem onClick={makeDownload(doc, content)}>
							Download
						</DropdownMenuItem>
						<DropdownMenuItem onClick={makeSaveAs(content)}>
							Save as...
							<DropdownMenuShortcut>{modKey}S</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={makeDuplicate(doc, me, spaceId, navigate)}
						>
							Duplicate
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						{isAdmin ? (
							<DropdownMenuItem
								onClick={() => setDeleteOpen(true)}
								className="text-destructive focus:text-destructive"
							>
								Delete
							</DropdownMenuItem>
						) : (
							<DropdownMenuItem
								onClick={() => setLeaveOpen(true)}
								className="text-destructive focus:text-destructive"
								disabled={!me}
							>
								Leave
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>

			{docWithContent?.$isLoaded && me && (
				<MoveToFolderDialog
					doc={docWithContent}
					existingFolders={getExistingFolders(me)}
					open={moveOpen}
					onOpenChange={setMoveOpen}
				/>
			)}
			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title="Delete document?"
				description="This will move the document to trash. You can restore it later."
				confirmLabel="Delete"
				variant="destructive"
				onConfirm={makeDelete(doc, navigate)}
			/>
			<ConfirmDialog
				open={leaveOpen}
				onOpenChange={setLeaveOpen}
				title="Leave document?"
				description="You will lose access to this shared document."
				confirmLabel="Leave"
				variant="destructive"
				onConfirm={makeLeave(docWithContent, me, doc, navigate)}
			/>

			{docWithContent?.$isLoaded && (
				<MoveToSpaceDialog
					doc={docWithContent}
					open={moveSpaceOpen}
					onOpenChange={setMoveSpaceOpen}
					currentSpaceId={spaceId}
					onMove={makeMoveToSpace(navigate, spaceId)}
				/>
			)}
		</>
	)
}

// --- Hooks ---

function useFocusMode() {
	return useSyncExternalStore(
		callback => {
			let observer = new MutationObserver(callback)
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["data-focus-mode"],
			})
			return () => observer.disconnect()
		},
		() => document.documentElement.dataset.focusMode === "true",
	)
}

// --- Handler factories ---

function makeToggleFocusMode(focusMode: boolean) {
	return function handleToggleFocusMode() {
		document.documentElement.dataset.focusMode = String(!focusMode)
	}
}

function makeOpenTimeMachine(
	doc: LoadedDocument,
	navigate: ReturnType<typeof useNavigate>,
	setLeftOpenMobile: (open: boolean) => void,
	setRightOpenMobile: (open: boolean) => void,
) {
	return function handleOpenTimeMachine() {
		// Close sidebars before navigating
		setLeftOpenMobile(false)
		setRightOpenMobile(false)
		navigate({
			to: "/doc/$id/timemachine",
			params: { id: doc.$jazz.id },
		})
	}
}

function makeRename(
	editor: EditorRef,
	isMobile: boolean,
	setRightOpenMobile: (open: boolean, callback?: () => void) => void,
) {
	return function handleRename() {
		runWithMobileClose(isMobile, setRightOpenMobile, () => {
			let view = editor.current?.getEditor()
			if (!view) return

			let content = view.state.doc.toString()
			let { frontmatter, body } = parseFrontmatter(content)

			if (!frontmatter) {
				let inferredTitle = getInferredTitle(content)
				let newFrontmatter = `---\ntitle: ${inferredTitle}\n---\n\n`
				view.dispatch({ changes: { from: 0, to: 0, insert: newFrontmatter } })
				let titleStart = 4 + 7
				let titleEnd = titleStart + inferredTitle.length
				view.dispatch({ selection: { anchor: titleStart, head: titleEnd } })
				view.focus()
				return
			}

			if (!frontmatter.title) {
				let inferredTitle = getInferredTitle(body)
				let insertPos = 4
				let titleLine = `title: ${inferredTitle}\n`
				view.dispatch({
					changes: { from: insertPos, to: insertPos, insert: titleLine },
				})
				let range = getFrontmatterRange(view.state)
				if (range)
					view.dispatch({
						effects: unfoldEffect.of({ from: range.from, to: range.to }),
					})
				let titleStart = insertPos + 7
				let titleEnd = titleStart + inferredTitle.length
				view.dispatch({ selection: { anchor: titleStart, head: titleEnd } })
				view.focus()
				return
			}

			let range = getFrontmatterRange(view.state)
			if (range)
				view.dispatch({
					effects: unfoldEffect.of({ from: range.from, to: range.to }),
				})
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
		})
	}
}

function makeTogglePin(docWithContent: MaybeDocWithContent) {
	return function handleTogglePin() {
		if (!docWithContent?.$isLoaded || !docWithContent.content) return
		let content = docWithContent.content.toString()
		let newContent = togglePinned(content)
		docWithContent.content.$jazz.applyDiff(newContent)
		docWithContent.$jazz.set("updatedAt", new Date())
	}
}

function makeAddTag(
	editor: EditorRef,
	isMobile: boolean,
	setRightOpenMobile: (open: boolean, callback?: () => void) => void,
) {
	return function handleAddTag() {
		runWithMobileClose(isMobile, setRightOpenMobile, () => {
			let view = editor.current?.getEditor()
			if (!view) return

			let content = view.state.doc.toString()
			let { frontmatter } = parseFrontmatter(content)
			let tag = "your_tag"

			if (!frontmatter) {
				let newFrontmatter = `---\ntags: ${tag}\n---\n\n`
				view.dispatch({ changes: { from: 0, to: 0, insert: newFrontmatter } })
				let tagStart = 4 + 6
				let tagEnd = tagStart + tag.length
				view.dispatch({ selection: { anchor: tagStart, head: tagEnd } })
				view.focus()
				return
			}

			if (!frontmatter.tags) {
				let insertPos = 4
				let tagsLine = `tags: ${tag}\n`
				view.dispatch({
					changes: { from: insertPos, to: insertPos, insert: tagsLine },
				})
				let range = getFrontmatterRange(view.state)
				if (range)
					view.dispatch({
						effects: unfoldEffect.of({ from: range.from, to: range.to }),
					})
				let tagStart = insertPos + 6
				let tagEnd = tagStart + tag.length
				view.dispatch({ selection: { anchor: tagStart, head: tagEnd } })
				view.focus()
				return
			}

			let tagsMatch = content.match(/^(tags:\s*)(.*)$/m)
			if (tagsMatch) {
				let lineStart = content.indexOf(tagsMatch[0])
				let existingTags = tagsMatch[2]
				let insertPos = lineStart + tagsMatch[1].length + existingTags.length
				let insertText = existingTags ? `, ${tag}` : tag
				view.dispatch({
					changes: { from: insertPos, to: insertPos, insert: insertText },
				})
				let range = getFrontmatterRange(view.state)
				if (range)
					view.dispatch({
						effects: unfoldEffect.of({ from: range.from, to: range.to }),
					})
				let tagStart = insertPos + (existingTags ? 2 : 0)
				let tagEnd = tagStart + tag.length
				view.dispatch({ selection: { anchor: tagStart, head: tagEnd } })
				view.focus()
			}
		})
	}
}

function makeTurnIntoPresentation(
	editor: EditorRef,
	isMobile: boolean,
	setRightOpenMobile: (open: boolean, callback?: () => void) => void,
) {
	return function handleTurnIntoPresentation() {
		runWithMobileClose(isMobile, setRightOpenMobile, () => {
			let view = editor.current?.getEditor()
			if (!view) return

			let content = view.state.doc.toString()
			let { frontmatter } = parseFrontmatter(content)

			if (!frontmatter) {
				let newFrontmatter = `---\nmode: present\n---\n\n`
				view.dispatch({ changes: { from: 0, to: 0, insert: newFrontmatter } })
				view.focus()
				return
			}

			let insertPos = 4
			let modeLine = `mode: present\n`
			view.dispatch({
				changes: { from: insertPos, to: insertPos, insert: modeLine },
			})
			view.focus()
		})
	}
}

function makeDownload(doc: LoadedDocument, content: string) {
	return async function handleDownload() {
		let docAssets: ExportAsset[] = []
		if (doc.assets?.$isLoaded) {
			for (let asset of [...doc.assets]) {
				if (!asset?.$isLoaded || !asset.image?.$isLoaded) continue
				let original = asset.image.original
				if (!original?.$isLoaded) continue
				let blob = original.toBlob()
				if (blob) {
					docAssets.push({ id: asset.$jazz.id, name: asset.name, blob })
				}
			}
		}
		let title = getDocumentTitle(content)
		await exportDocument(
			content,
			title,
			docAssets.length > 0 ? docAssets : undefined,
		)
	}
}

function makeSaveAs(content: string) {
	return async function handleSaveAs() {
		let title = getDocumentTitle(content)
		await saveDocumentAs(content, title)
	}
}

function makeDelete(
	doc: LoadedDocument,
	navigate: ReturnType<typeof useNavigate>,
) {
	return function handleDelete() {
		doc.$jazz.set("deletedAt", new Date())
		navigate({ to: "/" })
	}
}

function makeLeave(
	docWithContent: MaybeDocWithContent,
	me: LoadedMe | undefined,
	doc: LoadedDocument,
	navigate: ReturnType<typeof useNavigate>,
) {
	return async function handleLeave() {
		if (!docWithContent?.$isLoaded || !me) return
		await leavePersonalDocument(docWithContent, me)
		let idx = me.root?.documents?.findIndex(d => d?.$jazz.id === doc.$jazz.id)
		if (idx !== undefined && idx !== -1 && me.root?.documents?.$isLoaded) {
			me.root.documents.$jazz.splice(idx, 1)
		}
		navigate({ to: "/" })
	}
}

function makeDuplicate(
	doc: LoadedDocument,
	me: LoadedMe | undefined,
	spaceId: string | undefined,
	navigate: ReturnType<typeof useNavigate>,
) {
	return function handleDuplicate() {
		if (!me?.root?.documents?.$isLoaded) return

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

		if (spaceId) {
			navigate({
				to: "/spaces/$spaceId/doc/$id",
				params: { spaceId, id: newDoc.$jazz.id },
			})
		} else {
			navigate({ to: "/doc/$id", params: { id: newDoc.$jazz.id } })
		}
	}
}

function makeMoveToSpace(
	navigate: ReturnType<typeof useNavigate>,
	currentSpaceId?: string,
) {
	return function handleMoveToSpace(
		destination: { id: string; name: string } | null,
	) {
		// Navigate to the document's new location
		// We need to get the doc ID from the current route, but since we're in a callback
		// the navigation will happen after the move completes
		if (destination) {
			// Get current doc ID from URL and navigate to new space location
			let docId = window.location.pathname.match(/\/doc\/([^/]+)/)?.[1]
			if (docId) {
				navigate({
					to: "/spaces/$spaceId/doc/$id",
					params: { spaceId: destination.id, id: docId },
				})
			}
		} else if (currentSpaceId) {
			// Moving from space to personal
			let docId = window.location.pathname.match(/\/doc\/([^/]+)/)?.[1]
			if (docId) {
				navigate({ to: "/doc/$id", params: { id: docId } })
			}
		}
	}
}

// --- Utilities ---

function runWithMobileClose(
	isMobile: boolean,
	setRightOpenMobile: (open: boolean, callback?: () => void) => void,
	fn: () => void,
) {
	if (isMobile) {
		setRightOpenMobile(false, fn)
	} else {
		requestAnimationFrame(fn)
	}
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

function getExistingFolders(me?: LoadedMe): string[] {
	if (!me?.root?.documents?.$isLoaded) return []

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
