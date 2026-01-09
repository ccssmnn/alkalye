import { useEffect, useRef } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { co, type ResolveQuery } from "jazz-tools"
import { useCoState, useAccount } from "jazz-tools/react"
import { Document, UserAccount } from "@/schema"
import { MarkdownEditor, useMarkdownEditorRef } from "@/editor/editor"
import "@/editor/editor.css"
import { useEditorSettings } from "@/lib/editor-settings"
import { getDocumentTitle } from "@/lib/document-utils"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/components/document-error-states"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { TimeMachineToolbar } from "@/components/time-machine-toolbar"
import {
	TimeMachineBottomBar,
	type ViewMode,
} from "@/components/time-machine-bottom-bar"
import {
	getEditHistory,
	getContentAtEdit,
	getAuthorName,
	formatEditDate,
	groupEditsByDay,
} from "@/lib/time-machine"
import { ConfirmDialog, useConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"
import type { ID } from "jazz-tools"
import { Loader2 } from "lucide-react"
import { SidebarProvider } from "@/components/ui/sidebar"

export { Route }

let Route = createFileRoute("/doc/$id/timemachine")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		edit?: number
		mode?: ViewMode
		day?: number
	} => {
		let mode: ViewMode | undefined
		if (search.mode === "days" || search.mode === "edits") {
			mode = search.mode
		}
		return {
			edit:
				typeof search.edit === "string" || typeof search.edit === "number"
					? Number(search.edit)
					: undefined,
			mode,
			day:
				typeof search.day === "string" || typeof search.day === "number"
					? Number(search.day)
					: undefined,
		}
	},
	loader: async ({ params, context }) => {
		let doc = await Document.load(params.id, { resolve: loaderResolve })
		if (!doc.$isLoaded) {
			return { doc: null, loadingState: doc.$jazz.loadingState, me: null }
		}

		let me = context.me
			? await context.me.$jazz.ensureLoaded({ resolve: settingsResolve })
			: null

		return { doc, loadingState: null, me }
	},
	component: TimeMachinePage,
})

