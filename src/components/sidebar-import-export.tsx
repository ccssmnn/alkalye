import { useRef } from "react"
import { Group, co } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { Document, Asset } from "@/schema"
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
import { Download, MoreHorizontal, Upload } from "lucide-react"
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
import type { LoadedDocument } from "@/components/sidebar-document-list"

export { SidebarImportExport, handleImportFiles }

function SidebarImportExport({
	docs: activeDocs,
	onImport,
}: {
	docs: LoadedDocument[]
	onImport: (files: ImportedFile[]) => Promise<void>
}) {
	let fileInputRef = useRef<HTMLInputElement>(null)

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		if (e.target.files) {
			let imported = await importMarkdownFiles(e.target.files)
			await onImport(imported)
		}
		e.target.value = ""
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
		</>
	)
}

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

async function handleImportFiles(
	imported: ImportedFile[],
	targetDocs: DocumentList,
) {
	let listOwner = targetDocs.$jazz.owner

	// Phase 1: Create all documents and collect their info for wikilink resolution
	let createdDocs: {
		doc: co.loaded<typeof Document>
		title: string
		path: string | null
	}[] = []

	for (let { name, content, assets: importedAssets, path } of imported) {
		let now = new Date()

		let processedContent = content
		let hasFrontmatter = content.trimStart().startsWith("---")
		let title = name.replace(/\.(md|markdown|txt)$/i, "")

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
		for (let importedAsset of importedAssets) {
			let image = await createImage(importedAsset.file, {
				owner: docGroup,
				maxSize: 2048,
			})
			let asset = Asset.create(
				{ type: "image", name: importedAsset.name, image, createdAt: now },
				docGroup,
			)
			docAssets.push(asset)

			let escapedRef = importedAsset.refName.replace(
				/[.*+?^${}()|[\]\\]/g,
				"\\$&",
			)
			processedContent = processedContent.replace(
				new RegExp(`!\\[([^\\]]*)\\]\\(${escapedRef}\\)`, "g"),
				`![$1](asset:${asset.$jazz.id})`,
			)
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

type DocumentList = co.loaded<ReturnType<typeof co.list<typeof Document>>>

// --- Utilities ---

async function loadDocumentAssets(
	doc: co.loaded<typeof Document>,
): Promise<ExportAsset[]> {
	let loaded = await doc.$jazz.ensureLoaded({
		resolve: { assets: { $each: { image: true } } },
	})
	let docAssets: ExportAsset[] = []

	if (loaded.assets?.$isLoaded) {
		for (let asset of [...loaded.assets]) {
			if (!asset?.$isLoaded || !asset.image?.$isLoaded) continue
			let original = asset.image.original
			if (!original?.$isLoaded) continue
			let blob = original.toBlob()
			if (blob) {
				docAssets.push({ id: asset.$jazz.id, name: asset.name, blob })
			}
		}
	}

	return docAssets
}
