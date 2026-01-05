import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Group, co, type ResolveQuery } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { useCoState, useAccount, Image } from "jazz-tools/react"
import { useState, useEffect, useRef } from "react"
import { ArrowLeft, Loader2, Upload } from "lucide-react"
import { Space, UserAccount, deleteSpace } from "@/schema"
import { SpaceInitials } from "@/components/space-selector"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ConfirmDialog, useConfirmDialog } from "@/components/ui/confirm-dialog"
import {
	SpaceDeleted,
	SpaceNotFound,
	SpaceUnauthorized,
} from "@/components/document-error-states"
import { SpaceBackupSettings } from "@/lib/backup"

export { Route }

let spaceQuery = {
	documents: true,
	avatar: true,
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
		if (data.loadingState === "unauthorized") return <SpaceUnauthorized />
		return <SpaceNotFound />
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
						<SpaceBackupSettingsSection space={space} spaceId={spaceId} />
						<SpaceMembersSection space={space} />
						<DeleteSpaceSection space={space} />
					</div>
				</div>
			</div>
		</>
	)
}

function SpaceNameSection({ space }: { space: LoadedSpace }) {
	let spaceGroup = space.$jazz.owner instanceof Group ? space.$jazz.owner : null
	let isAdmin = spaceGroup?.myRole() === "admin"

	function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
		let newName = e.target.value
		space.$jazz.set("name", newName)
		space.$jazz.set("updatedAt", new Date())
	}

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				General
			</h2>
			<div className="bg-muted/30 space-y-4 rounded-lg p-4">
				<div>
					<div className="text-muted-foreground mb-1 text-xs">Space name</div>
					<Input
						value={space.name}
						onChange={handleNameChange}
						disabled={!isAdmin}
						className="text-lg font-medium"
					/>
				</div>
				<SpaceAvatarUpload space={space} isAdmin={isAdmin} />
			</div>
		</section>
	)
}

function SpaceBackupSettingsSection({
	space,
	spaceId,
}: {
	space: LoadedSpace
	spaceId: string
}) {
	let spaceGroup = space.$jazz.owner instanceof Group ? space.$jazz.owner : null
	let isAdmin = spaceGroup?.myRole() === "admin"

	return <SpaceBackupSettings spaceId={spaceId} isAdmin={isAdmin} />
}

function SpaceAvatarUpload({
	space,
	isAdmin,
}: {
	space: LoadedSpace
	isAdmin: boolean
}) {
	let fileInputRef = useRef<HTMLInputElement>(null)
	let [isUploading, setIsUploading] = useState(false)

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		let file = e.target.files?.[0]
		if (!file) return

		setIsUploading(true)
		try {
			let image = await createImage(file, {
				owner: space.$jazz.owner,
				maxSize: 512,
			})
			space.$jazz.set("avatar", image)
			space.$jazz.set("updatedAt", new Date())
		} finally {
			setIsUploading(false)
			if (fileInputRef.current) {
				fileInputRef.current.value = ""
			}
		}
	}

	let avatarId = space.avatar?.$jazz.id

	return (
		<div>
			<div className="text-muted-foreground mb-1 text-xs">Space avatar</div>
			<div className="flex items-center gap-3">
				<div className="flex size-12 items-center justify-center overflow-hidden rounded-lg">
					{avatarId ? (
						<Image
							imageId={avatarId}
							width={48}
							height={48}
							alt={space.name}
							className="size-full object-cover"
						/>
					) : (
						<SpaceInitials name={space.name} size="md" />
					)}
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={!isAdmin || isUploading}
					onClick={() => fileInputRef.current?.click()}
				>
					{isUploading ? (
						<>
							<Loader2 className="mr-2 size-4 animate-spin" />
							Uploading...
						</>
					) : (
						<>
							<Upload className="mr-2 size-4" />
							Upload
						</>
					)}
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={handleFileChange}
				/>
			</div>
		</div>
	)
}

type SpaceMember = {
	id: string
	name: string
	role: string
}

function SpaceMembersSection({ space }: { space: LoadedSpace }) {
	let me = useAccount(UserAccount)
	let spaceGroup = space.$jazz.owner instanceof Group ? space.$jazz.owner : null
	let [members, setMembers] = useState<SpaceMember[]>([])

	useEffect(() => {
		if (!spaceGroup) return

		async function loadMembers() {
			if (!spaceGroup) return
			let loaded: SpaceMember[] = []

			for (let member of spaceGroup.members) {
				if (member.account?.$isLoaded) {
					let profile = await member.account.$jazz.ensureLoaded({
						resolve: { profile: true },
					})
					loaded.push({
						id: member.id,
						name:
							(profile as { profile?: { name?: string } }).profile?.name ??
							"Unknown",
						role: member.role,
					})
				}
			}

			setMembers(loaded)
		}

		loadMembers()
	}, [spaceGroup])

	if (!spaceGroup || members.length === 0) return null

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Members
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				<ul className="space-y-2">
					{members.map(member => (
						<li
							key={member.id}
							className="flex items-center justify-between py-1"
						>
							<span className="flex items-center gap-2 text-sm">
								{member.name}
								{member.id === me?.$jazz.id && (
									<Badge variant="secondary">You</Badge>
								)}
							</span>
							<span className="text-muted-foreground text-xs capitalize">
								{getRoleLabel(member.role)}
							</span>
						</li>
					))}
				</ul>
			</div>
		</section>
	)
}

function getRoleLabel(role: string): string {
	switch (role) {
		case "admin":
			return "Admin"
		case "writer":
			return "Can edit"
		case "reader":
			return "Can view"
		default:
			return role
	}
}

function DeleteSpaceSection({ space }: { space: LoadedSpace }) {
	let navigate = useNavigate()
	let spaceGroup = space.$jazz.owner instanceof Group ? space.$jazz.owner : null
	let isAdmin = spaceGroup?.myRole() === "admin"
	let confirmDialog = useConfirmDialog()

	function handleDelete() {
		deleteSpace(space)
		navigate({ to: "/" })
	}

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Danger Zone
			</h2>
			<div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-sm font-medium">Delete space</div>
						<div className="text-muted-foreground text-xs">
							Permanently delete this space and all its documents
						</div>
					</div>
					<Button
						variant="destructive"
						size="sm"
						disabled={!isAdmin}
						onClick={() => confirmDialog.setOpen(true)}
					>
						Delete
					</Button>
				</div>
			</div>
			<ConfirmDialog
				open={confirmDialog.open}
				onOpenChange={confirmDialog.onOpenChange}
				title="Delete space?"
				description={`This will permanently delete "${space.name}" and all documents within it. This action cannot be undone.`}
				confirmLabel="Delete"
				variant="destructive"
				onConfirm={handleDelete}
			/>
		</section>
	)
}
