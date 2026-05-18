import { EditorView, ViewPlugin } from "@codemirror/view"
import { isTouchDevice } from "@/app/lib/platform"

export { keyboardAwareScrollMargins, clickBelowContent, preventBrowserScroll }

interface VirtualKeyboard extends EventTarget {
	boundingRect: DOMRect
	overlaysContent: boolean
}

// Track virtual keyboard height for scroll margins
let keyboardHeight = 0
let keyboardViews = new Set<EditorView>()
let keyboardSelectionMargin = 120

function updateKeyboardHeight(height: number) {
	keyboardHeight = height
	let scrollPadding = height > 0 ? height + keyboardSelectionMargin : 0
	document.documentElement.style.setProperty(
		"--keyboard-scroll-padding",
		`${scrollPadding}px`,
	)
	for (let view of keyboardViews) {
		view.requestMeasure()
		if (height > 0) scheduleSelectionCorrections(view)
	}
}

function scheduleSelectionCorrections(view: EditorView) {
	for (let delay of [80, 180, 320, 500]) {
		window.setTimeout(() => ensureSelectionAboveKeyboard(view), delay)
	}
}

function ensureSelectionAboveKeyboard(view: EditorView) {
	if (keyboardHeight <= 0 || !view.contentDOM.isConnected) return

	let coords = view.coordsAtPos(view.state.selection.main.head)
	if (!coords) return

	let visibleBottom = getVisibleViewportBottom()
	let targetBottom = visibleBottom - keyboardSelectionMargin
	if (coords.bottom <= targetBottom) return

	view.scrollDOM.scrollTop += coords.bottom - targetBottom
}

function getVisibleViewportBottom() {
	return window.innerHeight - keyboardHeight
}

// Listener setup runs only in real browsers — guards keep this module
// safe to import from CLI/test/Node contexts.
if (typeof window !== "undefined" && typeof navigator !== "undefined") {
	if ("virtualKeyboard" in navigator) {
		// Chrome/Edge: use VirtualKeyboard API
		let vk = navigator.virtualKeyboard as VirtualKeyboard
		vk.overlaysContent = true
		vk.addEventListener("geometrychange", () => {
			updateKeyboardHeight(vk.boundingRect.height)
		})
	} else if (window.visualViewport) {
		let vv = window.visualViewport
		let maxViewportHeight = vv.height
		vv.addEventListener("resize", () => {
			if (vv.height > maxViewportHeight) {
				maxViewportHeight = vv.height
			}

			let keyboardH = maxViewportHeight - vv.height
			let height = keyboardH > 50 ? keyboardH : 0
			updateKeyboardHeight(height)
		})
	}
}

let keyboardAwareScrollMargins = ViewPlugin.fromClass(
	class {
		view: EditorView
		constructor(view: EditorView) {
			this.view = view
			keyboardViews.add(view)
		}
		update(update: { selectionSet: boolean; focusChanged: boolean }) {
			if (keyboardHeight > 0 && (update.selectionSet || update.focusChanged)) {
				scheduleSelectionCorrections(this.view)
			}
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
						? keyboardHeight + keyboardSelectionMargin
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
				ensureSelectionAboveKeyboard(this.view)
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
