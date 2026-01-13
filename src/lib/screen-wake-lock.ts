import { useEffect, useRef } from "react"

export { useScreenWakeLock }

/**
 * Hook to keep screen awake while component is mounted.
 * Automatically handles:
 * - Feature detection (graceful fallback on unsupported browsers)
 * - Reacquiring lock on visibility change (tab switch, etc.)
 * - Cleanup on unmount
 */
function useScreenWakeLock() {
	let wakeLockRef = useRef<WakeLockSentinel | null>(null)

	useEffect(() => {
		if (!("wakeLock" in navigator)) return

		async function requestWakeLock() {
			if (document.visibilityState !== "visible") return
			try {
				wakeLockRef.current = await navigator.wakeLock.request("screen")
			} catch {
				// request can fail due to low battery, power save mode, etc.
			}
		}

		function handleVisibilityChange() {
			if (document.visibilityState === "visible" && !wakeLockRef.current) {
				requestWakeLock()
			}
		}

		requestWakeLock()
		document.addEventListener("visibilitychange", handleVisibilityChange)

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange)
			if (wakeLockRef.current) {
				wakeLockRef.current.release()
				wakeLockRef.current = null
			}
		}
	}, [])
}
