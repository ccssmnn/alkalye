import { StrictMode } from "react"
import { JazzReactProvider, useAccount } from "jazz-tools/react"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { Toaster } from "sonner"
import { routeTree } from "#app/routeTree.gen"
import { UserAccount, migrateAnonymousData } from "@/schema"
import { env } from "@/lib/env"
import {
	SplashScreen,
	SplashScreenStatic,
	useSplashDelay,
} from "@/components/splash-screen"
import { PWAContext, usePWAProvider, PWAInstallHint } from "@/lib/pwa"
import {
	BackupSubscriber,
	SpacesBackupSubscriber,
} from "@/lib/backup-subscribers"
import { useCleanupDeleted } from "@/lib/use-cleanup-deleted"
import { init } from "@plausible-analytics/tracker"

init({ domain: "alkalye.com" })

let router = createRouter({
	basepath: "/app",
	routeTree,
	context: { me: null },
	defaultPreload: false,
	defaultStaleTime: 0,
	defaultGcTime: 0,
})

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router
	}
}

function ContextPWAProvider({ children }: { children: React.ReactNode }) {
	let pwa = usePWAProvider()
	return <PWAContext.Provider value={pwa}>{children}</PWAContext.Provider>
}

function RouterWithJazz() {
	let me = useAccount(UserAccount)
	let splashReady = useSplashDelay(700)
	let showSplash = me.$jazz.loadingState === "loading" || !splashReady

	useCleanupDeleted()

	return (
		<ContextPWAProvider>
			<Toaster />
			<PWAInstallHint />
			<BackupSubscriber />
			<SpacesBackupSubscriber />
			<SplashScreen show={showSplash} />
			<RouterProvider
				router={router}
				context={{ me: me.$isLoaded ? me : null }}
			/>
		</ContextPWAProvider>
	)
}

export function PWA() {
	return (
		<StrictMode>
			<JazzReactProvider
				AccountSchema={UserAccount}
				sync={{
					peer: env.VITE_JAZZ_SYNC_SERVER as `wss://${string}`,
					when: "always",
				}}
				onAnonymousAccountDiscarded={migrateAnonymousData}
				fallback={<SplashScreenStatic />}
			>
				<RouterWithJazz />
			</JazzReactProvider>
		</StrictMode>
	)
}