function TimeMachinePage() {
	let { id } = Route.useParams()
	let data = Route.useLoaderData()
	let { edit, mode, day } = Route.useSearch()

	let doc = useCoState(Document, id, { resolve })

	if (!data.doc) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	if (!doc.$isLoaded && doc.$jazz.loadingState !== "loading") {
		if (doc.$jazz.loadingState === "unauthorized")
			return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	if (!doc.$isLoaded) {
		return (
			<Empty className="h-screen">
				<EmptyHeader>
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<EmptyTitle>Loading document...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	return (
		<SidebarProvider>
			<TimeMachineContent
				doc={doc}
				docId={id}
				initialEdit={edit}
				initialMode={mode}
				initialDay={day}
			/>
		</SidebarProvider>
	)
}

interface TimeMachineContentProps {
	doc: LoadedDocument
	docId: string
	initialEdit?: number
	initialMode?: ViewMode
	initialDay?: number
}

function TimeMachineContent({
	doc,
	docId,
	initialEdit,
	initialMode,
	initialDay,
}: TimeMachineContentProps) {
	let navigate = useNavigate()
	let data = Route.useLoaderData()
	let editor = useMarkdownEditorRef()
	let restoreDialog = useConfirmDialog()

	let me = useAccount(UserAccount, { resolve: meResolve })

	let editorSettings =
		me.$isLoaded && me.root?.settings?.$isLoaded
			? me.root.settings
			: data.me?.root?.settings

	useEditorSettings(editorSettings)

	let content = doc.content?.toString() ?? ""
	let docTitle = getDocumentTitle(content)

	// Time Machine state
	let editHistory = getEditHistory(doc)
	let totalEdits = editHistory.length
	let dayGroups = groupEditsByDay(editHistory)

	// Determine current edit index
	let currentEditIndex =
		initialEdit !== undefined
			? Math.min(Math.max(0, initialEdit), totalEdits - 1)
			: totalEdits - 1

	let currentEdit = editHistory[currentEditIndex]
	let timeMachineContent = getContentAtEdit(doc, currentEditIndex)

	// View mode state
	let viewMode: ViewMode = initialMode ?? "days"
	let selectedDayIndex: number | null =
		viewMode === "edits" && initialDay !== undefined ? initialDay : null

	// Load the author account for the current Time Machine edit
	let currentEditAuthor = useCoState(
		UserAccount,
		currentEdit?.accountId as ID<typeof UserAccount> | undefined,
		{ resolve: { profile: true } },
	)

	// Redirect to include edit param in URL when entering Time Machine without one
	useEffect(() => {
		if (initialEdit === undefined && totalEdits > 0) {
			navigate({
				to: "/doc/$id/timemachine",
				params: { id: docId },
				search: {
					edit: totalEdits - 1,
				},
				replace: true,
			})
		}
	}, [initialEdit, totalEdits, docId, navigate])

	// Show toast when edit param is clamped to valid range
	let shownClampToastRef = useRef(false)
	useEffect(() => {
		if (initialEdit === undefined || totalEdits === 0) return

		let wasClamped = initialEdit !== currentEditIndex
		if (wasClamped && !shownClampToastRef.current) {
			shownClampToastRef.current = true
			toast(`Showing edit ${currentEditIndex + 1} of ${totalEdits}`, {
				description: `Edit ${initialEdit + 1} doesn't exist. Showing closest available version.`,
				duration: 4000,
			})
			// Update URL to show the clamped value
			navigate({
				to: "/doc/$id/timemachine",
				params: { id: docId },
				search: {
					edit: currentEditIndex,
					mode: viewMode === "edits" ? "edits" : undefined,
					day: selectedDayIndex ?? undefined,
				},
				replace: true,
			})
		}
	}, [
		initialEdit,
		currentEditIndex,
		totalEdits,
		docId,
		navigate,
		viewMode,
		selectedDayIndex,
	])

	// Keyboard shortcuts for Time Machine navigation
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey) return

			if (e.key === "[") {
				e.preventDefault()
				if (currentEditIndex > 0) {
					navigate({
						to: "/doc/$id/timemachine",
						params: { id: docId },
						search: {
							edit: currentEditIndex - 1,
							mode: viewMode === "edits" ? "edits" : undefined,
							day: selectedDayIndex ?? undefined,
						},
					})
				}
				return
			}
			if (e.key === "]") {
				e.preventDefault()
				if (currentEditIndex < totalEdits - 1) {
					navigate({
						to: "/doc/$id/timemachine",
						params: { id: docId },
						search: {
							edit: currentEditIndex + 1,
							mode: viewMode === "edits" ? "edits" : undefined,
							day: selectedDayIndex ?? undefined,
						},
					})
				}
				return
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [
		currentEditIndex,
		totalEdits,
		docId,
		navigate,
		viewMode,
		selectedDayIndex,
	])

	return (
		<>
			<title>{docTitle} - Time Machine</title>
			<div className="markdown-editor flex-1">
				<MarkdownEditor
					ref={editor}
					value={timeMachineContent}
					onChange={() => {}}
					onCursorChange={() => {}}
					placeholder=""
					readOnly={true}
					assets={[]}
					documents={[]}
					remoteCursors={[]}
				/>
				<TimeMachineToolbar
					editDate={currentEdit?.madeAt ?? doc.createdAt}
					authorName={getAuthorName(
						currentEditAuthor?.$isLoaded ? currentEditAuthor : null,
						me.$isLoaded ? me.$jazz.id : undefined,
					)}
					onExit={() => {
						navigate({
							to: "/doc/$id",
							params: { id: docId },
							search: {},
						})
					}}
					onCreateCopy={makeTimeMachineCreateCopy({
						doc,
						historicalContent: timeMachineContent,
						originalTitle: docTitle,
						editDate: currentEdit?.madeAt ?? doc.createdAt,
						me,
						navigate,
					})}
					onRestore={() => restoreDialog.setOpen(true)}
				/>
				<ConfirmDialog
					open={restoreDialog.open}
					onOpenChange={restoreDialog.onOpenChange}
					title="Restore this version?"
					description={`Restore document to ${formatEditDate(currentEdit?.madeAt ?? doc.createdAt)} version? This will overwrite the current content.`}
					confirmLabel="Restore"
					cancelLabel="Cancel"
					onConfirm={makeTimeMachineRestore({
						doc,
						historicalContent: timeMachineContent,
						navigate,
						docId,
					})}
				/>
				<TimeMachineBottomBar
					currentEditIndex={currentEditIndex}
					dayGroups={dayGroups}
					selectedDayIndex={selectedDayIndex}
					viewMode={viewMode}
					disabled={dayGroups.length <= 1 && totalEdits <= 1}
					onEditChange={editIndex => {
						navigate({
							to: "/doc/$id/timemachine",
							params: { id: docId },
							search: {
								edit: editIndex,
								mode: viewMode === "edits" ? "edits" : undefined,
								day: selectedDayIndex ?? undefined,
							},
						})
					}}
					onViewModeChange={(newMode, dayIndex) => {
						navigate({
							to: "/doc/$id/timemachine",
							params: { id: docId },
							search: {
								edit: currentEditIndex,
								mode: newMode === "edits" ? "edits" : undefined,
								day: dayIndex,
							},
							replace: true,
						})
					}}
				/>
			</div>
		</>
	)
}

// --- Handler factories ---

import { Group } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { Asset, Space } from "@/schema"
import { getSpaceGroup } from "@/lib/spaces"

type TimeMachineCopyParams = {
	doc: LoadedDocument
	historicalContent: string
	originalTitle: string
	editDate: Date
	me: LoadedMe
	navigate: ReturnType<typeof useNavigate>
}

type LoadedSpace = co.loaded<typeof Space, { documents: true }>

function makeTimeMachineCreateCopy(params: TimeMachineCopyParams) {
	return async function handleTimeMachineCreateCopy() {
		let { doc, historicalContent, originalTitle, editDate, me, navigate } =
			params
		if (!me.$isLoaded || !me.root?.documents?.$isLoaded) return

		// Determine the owner group for the new document
		let owner: Group
		let targetSpace: LoadedSpace | undefined

		if (doc.spaceId) {
			// Find the target space for proper group hierarchy
			let space = me.root.spaces?.find(s => s?.$jazz.id === doc.spaceId)
			if (space?.$isLoaded) {
				targetSpace = space as LoadedSpace
				// Create document-specific group with space group as parent
				let spaceGroup = getSpaceGroup(space as LoadedSpace)
				if (spaceGroup) {
					owner = Group.create()
					owner.addMember(spaceGroup)
				} else {
					// Fallback to personal group if space group not found
					owner = Group.create()
				}
			} else {
				// Fallback to personal group if space not loaded
				owner = Group.create()
			}
		} else {
			// Personal document - create new group
			owner = Group.create()
		}

		// Build a map of old asset ID -> new asset ID for content replacement
		let assetIdMap = new Map<string, string>()
		let newAssets = co.list(Asset).create([], owner)
		let assets = doc.assets ?? []

		// Deep copy each asset
		for (let asset of [...assets]) {
			if (!asset?.$isLoaded || !asset.image?.$isLoaded) continue

			let original = asset.image.original
			if (!original?.$isLoaded) continue

			let blob = original.toBlob()
			if (!blob) continue

			try {
				// Create a new image from the blob
				let newImage = await createImage(blob, {
					owner,
					maxSize: 2048,
				})

				// Create a new asset with the copied image
				let newAsset = Asset.create(
					{
						type: "image",
						name: asset.name,
						image: newImage,
						createdAt: new Date(),
					},
					owner,
				)

				newAssets.$jazz.push(newAsset)
				assetIdMap.set(asset.$jazz.id, newAsset.$jazz.id)
			} catch (err) {
				console.error("Failed to copy asset:", err)
				toast.error(`Failed to copy asset: ${asset.name}`)
			}
		}

		// Replace asset references in content with new asset IDs
		let content = historicalContent
		for (let [oldId, newId] of assetIdMap) {
			content = content.replace(
				new RegExp(`\\(asset:${oldId}\\)`, "g"),
				`(asset:${newId})`,
			)
		}

		// Add frontmatter noting the source
		let formattedDate = formatEditDate(editDate)
		let frontmatter = `---\ntimemachine: restored from ${originalTitle} at ${formattedDate}\n---\n\n`

		// Add frontmatter to content, update title to indicate it's a copy
		let lines = content.split("\n")
		let newTitle = `${originalTitle} (restored)`

		// Replace or add title
		if (lines[0]?.startsWith("#")) {
			lines[0] = `# ${newTitle}`
		} else {
			lines.unshift(`# ${newTitle}`)
		}

		let finalContent = frontmatter + lines.join("\n")

		// Create the new document
		let now = new Date()
		let newDoc = Document.create(
			{
				version: 1,
				content: co.plainText().create(finalContent, owner),
				assets: newAssets,
				createdAt: now,
				updatedAt: now,
				spaceId: doc.spaceId,
			},
			owner,
		)

		// Add to the appropriate list
		if (targetSpace?.documents?.$isLoaded) {
			targetSpace.documents.$jazz.push(newDoc)
		} else {
			me.root.documents.$jazz.push(newDoc)
		}

		// Navigate to the new document
		navigate({ to: "/doc/$id", params: { id: newDoc.$jazz.id } })
	}
}

type TimeMachineRestoreParams = {
	doc: LoadedDocument
	historicalContent: string
	navigate: ReturnType<typeof useNavigate>
	docId: string
}

function makeTimeMachineRestore(params: TimeMachineRestoreParams) {
	return function handleTimeMachineRestore() {
		let { doc, historicalContent, navigate, docId } = params
		if (!doc.content) return

		// Overwrite the current document content with the historical version
		doc.content.$jazz.applyDiff(historicalContent)
		doc.$jazz.set("updatedAt", new Date())

		// Exit Time Machine mode
		navigate({
			to: "/doc/$id",
			params: { id: docId },
			search: {},
		})
	}
}

// --- Types ---

type LoadedDocument = co.loaded<typeof Document, typeof resolve>
type LoadedMe = ReturnType<
	typeof useAccount<typeof UserAccount, typeof meResolve>
>

let loaderResolve = {
	content: true,
	assets: true,
} as const satisfies ResolveQuery<typeof Document>

let resolve = {
	content: true,
	assets: { $each: { image: true } },
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
