export { isMac, modKey, altModKey, isTouchDevice }

let isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent)

let modKey = isMac ? "⌘" : "Ctrl+"
let altModKey = isMac ? "⌥⌘" : "Ctrl+Alt+"

function isTouchDevice(): boolean {
	return (
		typeof window !== "undefined" &&
		("ontouchstart" in window || navigator.maxTouchPoints > 0)
	)
}
