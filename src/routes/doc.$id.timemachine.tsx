import { useEffect, useRef, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { co, Group, type ResolveQuery } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { useCoState, useAccount } from "jazz-tools/react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import {
	Loader2,
	X,
	EllipsisVertical,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
} from "lucide-react"
import { toast } from "sonner"
import { Document, UserAccount, Asset, Space } from "@/schema"
import { MarkdownEditor, useMarkdownEditorRef } from "@/editor/editor"
import "@/editor/editor.css"
import { useEditorSettings } from "@/lib/editor-settings"
import { getDocumentTitle } from "@/lib/document-utils"
import { getSpaceGroup } from "@/lib/spaces"
import {
	DocumentNotFound,
	DocumentUnauthorized,
} from "@/components/document-error-states"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu"
import {
	getEditHistory,
	getContentAtEdit,
	getAuthorName,
	formatEditDate,
	groupEditsByDay,
	type DayGroup,
	type EditHistoryItem,
} from "@/lib/time-machine"
import { ConfirmDialog, useConfirmDialog } from "@/components/ui/confirm-dialog"
import { SidebarProvider } from "@/components/ui/sidebar"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

export { Route }
export type { ViewMode }

type ViewMode = "days" | "edits"

let Route = createFileRoute("/doc/$id/timemachine")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		edit?: number
		mode?: ViewMode
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
	let { edit, mode } = Route.useSearch()

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
			/>
		</SidebarProvider>
	)
}

interface TimeMachineContentProps {
	doc: LoadedDocument
	docId: string
	initialEdit?: number
	initialMode?: ViewMode
}

