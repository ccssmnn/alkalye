import { toast } from "sonner"

export { setupKeyboardShortcuts }

function setupKeyboardShortcuts(opts: {
	toggleLeft: () => void
	toggleRight: () => void
	toggleFocusMode: () => void
	openFind?: () => void
	onPrintPdf?: () => void
	onPreview?: () => void
	onDownload?: () => void
}) {
	function showAutosaveToast() {
		toast("Alkalye saves automatically", {
			description:
				"Changes are saved locally and synced to the cloud while you type.",
			action: opts.onDownload
				? {
						label: "Download",
						onClick: opts.onDownload,
					}
				: undefined,
			id: "editor-save-shortcut",
		})
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (
			(e.metaKey || e.ctrlKey) &&
			e.altKey &&
			(e.key.toLowerCase() === "r" || e.code === "KeyR")
		) {
			e.preventDefault()
			opts.onPreview?.()
			return
		}
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "e") {
			e.preventDefault()
			opts.toggleLeft()
			return
		}
		if ((e.metaKey || e.ctrlKey) && e.key === ".") {
			e.preventDefault()
			opts.toggleRight()
			return
		}
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
			e.preventDefault()
			opts.toggleFocusMode()
			return
		}
		if (
			(e.metaKey || e.ctrlKey) &&
			!e.shiftKey &&
			e.key.toLowerCase() === "f"
		) {
			e.preventDefault()
			opts.openFind?.()
			return
		}
		if (
			(e.metaKey || e.ctrlKey) &&
			!e.shiftKey &&
			!e.altKey &&
			e.key.toLowerCase() === "p"
		) {
			e.preventDefault()
			opts.onPrintPdf?.()
			return
		}
		if ((e.metaKey || e.ctrlKey) && e.key === "s") {
			e.preventDefault()
			showAutosaveToast()
		}
	}

	document.addEventListener("keydown", handleKeyDown)
	return () => document.removeEventListener("keydown", handleKeyDown)
}
