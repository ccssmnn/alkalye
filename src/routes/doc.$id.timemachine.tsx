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
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import {
	getEditHistory,
	getContentAtEdit,
	getAuthorName,
	formatEditDate,
	groupEditsByDay,
	type DayGroup,
} from "@/lib/time-machine"
import { ConfirmDialog, useConfirmDialog } from "@/components/ui/confirm-dialog"
import { toast } from "sonner"
import type { ID } from "jazz-tools"
import {
	Loader2,
	X,
	EllipsisVertical,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
} from "lucide-react"
import { SidebarProvider } from "@/components/ui/sidebar"

export { Route }
export type { ViewMode }

type ViewMode = "days" | "edits"

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

// --- UI Components ---

interface TimeMachineToolbarProps {
	editDate: Date
	authorName: string
	onExit: () => void
	onCreateCopy: () => void
	onRestore: () => void
}

function TimeMachineToolbar({
	editDate,
	authorName,
	onExit,
	onCreateCopy,
	onRestore,
}: TimeMachineToolbarProps) {
	return (
		<div
			className="border-border bg-background fixed top-0 right-0 left-0 z-20 flex items-center justify-between border-b px-4 py-2"
			style={{
				paddingTop: "max(0.5rem, env(safe-area-inset-top))",
				paddingLeft: "max(1rem, env(safe-area-inset-left))",
				paddingRight: "max(1rem, env(safe-area-inset-right))",
			}}
		>
			<Button variant="ghost" size="sm" onClick={onExit} className="gap-1.5">
				<X className="size-4" />
				<span className="hidden sm:inline">Exit</span>
			</Button>

			<div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center">
				<span className="text-foreground text-sm font-medium">
					Time Machine
				</span>
				<span className="text-muted-foreground text-xs">
					{formatEditDate(editDate)} by {authorName}
				</span>
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="icon" nativeButton={false}>
							<EllipsisVertical className="size-4" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={onCreateCopy}>
						Create Copy
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onRestore}>
						Restore This Version
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

interface TimeMachineBottomBarProps {
	currentEditIndex: number
	dayGroups: DayGroup[]
	selectedDayIndex: number | null
	viewMode: ViewMode
	onEditChange: (editIndex: number) => void
	onViewModeChange: (mode: ViewMode, dayIndex?: number) => void
	disabled?: boolean
}

function TimeMachineBottomBar({
	currentEditIndex,
	dayGroups,
	selectedDayIndex,
	viewMode,
	onEditChange,
	onViewModeChange,
	disabled = false,
}: TimeMachineBottomBarProps) {
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	let totalDays = dayGroups.length
	let hasHistory = totalDays > 0

	let isViewingDay = viewMode === "edits" && selectedDayIndex !== null
	let selectedDay =
		selectedDayIndex !== null ? dayGroups[selectedDayIndex] : null

	let currentDayIndex = dayGroups.findIndex(day =>
		day.edits.some(e => e.index === currentEditIndex),
	)
	if (currentDayIndex === -1 && dayGroups.length > 0) {
		currentDayIndex = dayGroups.length - 1
	}

	let sliderMax: number
	let sliderValue: number

	if (isViewingDay && selectedDay) {
		sliderMax = selectedDay.edits.length - 1
		let editIndexInDay = selectedDay.edits.findIndex(
			e => e.index === currentEditIndex,
		)
		sliderValue = editIndexInDay >= 0 ? editIndexInDay : 0
	} else {
		sliderMax = totalDays - 1
		sliderValue = currentDayIndex
	}

	function handleSliderChange(value: number) {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current)
		}
		debounceRef.current = setTimeout(() => {
			debounceRef.current = null

			if (isViewingDay && selectedDay) {
				let edit = selectedDay.edits[value]
				if (edit) {
					onEditChange(edit.index)
				}
			} else {
				let day = dayGroups[value]
				if (day) {
					onEditChange(day.lastEditIndex)
				}
			}
		}, 50)
	}

	function handlePrevious() {
		if (isViewingDay && selectedDay) {
			let editIndexInDay = selectedDay.edits.findIndex(
				e => e.index === currentEditIndex,
			)
			if (editIndexInDay > 0) {
				onEditChange(selectedDay.edits[editIndexInDay - 1].index)
			}
		} else {
			if (currentDayIndex > 0) {
				onEditChange(dayGroups[currentDayIndex - 1].lastEditIndex)
			}
		}
	}

	function handleNext() {
		if (isViewingDay && selectedDay) {
			let editIndexInDay = selectedDay.edits.findIndex(
				e => e.index === currentEditIndex,
			)
			if (editIndexInDay < selectedDay.edits.length - 1) {
				onEditChange(selectedDay.edits[editIndexInDay + 1].index)
			}
		} else {
			if (currentDayIndex < dayGroups.length - 1) {
				onEditChange(dayGroups[currentDayIndex + 1].lastEditIndex)
			}
		}
	}

	let isAtStart =
		isViewingDay && selectedDay
			? selectedDay.edits[0]?.index === currentEditIndex
			: currentDayIndex === 0

	let isAtEnd =
		isViewingDay && selectedDay
			? selectedDay.edits[selectedDay.edits.length - 1]?.index ===
				currentEditIndex
			: currentDayIndex >= dayGroups.length - 1

	let currentDay = dayGroups[currentDayIndex]
	let dateDisplay = currentDay
		? currentDay.date.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
				year:
					currentDay.date.getFullYear() !== new Date().getFullYear()
						? "numeric"
						: undefined,
			})
		: ""

	let statusText: string
	if (!hasHistory) {
		statusText = "No previous versions"
	} else if (isViewingDay && selectedDay) {
		let editIndexInDay =
			selectedDay.edits.findIndex(e => e.index === currentEditIndex) + 1
		statusText = `Edit ${editIndexInDay}/${selectedDay.edits.length} on ${dateDisplay}`
	} else {
		statusText = `${dateDisplay} (${totalDays} ${totalDays === 1 ? "day" : "days"})`
	}

	let modeLabel = isViewingDay ? `${dateDisplay}` : "Days"

	return (
		<div
			className="border-border bg-background fixed right-0 bottom-0 left-0 z-20 flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:gap-4"
			style={{
				paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
				paddingLeft: "max(1rem, env(safe-area-inset-left))",
				paddingRight: "max(1rem, env(safe-area-inset-right))",
			}}
		>
			{/* Mobile: Row 1 - Slider + status */}
			<div className="flex items-center gap-3 md:hidden">
				<Slider
					min={0}
					max={Math.max(0, sliderMax)}
					value={[sliderValue]}
					onValueChange={value =>
						handleSliderChange(Array.isArray(value) ? value[0] : value)
					}
					disabled={disabled || !hasHistory || sliderMax === 0}
					className="flex-1"
				/>
			</div>

			{/* Mobile: Row 2 - Navigation buttons + mode dropdown + status */}
			<div className="flex items-center justify-between gap-3 md:hidden">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						onClick={handlePrevious}
						disabled={disabled || isAtStart || !hasHistory}
						aria-label={isViewingDay ? "Previous edit" : "Previous day"}
						className="size-10"
					>
						<ChevronLeft className="size-5" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						onClick={handleNext}
						disabled={disabled || isAtEnd || !hasHistory}
						aria-label={isViewingDay ? "Next edit" : "Next day"}
						className="size-10"
					>
						<ChevronRight className="size-5" />
					</Button>
				</div>
				<ModeDropdown
					dayGroups={dayGroups}
					currentDayIndex={currentDayIndex}
					isViewingDay={isViewingDay}
					modeLabel={modeLabel}
					disabled={disabled}
					hasHistory={hasHistory}
					onViewModeChange={onViewModeChange}
				/>
				<div className="text-muted-foreground shrink-0 text-sm">
					{statusText}
				</div>
			</div>

			{/* Desktop: Single row layout */}
			<div className="hidden items-center gap-2 md:flex">
				<Button
					variant="outline"
					size="icon"
					onClick={handlePrevious}
					disabled={disabled || isAtStart || !hasHistory}
					aria-label={isViewingDay ? "Previous edit" : "Previous day"}
				>
					<ChevronLeft className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={handleNext}
					disabled={disabled || isAtEnd || !hasHistory}
					aria-label={isViewingDay ? "Next edit" : "Next day"}
				>
					<ChevronRight className="size-4" />
				</Button>
			</div>

			<ModeDropdown
				dayGroups={dayGroups}
				currentDayIndex={currentDayIndex}
				isViewingDay={isViewingDay}
				modeLabel={modeLabel}
				disabled={disabled}
				hasHistory={hasHistory}
				onViewModeChange={onViewModeChange}
				className="hidden md:flex"
			/>

			<div className="hidden flex-1 items-center gap-4 md:flex">
				<Slider
					min={0}
					max={Math.max(0, sliderMax)}
					value={[sliderValue]}
					onValueChange={value =>
						handleSliderChange(Array.isArray(value) ? value[0] : value)
					}
					disabled={disabled || !hasHistory || sliderMax === 0}
					className="flex-1"
				/>
			</div>

			<div className="text-muted-foreground hidden shrink-0 text-sm md:block">
				{statusText}
			</div>
		</div>
	)
}

