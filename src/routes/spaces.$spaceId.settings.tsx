import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { co, type ResolveQuery } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { useCoState, useAccount, Image } from "jazz-tools/react"
import { useState, useEffect, useRef } from "react"
import { ArrowLeft, Loader2, Upload, UserRoundPlus } from "lucide-react"
import { Space, UserAccount, deleteSpace } from "@/schema"
import { SpaceShareDialog } from "@/components/space-share-dialog"
import { SpaceInitials } from "@/components/space-selector"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ConfirmDialog, useConfirmDialog } from "@/components/ui/confirm-dialog"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	SpaceDeleted,
	SpaceNotFound,
	SpaceUnauthorized,
} from "@/components/document-error-states"
import { SpaceBackupSettings } from "@/lib/backup"
import {
	getSpaceGroup,
	leaveSpace,
	changeSpaceCollaboratorRole,
	revokeSpaceInvite,
	listSpaceMembers,
	type SpaceMember,
} from "@/lib/spaces"

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
						<SpaceMembersSection space={space} />
						<SpaceBackupSettingsSection space={space} spaceId={spaceId} />
						<DangerZoneSection space={space} />
					</div>
				</div>
			</div>
		</>
	)
}

function SpaceNameSection({ space }: { space: LoadedSpace }) {
	let spaceGroup = getSpaceGroup(space)
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
	let spaceGroup = getSpaceGroup(space)
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

function SpaceMembersSection({ space }: { space: LoadedSpace }) {
	let me = useAccount(UserAccount)
	let spaceGroup = getSpaceGroup(space)
	let myRole = spaceGroup?.myRole()
	let canEditMembers = myRole === "admin" || myRole === "manager"
	let [members, setMembers] = useState<SpaceMember[]>([])
	let [shareOpen, setShareOpen] = useState(false)
	let [editMember, setEditMember] = useState<SpaceMember | null>(null)

	let loadMembersRef = useRef(async () => {
		let loaded = await listSpaceMembers(space)
		setMembers(loaded)
	})

	useEffect(() => {
		loadMembersRef.current = async () => {
			let loaded = await listSpaceMembers(space)
			setMembers(loaded)
		}
	})

	useEffect(() => {
		loadMembersRef.current()
	}, [spaceGroup])

	if (!spaceGroup) return null

	let adminCount =
		spaceGroup?.members.filter(m => m.role === "admin").length ?? 0

	function handleEditMember(member: SpaceMember) {
		if (!canEditMembers) return
		// Can't edit other admins
		if (member.role === "admin" && member.id !== me?.$jazz.id) return
		// Can't edit yourself if you're the last admin
		if (
			member.id === me?.$jazz.id &&
			member.role === "admin" &&
			adminCount <= 1
		)
			return
		setEditMember(member)
	}

	return (
		<section>
			<div className="mb-3 flex items-center justify-between">
				<h2 className="text-muted-foreground text-sm font-medium">Members</h2>
				{myRole === "admin" && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShareOpen(true)}
					>
						<UserRoundPlus />
						Invite
					</Button>
				)}
			</div>
			<div className="bg-muted/30 rounded-lg p-4">
				{members.length > 0 ? (
					<ul className="space-y-2">
						{members.map(member => {
							let isMe = member.id === me?.$jazz.id
							let isOtherAdmin = member.role === "admin" && !isMe
							let isLastAdmin =
								isMe && member.role === "admin" && adminCount <= 1
							let isEditable = canEditMembers && !isOtherAdmin && !isLastAdmin
							return (
								<li
									key={member.id}
									className="flex items-center justify-between py-1"
								>
									<span className="flex items-center gap-2 text-sm">
										{member.name}
										{isMe && <Badge variant="secondary">You</Badge>}
									</span>
									<span className="flex items-center gap-2">
										{isEditable && (
											<Button
												variant="outline"
												size="sm"
												onClick={() => handleEditMember(member)}
											>
												Edit
											</Button>
										)}
										<span className="text-muted-foreground w-14 text-right text-xs">
											{getRoleLabel(member.role)}
										</span>
									</span>
								</li>
							)
						})}
					</ul>
				) : (
					<p className="text-muted-foreground text-sm">Loading members...</p>
				)}
			</div>
			<SpaceShareDialog
				space={space}
				open={shareOpen}
				onOpenChange={setShareOpen}
			/>
			<MemberEditDialog
				space={space}
				member={editMember}
				onOpenChange={open => !open && setEditMember(null)}
				onMemberUpdated={() => loadMembersRef.current()}
			/>
		</section>
	)
}

