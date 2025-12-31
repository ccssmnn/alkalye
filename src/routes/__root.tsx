import {
	Outlet,
	createRootRouteWithContext,
	Link,
} from "@tanstack/react-router"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ErrorUI } from "@/components/ui/error-ui"
import { Button } from "@/components/ui/button"
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
} from "@/components/ui/empty"
import { FileQuestion } from "lucide-react"
import type { UserAccount } from "@/schema"
import type { co } from "jazz-tools"

export { Route }

export type RouterContext = {
	me: co.loaded<typeof UserAccount> | null
}

let Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	errorComponent: ErrorComponent,
	notFoundComponent: NotFoundComponent,
})

function RootComponent() {
	return (
		<TooltipProvider>
			<main className="flex min-h-dvh flex-col">
				<Outlet />
			</main>
		</TooltipProvider>
	)
}

function ErrorComponent({ error }: { error?: Error }) {
	return (
		<ErrorUI
			error={error}
			title="Something went wrong"
			description="An unexpected error occurred. Please try reloading the page."
			actions={
				<>
					<Button
						variant="outline"
						onClick={() => window.location.reload()}
						className="flex-1"
					>
						Reload Page
					</Button>
					<Link to="/">
						<Button className="flex-1">Go Home</Button>
					</Link>
				</>
			}
		/>
	)
}

function NotFoundComponent() {
	return (
		<div className="bg-background flex min-h-dvh items-center justify-center">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<FileQuestion className="text-muted-foreground size-12" />
					</EmptyMedia>
					<EmptyTitle>Page not found</EmptyTitle>
					<EmptyDescription>
						The page you're looking for doesn't exist or has been moved.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => window.history.back()}>
							Go back
						</Button>
						<Link to="/">
							<Button>Go home</Button>
						</Link>
					</div>
				</EmptyContent>
			</Empty>
		</div>
	)
}
