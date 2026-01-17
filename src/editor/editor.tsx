import { useImperativeHandle, useEffect, useRef, useState } from "react"
import { diff } from "fast-myers-diff"
import { ImageOff } from "lucide-react"
import { useDocTitles } from "@/lib/doc-resolver"
import { parseWikiLinks } from "./wikilink-parser"
import {
	EditorState,
	Compartment,
	type Extension,
	Prec,
} from "@codemirror/state"
import {
	EditorView,
	keymap,
	placeholder as placeholderExt,
	highlightActiveLine,
} from "@codemirror/view"
import {
	deleteMarkupBackward,
	markdown,
	markdownLanguage,
} from "@codemirror/lang-markdown"
import { languages } from "@codemirror/language-data"
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentLess,
	indentMore,
	redo,
	undo,
} from "@codemirror/commands"
import { syntaxTree } from "@codemirror/language"
import { useNavigate } from "@tanstack/react-router"
import { Image as JazzImage } from "jazz-tools/react"
import { editorExtensions } from "./extensions"
import { createPresenceExtension, dispatchRemoteCursors } from "@/lib/presence"
import {
	insertCodeBlock,
	insertImage,
	insertLink,
	insertNewlineContinueMarkupTight,
	moveLineDown,
	moveLineUp,
	setBody,
	setHeadingLevel,
	sortTasks,
	toggleBlockquote,
	toggleBold,
	toggleBulletList,
	toggleInlineCode,
	toggleItalic,
	toggleOrderedList,
	toggleStrikethrough,
	toggleTaskCompleteWithSort,
	toggleTaskList,
} from "./commands"
import { createBracketsExtension } from "./autocomplete-brackets"
import { createLinkDecorations } from "./link-decorations"
import { createWikilinkDecorations } from "./wikilink-decorations"
import { createBacklinkDecorations } from "./backlink-decorations"
import { createImageDecorations } from "./image-decorations"

import { useIsMobile } from "@/lib/use-mobile"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	FloatingActions,
	TaskAction,
	LinkAction,
	ImageAction,
	WikiLinkAction,
	type FloatingActionsRef,
} from "@/components/floating-actions"

export { MarkdownEditor, useMarkdownEditorRef }
export { parseFrontmatter } from "./frontmatter"
export type { MarkdownEditorProps, MarkdownEditorRef, WikilinkDoc }

type WikilinkDoc = {
	id: string
	title: string
	path?: string | null
	tags?: string[]
}

type RemoteCursor = {
	id: string
	sessionId: string
	name: string
	color: string
	position: number
	selectionEnd?: number
}

type Asset = {
	id: string
	name: string
	imageId?: string
}

interface MarkdownEditorProps {
	// Core
	value: string
	onChange: (content: string) => void

	// Cursor/focus callbacks
	onCursorChange?: (from: number, to: number) => void
	onFocus?: () => void
	onBlur?: () => void

	// Data for decorations (optional = feature detection)
	assets?: Asset[]
	documents?: WikilinkDoc[]
	remoteCursors?: RemoteCursor[]

	// Callbacks (optional = feature detection)
	onCreateDocument?: (title: string) => Promise<string>
	onUploadImage?: (file: File) => Promise<{ id: string; name: string }>

	// Config
	placeholder?: string
	readOnly?: boolean
	className?: string
	autoSortTasks?: boolean
}

interface MarkdownEditorRef {
	getContent(): string
	setContent(markdown: string): void
	focus(): void
	insertText(text: string): void

	getSelection(): { from: number; to: number } | null
	restoreSelection(selection: { from: number; to: number }): void

	getScrollPosition(): { top: number; left: number }
	setScrollPosition(position: { top: number; left: number }): void

	undo(): void
	redo(): void
	cut(): void
	copy(): void
	paste(): void

	toggleBold(): void
	toggleItalic(): void
	toggleStrikethrough(): void
	toggleInlineCode(): void
	setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void
	toggleBulletList(): void
	toggleOrderedList(): void
	toggleTaskList(): void
	toggleTaskComplete(): void
	toggleBlockquote(): void
	setBody(): void
	insertLink(): void
	insertImage(): void
	insertCodeBlock(): void

	indent(): void
	outdent(): void
	moveLineUp(): void
	moveLineDown(): void

	sortTasks(): void

	getLinkAtCursor(): string | null
	getEditor(): EditorView | null
	refreshDecorations(): void
}

