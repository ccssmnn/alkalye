import { useRef, useState } from "react"
import { Group, co } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { Document, Asset, ImageAsset, VideoAsset } from "@/schema"
import { compressVideo, canEncodeVideo } from "@/lib/video-conversion"
import { getDocumentTitle } from "@/lib/document-utils"
import { getPath } from "@/editor/frontmatter"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Download, FileUp, MoreHorizontal, Upload } from "lucide-react"
import {
	importMarkdownFiles,
	resolveWikilinksForImport,
	type ImportedFile,
} from "@/lib/import"
import {
	exportDocumentsAsZip,
	transformWikilinksForExport,
	stripBacklinksFrontmatter,
	type ExportAsset,
} from "@/lib/export"
import {
	ImportProgressDialog,
	type ImportProgress,
} from "@/components/import-progress-dialog"
import type { LoadedDocument } from "@/components/sidebar-document-list"
import { Link } from "@tanstack/react-router"

export { SidebarImportExport, handleImportFiles }
export type { ImportOptions }

type DocumentList = co.loaded<ReturnType<typeof co.list<typeof Document>>>

type ImportOptions = {
	onProgress?: (progress: ImportProgress) => void
	signal?: AbortSignal
}

function SidebarImportExport({
	docs: activeDocs,
	onImport,
}: {
	docs: LoadedDocument[]
	onImport: (files: ImportedFile[], options?: ImportOptions) => Promise<void>
}) {
	let fileInputRef = useRef<HTMLInputElement>(null)
	let [importProgress, setImportProgress] = useState<ImportProgress | null>(
		null,
	)
	let [abortController, setAbortController] = useState<AbortController | null>(
		null,
	)

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		if (e.target.files && e.target.files.length > 0) {
			let controller = new AbortController()
			setAbortController(controller)
			setImportProgress({
				phase: "reading",
				currentFile: "Reading files...",
				fileIndex: 0,
				totalFiles: 1,
				assetIndex: 0,
				totalAssets: 0,
				compressionProgress: 0,
			})

			try {
				let imported = await importMarkdownFiles(e.target.files)
				if (controller.signal.aborted) return

				await onImport(imported, {
					onProgress: setImportProgress,
					signal: controller.signal,
				})
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") {
					// Cancelled
				} else {
					console.error("Import failed:", err)
				}
			} finally {
				setImportProgress(null)
				setAbortController(null)
			}
		}
		e.target.value = ""
	}

	function handleCancelImport() {
		abortController?.abort()
		setImportProgress(null)
		setAbortController(null)
	}

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept=".md,.markdown,.txt,.zip"
				multiple
				className="hidden"
				onChange={handleFileChange}
			/>
			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger
						render={
							<DropdownMenuTrigger
								render={
									<Button size="icon-sm" variant="ghost" nativeButton>
										<MoreHorizontal className="size-4" />
									</Button>
								}
							/>
						}
					/>
					<TooltipContent side="bottom">Import & Export</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end">
					<DropdownMenuItem render={<Link to="/local" />}>
						<FileUp />
						Open Local File
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
						<Download />
						Import
					</DropdownMenuItem>
					{activeDocs.length > 0 && (
						<DropdownMenuItem onClick={() => handleExportDocs(activeDocs)}>
							<Upload />
							Export all
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{importProgress && (
				<ImportProgressDialog
					open={true}
					progress={importProgress}
					onCancel={handleCancelImport}
				/>
			)}
		</>
	)
}

