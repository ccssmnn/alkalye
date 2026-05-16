import {
	Outlet,
	createRootRouteWithContext,
	redirect,
	Link,
} from "@tanstack/react-router"
import { TooltipProvider } from "@/app/components/ui/tooltip"
import { ErrorUI } from "@/app/components/ui/error-ui"
import { Button } from "@/app/components/ui/button"
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
} from "@/app/components/ui/empty"
import { FileQuestion } from "lucide-react"
import type { UserAccount } from "@/schema"
import type { co } from "jazz-tools"
import { T, useIntl } from "@/shared/intl/setup"

export { Route }

export type RouterContext = {
	me: co.loaded<typeof UserAccount> | null
}

let Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: () => {
		// PWA cold start: redirect deep links to / so user lands on their own docs
		// iOS Safari ignores manifest start_url and uses current URL when adding to homescreen
		if (
			(window as { __pwaColdStartRedirect?: boolean }).__pwaColdStartRedirect
		) {
			delete (window as { __pwaColdStartRedirect?: boolean })
				.__pwaColdStartRedirect
			throw redirect({ to: "/" })
		}
	},
	component: RootComponent,
	errorComponent: ErrorComponent,
	notFoundComponent: NotFoundComponent,
})

function RootComponent() {
	return (
		<TooltipProvider>
			<main className="flex h-full flex-col">
				<Outlet />
			</main>
		</TooltipProvider>
	)
}

function ErrorComponent({ error }: { error?: Error }) {
	let t = useIntl()

	return (
		<ErrorUI
			error={error}
			title={t("error.generic.title")}
			description={t("error.generic.description")}
			actions={
				<>
					<Button
						variant="outline"
						onClick={() => window.location.reload()}
						className="flex-1"
					>
						<T k="error.generic.reloadPage" />
					</Button>
					<Link to="/">
						<Button className="flex-1">
							<T k="common.goHome" />
						</Button>
					</Link>
				</>
			}
		/>
	)
}

function NotFoundComponent() {
	return (
		<div className="bg-background flex h-full items-center justify-center">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<FileQuestion className="text-muted-foreground size-12" />
					</EmptyMedia>
					<EmptyTitle>
						<T k="error.pageNotFound.title" />
					</EmptyTitle>
					<EmptyDescription>
						<T k="error.pageNotFound.description" />
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => window.history.back()}>
							<T k="common.goBack" />
						</Button>
						<Link to="/">
							<Button>
								<T k="common.home" />
							</Button>
						</Link>
					</div>
				</EmptyContent>
			</Empty>
		</div>
	)
}
