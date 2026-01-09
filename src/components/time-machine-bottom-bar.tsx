import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import type { DayGroup } from "@/lib/time-machine"

export { TimeMachineBottomBar }
export type { ViewMode }

type ViewMode = "days" | "edits"

interface TimeMachineBottomBarProps {
	currentEditIndex: number
	dayGroups: DayGroup[]
	selectedDayIndex: number | null // null = viewing all days, number = viewing edits within that day
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

	// When viewing days: slider position is day index, value is last edit of that day
	// When viewing edits within a day: slider position is edit index within that day
	let isViewingDay = viewMode === "edits" && selectedDayIndex !== null
	let selectedDay =
		selectedDayIndex !== null ? dayGroups[selectedDayIndex] : null

	// Find which day the current edit belongs to
	let currentDayIndex = dayGroups.findIndex(day =>
		day.edits.some(e => e.index === currentEditIndex),
	)
	if (currentDayIndex === -1 && dayGroups.length > 0) {
		// Fallback to last day if not found
		currentDayIndex = dayGroups.length - 1
	}

	// For day view: slider position is the day index
	// For edit view: slider position is the edit index within the selected day
	let sliderMax: number
	let sliderValue: number

	if (isViewingDay && selectedDay) {
		// Viewing edits within a specific day
		sliderMax = selectedDay.edits.length - 1
		let editIndexInDay = selectedDay.edits.findIndex(
			e => e.index === currentEditIndex,
		)
		sliderValue = editIndexInDay >= 0 ? editIndexInDay : 0
	} else {
		// Viewing days
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
				// Navigate to specific edit within the day
				let edit = selectedDay.edits[value]
				if (edit) {
					onEditChange(edit.index)
				}
			} else {
				// Navigate to last edit of the selected day
				let day = dayGroups[value]
				if (day) {
					onEditChange(day.lastEditIndex)
				}
			}
		}, 50)
	}

	function handlePrevious() {
		if (isViewingDay && selectedDay) {
			// Previous edit within day
			let editIndexInDay = selectedDay.edits.findIndex(
				e => e.index === currentEditIndex,
			)
			if (editIndexInDay > 0) {
				onEditChange(selectedDay.edits[editIndexInDay - 1].index)
			}
		} else {
			// Previous day
			if (currentDayIndex > 0) {
				onEditChange(dayGroups[currentDayIndex - 1].lastEditIndex)
			}
		}
	}

	function handleNext() {
		if (isViewingDay && selectedDay) {
			// Next edit within day
			let editIndexInDay = selectedDay.edits.findIndex(
				e => e.index === currentEditIndex,
			)
			if (editIndexInDay < selectedDay.edits.length - 1) {
				onEditChange(selectedDay.edits[editIndexInDay + 1].index)
			}
		} else {
			// Next day
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

	// Format date for display
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

	// Status text
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

	// Dropdown label
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

// --- Mode Dropdown ---

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
