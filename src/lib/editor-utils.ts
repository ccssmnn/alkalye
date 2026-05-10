import { co, type ResolveQuery } from "jazz-tools"
import { useNavigate } from "@tanstack/react-router"
import { Document, UserAccount } from "@/schema"
import { getDocumentTitle } from "@/lib/document-utils"
import { copyDocumentToMyList } from "@/lib/documents"
import { saveDocumentAs } from "@/app/features/import-export"
import { useCoState, useAccount } from "jazz-tools/react"
import { toast } from "sonner"

export {
	handleSaveCopy,
	setupKeyboardShortcuts,
	loaderResolve,
	resolve,
	settingsResolve,
	meResolve,
}
export type { LoadedDocument, MaybeDocWithContent, LoadedMe }

type LoadedDocument = co.loaded<typeof Document, typeof resolve>
type MaybeDocWithContent = ReturnType<
	typeof useCoState<typeof Document, { content: true }>
>
type LoadedMe = ReturnType<
	typeof useAccount<typeof UserAccount, typeof meResolve>
>

let loaderResolve = {
	content: true,
	cursors: true,
	assets: true,
} as const satisfies ResolveQuery<typeof Document>

let resolve = {
	content: true,
	cursors: true,
	assets: { $each: { image: true, video: true } },
} as const satisfies ResolveQuery<typeof Document>

let settingsResolve = {
	root: { settings: true },
} as const satisfies ResolveQuery<typeof UserAccount>

let meResolve = {
	root: {
		documents: { $each: { content: true } },
		spaces: { $each: { documents: { $each: { content: true } } } },
		settings: true,
	},
} as const satisfies ResolveQuery<typeof UserAccount>

async function handleSaveCopy(
	doc: LoadedDocument,
	me: co.loaded<typeof UserAccount, { root: { documents: true } }>,
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
