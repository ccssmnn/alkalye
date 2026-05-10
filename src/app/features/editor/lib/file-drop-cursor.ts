import { EditorView, ViewPlugin } from "@codemirror/view"
import { type Extension } from "@codemirror/state"

export { fileDropCursor, clearFileDropCursor }

type CursorRect = { left: number; top: number; height: number }

// Built-in dropCursor() binds to .cm-content, so file drags over scroller
// whitespace (margins, below the last line) never show a caret. We bind
// to scrollDOM so the cursor tracks across the entire editor area.
let fileDropCursorPlugin = ViewPlugin.fromClass(
	class {
		view: EditorView
		cursor: HTMLElement | null = null
		pos: number | null = null

		constructor(view: EditorView) {
			this.view = view
			view.scrollDOM.addEventListener("dragover", this.onDragOver)
			view.scrollDOM.addEventListener("dragleave", this.onDragLeave)
			view.scrollDOM.addEventListener("drop", this.onDrop)
			view.scrollDOM.addEventListener("dragend", this.onDragEnd)
		}

		onDragOver = (event: DragEvent) => {
			if (!event.dataTransfer?.types.includes("Files")) return
			let pos = this.view.posAtCoords({
				x: event.clientX,
				y: event.clientY,
			})
			this.setPos(pos ?? this.view.state.doc.length)
		}

		onDragLeave = (event: DragEvent) => {
			let related = event.relatedTarget
			if (related instanceof Node && this.view.scrollDOM.contains(related)) {
				return
			}
			this.setPos(null)
		}

		onDrop = () => this.setPos(null)
		onDragEnd = () => this.setPos(null)

		setPos(pos: number | null) {
			if (pos === this.pos) return
			this.pos = pos
			this.view.requestMeasure({
				read: () => this.measure(),
				write: rect => this.draw(rect),
			})
		}

		measure(): CursorRect | null {
			if (this.pos == null) return null
			let rect = this.view.coordsAtPos(this.pos)
			if (!rect) return null
			let outer = this.view.scrollDOM.getBoundingClientRect()
			return {
				left: rect.left - outer.left + this.view.scrollDOM.scrollLeft,
				top: rect.top - outer.top + this.view.scrollDOM.scrollTop,
				height: rect.bottom - rect.top,
			}
		}

		draw(rect: CursorRect | null) {
			if (!rect) {
				if (this.cursor) {
					this.cursor.remove()
					this.cursor = null
				}
				return
			}
			if (!this.cursor) {
				this.cursor = document.createElement("div")
				this.cursor.className = "cm-fileDropCursor"
				this.view.scrollDOM.appendChild(this.cursor)
			}
			this.cursor.style.left = rect.left + "px"
			this.cursor.style.top = rect.top + "px"
			this.cursor.style.height = rect.height + "px"
		}

		destroy() {
			this.view.scrollDOM.removeEventListener("dragover", this.onDragOver)
			this.view.scrollDOM.removeEventListener("dragleave", this.onDragLeave)
			this.view.scrollDOM.removeEventListener("drop", this.onDrop)
			this.view.scrollDOM.removeEventListener("dragend", this.onDragEnd)
			if (this.cursor) this.cursor.remove()
		}
	},
)

let fileDropCursorTheme = EditorView.theme({
	".cm-fileDropCursor": {
		position: "absolute",
		borderLeft: "2px solid var(--brand)",
		marginLeft: "-1px",
		pointerEvents: "none",
		zIndex: "10",
	},
})

let fileDropCursor: Extension = [fileDropCursorPlugin, fileDropCursorTheme]

// The container-level drop handler in editor.tsx calls stopPropagation, so
// the plugin's own drop/dragend listener on scrollDOM never fires. Callers
// that intercept the drop must clear the cursor explicitly.
function clearFileDropCursor(view: EditorView) {
	view.plugin(fileDropCursorPlugin)?.setPos(null)
}
