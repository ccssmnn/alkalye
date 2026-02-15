import { co, FileStream, type ResolveQuery } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { useNavigate } from "@tanstack/react-router"
import { Asset, ImageAsset, VideoAsset, Document, UserAccount } from "@/schema"
import {
	compressVideo,
	canEncodeVideo,
	VideoCompressionError,
} from "@/lib/video-conversion"
import { getDocumentTitle } from "@/lib/document-utils"
import { copyDocumentToMyList } from "@/lib/documents"
import { saveDocumentAs } from "@/lib/export"
import { useCoState, useAccount } from "jazz-tools/react"
import { toast } from "sonner"

export {
	makeUploadImage,
	makeUploadVideo,
	makeUploadAssets,
	makeRenameAsset,
	makeIsAssetUsed,
	makeDeleteAsset,
	makeDownloadAsset,
	handleSaveCopy,
	setupKeyboardShortcuts,
	loaderResolve,
	resolve,
	settingsResolve,
	meResolve,
	canEncodeVideo,
	VideoCompressionError,
}
export type {
	LoadedDocument,
	MaybeDocWithContent,
	LoadedMe,
	VideoUploadProgress,
}

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

function makeUploadImage(doc: LoadedDocument) {
	return async function handleUploadImage(
		file: File,
	): Promise<{ id: string; name: string }> {
		let image = await createImage(file, {
			owner: doc.$jazz.owner,
			maxSize: 2048,
		})

		if (!doc.assets) {
			doc.$jazz.set("assets", co.list(Asset).create([], doc.$jazz.owner))
		}

		let asset = ImageAsset.create(
			{
				type: "image",
				name: file.name.replace(/\.[^.]+$/, ""),
				image,
				createdAt: new Date(),
			},
			doc.$jazz.owner,
		)

		doc.assets!.$jazz.push(asset)
		doc.$jazz.set("updatedAt", new Date())

		return { id: asset.$jazz.id, name: asset.name }
	}
}

type VideoUploadProgress = {
	phase: "compressing" | "uploading" | "done"
	progress: number
}

function makeUploadVideo(doc: LoadedDocument) {
	return async function handleUploadVideo(
		file: File,
		options: {
			onProgress?: (progress: VideoUploadProgress) => void
			signal?: AbortSignal
		} = {},
	): Promise<{ id: string; name: string }> {
		let { onProgress, signal } = options

		// Compress video
		let compressed = await compressVideo(file, {
			onProgress: p =>
				onProgress?.({ phase: "compressing", progress: p.progress }),
			signal,
		})

		// Upload to Jazz FileStream
		onProgress?.({ phase: "uploading", progress: 0 })
		let video = await FileStream.createFromBlob(compressed, {
			owner: doc.$jazz.owner,
			onProgress: p => onProgress?.({ phase: "uploading", progress: p }),
		})

		if (!doc.assets) {
			doc.$jazz.set("assets", co.list(Asset).create([], doc.$jazz.owner))
		}

		let asset = VideoAsset.create(
			{
				type: "video",
				name: file.name.replace(/\.[^.]+$/, ""),
				video,
				mimeType: "video/mp4",
				createdAt: new Date(),
			},
			doc.$jazz.owner,
		)

		doc.assets!.$jazz.push(asset)
		doc.$jazz.set("updatedAt", new Date())

		onProgress?.({ phase: "done", progress: 1 })
		return { id: asset.$jazz.id, name: asset.name }
	}
}

function makeUploadAssets(doc: LoadedDocument) {
	return async function handleUploadAssets(files: FileList) {
		for (let file of Array.from(files)) {
			if (!file.type.startsWith("image/")) continue

			let image = await createImage(file, {
				owner: doc.$jazz.owner,
				maxSize: 2048,
			})

			if (!doc.assets) {
				doc.$jazz.set("assets", co.list(Asset).create([], doc.$jazz.owner))
			}

			let asset = ImageAsset.create(
				{
					type: "image",
					name: file.name.replace(/\.[^.]+$/, ""),
					image,
					createdAt: new Date(),
				},
				doc.$jazz.owner,
			)

			doc.assets!.$jazz.push(asset)
		}

		doc.$jazz.set("updatedAt", new Date())
	}
}

function makeRenameAsset(doc: LoadedDocument) {
	return function handleRenameAsset(assetId: string, newName: string) {
		let asset = doc.assets?.find(a => a?.$jazz.id === assetId)
		if (asset?.$isLoaded) {
			asset.$jazz.applyDiff({ name: newName })
			doc.$jazz.set("updatedAt", new Date())
		}
	}
}

function makeIsAssetUsed(docWithContent: MaybeDocWithContent) {
	return function isAssetUsed(assetId: string): boolean {
		if (!docWithContent?.$isLoaded || !docWithContent.content) return false
		let content = docWithContent.content.toString()
		let regex = new RegExp(`!\\[[^\\]]*\\]\\(asset:${assetId}\\)`)
		return regex.test(content)
	}
}

function makeDeleteAsset(
	doc: LoadedDocument,
	docWithContent: MaybeDocWithContent,
) {
	return function handleDeleteAsset(assetId: string) {
		if (!doc.assets) return

		if (docWithContent?.$isLoaded && docWithContent.content) {
			let content = docWithContent.content.toString()
			let regex = new RegExp(`!\\[[^\\]]*\\]\\(asset:${assetId}\\)`, "g")
			let newContent = content.replace(regex, "")
			if (newContent !== content) {
				docWithContent.content.$jazz.applyDiff(newContent)
			}
		}

		let idx = doc.assets.findIndex(a => a?.$jazz.id === assetId)
		if (idx !== -1) {
			doc.assets.$jazz.splice(idx, 1)
			doc.$jazz.set("updatedAt", new Date())
		}
	}
}

function makeDownloadAsset(doc: LoadedDocument) {
	return async function handleDownloadAsset(assetId: string, name: string) {
		let asset = doc.assets?.find(a => a?.$jazz.id === assetId)
		if (!asset?.$isLoaded) return

		let blob: Blob | undefined
		if (asset.type === "image" && asset.image?.$isLoaded) {
			let original = asset.image.original
			if (original?.$isLoaded) {
				blob = original.toBlob()
			}
		} else if (asset.type === "video" && asset.video?.$isLoaded) {
			blob = await asset.video.toBlob()
		}

		if (!blob) return

		let url = URL.createObjectURL(blob)
		let a = document.createElement("a")
		a.href = url
		a.download = `${name}.${blob.type.split("/")[1] || "png"}`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)
	}
}

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
		toast("Alkalyte saves automatically", {
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
