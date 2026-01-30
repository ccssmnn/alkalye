import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { EditorView } from "@codemirror/view"
import { X, ChevronUp, ChevronDown, CaseSensitive } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import { useSidebar } from "@/components/ui/sidebar"
import { setFindQuery, selectMatch, getFindState } from "./find-extension"

export { FindPanel }

interface FindPanelProps {
	view: EditorView | null
	initialQuery?: string
	onClose: () => void
	onHeightChange?: (height: number) => void
}

function FindPanel({
	view,
	initialQuery,
	onClose,
	onHeightChange,
}: FindPanelProps) {
	let { rightOpen, isMobile } = useSidebar()
	let inputRef = useRef<HTMLInputElement>(null)
	let panelRef = useRef<HTMLDivElement>(null)
	let [query, setQuery] = useState(initialQuery ?? lastQuery)
	let [caseSensitive, setCaseSensitive] = useState(lastCaseSensitive)
	let [fuzzy, setFuzzy] = useState(lastFuzzy)
	let [matchInfo, setMatchInfo] = useState({ current: 0, total: 0 })

	let closeRef = useRef(onClose)
	let viewRef = useRef(view)

	useEffect(() => {
		closeRef.current = onClose
		viewRef.current = view
	})

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus()
		inputRef.current?.select()
	}, [])

	// Report height changes
	useEffect(() => {
		if (!panelRef.current || !onHeightChange) return

		let observer = new ResizeObserver(entries => {
			let entry = entries[0]
			if (entry) {
				onHeightChange(entry.contentRect.height + 16) // +16 for padding
			}
		})

		observer.observe(panelRef.current)
		onHeightChange(panelRef.current.offsetHeight + 16)

		return () => observer.disconnect()
	}, [onHeightChange])

	// Global Escape handler
	useEffect(() => {
		function handleGlobalKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.preventDefault()
				if (viewRef.current) {
					setFindQuery(viewRef.current, "", false, false)
					viewRef.current.focus()
				}
				closeRef.current()
			}
		}

		document.addEventListener("keydown", handleGlobalKeyDown)
		return () => document.removeEventListener("keydown", handleGlobalKeyDown)
	}, [])

	// Sync query to editor
	useEffect(() => {
		if (!view) return

		setFindQuery(view, query, caseSensitive, fuzzy)

		// Persist for next open
		lastQuery = query
		lastCaseSensitive = caseSensitive
		lastFuzzy = fuzzy

		// Update match info after state settles
		requestAnimationFrame(() => {
			let state = getFindState(view)
			setMatchInfo({
				current: state.currentIndex + 1,
				total: state.matches.length,
			})
		})
	}, [view, query, caseSensitive, fuzzy])

	// Poll for match info changes (when navigating matches)
	useEffect(() => {
		if (!view) return

		let lastCurrent = -1
		let lastTotal = -1

		let interval = setInterval(() => {
			let state = getFindState(view)
			let current = state.currentIndex + 1
			let total = state.matches.length

			if (current !== lastCurrent || total !== lastTotal) {
				lastCurrent = current
				lastTotal = total
				setMatchInfo({ current, total })
			}
		}, 100)

		return () => clearInterval(interval)
	}, [view])

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") return
		if (e.key === "Enter") {
			e.preventDefault()
			if (view) {
				selectMatch(view, e.shiftKey ? "prev" : "next")
			}
		}
	}

	function handleClose() {
		if (view) {
			// Clear highlights
			setFindQuery(view, "", false, false)
			view.focus()
		}
		onClose()
	}

	function handleNext() {
		if (view) selectMatch(view, "next")
	}

	function handlePrev() {
		if (view) selectMatch(view, "prev")
	}

	let sidebarWidth = rightOpen && !isMobile ? "14rem" : "0px"

	let panel = (
		<div
			ref={panelRef}
			className="find-panel bg-background border-border fixed z-50 flex flex-col gap-1.5 rounded border p-2 shadow-md transition-[right] duration-200 ease-in md:flex-row md:items-center md:py-1.5"
			style={{
				top: "calc(48px + env(safe-area-inset-top) + 0.75rem)",
				right: `calc(${sidebarWidth} + 0.75rem)`,
				left: isMobile ? "0.75rem" : "auto",
			}}
		>
			{/* Row 1: Input + Close */}
			<div className="flex items-center gap-1.5">
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={e => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Find..."
					className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-7 flex-1 rounded-none border bg-transparent px-2 text-xs outline-none focus-visible:ring-1 md:w-48 md:flex-none"
				/>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button size="icon-xs" variant="ghost" onClick={handleClose}>
								<X className="size-3.5" />
							</Button>
						}
					/>
					<TooltipContent side="bottom">
						Close <Kbd>Esc</Kbd>
					</TooltipContent>
				</Tooltip>
			</div>

			{/* Row 2: Controls */}
			<div className="flex items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								size="icon-xs"
								variant={caseSensitive ? "secondary" : "ghost"}
								onClick={() => setCaseSensitive(!caseSensitive)}
							>
								<CaseSensitive className="size-3.5" />
							</Button>
						}
					/>
					<TooltipContent side="bottom">Case sensitive</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								size="xs"
								variant={fuzzy ? "secondary" : "ghost"}
								onClick={() => setFuzzy(!fuzzy)}
								className="px-1.5 font-mono"
							>
								.*
							</Button>
						}
					/>
					<TooltipContent side="bottom">Fuzzy matching</TooltipContent>
				</Tooltip>

				<span
					className={cn(
						"text-muted-foreground flex-1 text-center text-xs tabular-nums md:min-w-[4rem] md:flex-none",
						matchInfo.total === 0 && query && "text-destructive",
					)}
				>
					{query
						? matchInfo.total > 0
							? `${matchInfo.current} of ${matchInfo.total}`
							: "No results"
						: ""}
				</span>

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								size="icon-xs"
								variant="ghost"
								onClick={handlePrev}
								disabled={matchInfo.total === 0}
							>
								<ChevronUp className="size-3.5" />
							</Button>
						}
					/>
					<TooltipContent side="bottom">
						Previous <Kbd>Shift</Kbd>
						<Kbd>F3</Kbd> or <Kbd>Shift</Kbd>
						<Kbd>Enter</Kbd>
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								size="icon-xs"
								variant="ghost"
								onClick={handleNext}
								disabled={matchInfo.total === 0}
							>
								<ChevronDown className="size-3.5" />
							</Button>
						}
					/>
					<TooltipContent side="bottom">
						Next <Kbd>F3</Kbd> or <Kbd>Enter</Kbd>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	)

	return createPortal(panel, document.body)
}

// Module-level state for persistence across panel open/close
let lastQuery = ""
let lastCaseSensitive = false
let lastFuzzy = false
