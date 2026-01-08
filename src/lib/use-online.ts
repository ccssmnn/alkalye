import { useSyncExternalStore } from "react"

export { useIsOnline }

function getSnapshot() {
	return navigator.onLine
}

function getServerSnapshot() {
	return true
}

function subscribe(callback: () => void) {
	window.addEventListener("online", callback)
	window.addEventListener("offline", callback)
	return () => {
		window.removeEventListener("online", callback)
		window.removeEventListener("offline", callback)
	}
}

function useIsOnline() {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
