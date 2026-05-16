import { StrictMode } from "react"
import { JazzReactProvider, useAccount } from "jazz-tools/react"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { PUBLIC_JAZZ_SYNC_SERVER } from "astro:env/client"
import { Toaster } from "sonner"
import { routeTree } from "#app/routeTree.gen"
import { UserAccount, migrateAnonymousData } from "@/schema"
import {
	SplashScreen,
	SplashScreenStatic,
	useSplashDelay,
} from "@/app/features/onboarding"
import { PWAContext, usePWAProvider, PWAInstallHint } from "@/app/lib/pwa"
import { BackupSubscriber, SpacesBackupSubscriber } from "@/app/features/backup"
import { useCleanupDeleted } from "@/app/features/documents"
import { init } from "@plausible-analytics/tracker"
import { IntlProvider } from "@/shared/intl/setup"
import { messagesDe } from "@/shared/intl/messages"

export { PWA, buildSyncConfig }

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

type JazzSyncProps = Parameters<typeof JazzReactProvider>[0]["sync"]
type JazzSyncConfig = NonNullable<JazzSyncProps>
type SyncPeer = JazzSyncConfig["peer"]

function buildSyncConfig(): JazzSyncConfig {
	let syncServer = PUBLIC_JAZZ_SYNC_SERVER
	if (!isSyncPeer(syncServer)) {
		throw new Error("PUBLIC_JAZZ_SYNC_SERVER must be a ws:// or wss:// URL")
	}

	let syncConfig: JazzSyncConfig = {
		peer: syncServer,
		when: "always",
	}

	return syncConfig
}

function PWA() {
	return (
		<StrictMode>
			<JazzReactProvider
				AccountSchema={UserAccount}
				sync={buildSyncConfig()}
				onAnonymousAccountDiscarded={migrateAnonymousData}
				fallback={<SplashScreenStatic />}
			>
				<RouterWithJazz />
			</JazzReactProvider>
		</StrictMode>
	)
}

function isSyncPeer(value: string | undefined): value is SyncPeer {
	if (!value) return false
	return value.startsWith("ws://") || value.startsWith("wss://")
}

function ContextPWAProvider({ children }: { children: React.ReactNode }) {
	let pwa = usePWAProvider()
	return <PWAContext.Provider value={pwa}>{children}</PWAContext.Provider>
}

function RouterWithJazz() {
	let me = useAccount(UserAccount, { resolve: { root: true } })
	let splashReady = useSplashDelay(700)
	let showSplash = me.$jazz.loadingState === "loading" || !splashReady

	useCleanupDeleted()

	let locale = me.$isLoaded ? me.root?.language || "en" : "en"

	let content = (
		<>
			<Toaster />
			<PWAInstallHint />
			<BackupSubscriber />
			<SpacesBackupSubscriber />
			<SplashScreen show={showSplash} />
			<RouterProvider
				router={router}
				context={{ me: me.$isLoaded ? me : null }}
			/>
		</>
	)

	let intlWrapped = <ContextPWAProvider>{content}</ContextPWAProvider>

	return locale === "de" ? (
		<IntlProvider messages={messagesDe} locale="de">
			{intlWrapped}
		</IntlProvider>
	) : (
		<IntlProvider>{intlWrapped}</IntlProvider>
	)
}