function TimeMachineContent({
	doc,
	docId,
	initialEdit,
	initialMode,
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

	let editHistory = getEditHistory(doc)
	let totalEdits = editHistory.length
	let dayGroups = groupEditsByDay(editHistory)

	let currentEditIndex =
		initialEdit !== undefined
			? Math.min(Math.max(0, initialEdit), totalEdits - 1)
			: totalEdits - 1

	let currentEdit = editHistory[currentEditIndex]
	let timeMachineContent = getContentAtEdit(doc, currentEditIndex)

	let viewMode: ViewMode = initialMode ?? "days"
	let selectedDayIndex: number | null = null
	if (viewMode === "edits") {
		selectedDayIndex = dayGroups.findIndex(day =>
			day.edits.some(e => e.index === currentEditIndex),
		)
		if (selectedDayIndex === -1) selectedDayIndex = null
	}

	let currentEditAuthor = useCoState(
		UserAccount,
		currentEdit?.accountId ?? undefined,
		{ resolve: { profile: true } },
	)

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
			navigate({
				to: "/doc/$id/timemachine",
				params: { id: docId },
				search: {
					edit: currentEditIndex,
					mode: viewMode === "edits" ? "edits" : undefined,
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

	let isViewingDay = viewMode === "edits" && selectedDayIndex !== null
	let selectedDay =
		selectedDayIndex !== null ? dayGroups[selectedDayIndex] : null

	useEffect(() => {
		function getPreviousEditIndex(): number | null {
			if (isViewingDay && selectedDay) {
				let editIndexInDay = selectedDay.edits.findIndex(
					e => e.index === currentEditIndex,
				)
				if (editIndexInDay > 0)
					return selectedDay.edits[editIndexInDay - 1].index
			} else {
				if (currentEditIndex > 0) return currentEditIndex - 1
			}
			return null
		}

		function getNextEditIndex(): number | null {
			if (isViewingDay && selectedDay) {
				let editIndexInDay = selectedDay.edits.findIndex(
					e => e.index === currentEditIndex,
				)
				if (editIndexInDay < selectedDay.edits.length - 1)
					return selectedDay.edits[editIndexInDay + 1].index
			} else {
				if (currentEditIndex < totalEdits - 1) return currentEditIndex + 1
			}
			return null
		}

		function handleKeyDown(e: KeyboardEvent) {
			if (e.metaKey || e.ctrlKey || e.altKey) return

			if (e.key === "[") {
				e.preventDefault()
				let idx = getPreviousEditIndex()
				if (idx !== null) {
					navigate({
						to: "/doc/$id/timemachine",
						params: { id: docId },
						search: {
							edit: idx,
							mode: viewMode === "edits" ? "edits" : undefined,
						},
					})
				}
				return
			}
			if (e.key === "]") {
				e.preventDefault()
				let idx = getNextEditIndex()
				if (idx !== null) {
					navigate({
						to: "/doc/$id/timemachine",
						params: { id: docId },
						search: {
							edit: idx,
							mode: viewMode === "edits" ? "edits" : undefined,
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
		isViewingDay,
		selectedDay,
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
				<TimeMachineBottomBar editHistory={editHistory} />
			</div>
		</>
	)
}

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

		let owner: Group
		let targetSpace: LoadedSpace | undefined

		if (doc.spaceId) {
			let space = me.root.spaces?.find(s => s?.$jazz.id === doc.spaceId)
			if (space?.$isLoaded) {
				targetSpace = space as LoadedSpace
				let spaceGroup = getSpaceGroup(space as LoadedSpace)
				if (spaceGroup) {
					owner = Group.create()
					owner.addMember(spaceGroup)
				} else {
					owner = Group.create()
				}
			} else {
				owner = Group.create()
			}
		} else {
			owner = Group.create()
		}

		let assetIdMap = new Map<string, string>()
		let newAssets = co.list(Asset).create([], owner)
		let assets = doc.assets ?? []

		for (let asset of [...assets]) {
			if (!asset?.$isLoaded || !asset.image?.$isLoaded) continue

			let original = asset.image.original
			if (!original?.$isLoaded) continue

			let blob = original.toBlob()
			if (!blob) continue

			try {
				let newImage = await createImage(blob, {
					owner,
					maxSize: 2048,
				})

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

		let content = historicalContent
		for (let [oldId, newId] of assetIdMap) {
			content = content.replace(
				new RegExp(`\\(asset:${oldId}\\)`, "g"),
				`(asset:${newId})`,
			)
		}

		let formattedDate = formatEditDate(editDate)
		let frontmatter = `---\ntimemachine: restored from ${originalTitle} at ${formattedDate}\n---\n\n`

		let lines = content.split("\n")
		let newTitle = `${originalTitle} (restored)`

		if (lines[0]?.startsWith("#")) {
			lines[0] = `# ${newTitle}`
		} else {
			lines.unshift(`# ${newTitle}`)
		}

		let finalContent = frontmatter + lines.join("\n")

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

		if (targetSpace?.documents?.$isLoaded) {
			targetSpace.documents.$jazz.push(newDoc)
		} else {
			me.root.documents.$jazz.push(newDoc)
		}

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

		doc.content.$jazz.applyDiff(historicalContent)
		doc.$jazz.set("updatedAt", new Date())

		navigate({
			to: "/doc/$id",
			params: { id: docId },
			search: {},
		})
	}
}

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
	editHistory: EditHistoryItem[]
}

function TimeMachineBottomBar({ editHistory }: TimeMachineBottomBarProps) {
	let { id: docId } = Route.useParams()
	let { edit: editParam, mode } = Route.useSearch()
	let navigate = useNavigate()

	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
	let holdEditRef = useRef(0)

	let totalEdits = editHistory.length
	let dayGroups = groupEditsByDay(editHistory)

	let currentEditIndex =
		editParam !== undefined
			? Math.min(Math.max(0, editParam), totalEdits - 1)
			: totalEdits - 1

	let viewMode: ViewMode = mode ?? "days"
	let selectedDayIndex: number | null = null
	if (viewMode === "edits") {
		selectedDayIndex = dayGroups.findIndex(day =>
			day.edits.some(e => e.index === currentEditIndex),
		)
		if (selectedDayIndex === -1) selectedDayIndex = null
	}

	let hasHistory = totalEdits > 0
	let disabled = dayGroups.length <= 1 && totalEdits <= 1
	let isViewingDay = viewMode === "edits" && selectedDayIndex !== null
	let selectedDay =
		selectedDayIndex !== null ? dayGroups[selectedDayIndex] : null

	let sliderMax: number
	let sliderValue: number

	if (isViewingDay && selectedDay) {
		sliderMax = selectedDay.edits.length - 1
		let editIndexInDay = selectedDay.edits.findIndex(
			e => e.index === currentEditIndex,
		)
		sliderValue = editIndexInDay >= 0 ? editIndexInDay : 0
	} else {
		sliderMax = totalEdits - 1
		sliderValue = currentEditIndex
	}

	useEffect(() => {
		holdEditRef.current = currentEditIndex
	}, [currentEditIndex])

	function sliderToEditIndex(value: number): number {
		if (isViewingDay && selectedDay) {
			return selectedDay.edits[value]?.index ?? currentEditIndex
		}
		return value
	}

	function navigateToEdit(editIndex: number, replace = false) {
		navigate({
			to: "/doc/$id/timemachine",
			params: { id: docId },
			search: {
				edit: editIndex,
				mode: viewMode === "edits" ? "edits" : undefined,
			},
			replace,
		})
	}

	function handleSliderChange(value: number) {
		if (debounceRef.current) clearTimeout(debounceRef.current)
		debounceRef.current = setTimeout(() => {
			let editIndex = sliderToEditIndex(value)
			navigateToEdit(editIndex, true)
		}, 150)
	}

	function handleSliderCommit(value: number) {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current)
			debounceRef.current = null
		}
		navigateToEdit(sliderToEditIndex(value))
	}

	function handleViewModeChange(newMode: ViewMode, dayIndex?: number) {
		let targetEdit = currentEditIndex
		if (newMode === "edits" && dayIndex !== undefined) {
			let day = dayGroups[dayIndex]
			if (day && day.edits.length > 0) {
				targetEdit = day.edits[day.edits.length - 1].index
			}
		}
		navigate({
			to: "/doc/$id/timemachine",
			params: { id: docId },
			search: {
				edit: targetEdit,
				mode: newMode === "edits" ? "edits" : undefined,
			},
			replace: true,
		})
	}

	function getTooltipContent(value: number): string | undefined {
		let edit: EditHistoryItem | undefined
		if (isViewingDay && selectedDay) {
			edit = selectedDay.edits[value]
		} else {
			edit = editHistory[value]
		}
		if (!edit) return undefined
		return isViewingDay
			? edit.madeAt.toLocaleTimeString(undefined, {
					hour: "numeric",
					minute: "2-digit",
				})
			: formatEditDate(edit.madeAt)
	}

	function getPreviousEditIndex(fromIndex: number): number | null {
		if (isViewingDay && selectedDay) {
			let editIndexInDay = selectedDay.edits.findIndex(
				e => e.index === fromIndex,
			)
			if (editIndexInDay > 0) return selectedDay.edits[editIndexInDay - 1].index
		} else {
			if (fromIndex > 0) return fromIndex - 1
		}
		return null
	}

	function getNextEditIndex(fromIndex: number): number | null {
		if (isViewingDay && selectedDay) {
			let editIndexInDay = selectedDay.edits.findIndex(
				e => e.index === fromIndex,
			)
			if (editIndexInDay < selectedDay.edits.length - 1)
				return selectedDay.edits[editIndexInDay + 1].index
		} else {
			if (fromIndex < totalEdits - 1) return fromIndex + 1
		}
		return null
	}

	function startHold(direction: "prev" | "next") {
		stopHold()
		holdEditRef.current = currentEditIndex
		let getNext =
			direction === "prev"
				? () => getPreviousEditIndex(holdEditRef.current)
				: () => getNextEditIndex(holdEditRef.current)

		let idx = getNext()
		if (idx !== null) {
			holdEditRef.current = idx
			navigateToEdit(idx)
		}

		holdIntervalRef.current = setInterval(() => {
			let nextIdx = getNext()
			if (nextIdx !== null) {
				holdEditRef.current = nextIdx
				navigateToEdit(nextIdx)
			} else {
				stopHold()
			}
		}, 100)
	}

	function stopHold() {
		if (holdIntervalRef.current) {
			clearInterval(holdIntervalRef.current)
			holdIntervalRef.current = null
		}
	}

	let isAtStart =
		isViewingDay && selectedDay
			? selectedDay.edits[0]?.index === currentEditIndex
			: currentEditIndex === 0

	let isAtEnd =
		isViewingDay && selectedDay
			? selectedDay.edits[selectedDay.edits.length - 1]?.index ===
				currentEditIndex
			: currentEditIndex >= totalEdits - 1

	let statusText: string
	if (!hasHistory) {
		statusText = "No previous versions"
	} else if (isViewingDay && selectedDay) {
		let editIndexInDay =
			selectedDay.edits.findIndex(e => e.index === currentEditIndex) + 1
		statusText = `${editIndexInDay}/${selectedDay.edits.length}`
	} else {
		statusText = `${currentEditIndex + 1}/${totalEdits}`
	}

	let dropdownLabel = isViewingDay
		? formatDayLabel(selectedDay!.date)
		: "All history"

	return (
		<div
			className="border-border bg-background fixed right-0 bottom-0 left-0 flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:gap-4"
			style={{
				paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
				paddingLeft: "max(1rem, env(safe-area-inset-left))",
				paddingRight: "max(1rem, env(safe-area-inset-right))",
			}}
		>
			<div className="flex items-center gap-3 md:hidden">
				<TimeMachineSlider
					min={0}
					max={Math.max(0, sliderMax)}
					value={sliderValue}
					onChange={handleSliderChange}
					onCommit={handleSliderCommit}
					disabled={disabled || !hasHistory || sliderMax === 0}
					className="flex-1"
					getTooltipContent={getTooltipContent}
				/>
			</div>

			<div className="flex items-center justify-between gap-3 md:hidden">
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onMouseDown={() => startHold("prev")}
						onMouseUp={stopHold}
						onMouseLeave={stopHold}
						onTouchStart={() => startHold("prev")}
						onTouchEnd={stopHold}
						disabled={disabled || isAtStart || !hasHistory}
						aria-label="Previous edit"
						className="gap-1"
					>
						<ChevronLeft className="size-4" />
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onMouseDown={() => startHold("next")}
						onMouseUp={stopHold}
						onMouseLeave={stopHold}
						onTouchStart={() => startHold("next")}
						onTouchEnd={stopHold}
						disabled={disabled || isAtEnd || !hasHistory}
						aria-label="Next edit"
						className="gap-1"
					>
						Next
						<ChevronRight className="size-4" />
					</Button>
				</div>
				<DateDropdown
					dayGroups={dayGroups}
					selectedDayIndex={selectedDayIndex}
					dropdownLabel={dropdownLabel}
					disabled={disabled}
					hasHistory={hasHistory}
					onViewModeChange={handleViewModeChange}
				/>
				<div className="text-muted-foreground shrink-0 text-sm tabular-nums">
					{statusText}
				</div>
			</div>

			<TooltipProvider>
				<div className="hidden items-center gap-2 md:flex">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="outline"
									size="sm"
									onMouseDown={() => startHold("prev")}
									onMouseUp={stopHold}
									onMouseLeave={stopHold}
									disabled={disabled || isAtStart || !hasHistory}
									aria-label="Previous edit"
									nativeButton={false}
									className="gap-1"
								>
									<ChevronLeft className="size-4" />
									Previous
								</Button>
							}
						/>
						<TooltipContent side="top">
							Previous edit <Kbd>[</Kbd>
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									variant="outline"
									size="sm"
									onMouseDown={() => startHold("next")}
									onMouseUp={stopHold}
									onMouseLeave={stopHold}
									disabled={disabled || isAtEnd || !hasHistory}
									aria-label="Next edit"
									nativeButton={false}
									className="gap-1"
								>
									Next
									<ChevronRight className="size-4" />
								</Button>
							}
						/>
						<TooltipContent side="top">
							Next edit <Kbd>]</Kbd>
						</TooltipContent>
					</Tooltip>
				</div>
			</TooltipProvider>

			<DateDropdown
				dayGroups={dayGroups}
				selectedDayIndex={selectedDayIndex}
				dropdownLabel={dropdownLabel}
				disabled={disabled}
				hasHistory={hasHistory}
				onViewModeChange={handleViewModeChange}
				className="hidden md:flex"
			/>

			<div className="hidden flex-1 items-center gap-4 md:flex">
				<TimeMachineSlider
					min={0}
					max={Math.max(0, sliderMax)}
					value={sliderValue}
					onChange={handleSliderChange}
					onCommit={handleSliderCommit}
					disabled={disabled || !hasHistory || sliderMax === 0}
					className="flex-1"
					getTooltipContent={getTooltipContent}
				/>
			</div>

			<div className="text-muted-foreground hidden shrink-0 text-sm tabular-nums md:block">
				{statusText}
			</div>
		</div>
	)
}

function formatDayLabel(date: Date): string {
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year:
			date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
	})
}

function formatMonthLabel(date: Date): string {
	return date.toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	})
}

type MonthGroup = {
	label: string
	days: { day: DayGroup; originalIndex: number }[]
	totalEdits: number
}

function groupDaysByMonth(dayGroups: DayGroup[]): {
	recentDays: { day: DayGroup; originalIndex: number }[]
	olderMonths: MonthGroup[]
} {
	let now = new Date()
	let sevenDaysAgo = new Date(now)
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
	sevenDaysAgo.setHours(0, 0, 0, 0)

	let recentDays: { day: DayGroup; originalIndex: number }[] = []
	let olderDays: { day: DayGroup; originalIndex: number }[] = []

	dayGroups.forEach((day, idx) => {
		if (day.date >= sevenDaysAgo) {
			recentDays.push({ day, originalIndex: idx })
		} else {
			olderDays.push({ day, originalIndex: idx })
		}
	})

	let monthMap = new Map<string, MonthGroup>()
	for (let item of olderDays) {
		let monthKey = `${item.day.date.getFullYear()}-${item.day.date.getMonth()}`
		let existing = monthMap.get(monthKey)
		if (existing) {
			existing.days.push(item)
			existing.totalEdits += item.day.edits.length
		} else {
			monthMap.set(monthKey, {
				label: formatMonthLabel(item.day.date),
				days: [item],
				totalEdits: item.day.edits.length,
			})
		}
	}

	let olderMonths = Array.from(monthMap.values())

	return { recentDays, olderMonths }
}

interface DateDropdownProps {
	dayGroups: DayGroup[]
	selectedDayIndex: number | null
	dropdownLabel: string
	disabled: boolean
	hasHistory: boolean
	onViewModeChange: (mode: ViewMode, dayIndex?: number) => void
	className?: string
}

function DateDropdown({
	dayGroups,
	selectedDayIndex,
	dropdownLabel,
	disabled,
	hasHistory,
	onViewModeChange,
	className = "",
}: DateDropdownProps) {
	let totalEdits = dayGroups.reduce((sum, day) => sum + day.edits.length, 0)
	let { recentDays, olderMonths } = groupDaysByMonth(dayGroups)

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled || !hasHistory}
				className={`border-input bg-background hover:bg-muted hover:text-foreground h-9 items-center justify-between gap-1 rounded-none border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 md:h-7 md:px-2.5 md:text-xs ${className || "flex"}`}
			>
				<span>{dropdownLabel}</span>
				<ChevronDown className="size-4 opacity-50" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side="top"
				align="start"
				className="max-h-80 overflow-y-auto"
			>
				<DropdownMenuRadioGroup
					value={selectedDayIndex !== null ? String(selectedDayIndex) : "all"}
					onValueChange={value => {
						if (value === "all") {
							onViewModeChange("days")
						} else {
							onViewModeChange("edits", Number(value))
						}
					}}
				>
					<DropdownMenuRadioItem value="all">
						All history ({totalEdits})
					</DropdownMenuRadioItem>

					{recentDays.length > 0 && (
						<>
							<DropdownMenuSeparator />
							{recentDays.map(({ day, originalIndex }) => (
								<DropdownMenuRadioItem
									key={originalIndex}
									value={String(originalIndex)}
								>
									{formatDayLabel(day.date)} ({day.edits.length})
								</DropdownMenuRadioItem>
							))}
						</>
					)}
				</DropdownMenuRadioGroup>

				{olderMonths.length > 0 && (
					<>
						<DropdownMenuSeparator />
						{olderMonths.map(month => (
							<DropdownMenuSub key={month.label}>
								<DropdownMenuSubTrigger>
									{month.label} ({month.totalEdits})
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									<DropdownMenuRadioGroup
										value={
											selectedDayIndex !== null
												? String(selectedDayIndex)
												: "all"
										}
										onValueChange={value => {
											if (value !== "all") {
												onViewModeChange("edits", Number(value))
											}
										}}
									>
										{month.days.map(({ day, originalIndex }) => (
											<DropdownMenuRadioItem
												key={originalIndex}
												value={String(originalIndex)}
											>
												{formatDayLabel(day.date)} ({day.edits.length})
											</DropdownMenuRadioItem>
										))}
									</DropdownMenuRadioGroup>
								</DropdownMenuSubContent>
							</DropdownMenuSub>
						))}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

interface TimeMachineSliderProps {
	min: number
	max: number
	value: number
	onChange: (value: number) => void
	onCommit: (value: number) => void
	disabled?: boolean
	className?: string
	getTooltipContent: (value: number) => string | undefined
}

function TimeMachineSlider({
	min,
	max,
	value,
	onChange,
	onCommit,
	disabled,
	className,
	getTooltipContent,
}: TimeMachineSliderProps) {
	let [localValue, setLocalValue] = useState(value)
	let [isHovering, setIsHovering] = useState(false)
	let [isDragging, setIsDragging] = useState(false)

	function handleValueChange(newValue: number, details: { reason: string }) {
		setLocalValue(newValue)
		if (details.reason === "drag") {
			setIsDragging(true)
		}
		onChange(newValue)
	}

	function handleValueCommitted(committedValue: number) {
		setIsDragging(false)
		setLocalValue(committedValue)
		onCommit(committedValue)
	}

	let displayValue = isDragging ? localValue : value
	let tooltipContent = getTooltipContent(displayValue)
	let showTooltip = (isDragging || isHovering) && tooltipContent

	return (
		<SliderPrimitive.Root
			className={cn("data-horizontal:w-full", className)}
			value={displayValue}
			onValueChange={handleValueChange}
			onValueCommitted={handleValueCommitted}
			min={min}
			max={max}
			disabled={disabled}
			thumbAlignment="edge"
		>
			<SliderPrimitive.Control className="relative flex h-5 w-full touch-none items-center select-none data-disabled:opacity-50">
				<SliderPrimitive.Track className="bg-muted relative h-1.5 w-full rounded-none select-none">
					<SliderPrimitive.Indicator className="bg-primary h-full select-none" />
					<SliderPrimitive.Thumb
						className="border-ring ring-ring/50 relative block size-5 shrink-0 rounded-none border bg-white transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-1 focus-visible:ring-1 focus-visible:outline-hidden active:ring-1 disabled:pointer-events-none disabled:opacity-50"
						onMouseEnter={() => setIsHovering(true)}
						onMouseLeave={() => setIsHovering(false)}
					>
						{showTooltip && (
							<div className="bg-foreground text-background absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-none px-2 py-1 text-xs whitespace-nowrap">
								{tooltipContent}
								<div className="bg-foreground absolute top-full left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45" />
							</div>
						)}
					</SliderPrimitive.Thumb>
				</SliderPrimitive.Track>
			</SliderPrimitive.Control>
		</SliderPrimitive.Root>
	)
}

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
