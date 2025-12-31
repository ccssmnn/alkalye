import { EditorView, ViewPlugin } from "@codemirror/view"
import { isTouchDevice } from "@/lib/platform"

export { keyboardAwareScrollMargins, clickBelowContent, preventBrowserScroll }

interface VirtualKeyboard extends EventTarget {
	boundingRect: DOMRect
	overlaysContent: boolean
}

// Track virtual keyboard height for scroll margins
let keyboardHeight = 0
let keyboardViews = new Set<EditorView>()

function updateKeyboardHeight(height: number) {
	let prevHeight = keyboardHeight
	keyboardHeight = height
	for (let view of keyboardViews) {
		view.requestMeasure()
		// Re-scroll cursor into view when keyboard appears
		if (height > 0 && prevHeight === 0) {
			let { head } = view.state.selection.main
			view.dispatch({
				effects: EditorView.scrollIntoView(head, { y: "nearest" }),
			})
		}
	}
}

if ("virtualKeyboard" in navigator) {
	// Chrome/Edge: use VirtualKeyboard API
	let vk = navigator.virtualKeyboard as VirtualKeyboard
	vk.overlaysContent = true
	vk.addEventListener("geometrychange", () => {
		updateKeyboardHeight(vk.boundingRect.height)
	})
} else if (window.visualViewport) {
	// Safari/iOS: infer keyboard height from viewport resize
	// Track max viewport height (before keyboard) since innerHeight shrinks with keyboard on iOS
	let vv = window.visualViewport
	let maxViewportHeight = vv.height
	vv.addEventListener("resize", () => {
		if (vv.height > maxViewportHeight) {
			maxViewportHeight = vv.height
		}
		let keyboardH = maxViewportHeight - vv.height
		updateKeyboardHeight(keyboardH > 50 ? keyboardH : 0)
	})
}

let keyboardAwareScrollMargins = ViewPlugin.fromClass(
	class {
		view: EditorView
		constructor(view: EditorView) {
			this.view = view
			keyboardViews.add(view)
		}
		destroy() {
			keyboardViews.delete(this.view)
		}
	},
	{
		provide: () =>
			EditorView.scrollMargins.of(() => ({
				top: 100,
				bottom: isTouchDevice()
					? keyboardHeight > 0
						? keyboardHeight + 50
						: window.innerHeight * 0.5
					: 100,
			})),
	},
)

let clickBelowContent = ViewPlugin.fromClass(
	class {
		view: EditorView

		handleClick = (event: MouseEvent) => {
			let contentRect = this.view.contentDOM.getBoundingClientRect()
			if (event.clientY > contentRect.bottom) {
				event.preventDefault()
				let docLength = this.view.state.doc.length
				this.view.dispatch({
					selection: { anchor: docLength },
					effects: EditorView.scrollIntoView(docLength, { y: "nearest" }),
				})
				this.view.focus()
			}
		}

		constructor(view: EditorView) {
			this.view = view
			view.scrollDOM.addEventListener("click", this.handleClick)
		}

		update() {}

		destroy() {
			this.view.scrollDOM.removeEventListener("click", this.handleClick)
		}
	},
)

let preventBrowserScroll = ViewPlugin.fromClass(
	class {
		view: EditorView
		isTouchDevice: boolean

		handleScroll = () => {
			if (window.scrollY !== 0) {
				window.scrollTo(0, 0)
			}
		}

		handleFocus = () => {
			setTimeout(() => {
				let { head } = this.view.state.selection.main
				this.view.dispatch({
					effects: EditorView.scrollIntoView(head, { y: "nearest" }),
				})
			}, 300)
		}

		constructor(view: EditorView) {
			this.view = view
			this.isTouchDevice =
				"ontouchstart" in window || navigator.maxTouchPoints > 0

			if (this.isTouchDevice) {
				window.addEventListener("scroll", this.handleScroll)
				view.contentDOM.addEventListener("focus", this.handleFocus)
			}
		}

		update() {}

		destroy() {
			if (this.isTouchDevice) {
				window.removeEventListener("scroll", this.handleScroll)
				this.view.contentDOM.removeEventListener("focus", this.handleFocus)
			}
		}
	},
)
