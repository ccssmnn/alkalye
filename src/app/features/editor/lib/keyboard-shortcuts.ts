import type { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { getDocumentTitle } from "@/lib/document-utils"
import { saveDocumentAs } from "@/app/features/import-export"
import type { MaybeDocWithContent } from "@/lib/editor-utils"

export { setupKeyboardShortcuts }

function setupKeyboardShortcuts(opts: {
	navigate: ReturnType<typeof useNavigate>
	docId: string
	toggleLeft: () => void
	toggleRight: () => void
	toggleFocusMode: () => void
	openFind?: () => void
	onPrintPdf?: () => void
	docWithContent: MaybeDocWithContent
}) {
	function downloadCurrentDocument() {
		if (!opts.docWithContent?.$isLoaded) return
		let title = getDocumentTitle(opts.docWithContent)
		saveDocumentAs(opts.docWithContent.content?.toString() ?? "", title)
	}

	function showAutosaveToast() {
		toast("Alkalye saves automatically", {
			description:
				"Changes are saved locally and synced to the cloud while you type.",
			action: {
				label: "Download",
				onClick: downloadCurrentDocument,
			},
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
			opts.navigate({
				to: "/doc/$id/preview",
				params: { id: opts.docId },
				search: { from: undefined },
			})
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