interface ModeDropdownProps {
	dayGroups: DayGroup[]
	currentDayIndex: number
	isViewingDay: boolean
	modeLabel: string
	disabled: boolean
	hasHistory: boolean
	onViewModeChange: (mode: ViewMode, dayIndex?: number) => void
	className?: string
}

function ModeDropdown({
	dayGroups,
	currentDayIndex,
	isViewingDay,
	modeLabel,
	disabled,
	hasHistory,
	onViewModeChange,
	className = "",
}: ModeDropdownProps) {
	let currentDay = dayGroups[currentDayIndex]
	let hasMultipleEditsToday = currentDay && currentDay.edits.length > 1

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled || !hasHistory}
				className={`border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 items-center justify-between gap-1 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${className || "flex"}`}
			>
				<span>{modeLabel}</span>
				<ChevronDown className="size-4 opacity-50" />
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start">
				<DropdownMenuRadioGroup
					value={isViewingDay ? "edits" : "days"}
					onValueChange={value => {
						if (value === "days") {
							onViewModeChange("days")
						} else {
							onViewModeChange("edits", currentDayIndex)
						}
					}}
				>
					<DropdownMenuRadioItem value="days">All days</DropdownMenuRadioItem>
					<DropdownMenuRadioItem
						value="edits"
						disabled={!hasMultipleEditsToday}
					>
						Edits on{" "}
						{currentDay?.date.toLocaleDateString(undefined, {
							month: "short",
							day: "numeric",
						})}{" "}
						({currentDay?.edits.length ?? 0})
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
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
