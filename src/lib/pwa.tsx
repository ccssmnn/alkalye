import {
	createContext,
	useContext,
	useState,
	useEffect,
	useSyncExternalStore,
} from "react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { toast } from "sonner"
import { Share, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog"

export { PWAContext, usePWA, usePWAProvider }
export { PWAInstallHint, PWAInstallDialog }
export { useIsPWAInstalled, isAndroid, isIOS, isMobileDevice }
export type { PWAContextValue }

type PWAContextValue = {
	needRefresh: boolean
	offlineReady: boolean
	updateServiceWorker: () => Promise<void>
	checkForUpdates: () => Promise<void>
}

let PWAContext = createContext<PWAContextValue | null>(null)

function usePWA(): PWAContextValue {
	let context = useContext(PWAContext)
	if (!context) {
		return {
			needRefresh: false,
			offlineReady: false,
			updateServiceWorker: async () => {},
			checkForUpdates: async () => {},
		}
	}
	return context
}

function usePWAProvider(): PWAContextValue {
	let {
		needRefresh: [needRefresh, setNeedRefresh],
		offlineReady: [offlineReady, setOfflineReady],
		updateServiceWorker,
	} = useRegisterSW({
		onRegisteredSW(swUrl, registration) {
			console.log("[PWA] Service worker registered:", swUrl)
			if (registration) {
				;(
					window as Window & { __swRegistration?: ServiceWorkerRegistration }
				).__swRegistration = registration
			}
		},
		onRegisterError(error) {
			console.error("[PWA] Service worker registration error:", error)
		},
		onNeedRefresh() {
			toast("Update available", {
				description: "Reload to update to the latest version",
				duration: Infinity,
				action: {
					label: "Reload",
					onClick: () => updateServiceWorker(true),
				},
				onDismiss: () => setNeedRefresh(false),
			})
		},
		onOfflineReady() {
			toast("Ready to work offline", {
				description: "App has been cached for offline use",
				duration: 4000,
			})
			setTimeout(() => setOfflineReady(false), 4000)
		},
	})

	async function checkForUpdates() {
		let registration = (
			window as Window & { __swRegistration?: ServiceWorkerRegistration }
		).__swRegistration
		if (registration) {
			await registration.update()
		}
	}

	return {
		needRefresh,
		offlineReady,
		updateServiceWorker: () => updateServiceWorker(true),
		checkForUpdates,
	}
}

// Detection hooks and helpers

function subscribeToPWAInstalled(callback: () => void) {
	let mediaQuery = window.matchMedia("(display-mode: standalone)")
	mediaQuery.addEventListener("change", callback)
	return () => mediaQuery.removeEventListener("change", callback)
}

function getPWAInstalledSnapshot() {
	let isStandalone = window.matchMedia("(display-mode: standalone)").matches
	let isIOSStandalone =
		(window.navigator as unknown as { standalone: boolean }).standalone === true
	return isStandalone || isIOSStandalone
}

function useIsPWAInstalled(): boolean {
	return useSyncExternalStore(
		subscribeToPWAInstalled,
		getPWAInstalledSnapshot,
		() => false, // Server default
	)
}

function isAndroid(): boolean {
	return navigator.userAgent.toLowerCase().includes("android")
}

function isIOS(): boolean {
	return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())
}

function isMobileDevice(): boolean {
	let userAgent = navigator.userAgent.toLowerCase()
	let isMobile =
		/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
			userAgent,
		)
	let hasTouchScreen = "ontouchstart" in window || navigator.maxTouchPoints > 0
	return isMobile || hasTouchScreen
}

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

function usePWAInstallPrompt() {
	let [deferredPrompt, setDeferredPrompt] =
		useState<BeforeInstallPromptEvent | null>(null)
	let [canInstall, setCanInstall] = useState(false)

	useEffect(() => {
		function handleBeforeInstallPrompt(e: Event) {
			e.preventDefault()
			setDeferredPrompt(e as BeforeInstallPromptEvent)
			setCanInstall(true)
		}

		function handleAppInstalled() {
			setDeferredPrompt(null)
			setCanInstall(false)
		}

		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
		window.addEventListener("appinstalled", handleAppInstalled)

		return () => {
			window.removeEventListener(
				"beforeinstallprompt",
				handleBeforeInstallPrompt,
			)
			window.removeEventListener("appinstalled", handleAppInstalled)
		}
	}, [])

	async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
		if (!deferredPrompt) return null

		await deferredPrompt.prompt()
		let choiceResult = await deferredPrompt.userChoice

		setDeferredPrompt(null)
		setCanInstall(false)

		return choiceResult.outcome
	}

	return { canInstall, promptInstall }
}

let INSTALL_HINT_DISMISSED_KEY = "pwa-install-hint-dismissed"

function usePWAInstallHintDismissed() {
	let [dismissed, setDismissedState] = useState(() => {
		try {
			return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === "true"
		} catch {
			return false
		}
	})

	function setDismissed(value: boolean) {
		setDismissedState(value)
		try {
			if (value) {
				localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "true")
			} else {
				localStorage.removeItem(INSTALL_HINT_DISMISSED_KEY)
			}
		} catch {}
	}

	return { dismissed, setDismissed }
}

// Components

