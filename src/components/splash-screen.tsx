import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"

export { SplashScreen, SplashScreenStatic, useSplashDelay }

declare global {
	interface Window {
		__pageLoadTime?: number
	}
}

function useSplashDelay(minDurationMs = 1000) {
	let [ready, setReady] = useState(false)

	useEffect(() => {
		let loadTime = window.__pageLoadTime ?? Date.now()
		let elapsed = Date.now() - loadTime
		let remaining = Math.max(0, minDurationMs - elapsed)

		if (remaining === 0) {
			setReady(true)
		} else {
			let timer = setTimeout(() => setReady(true), remaining)
			return () => clearTimeout(timer)
		}
	}, [minDurationMs])

	return ready
}

function SplashScreenStatic() {
	useEffect(() => {
		document.getElementById("splash")?.remove()
	}, [])

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
			<SplashIcon />
		</div>
	)
}

function SplashScreen({ show }: { show: boolean }) {
	return (
		<AnimatePresence>
			{show && (
				<motion.div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black"
					initial={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.3, ease: "easeOut" }}
				>
					<motion.div
						exit={{ scale: 0.9, opacity: 0 }}
						transition={{ duration: 0.3, ease: "easeOut" }}
					>
						<SplashIcon />
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}

function SplashIcon() {
	return (
		<div className="flex aspect-square size-48 flex-col items-center justify-center rounded-3xl bg-radial from-emerald-900 from-0% via-emerald-950 via-30% to-black to-70% font-mono text-white">
			<div className="text-[36px] leading-none font-bold tracking-tighter">
				Alkalye
			</div>
		</div>
	)
}
