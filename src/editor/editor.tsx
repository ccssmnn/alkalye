import {
	defaultKeymap,
	history,
	historyKeymap,
	indentLess,
	indentMore,
	redo,
	undo,
} from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { syntaxTree } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { EditorState, type Extension, Prec } from "@codemirror/state"
import {
	EditorView,
	highlightActiveLine,
	keymap,
	placeholder as placeholderExt,
} from "@codemirror/view"
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react"
import {
	indentListItems,
	insertCodeBlock,
	insertImage,
	insertLink,
	moveLineDown,
	moveLineUp,
	outdentListItems,
	setBody,
	setHeadingLevel,
	toggleBlockquote,
	toggleBold,
	toggleBulletList,
	toggleInlineCode,
	toggleItalic,
	toggleOrderedList,
	toggleStrikethrough,
	toggleTaskComplete,
	toggleTaskList,
} from "./commands"
import { editorExtensions } from "./extensions"

export { parseFrontmatter } from "./frontmatter"
export { MarkdownEditor, useMarkdownEditorRef }
export type { MarkdownEditorProps, MarkdownEditorRef }

interface MarkdownEditorProps {
	value?: string
	defaultValue?: string
	onChange?: (markdown: string) => void
	onSelectionChange?: (from: number, to: number) => void
	onFocusChange?: (focused: boolean) => void
	placeholder?: string
	autoFocus?: boolean
	readOnly?: boolean
	className?: string
	extensions?: Extension[]
}

interface MarkdownEditorRef {
	getContent(): string
	setContent(markdown: string): void
	focus(): void
	insertText(text: string): void

	getSelection(): { from: number; to: number } | null
	restoreSelection(selection: { from: number; to: number }): void

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

	getLinkAtCursor(): string | null
	getEditor(): EditorView | null
}

function useMarkdownEditorRef() {
	return useRef<MarkdownEditorRef>(null)
}

let MarkdownEditor = forwardRef<MarkdownEditorRef, MarkdownEditorProps>(
	function MarkdownEditor(props, ref) {
		let {
			value,
			defaultValue,
			onChange,
			onSelectionChange,
			onFocusChange,
			placeholder,
			autoFocus,
			readOnly,
			className,
			extensions: additionalExtensions,
		} = props

		let isControlled = value !== undefined
		let lastExternalValue = useRef(value ?? defaultValue ?? "")
		let containerRef = useRef<HTMLDivElement>(null)
		let [view, setView] = useState<EditorView | null>(null)
		let onChangeRef = useRef(onChange)
		let onSelectionChangeRef = useRef(onSelectionChange)
		let onFocusChangeRef = useRef(onFocusChange)

		useEffect(() => {
			onChangeRef.current = onChange
		}, [onChange])

		useEffect(() => {
			onSelectionChangeRef.current = onSelectionChange
		}, [onSelectionChange])

		useEffect(() => {
			onFocusChangeRef.current = onFocusChange
		}, [onFocusChange])

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
						{ key: "Alt-Mod-x", run: toggleTaskComplete, preventDefault: true },
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
							run: view => {
								if (indentListItems(view)) return true
								return indentMore(view)
							},
							preventDefault: true,
						},
						{
							key: "Shift-Tab",
							run: view => {
								if (outdentListItems(view)) return true
								return indentLess(view)
							},
							preventDefault: true,
						},
					]),
				),
				markdown({
					base: markdownLanguage,
					codeLanguages: languages,
				}),
				editorExtensions,
				highlightActiveLine(),
				EditorView.lineWrapping,
				EditorView.updateListener.of(update => {
					if (update.docChanged && onChangeRef.current) {
						onChangeRef.current(update.state.doc.toString())
					}
					if (update.selectionSet && onSelectionChangeRef.current) {
						let { from, to } = update.state.selection.main
						onSelectionChangeRef.current(from, to)
					}
					if (update.focusChanged && onFocusChangeRef.current) {
						onFocusChangeRef.current(update.view.hasFocus)
					}
				}),
			]

			if (additionalExtensions) {
				extensions.push(...additionalExtensions)
			}

			if (placeholder) {
				extensions.push(placeholderExt(placeholder))
			}

			if (readOnly) {
				extensions.push(EditorState.readOnly.of(true))
			}

			let state = EditorState.create({
				doc: value ?? defaultValue ?? "",
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
			// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally run once to initialize CodeMirror
		}, [])

		function getContent() {
			return view?.state.doc.toString() ?? ""
		}

		function setContent(content: string) {
			if (!view) return
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: content,
				},
			})
		}

		useEffect(() => {
			if (!isControlled || !view) return
			if (value === undefined) return

			let currentContent = view.state.doc.toString()
			if (value !== currentContent && value !== lastExternalValue.current) {
				let cursorPos = view.state.selection.main.head
				setContent(value)
				let newCursorPos = Math.min(cursorPos, value.length)
				view.dispatch({
					selection: { anchor: newCursorPos },
				})
			}
			lastExternalValue.current = value
			// eslint-disable-next-line react-hooks/exhaustive-deps -- setContent is stable when view is stable
		}, [value, view, isControlled])

		useEffect(() => {
			if (autoFocus && view) {
				view.focus()
			}
		}, [autoFocus, view])

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
			toggleTaskComplete: () => runCommand(toggleTaskComplete),
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
			getLinkAtCursor,
			getEditor: () => view,
		}))

		return <div ref={containerRef} className={className} />
	},
)
