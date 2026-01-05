import { createFileRoute, Link } from "@tanstack/react-router"
import { co, type ResolveQuery } from "jazz-tools"
import { useCoState } from "jazz-tools/react"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Space } from "@/schema"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
	DocumentNotFound,
	DocumentUnauthorized,
	SpaceDeleted,
} from "@/components/document-error-states"

export { Route }

let spaceQuery = {
	documents: true,
} as const satisfies ResolveQuery<typeof Space>

type LoadedSpace = co.loaded<typeof Space, typeof spaceQuery>

let Route = createFileRoute("/spaces/$spaceId/settings")({
	loader: async ({ params }) => {
		let space = await Space.load(params.spaceId, { resolve: spaceQuery })
		if (!space.$isLoaded) {
			return { space: null, loadingState: space.$jazz.loadingState }
		}
		return { space, loadingState: null }
	},
	component: SpaceSettingsPage,
})

function SpaceSettingsPage() {
	let { spaceId } = Route.useParams()
	let data = Route.useLoaderData()
	let space = useCoState(Space, spaceId, { resolve: spaceQuery })

	// Space not found or unauthorized
	if (!data.space) {
		if (data.loadingState === "unauthorized") return <DocumentUnauthorized />
		return <DocumentNotFound />
	}

	// Space deleted
	if (space.$isLoaded && space.deletedAt) {
		return <SpaceDeleted />
	}

	// Loading
	if (!space.$isLoaded) {
		return (
			<Empty className="h-screen">
				<EmptyHeader>
					<Loader2 className="text-muted-foreground size-8 animate-spin" />
					<EmptyTitle>Loading space...</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	return <SpaceSettingsContent space={space} spaceId={spaceId} />
}

function SpaceSettingsContent({
	space,
	spaceId,
}: {
	space: LoadedSpace
	spaceId: string
}) {
	return (
		<>
			<title>{space.name} Settings</title>
			<div
				className="bg-background fixed inset-0 overflow-auto"
				style={{
					paddingTop: "calc(48px + env(safe-area-inset-top))",
					paddingBottom: "env(safe-area-inset-bottom)",
					paddingLeft: "env(safe-area-inset-left)",
					paddingRight: "env(safe-area-inset-right)",
				}}
			>
				<div
					className="bg-background border-border fixed top-0 right-0 left-0 z-10 flex items-center justify-center border-b"
					style={{
						paddingTop: "env(safe-area-inset-top)",
						paddingLeft: "env(safe-area-inset-left)",
						paddingRight: "env(safe-area-inset-right)",
						height: "calc(48px + env(safe-area-inset-top))",
					}}
				>
					<div className="flex w-full max-w-2xl items-center gap-3 px-4">
						<Link to="/spaces/$spaceId" params={{ spaceId }}>
							<Button variant="ghost" size="icon" aria-label="Back">
								<ArrowLeft className="size-4" />
							</Button>
						</Link>
						<h1 className="text-foreground text-lg font-semibold">
							Space Settings
						</h1>
					</div>
				</div>
				<div className="mx-auto max-w-2xl px-4 py-8">
					<div className="space-y-8">
						<SpaceNameSection space={space} />
					</div>
				</div>
			</div>
		</>
	)
}

function SpaceNameSection({ space }: { space: LoadedSpace }) {
	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				General
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				<div>
					<div className="text-muted-foreground mb-1 text-xs">Space name</div>
					<div className="text-lg font-medium">{space.name}</div>
				</div>
			</div>
		</section>
	)
}
