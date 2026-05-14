import { createContext, useContext, useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Share, Upload } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/app/components/ui/dialog"
import {
	isAndroid,
	isIOS,
	isMobileDevice,
	getPWAInstalledSnapshot,
	useIsPWAInstalled,
} from "@/app/lib/platform"

export { PWAContext, usePWA, usePWAProvider }
export { PWAInstallHint, PWAInstallDialog }
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
	let [needRefresh, setNeedRefresh] = useState(false)
	let [offlineReady, setOfflineReady] = useState(false)
	let updateRef = useRef<(reload?: boolean) => Promise<void>>(() =>
		Promise.resolve(),
	)

	// virtual:pwa-register is a Vite virtual module. Dynamic-importing it
	// inside useEffect keeps this file safe to load in non-Vite contexts
	// (CLI, Node tests). Outside a browser the effect never runs.
	useEffect(() => {
		let cancelled = false
		import("virtual:pwa-register")
			.then(({ registerSW }) => {
				if (cancelled) return
				let updateSW = registerSW({
					onRegisteredSW(swUrl, registration) {
						console.log("[PWA] Service worker registered:", swUrl)
						if (registration) {
							;(
								window as Window & {
									__swRegistration?: ServiceWorkerRegistration
								}
							).__swRegistration = registration
						}
					},
					onRegisterError(error) {
						console.error("[PWA] Service worker registration error:", error)
					},
					onNeedRefresh() {
						setNeedRefresh(true)
						toast("Update available", {
							description: "Reload to update to the latest version",
							duration: Infinity,
							action: {
								label: "Reload",
								onClick: () => updateSW(true),
							},
							onDismiss: () => setNeedRefresh(false),
						})
					},
					onOfflineReady() {
						setOfflineReady(true)
						if (isMobileDevice() && getPWAInstalledSnapshot()) {
							toast("Ready to work offline", {
								description: "App has been cached for offline use",
								duration: 4000,
							})
						}
						setTimeout(() => setOfflineReady(false), 4000)
					},
				})
				updateRef.current = updateSW
			})
			.catch(err => {
				console.warn("[PWA] registration unavailable in this environment", err)
			})
		return () => {
			cancelled = true
		}
	}, [])

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
		updateServiceWorker: () => updateRef.current(true),
		checkForUpdates,
	}
}

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let INSTALL_HINT_DISMISSED_KEY = "pwa-install-hint-dismissed"

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
						<div className="font-medium">Install Alkalye</div>
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
					<DialogTitle>Install Alkalye</DialogTitle>
					<DialogDescription>
						{isMobileDevice()
							? "Add Alkalye to your homescreen for instant access and the best experience."
							: "Install Alkalye as an app for quick access and a better experience."}
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
				<li>
					Select &ldquo;Add to Home screen&rdquo; or &ldquo;Install app&rdquo;
				</li>
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
				<li>Scroll down and tap &ldquo;Add to Home Screen&rdquo;</li>
				<li>Tap &ldquo;Add&rdquo; in the top right corner</li>
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
						select &ldquo;Install app&rdquo;
					</p>
				</div>
				<div>
					<p className="font-medium">Safari (macOS)</p>
					<p className="text-muted-foreground">Click File &gt; Add to Dock</p>
				</div>
				<div>
					<p className="font-medium">Firefox</p>
					<p className="text-muted-foreground">
						Firefox doesn&apos;t support PWA installation. Use Chrome or Edge
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
				<li>Open your browser&apos;s menu</li>
				<li>
					Look for &ldquo;Add to Home Screen&rdquo; or &ldquo;Install App&rdquo;
				</li>
			</ol>
		</div>
	)
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
		} catch {
			// Ignore localStorage errors (e.g. in private browsing)
		}
	}

	return { dismissed, setDismissed }
}