async function handleImportFiles(
	imported: ImportedFile[],
	targetDocs: DocumentList,
	options: ImportOptions = {},
) {
	let { onProgress, signal } = options
	let listOwner = targetDocs.$jazz.owner

	// Phase 1: Create all documents and collect their info for wikilink resolution
	let createdDocs: {
		doc: co.loaded<typeof Document>
		title: string
		path: string | null
	}[] = []

	for (let fileIndex = 0; fileIndex < imported.length; fileIndex++) {
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

		let { name, content, assets: importedAssets, path } = imported[fileIndex]
		let now = new Date()
		let title = name.replace(/\.(md|markdown|txt)$/i, "")

		onProgress?.({
			phase: "creating",
			currentFile: title,
			fileIndex,
			totalFiles: imported.length,
			assetIndex: 0,
			totalAssets: importedAssets.length,
			compressionProgress: 0,
		})

		let processedContent = content
		let hasFrontmatter = content.trimStart().startsWith("---")

		if (!hasFrontmatter) {
			let pathLine = path ? `path: ${path}\n` : ""
			processedContent = `---\ntitle: ${title}\n${pathLine}---\n\n${content}`
		} else if (path) {
			let existingPath = getPath(content)
			if (!existingPath) {
				processedContent = content.replace(/^(---\r?\n)/, `$1path: ${path}\n`)
			}
		}

		// Create doc-specific group with list owner as parent
		let docGroup = Group.create()
		docGroup.addMember(listOwner)

		let docAssets: co.loaded<typeof Asset>[] = []
		for (let assetIndex = 0; assetIndex < importedAssets.length; assetIndex++) {
			if (signal?.aborted) throw new DOMException("Aborted", "AbortError")

			let importedAsset = importedAssets[assetIndex]
			let isVideo = importedAsset.file.type.startsWith("video/")
			let asset: co.loaded<typeof Asset>

			if (isVideo) {
				// Compress video if supported, otherwise use original
				let videoBlob: Blob = importedAsset.file
				if (await canEncodeVideo()) {
					onProgress?.({
						phase: "compressing",
						currentFile: importedAsset.name,
						fileIndex,
						totalFiles: imported.length,
						assetIndex,
						totalAssets: importedAssets.length,
						compressionProgress: 0,
					})
					try {
						videoBlob = await compressVideo(importedAsset.file, {
							onProgress: p =>
								onProgress?.({
									phase: "compressing",
									currentFile: importedAsset.name,
									fileIndex,
									totalFiles: imported.length,
									assetIndex,
									totalAssets: importedAssets.length,
									compressionProgress: p.progress,
								}),
							signal,
						})
					} catch {
						// Fall back to original if compression fails (but not if cancelled)
						if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
					}
				}
				let video = await co.fileStream().createFromBlob(videoBlob, {
					owner: docGroup,
				})
				asset = VideoAsset.create(
					{
						type: "video",
						name: importedAsset.name,
						video,
						mimeType: "video/mp4",
						createdAt: now,
					},
					docGroup,
				)
			} else {
				let image = await createImage(importedAsset.file, {
					owner: docGroup,
					maxSize: 2048,
				})
				asset = ImageAsset.create(
					{ type: "image", name: importedAsset.name, image, createdAt: now },
					docGroup,
				)
			}
			docAssets.push(asset)

			if (importedAsset.refName) {
				let escapedRef = importedAsset.refName.replace(
					/[.*+?^${}()|[\]\\]/g,
					"\\$&",
				)
				processedContent = processedContent.replace(
					new RegExp(`!\\[([^\\]]*)\\]\\(${escapedRef}\\)`, "g"),
					`![$1](asset:${asset.$jazz.id})`,
				)
			}
		}

		let newDoc = Document.create(
			{
				version: 1,
				content: co.plainText().create(processedContent, docGroup),
				assets:
					docAssets.length > 0
						? co.list(Asset).create(docAssets, docGroup)
						: undefined,
				createdAt: now,
				updatedAt: now,
			},
			docGroup,
		)

		targetDocs.$jazz.push(newDoc)
		createdDocs.push({ doc: newDoc, title, path })
	}

	// Phase 2: Resolve wikilinks now that all docs exist with their new IDs
	let docInfoForResolution = createdDocs.map(d => ({
		title: d.title,
		path: d.path,
		newId: d.doc.$jazz.id,
	}))

	for (let { doc, path } of createdDocs) {
		if (!doc.content?.$isLoaded) continue
		let currentContent = doc.content.toString()
		let resolvedContent = resolveWikilinksForImport(
			currentContent,
			path,
			docInfoForResolution,
		)
		if (resolvedContent !== currentContent) {
			doc.content.$jazz.applyDiff(resolvedContent)
		}
	}
}

// --- Helpers ---

async function handleExportDocs(docs: LoadedDocument[]) {
	if (docs.length === 0) return

	// Build doc info map for wikilink transformation
	let docPathInfo = docs.map(d => ({
		id: d.$jazz.id,
		title: getDocumentTitle(d),
		path: getPath(d.content?.toString() ?? ""),
	}))

	let exportDocs: {
		title: string
		content: string
		assets?: ExportAsset[]
		path?: string | null
	}[] = []

	for (let d of docs) {
		let content = d.content?.toString() ?? ""
		let docPath = getPath(content)

		// Transform wikilinks and strip backlinks
		let transformedContent = transformWikilinksForExport(
			content,
			docPath,
			docPathInfo,
		)
		transformedContent = stripBacklinksFrontmatter(transformedContent)

		let docAssets = await loadDocumentAssets(d)
		exportDocs.push({
			title: getDocumentTitle(d),
			content: transformedContent,
			assets: docAssets.length > 0 ? docAssets : undefined,
			path: docPath,
		})
	}

	if (exportDocs.length > 0) {
		await exportDocumentsAsZip(exportDocs)
	}
}

async function loadDocumentAssets(
	doc: co.loaded<typeof Document>,
): Promise<ExportAsset[]> {
	let loaded = await doc.$jazz.ensureLoaded({
		resolve: { assets: { $each: { image: true, video: true } } },
	})
	let docAssets: ExportAsset[] = []

	if (loaded.assets?.$isLoaded) {
		for (let asset of [...loaded.assets]) {
			if (!asset?.$isLoaded) continue

			if (asset.type === "image" && asset.image?.$isLoaded) {
				let original = asset.image.original
				if (!original?.$isLoaded) continue
				let blob = original.toBlob()
				if (blob) {
					docAssets.push({ id: asset.$jazz.id, name: asset.name, blob })
				}
			} else if (asset.type === "video" && asset.video?.$isLoaded) {
				let blob = asset.video.toBlob()
				if (blob) {
					docAssets.push({ id: asset.$jazz.id, name: asset.name, blob })
				}
			}
		}
	}

	return docAssets
}
