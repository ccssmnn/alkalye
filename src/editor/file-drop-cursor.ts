import { EditorView, ViewPlugin } from "@codemirror/view"
import { type Extension } from "@codemirror/state"

export { fileDropCursor }

// Custom drop cursor for file drags. The built-in dropCursor() attaches
// its observers to .cm-content, so it never fires when the drag is over
// .cm-scroller whitespace (margins, area below the last line). This plugin
// attaches listeners directly to view.scrollDOM, which covers the entire
// editor area.
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

		measure() {
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

		draw(rect: { left: number; top: number; height: number } | null) {
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

function fileDropCursor(): Extension {
	return [fileDropCursorPlugin, fileDropCursorTheme]
}
