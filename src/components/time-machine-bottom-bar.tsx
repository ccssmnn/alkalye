import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"

export { TimeMachineBottomBar, calculateZoomWindow }
export type { ZoomLevel }

type ZoomLevel = 25 | 100 | 500 | "all"

interface TimeMachineBottomBarProps {
	currentEdit: number
	totalEdits: number
	onEditChange: (editIndex: number) => void
	disabled?: boolean
	zoomLevel: ZoomLevel
	onZoomChange: (zoom: ZoomLevel) => void
}

// Calculate the visible window of edits based on zoom level, centered on current edit
function calculateZoomWindow(
	currentEdit: number,
	totalEdits: number,
	zoomLevel: ZoomLevel,
): { windowStart: number; windowEnd: number } {
	if (zoomLevel === "all" || totalEdits <= 1) {
		return { windowStart: 0, windowEnd: totalEdits - 1 }
	}

	let windowSize = zoomLevel
	let halfWindow = Math.floor(windowSize / 2)

	// Try to center on current edit
	let windowStart = currentEdit - halfWindow
	let windowEnd = windowStart + windowSize - 1

	// Clamp to valid range
	if (windowStart < 0) {
		windowStart = 0
		windowEnd = Math.min(windowSize - 1, totalEdits - 1)
	}
	if (windowEnd >= totalEdits) {
		windowEnd = totalEdits - 1
		windowStart = Math.max(0, windowEnd - windowSize + 1)
	}

	return { windowStart, windowEnd }
}

function TimeMachineBottomBar({
	currentEdit,
	totalEdits,
	onEditChange,
	disabled = false,
	zoomLevel,
	onZoomChange,
}: TimeMachineBottomBarProps) {
	// Calculate the zoom window (visible range of edits)
	let { windowStart, windowEnd } = calculateZoomWindow(
		currentEdit,
		totalEdits,
		zoomLevel,
	)
	let windowSize = windowEnd - windowStart + 1

	// Local slider value is relative to the window (0 to windowSize-1)
	// Convert currentEdit (absolute) to slider position (window-relative)
	let sliderPosition = currentEdit - windowStart
	let [localValue, setLocalValue] = useState(sliderPosition)
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Sync local value when currentEdit or window changes from outside
	useEffect(() => {
		setLocalValue(currentEdit - windowStart)
	}, [currentEdit, windowStart])

	function handleSliderChange(value: number) {
		setLocalValue(value)

		// Convert window-relative position to absolute edit index
		let absoluteEdit = windowStart + value

		// Debounce the actual update
		if (debounceRef.current) {
			clearTimeout(debounceRef.current)
		}
		debounceRef.current = setTimeout(() => {
			onEditChange(absoluteEdit)
		}, 150)
	}

	function handlePrevious() {
		if (currentEdit > 0) {
			onEditChange(currentEdit - 1)
		}
	}

	function handleNext() {
		if (currentEdit < totalEdits - 1) {
			onEditChange(currentEdit + 1)
		}
	}

	let isAtStart = currentEdit === 0
	let isAtEnd = currentEdit >= totalEdits - 1
	let hasHistory = totalEdits > 1

	return (
		<div
			className="border-border bg-background fixed right-0 bottom-0 left-0 z-20 flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:gap-4"
			style={{
				paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
				paddingLeft: "max(1rem, env(safe-area-inset-left))",
				paddingRight: "max(1rem, env(safe-area-inset-right))",
			}}
		>
			{/* Mobile: Row 1 - Slider + edit counter */}
			<div className="flex items-center gap-3 md:hidden">
				<input
					type="range"
					min={0}
					max={Math.max(0, windowSize - 1)}
					value={localValue}
					onChange={e => handleSliderChange(Number(e.target.value))}
					disabled={disabled || !hasHistory}
					className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:accent-gray-100"
				/>
				<div className="text-muted-foreground shrink-0 text-sm tabular-nums">
					{hasHistory ? (
						<>
							{currentEdit + 1}/{totalEdits}
						</>
					) : (
						"No previous versions"
					)}
				</div>
			</div>

			{/* Mobile: Row 2 - Navigation buttons + zoom dropdown */}
			<div className="flex items-center justify-center gap-3 md:hidden">
				<Button
					variant="outline"
					size="icon"
					onClick={handlePrevious}
					disabled={disabled || isAtStart || !hasHistory}
					aria-label="Previous edit"
					className="size-10"
				>
					<ChevronLeft className="size-5" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={handleNext}
					disabled={disabled || isAtEnd || !hasHistory}
					aria-label="Next edit"
					className="size-10"
				>
					<ChevronRight className="size-5" />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger
						disabled={disabled || !hasHistory}
						className="border-input bg-background hover:bg-accent hover:text-accent-foreground flex h-10 items-center justify-between gap-1 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
					>
						<span>{zoomLevel === "all" ? "All" : zoomLevel}</span>
						<ChevronDown className="size-4 opacity-50" />
					</DropdownMenuTrigger>
					<DropdownMenuContent side="top" align="center">
						<DropdownMenuRadioGroup
							value={String(zoomLevel)}
							onValueChange={value => {
								let zoom: ZoomLevel =
									value === "all" ? "all" : (Number(value) as 25 | 100 | 500)
								onZoomChange(zoom)
							}}
						>
							<DropdownMenuRadioItem value="25">25</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="100">100</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="500">500</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Desktop: Single row layout */}
			<div className="hidden items-center gap-2 md:flex">
				<Button
					variant="outline"
					size="icon"
					onClick={handlePrevious}
					disabled={disabled || isAtStart || !hasHistory}
					aria-label="Previous edit"
				>
					<ChevronLeft className="size-4" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					onClick={handleNext}
					disabled={disabled || isAtEnd || !hasHistory}
					aria-label="Next edit"
				>
					<ChevronRight className="size-4" />
				</Button>
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger
					disabled={disabled || !hasHistory}
					className="border-input bg-background hover:bg-accent hover:text-accent-foreground hidden h-9 items-center justify-between gap-1 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 md:flex"
				>
					<span>{zoomLevel === "all" ? "All" : zoomLevel}</span>
					<ChevronDown className="size-4 opacity-50" />
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="start">
					<DropdownMenuRadioGroup
						value={String(zoomLevel)}
						onValueChange={value => {
							let zoom: ZoomLevel =
								value === "all" ? "all" : (Number(value) as 25 | 100 | 500)
							onZoomChange(zoom)
						}}
					>
						<DropdownMenuRadioItem value="25">25</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="100">100</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="500">500</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			<div className="hidden flex-1 items-center gap-4 md:flex">
				<input
					type="range"
					min={0}
					max={Math.max(0, windowSize - 1)}
					value={localValue}
					onChange={e => handleSliderChange(Number(e.target.value))}
					disabled={disabled || !hasHistory}
					className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:accent-gray-100"
				/>
			</div>

			<div className="text-muted-foreground hidden shrink-0 text-sm tabular-nums md:block">
				{hasHistory ? (
					<>
						{currentEdit + 1}/{totalEdits}
					</>
				) : (
					"No previous versions"
				)}
			</div>
		</div>
	)
}
