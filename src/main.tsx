import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { JazzReactProvider, useAccount } from "jazz-tools/react"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import { Toaster } from "sonner"
import { routeTree } from "./routeTree.gen"
import { UserAccount, migrateAnonymousData } from "./schema"
import { env } from "./lib/env"
import {
	SplashScreen,
	SplashScreenStatic,
	useSplashDelay,
} from "./components/splash-screen"
import { PWAContext, usePWAProvider, PWAInstallHint } from "./lib/pwa"
import { init } from "@plausible-analytics/tracker"

import "@fontsource-variable/geist-mono/index.css"
import "./index.css"

init({ domain: "alkalye.com" })

let router = createRouter({
	routeTree,
	context: { me: null },
})

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router
	}
}

function PWAProvider({ children }: { children: React.ReactNode }) {
	let pwa = usePWAProvider()
	return <PWAContext.Provider value={pwa}>{children}</PWAContext.Provider>
}

function RouterWithJazz() {
	let me = useAccount(UserAccount)
	let splashReady = useSplashDelay(700)
	let showSplash = me.$jazz.loadingState === "loading" || !splashReady

	return (
		<PWAProvider>
			<Toaster />
			<PWAInstallHint />
			<SplashScreen show={showSplash} />
			<RouterProvider
				router={router}
				context={{ me: me.$isLoaded ? me : null }}
			/>
		</PWAProvider>
	)
}

createRoot(document.getElementById("root")!).render(
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
	</StrictMode>,
)