function PWAInstallHint() {
	let isPWAInstalled = useIsPWAInstalled()
	let { dismissed, setDismissed } = usePWAInstallHintDismissed()
	let [dialogOpen, setDialogOpen] = useState(false)
	let [toastShown, setToastShown] = useState(false)

	let shouldShowHint = isMobileDevice() && !isPWAInstalled && !dismissed

	useEffect(() => {
		if (!shouldShowHint || toastShown) return

		let timeout = setTimeout(() => {
			setToastShown(true)
			toast(
				<div className="flex flex-col gap-3">
					<div>
						<div className="font-medium">Install Alkalyte</div>
						<div className="text-muted-foreground text-sm">
							Add to your homescreen for the best experience.
						</div>
					</div>
					<div className="flex flex-row-reverse justify-start gap-2">
						<Button
							size="sm"
							onClick={() => {
								toast.dismiss()
								setDialogOpen(true)
							}}
						>
							Show me how
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => {
								toast.dismiss()
								setDismissed(true)
							}}
						>
							Maybe later
						</Button>
					</div>
				</div>,
				{ duration: Infinity },
			)
		}, 2000)

		return () => clearTimeout(timeout)
	}, [shouldShowHint, toastShown, setDismissed])

	return (
		<PWAInstallDialog
			open={dialogOpen}
			onOpenChange={setDialogOpen}
			onInstallComplete={() => setDialogOpen(false)}
		/>
	)
}

interface PWAInstallDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onInstallComplete?: () => void
}

function PWAInstallDialog({
	open,
	onOpenChange,
	onInstallComplete,
}: PWAInstallDialogProps) {
	let { canInstall, promptInstall } = usePWAInstallPrompt()

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Install Alkalyte</DialogTitle>
					<DialogDescription>
						{isMobileDevice()
							? "Add Alkalyte to your homescreen for instant access and the best experience."
							: "Install Alkalyte as an app for quick access and a better experience."}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					{isAndroid() && canInstall && (
						<AndroidChromeInstructions
							onInstall={promptInstall}
							onInstallComplete={onInstallComplete}
						/>
					)}
					{isAndroid() && !canInstall && <AndroidManualInstructions />}
					{isIOS() && <IOSInstructions />}
					{!isAndroid() && !isIOS() && isMobileDevice() && (
						<GenericInstructions />
					)}
					{!isMobileDevice() && (
						<DesktopInstructions
							canInstall={canInstall}
							onInstall={promptInstall}
							onInstallComplete={onInstallComplete}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}

// Instruction components

function AndroidChromeInstructions({
	onInstall,
	onInstallComplete,
}: {
	onInstall: () => Promise<"accepted" | "dismissed" | null>
	onInstallComplete?: () => void
}) {
	async function handleInstall() {
		let result = await onInstall()
		if (result === "accepted") onInstallComplete?.()
	}

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">
				Your browser supports direct installation:
			</p>
			<Button onClick={handleInstall} className="w-full">
				Install App
			</Button>
		</div>
	)
}

function AndroidManualInstructions() {
	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">
				To install, follow these steps:
			</p>
			<ol className="text-muted-foreground list-decimal space-y-2 pl-4 text-xs">
				<li>
					Tap the menu button <Share className="inline size-3" /> in your
					browser
				</li>
				<li>Select "Add to Home screen" or "Install app"</li>
				<li>Confirm the installation</li>
			</ol>
		</div>
	)
}

function IOSInstructions() {
	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">
				To install on iOS, use Safari and follow these steps:
			</p>
			<ol className="text-muted-foreground list-decimal space-y-2 pl-4 text-xs">
				<li>
					Tap the Share button <Upload className="inline size-3" /> at the
					bottom of Safari
				</li>
				<li>Scroll down and tap "Add to Home Screen"</li>
				<li>Tap "Add" in the top right corner</li>
			</ol>
			<p className="text-muted-foreground bg-muted/50 rounded p-2 text-xs">
				Note: This only works in Safari, not other browsers on iOS.
			</p>
		</div>
	)
}

function DesktopInstructions({
	canInstall,
	onInstall,
	onInstallComplete,
}: {
	canInstall: boolean
	onInstall: () => Promise<"accepted" | "dismissed" | null>
	onInstallComplete?: () => void
}) {
	async function handleInstall() {
		let result = await onInstall()
		if (result === "accepted") onInstallComplete?.()
	}

	if (canInstall) {
		return (
			<div className="space-y-3">
				<p className="text-muted-foreground text-xs">
					Your browser supports direct installation:
				</p>
				<Button onClick={handleInstall} className="w-full">
					Install App
				</Button>
			</div>
		)
	}

	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">
				Install instructions vary by browser:
			</p>
			<div className="space-y-3 text-xs">
				<div>
					<p className="font-medium">Chrome / Edge</p>
					<p className="text-muted-foreground">
						Look for the install icon in the address bar, or use the menu and
						select "Install app"
					</p>
				</div>
				<div>
					<p className="font-medium">Safari (macOS)</p>
					<p className="text-muted-foreground">Click File &gt; Add to Dock</p>
				</div>
				<div>
					<p className="font-medium">Firefox</p>
					<p className="text-muted-foreground">
						Firefox doesn't support PWA installation. Use Chrome or Edge
						instead.
					</p>
				</div>
			</div>
		</div>
	)
}

function GenericInstructions() {
	return (
		<div className="space-y-3">
			<p className="text-muted-foreground text-xs">To install:</p>
			<ol className="text-muted-foreground list-decimal space-y-2 pl-4 text-xs">
				<li>Open your browser's menu</li>
				<li>Look for "Add to Home Screen" or "Install App"</li>
			</ol>
		</div>
	)
}
