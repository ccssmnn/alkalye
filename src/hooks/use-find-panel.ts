import { useCallback } from "react"
import { useNavigate } from "@tanstack/react-router"

export { useFindPanel }

function useFindPanel(): {
	findOpen: boolean
	findQuery?: string
	findCase?: boolean
	findFuzzy?: boolean
	setFind: (updates: FindPanelState) => void
} {
	// Use search from URL directly to ensure reactivity
	let search = getSearchFromUrl()
	let navigate = useNavigate()

	let findOpen = search.find === true
	let findQuery = search.q
	let findCase = search.case
	let findFuzzy = search.fuzzy

	let setFind = useCallback(
		(updates: FindPanelState) => {
			// Always read current URL state to avoid stale closure issues
			let currentSearch = getSearchFromUrl()
			let nextSearch: FindSearchSchema = { ...currentSearch }

			if (updates.open !== undefined) {
				if (updates.open) {
					nextSearch.find = true
				} else {
					// Clear all find-related params when closing
					delete nextSearch.find
					delete nextSearch.q
					delete nextSearch.case
					delete nextSearch.fuzzy
				}
			}

			if (updates.q !== undefined) {
				if (updates.q) {
					nextSearch.q = updates.q
				} else {
					delete nextSearch.q
				}
			}

			if (updates.case !== undefined) {
				if (updates.case) {
					nextSearch.case = true
				} else {
					delete nextSearch.case
				}
			}

			if (updates.fuzzy !== undefined) {
				if (updates.fuzzy) {
					nextSearch.fuzzy = true
				} else {
					delete nextSearch.fuzzy
				}
			}

			void navigate({
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				search: nextSearch as any,
				replace: true,
			})
		},
		[navigate],
	)

	return { findOpen, findQuery, findCase, findFuzzy, setFind }
}

interface FindPanelState {
	open?: boolean
	q?: string
	case?: boolean
	fuzzy?: boolean
}

// Generic search schema that works with any doc route
interface FindSearchSchema {
	find?: boolean
	q?: string
	case?: boolean
	fuzzy?: boolean
	[key: string]: unknown
}

function getSearchFromUrl(): FindSearchSchema {
	let params = new URLSearchParams(window.location.search)
	return {
		find: params.get("find") === "true" || undefined,
		q: params.get("q") ?? undefined,
		case: params.get("case") === "true" || undefined,
		fuzzy: params.get("fuzzy") === "true" || undefined,
	}
}