function useMarkdownEditorRef() {
	return useRef<MarkdownEditorRef>(null)
}

function MarkdownEditor(
	props: MarkdownEditorProps & { ref?: React.Ref<MarkdownEditorRef> },
) {
	let {
		value,
		onChange,
		onCursorChange,
		onFocus,
		onBlur,
		assets,
		documents,
		remoteCursors,
		onCreateDocument,
		onUploadImage,
		placeholder,
		readOnly,
		className,
		autoSortTasks,
		ref,
	} = props

	let navigate = useNavigate()
	let isMobile = useIsMobile()

	let lastExternalValue = useRef(value)
	let containerRef = useRef<HTMLDivElement>(null)
	let readOnlyCompartment = useRef(new Compartment())
	let floatingActionsRef = useRef<FloatingActionsRef>(null)
	let [view, setView] = useState<EditorView | null>(null)
	let [isFocused, setIsFocused] = useState(false)
	let [imagePreviewOpen, setImagePreviewOpen] = useState(false)
	let [imagePreview, setImagePreview] = useState<{
		url: string
		alt: string
		imageId: string | null
	} | null>(null)

	let callbacksRef = useRef({ onChange, onCursorChange, onFocus, onBlur })
	let dataRef = useRef({ assets, documents })
	let autoSortRef = useRef(autoSortTasks ?? false)

	useEffect(() => {
		callbacksRef.current = { onChange, onCursorChange, onFocus, onBlur }
	})

	useEffect(() => {
		autoSortRef.current = autoSortTasks ?? false
	}, [autoSortTasks])

	useEffect(() => {
		dataRef.current = { assets, documents }
	})

	let titleCache = new Map<string, { title: string; exists: boolean }>()
	if (documents) {
		for (let doc of documents) {
			titleCache.set(doc.id, { title: doc.title, exists: true })
		}
	}
	let titleCacheRef = useRef(titleCache)
	useEffect(() => {
		titleCacheRef.current = titleCache
	})

	let links = parseWikiLinks(value)
	let externalWikilinkIds = [
		...new Set(links.map(l => l.id).filter(id => !titleCache.has(id))),
	]

	let externalDocs = useDocTitles(externalWikilinkIds)

	let wikilinkResolver = (id: string) => {
		let local = titleCacheRef.current.get(id)
		if (local) return local

		let external = externalDocs.get(id)
		if (external) return { title: external.title, exists: external.exists }

		return undefined
	}

	let imageResolver = (assetId: string) => {
		let asset = dataRef.current.assets?.find(a => a.id === assetId)
		if (!asset) return undefined
		return `asset:${assetId}`
	}

	let handleImagePreview = (url: string, alt: string) => {
		let imageId: string | null = null
		if (url.startsWith("asset:")) {
			imageId = url.slice(6)
		}
		setImagePreview({ url, alt, imageId })
		setImagePreviewOpen(true)
	}

	let handleWikilinkNavigate = (id: string, newTab: boolean) => {
		if (newTab) {
			window.open(`/doc/${id}`, "_blank")
		} else {
			navigate({ to: "/doc/$id", params: { id } })
		}
	}

	let wikilinkResolverRef = useRef(wikilinkResolver)
	useEffect(() => {
		wikilinkResolverRef.current = wikilinkResolver
	})

	let initRef = useRef({
		value,
		placeholder,
		readOnly,
		isMobile,
	})

	useEffect(() => {
		if (!containerRef.current) return

		let extensions: Extension[] = [
			history(),
			keymap.of([...defaultKeymap, ...historyKeymap]),
			Prec.highest(
				keymap.of([
					{ key: "Mod-b", run: toggleBold, preventDefault: true },
					{ key: "Mod-i", run: toggleItalic, preventDefault: true },
					{ key: "Mod-e", run: toggleInlineCode, preventDefault: true },
					{ key: "Mod-k", run: insertLink, preventDefault: true },
					{ key: "Alt-Mod-k", run: insertImage, preventDefault: true },
					{
						key: "Mod-Shift-x",
						run: toggleStrikethrough,
						preventDefault: true,
					},
					{ key: "Alt-Mod-1", run: setHeadingLevel(1), preventDefault: true },
					{ key: "Alt-Mod-2", run: setHeadingLevel(2), preventDefault: true },
					{ key: "Alt-Mod-3", run: setHeadingLevel(3), preventDefault: true },
					{ key: "Alt-Mod-4", run: setHeadingLevel(4), preventDefault: true },
					{ key: "Alt-Mod-5", run: setHeadingLevel(5), preventDefault: true },
					{ key: "Alt-Mod-6", run: setHeadingLevel(6), preventDefault: true },
					{ key: "Alt-Mod-0", run: setBody, preventDefault: true },
					{ key: "Alt-Mod-l", run: toggleBulletList, preventDefault: true },
					{ key: "Alt-Mod-o", run: toggleOrderedList, preventDefault: true },
					{
						key: "Alt-Mod-Shift-l",
						run: toggleTaskList,
						preventDefault: true,
					},
					{
						key: "Alt-Mod-x",
						run: view => toggleTaskCompleteWithSort(autoSortRef.current)(view),
						preventDefault: true,
					},
					{ key: "Alt-Mod-Shift-x", run: sortTasks, preventDefault: true },
					{ key: "Alt-Mod-q", run: toggleBlockquote, preventDefault: true },
					{ key: "Alt-Mod-c", run: insertCodeBlock, preventDefault: true },
					{ key: "Alt-Mod-ArrowUp", run: moveLineUp, preventDefault: true },
					{
						key: "Alt-Mod-ArrowDown",
						run: moveLineDown,
						preventDefault: true,
					},
					{
						key: "Tab",
						run: indentMore,
						preventDefault: true,
					},
					{
						key: "Shift-Tab",
						run: indentLess,
						preventDefault: true,
					},
					{
						key: "Enter",
						run: insertNewlineContinueMarkupTight,
					},
					{
						key: "Backspace",
						run: deleteMarkupBackward,
					},
					{
						key: "Ctrl-Space",
						run: () => {
							floatingActionsRef.current?.triggerContextAction()
							return true
						},
						preventDefault: true,
					},
				]),
			),
			markdown({
				base: markdownLanguage,
				codeLanguages: languages,
				addKeymap: false,
			}),
			editorExtensions,
			highlightActiveLine(),
			EditorView.lineWrapping,
			EditorView.updateListener.of(update => {
				if (update.docChanged && callbacksRef.current.onChange) {
					callbacksRef.current.onChange(update.state.doc.toString())
				}
				if (update.selectionSet && callbacksRef.current.onCursorChange) {
					let { from, to } = update.state.selection.main
					callbacksRef.current.onCursorChange(from, to)
				}
				if (update.focusChanged) {
					let focused = update.view.hasFocus
					setIsFocused(focused)
					if (focused) {
						callbacksRef.current.onFocus?.()
					} else {
						callbacksRef.current.onBlur?.()
					}
				}
			}),
			// Feature extensions
			createPresenceExtension(),
			createBracketsExtension(),
			createLinkDecorations(),
			createWikilinkDecorations(
				id => wikilinkResolverRef.current(id),
				handleWikilinkNavigate,
			),
			createBacklinkDecorations(
				id => wikilinkResolverRef.current(id),
				handleWikilinkNavigate,
			),
			createImageDecorations(imageResolver, handleImagePreview),
		]

		if (initRef.current.placeholder) {
			extensions.push(placeholderExt(initRef.current.placeholder))
		}

		extensions.push(
			readOnlyCompartment.current.of(
				initRef.current.readOnly ? EditorState.readOnly.of(true) : [],
			),
		)

		let state = EditorState.create({
			doc: initRef.current.value,
			extensions,
		})

		let editorView = new EditorView({
			state,
			parent: containerRef.current,
		})

		setView(editorView)

		return () => {
			editorView.destroy()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once
	}, [])

	useEffect(() => {
		if (view && remoteCursors) {
			dispatchRemoteCursors(view, remoteCursors)
		}
	}, [view, remoteCursors])

	useEffect(() => {
		if (!view) return

		let currentContent = view.state.doc.toString()
		if (value !== currentContent && value !== lastExternalValue.current) {
			// Same document with remote changes - diff to preserve cursor
			let cursorPos = view.state.selection.main.head
			let anchorPos = view.state.selection.main.anchor

			let changes: { from: number; to: number; insert: string }[] = []
			for (let [fromA, toA, fromB, toB] of diff(currentContent, value)) {
				changes.push({
					from: fromA,
					to: toA,
					insert: value.slice(fromB, toB),
				})
			}

			if (changes.length > 0) {
				let tr = view.state.update({ changes })
				let newCursorPos = tr.changes.mapPos(cursorPos, 1)
				let newAnchorPos = tr.changes.mapPos(anchorPos, 1)
				view.dispatch({
					changes,
					selection: { anchor: newAnchorPos, head: newCursorPos },
				})
			}
		}
		lastExternalValue.current = value
	}, [value, view])

	useEffect(() => {
		if (view) {
			view.dispatch({ selection: view.state.selection })
		}
	}, [view, documents, externalDocs])

	useEffect(() => {
		if (!view) return
		view.dispatch({
			effects: readOnlyCompartment.current.reconfigure(
				readOnly ? EditorState.readOnly.of(true) : [],
			),
		})
	}, [view, readOnly])

	function getContent() {
		return view?.state.doc.toString() ?? ""
	}

	function setContent(content: string) {
		if (!view) return
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: content },
		})
	}

	function focus() {
		view?.focus()
	}

	function insertText(text: string) {
		if (!view) return
		let { from, to } = view.state.selection.main
		view.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length },
		})
	}

	function runCommand(cmd: (view: EditorView) => boolean) {
		if (!view) return
		cmd(view)
		view.focus()
	}

	function getLinkAtCursor(): string | null {
		if (!view) return null
		let state = view.state
		let pos = state.selection.main.head
		let tree = syntaxTree(state)
		let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
			pos,
			-1,
		)

		while (node) {
			if (node.name === "Link") {
				let urlNode = node.getChild("URL")
				if (urlNode) {
					return state.sliceDoc(urlNode.from, urlNode.to)
				}
				let linkText = state.sliceDoc(node.from, node.to)
				let match = linkText.match(/\[([^\]]*)\]\(([^)]*)\)/)
				if (match) {
					return match[2]
				}
				return null
			}
			node = node.parent
		}
		return null
	}

	function refreshDecorations() {
		if (view) {
			view.dispatch({ selection: view.state.selection })
		}
	}

	async function handleUploadAndInsert(
		file: File,
		replaceRange: { from: number; to: number },
	) {
		if (!onUploadImage || !view) return

		let result = await onUploadImage(file)
		let newText = `![${result.name}](asset:${result.id})`
		view.dispatch({
			changes: {
				from: replaceRange.from,
				to: replaceRange.to,
				insert: newText,
			},
		})
	}

	useImperativeHandle(ref, () => ({
		getContent,
		setContent,
		focus,
		insertText,
		getSelection: () => {
			if (!view) return null
			let { from, to } = view.state.selection.main
			return { from, to }
		},
		restoreSelection: (selection: { from: number; to: number }) => {
			if (!view) return
			view.focus()
			view.dispatch({
				selection: { anchor: selection.from, head: selection.to },
			})
		},
		getScrollPosition: () => {
			if (!view) return { top: 0, left: 0 }
			return {
				top: view.scrollDOM.scrollTop,
				left: view.scrollDOM.scrollLeft,
			}
		},
		setScrollPosition: (position: { top: number; left: number }) => {
			if (!view) return
			view.scrollDOM.scrollTop = position.top
			view.scrollDOM.scrollLeft = position.left
		},
		undo: () => {
			if (view) {
				undo(view)
				view.focus()
			}
		},
		redo: () => {
			if (view) {
				redo(view)
				view.focus()
			}
		},
		cut: () => {
			if (!view) return
			let { from, to } = view.state.selection.main
			if (from === to) return
			let text = view.state.sliceDoc(from, to)
			navigator.clipboard.writeText(text)
			view.dispatch({
				changes: { from, to, insert: "" },
				selection: { anchor: from },
			})
			view.focus()
		},
		copy: () => {
			if (!view) return
			let { from, to } = view.state.selection.main
			if (from === to) return
			let text = view.state.sliceDoc(from, to)
			navigator.clipboard.writeText(text)
			view.focus()
		},
		paste: async () => {
			if (!view) return
			let text = await navigator.clipboard.readText()
			let { from, to } = view.state.selection.main
			view.dispatch({
				changes: { from, to, insert: text },
				selection: { anchor: from + text.length },
			})
			view.focus()
		},
		toggleBold: () => runCommand(toggleBold),
		toggleItalic: () => runCommand(toggleItalic),
		toggleStrikethrough: () => runCommand(toggleStrikethrough),
		toggleInlineCode: () => runCommand(toggleInlineCode),
		setHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) =>
			runCommand(setHeadingLevel(level)),
		toggleBulletList: () => runCommand(toggleBulletList),
		toggleOrderedList: () => runCommand(toggleOrderedList),
		toggleTaskList: () => runCommand(toggleTaskList),
		toggleTaskComplete: () =>
			runCommand(toggleTaskCompleteWithSort(autoSortRef.current)),
		toggleBlockquote: () => runCommand(toggleBlockquote),
		setBody: () => runCommand(setBody),
		insertLink: () => runCommand(insertLink),
		insertImage: () => runCommand(insertImage),
		insertCodeBlock: () => runCommand(insertCodeBlock),
		indent: () => {
			if (view) {
				indentMore(view)
				view.focus()
			}
		},
		outdent: () => {
			if (view) {
				indentLess(view)
				view.focus()
			}
		},
		moveLineUp: () => runCommand(moveLineUp),
		moveLineDown: () => runCommand(moveLineDown),
		sortTasks: () => runCommand(sortTasks),
		getLinkAtCursor,
		getEditor: () => view,
		refreshDecorations,
	}))

	let internalRef = useRef<MarkdownEditorRef | null>(null)
	useEffect(() => {
		internalRef.current = {
			getContent,
			setContent,
			focus,
			insertText,
			getSelection: () => {
				if (!view) return null
				let { from, to } = view.state.selection.main
				return { from, to }
			},
			restoreSelection: () => {},
			getScrollPosition: () => ({ top: 0, left: 0 }),
			setScrollPosition: () => {},
			undo: () => {},
			redo: () => {},
			cut: () => {},
			copy: () => {},
			paste: async () => {},
			toggleBold: () => {},
			toggleItalic: () => {},
			toggleStrikethrough: () => {},
			toggleInlineCode: () => {},
			setHeading: () => {},
			toggleBulletList: () => {},
			toggleOrderedList: () => {},
			toggleTaskList: () => {},
			toggleTaskComplete: () => {
				if (view) {
					toggleTaskCompleteWithSort(autoSortRef.current)(view)
					view.focus()
				}
			},
			toggleBlockquote: () => {},
			setBody: () => {},
			insertLink: () => {},
			insertImage: () => {},
			insertCodeBlock: () => {},
			indent: () => {},
			outdent: () => {},
			moveLineUp: () => {},
			moveLineDown: () => {},
			sortTasks: () => {},
			getLinkAtCursor,
			getEditor: () => view,
			refreshDecorations,
		}
	})

	return (
		<>
			<div ref={containerRef} className={className} />

			<FloatingActions
				editor={internalRef}
				focused={isFocused}
				readOnly={readOnly}
				docs={documents}
				actionsRef={floatingActionsRef}
			>
				{ctx => (
					<>
						<TaskAction editor={internalRef} {...ctx.task} />
						<LinkAction {...ctx.link} />
						<WikiLinkAction
							editor={internalRef}
							{...ctx.wikiLink}
							docs={documents ?? []}
							onCreateDoc={onCreateDocument}
						/>
						<ImageAction
							editor={internalRef}
							{...ctx.image}
							assets={assets ?? []}
							onUploadAndInsert={
								onUploadImage ? handleUploadAndInsert : undefined
							}
						/>
					</>
				)}
			</FloatingActions>

			<Dialog
				open={imagePreviewOpen}
				onOpenChange={setImagePreviewOpen}
				onOpenChangeComplete={open => {
					if (!open) setImagePreview(null)
				}}
			>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>{imagePreview?.alt ?? "Image"}</DialogTitle>
					</DialogHeader>
					{imagePreview &&
						(imagePreview.imageId ? (
							(() => {
								let asset = assets?.find(a => a.id === imagePreview.imageId)
								if (!asset?.imageId) {
									return (
										<div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-12">
											<ImageOff className="size-12 opacity-50" />
											<p className="text-sm">Image not available</p>
										</div>
									)
								}
								return (
									<JazzImage
										imageId={asset.imageId}
										className="max-h-[70vh] w-full object-contain"
									/>
								)
							})()
						) : (
							<img
								src={imagePreview.url}
								alt={imagePreview.alt}
								className="max-h-[70vh] w-full object-contain"
							/>
						))}
				</DialogContent>
			</Dialog>
		</>
	)
}
