import { useSyncExternalStore } from "react"

export { useIsMobile }

let MOBILE_BREAKPOINT = 1024

function useIsMobile() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

// =============================================================================
// Helper functions (used by exported functions above)
// =============================================================================

function getSnapshot() {
	return window.innerWidth < MOBILE_BREAKPOINT
}

function getServerSnapshot() {
	return false // Default to desktop on server
}

function subscribe(callback: () => void) {
	let mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
	mql.addEventListener("change", callback)
	return () => mql.removeEventListener("change", callback)
}
