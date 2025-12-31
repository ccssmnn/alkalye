import { useEffect, useRef } from "react"

export { useAutoFocusInput }

function useAutoFocusInput<T extends HTMLElement = HTMLInputElement>() {
	let inputRef = useRef<T>(null)

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			let target = e.target as HTMLElement
			let isInputElement =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.contentEditable === "true"

			if (
				!isInputElement &&
				!e.ctrlKey &&
				!e.metaKey &&
				!e.altKey &&
				e.key.length === 1 &&
				inputRef.current &&
				"focus" in inputRef.current
			) {
				;(inputRef.current as HTMLElement).focus()
			}
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [])

	return inputRef
}