function MemberEditDialog({
	space,
	member,
	onOpenChange,
	onMemberUpdated,
}: {
	space: LoadedSpace
	member: SpaceMember | null
	onOpenChange: (open: boolean) => void
	onMemberUpdated: () => void
}) {
	let [role, setRole] = useState<string>(member?.role ?? "reader")
	let [loading, setLoading] = useState(false)

	useEffect(() => {
		if (member) setRole(member.role)
	}, [member])

	async function handleSave() {
		if (!member?.inviteGroupId) return
		if (role === member.role) {
			onOpenChange(false)
			return
		}
		setLoading(true)
		try {
			await changeSpaceCollaboratorRole(
				space,
				member.inviteGroupId,
				role as "admin" | "manager" | "writer" | "reader",
			)
			onMemberUpdated()
			onOpenChange(false)
		} catch (e) {
			console.error("Failed to change role:", e)
		} finally {
			setLoading(false)
		}
	}

	async function handleRemove() {
		if (!member?.inviteGroupId) return
		setLoading(true)
		try {
			revokeSpaceInvite(space, member.inviteGroupId)
			onMemberUpdated()
			onOpenChange(false)
		} finally {
			setLoading(false)
		}
	}

	return (
		<Dialog open={!!member} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Edit member</DialogTitle>
					<DialogDescription>
						Change permissions or remove {member?.name} from this space.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div>
						<div className="text-muted-foreground mb-1 text-xs">Role</div>
						<Select value={role} onValueChange={v => v && setRole(v)}>
							<SelectTrigger className="w-full">
								<SelectValue>{getRoleLabel(role)}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="admin">Admin</SelectItem>
								<SelectItem value="manager">Manager</SelectItem>
								<SelectItem value="writer">Writer</SelectItem>
								<SelectItem value="reader">Reader</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter className="flex-col gap-2 sm:flex-row">
					<Button
						variant="destructive"
						onClick={handleRemove}
						disabled={loading}
						className="sm:mr-auto"
					>
						Remove from space
					</Button>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={loading}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function getRoleLabel(role: string): string {
	switch (role) {
		case "admin":
			return "Admin"
		case "manager":
			return "Manager"
		case "writer":
			return "Writer"
		case "reader":
			return "Reader"
		default:
			return role
	}
}

function DangerZoneSection({ space }: { space: LoadedSpace }) {
	let navigate = useNavigate()
	let me = useAccount(UserAccount)
	let spaceGroup = getSpaceGroup(space)
	let myRole = spaceGroup?.myRole()
	let isAdmin = myRole === "admin"

	// Count admins
	let adminCount =
		spaceGroup?.members.filter(m => m.role === "admin").length ?? 0
	let isLastAdmin = isAdmin && adminCount === 1
	let canLeave = !isLastAdmin
	let canDelete = isLastAdmin

	let leaveDialog = useConfirmDialog()
	let deleteDialog = useConfirmDialog()
	let [loading, setLoading] = useState(false)

	async function handleLeave() {
		if (!me?.$isLoaded) return
		setLoading(true)
		try {
			await leaveSpace(space, me)
			navigate({ to: "/" })
		} finally {
			setLoading(false)
		}
	}

	function handleDelete() {
		deleteSpace(space)
		navigate({ to: "/" })
	}

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Danger Zone
			</h2>
			<div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
				{canLeave && (
					<div className="flex items-center justify-between">
						<div>
							<div className="text-sm font-medium">Leave space</div>
							<div className="text-muted-foreground text-xs">
								Remove yourself from this space
							</div>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => leaveDialog.setOpen(true)}
							disabled={loading}
						>
							Leave
						</Button>
					</div>
				)}
				{isAdmin && (
					<div className="flex items-center justify-between">
						<div>
							<div className="text-sm font-medium">Delete space</div>
							<div className="text-muted-foreground text-xs">
								{canDelete
									? "Permanently delete this space and all its documents"
									: "All other admins must leave before the space can be deleted"}
							</div>
						</div>
						<Button
							variant="destructive"
							size="sm"
							disabled={!canDelete}
							onClick={() => deleteDialog.setOpen(true)}
						>
							Delete
						</Button>
					</div>
				)}
			</div>
			<ConfirmDialog
				open={leaveDialog.open}
				onOpenChange={leaveDialog.onOpenChange}
				title="Leave space?"
				description={`You will lose access to "${space.name}" and all its documents. You'll need a new invite to rejoin.`}
				confirmLabel="Leave"
				variant="destructive"
				onConfirm={handleLeave}
			/>
			<ConfirmDialog
				open={deleteDialog.open}
				onOpenChange={deleteDialog.onOpenChange}
				title="Delete space?"
				description={`This will permanently delete "${space.name}" and all documents within it. This action cannot be undone.`}
				confirmLabel="Delete"
				variant="destructive"
				onConfirm={handleDelete}
			/>
		</section>
	)
}
