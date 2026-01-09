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

export { TimeMachineBottomBar }
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

function TimeMachineBottomBar({
	currentEdit,
	totalEdits,
	onEditChange,
	disabled = false,
	zoomLevel,
	onZoomChange,
}: TimeMachineBottomBarProps) {
	let [localValue, setLocalValue] = useState(currentEdit)
	let debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Sync local value when currentEdit changes from outside
	useEffect(() => {
		setLocalValue(currentEdit)
	}, [currentEdit])

	function handleSliderChange(value: number) {
		setLocalValue(value)

		// Debounce the actual update
		if (debounceRef.current) {
			clearTimeout(debounceRef.current)
		}
		debounceRef.current = setTimeout(() => {
			onEditChange(value)
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
			className="border-border bg-background fixed right-0 bottom-0 left-0 z-20 flex items-center gap-4 border-t px-4 py-3"
			style={{
				paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
				paddingLeft: "max(1rem, env(safe-area-inset-left))",
				paddingRight: "max(1rem, env(safe-area-inset-right))",
			}}
		>
			<div className="flex items-center gap-2">
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
					className="border-input bg-background hover:bg-accent hover:text-accent-foreground flex h-9 items-center justify-between gap-1 rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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

			<div className="flex flex-1 items-center gap-4">
				<input
					type="range"
					min={0}
					max={Math.max(0, totalEdits - 1)}
					value={localValue}
					onChange={e => handleSliderChange(Number(e.target.value))}
					disabled={disabled || !hasHistory}
					className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:accent-gray-100"
				/>
			</div>

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
	)
}
