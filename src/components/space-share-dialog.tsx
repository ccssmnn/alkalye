import { useState, useEffect, useRef } from "react"
import { useAccount, useIsAuthenticated } from "jazz-tools/react"
import { useNavigate, Link, useLocation } from "@tanstack/react-router"
import {
	Copy,
	Check,
	Link as LinkIcon,
	Trash2,
	LogOut,
	CloudOff,
	Globe,
	Lock,
} from "lucide-react"
import { co, Group } from "jazz-tools"
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Space, UserAccount } from "@/schema"

export { SpaceShareDialog }
export type { SpaceShareDialogProps }

type InviteRole = "manager" | "writer" | "reader"

type Collaborator = {
	id: string
	name: string
	role: string
	inviteGroupId: string
}

type LoadedSpace = co.loaded<typeof Space, { documents: true }>

interface SpaceShareDialogProps {
	space: LoadedSpace
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

function SpaceShareDialog({
	space,
	open: controlledOpen,
	onOpenChange,
}: SpaceShareDialogProps) {
	let navigate = useNavigate()
	let location = useLocation()
	let isAuthenticated = useIsAuthenticated()
	let [internalOpen, setInternalOpen] = useState(false)

	let open = controlledOpen ?? internalOpen
	let setOpen = onOpenChange ?? setInternalOpen
	let [inviteLink, setInviteLink] = useState<string | null>(null)
	let [inviteRole, setInviteRole] = useState<InviteRole | null>(null)
	let [copied, setCopied] = useState(false)
	let [loading, setLoading] = useState(false)
	let [collaborators, setCollaborators] = useState<Collaborator[]>([])
	let [pendingInvites, setPendingInvites] = useState<
		{ inviteGroupId: string }[]
	>([])
	let [owner, setOwner] = useState<{ id: string; name: string } | null>(null)
	let [spaceIsPublic, setSpaceIsPublic] = useState(() => isSpacePublic(space))
	let [publicCopied, setPublicCopied] = useState(false)
	let me = useAccount(UserAccount, { resolve: { root: { spaces: true } } })

	let spaceGroup = getSpaceGroup(space)
	let isAdmin = spaceGroup?.myRole() === "admin"
	let isCollaborator = spaceGroup && !isAdmin

	let refreshCollaboratorsRef = useRef(async () => {
		let result = await getSpaceCollaborators(space)
		setCollaborators(result.collaborators)
		setPendingInvites(result.pendingInvites)
		let spaceOwner = await getSpaceOwner(space)
		setOwner(spaceOwner)
	})
	useEffect(() => {
		refreshCollaboratorsRef.current = async () => {
			let result = await getSpaceCollaborators(space)
			setCollaborators(result.collaborators)
			setPendingInvites(result.pendingInvites)
			let spaceOwner = await getSpaceOwner(space)
			setOwner(spaceOwner)
		}
	})

	useEffect(() => {
		if (!open) return
		refreshCollaboratorsRef.current()
	}, [open, space])

	async function handleCreateLink(role: InviteRole) {
		if (!me?.$isLoaded) return
		setLoading(true)

		try {
			let link = await createSpaceInviteLink(space, role)
			setInviteLink(link)
			setInviteRole(role)
			await refreshCollaboratorsRef.current()
		} catch (e) {
			console.error("Failed to create invite link:", e)
		} finally {
			setLoading(false)
		}
	}

	async function handleCopy() {
		if (!inviteLink) return
		await navigator.clipboard.writeText(inviteLink)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	function handleRevoke(inviteGroupId: string) {
		revokeSpaceInvite(space, inviteGroupId)
		refreshCollaboratorsRef.current()
		if (inviteLink?.includes(inviteGroupId)) {
			setInviteLink(null)
			setInviteRole(null)
		}
	}

	async function handleLeave() {
		if (!me?.$isLoaded) return
		setLoading(true)
		try {
			await handleLeaveSpace(space, me, navigate, setOpen)
		} finally {
			setLoading(false)
		}
	}

	async function handleCopyPublicLink() {
		let link = getSpacePublicLink(space)
		await navigator.clipboard.writeText(link)
		setPublicCopied(true)
		setTimeout(() => setPublicCopied(false), 2000)
	}

	function handleMakePublic() {
		setLoading(true)
		try {
			makeSpacePublic(space)
			setSpaceIsPublic(true)
		} catch (e) {
			console.error("Failed to make space public:", e)
		} finally {
			setLoading(false)
		}
	}

	function handleMakePrivate() {
		setLoading(true)
		try {
			makeSpacePrivate(space)
			setSpaceIsPublic(false)
		} catch (e) {
			console.error("Failed to make space private:", e)
		} finally {
			setLoading(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Share space</DialogTitle>
					<DialogDescription>
						{!isAuthenticated
							? "Sign in to share spaces with others"
							: isAdmin
								? "Invite others to collaborate on this space"
								: owner
									? `Shared with you by ${owner.name}`
									: "You're viewing a shared space"}
					</DialogDescription>
				</DialogHeader>

				{!isAuthenticated && isAdmin && (
					<div className="flex flex-col items-center gap-3 py-4">
						<CloudOff className="text-muted-foreground size-8" />
						<p className="text-muted-foreground text-center text-sm">
							Sharing requires sync to be enabled
						</p>
						<Link to="/settings" search={{ from: location.pathname }}>
							<Button size="sm">Sign in to share</Button>
						</Link>
					</div>
				)}

				{isAuthenticated && isAdmin && (
					<div className="space-y-4">
						{inviteLink ? (
							<div className="space-y-2">
								<div className="text-muted-foreground text-xs">
									{getRoleLabel(inviteRole)} invite link
								</div>
								<div className="bg-muted flex items-center gap-2 rounded p-2 text-xs">
									<input
										type="text"
										value={inviteLink}
										readOnly
										className="flex-1 truncate bg-transparent outline-none"
									/>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={handleCopy}
										aria-label="Copy link"
									>
										{copied ? (
											<Check className="size-3.5" />
										) : (
											<Copy className="size-3.5" />
										)}
									</Button>
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="w-full"
									onClick={() => {
										setInviteLink(null)
										setInviteRole(null)
									}}
								>
									Create different link
								</Button>
							</div>
						) : (
							<div className="space-y-2">
								<div className="text-muted-foreground text-xs font-medium">
									Create invite link
								</div>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										className="flex-1"
										onClick={() => handleCreateLink("manager")}
										disabled={loading}
									>
										<LinkIcon className="mr-1 size-3.5" />
										Manager
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="flex-1"
										onClick={() => handleCreateLink("writer")}
										disabled={loading}
									>
										<LinkIcon className="mr-1 size-3.5" />
										Writer
									</Button>
									<Button
										variant="outline"
										size="sm"
										className="flex-1"
										onClick={() => handleCreateLink("reader")}
										disabled={loading}
									>
										<LinkIcon className="mr-1 size-3.5" />
										Reader
									</Button>
								</div>
							</div>
						)}

						<div className="border-border space-y-2 border-t pt-3">
							<div className="text-muted-foreground text-xs font-medium">
								Public access
							</div>
							{spaceIsPublic ? (
								<div className="space-y-2">
									<div className="bg-muted flex items-center gap-2 rounded p-2 text-xs">
										<Globe className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
										<input
											type="text"
											value={getSpacePublicLink(space)}
											readOnly
											className="flex-1 truncate bg-transparent outline-none"
										/>
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={handleCopyPublicLink}
											aria-label="Copy public link"
										>
											{publicCopied ? (
												<Check className="size-3.5" />
											) : (
												<Copy className="size-3.5" />
											)}
										</Button>
									</div>
									<p className="text-muted-foreground text-xs">
										Anyone with this link can view this space and its documents
									</p>
									<Button
										variant="ghost"
										size="sm"
										className="w-full"
										onClick={handleMakePrivate}
										disabled={loading}
									>
										<Lock className="mr-1 size-3.5" />
										Make private
									</Button>
								</div>
							) : (
								<div className="space-y-2">
									<p className="text-muted-foreground text-xs">
										Make this space publicly readable by anyone with the link
									</p>
									<Button
										variant="outline"
										size="sm"
										className="w-full"
										onClick={handleMakePublic}
										disabled={loading}
									>
										<Globe className="mr-1 size-3.5" />
										Make public
									</Button>
								</div>
							)}
						</div>
					</div>
				)}

				{collaborators.length > 0 && (
					<div className="space-y-2">
						<div className="text-muted-foreground text-xs font-medium">
							Members
						</div>
						<ul className="space-y-1">
							{collaborators.map(c => (
								<li
									key={c.id}
									className="flex items-center justify-between py-1 text-sm"
								>
									<span className="flex items-center gap-2">
										{c.name}
										{c.id === me?.$jazz.id && (
											<Badge variant="secondary">You</Badge>
										)}
									</span>
									<div className="flex items-center gap-2">
										{isAdmin && c.id !== me?.$jazz.id ? (
											<>
												<Select
													value={c.role}
													onValueChange={newRole => {
														changeCollaboratorRole(
															space,
															c.inviteGroupId,
															newRole as InviteRole,
														)
														refreshCollaboratorsRef.current()
													}}
												>
													<SelectTrigger size="sm" className="h-6 text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="manager">Manager</SelectItem>
														<SelectItem value="writer">Writer</SelectItem>
														<SelectItem value="reader">Reader</SelectItem>
													</SelectContent>
												</Select>
												<Button
													variant="ghost"
													size="icon-sm"
													onClick={() => handleRevoke(c.inviteGroupId)}
													aria-label="Remove access"
												>
													<Trash2 className="text-destructive size-3" />
												</Button>
											</>
										) : (
											<span className="text-muted-foreground text-xs">
												{getRoleLabel(c.role)}
											</span>
										)}
									</div>
								</li>
							))}
						</ul>
					</div>
				)}

				{pendingInvites.length > 0 && isAdmin && (
					<div className="space-y-2">
						<div className="text-muted-foreground text-xs font-medium">
							Pending invites
						</div>
						<ul className="space-y-1">
							{pendingInvites.map(invite => (
								<li
									key={invite.inviteGroupId}
									className="text-muted-foreground flex items-center justify-between py-1 text-sm"
								>
									<span>Pending invite</span>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => handleRevoke(invite.inviteGroupId)}
										aria-label="Revoke invite"
									>
										<Trash2 className="text-destructive size-3" />
									</Button>
								</li>
							))}
						</ul>
					</div>
				)}

				{isCollaborator && (
					<div className="border-border border-t pt-2">
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive w-full"
							onClick={handleLeave}
							disabled={loading}
						>
							<LogOut className="mr-1 size-3.5" />
							Leave space
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

// Helper functions

function getSpaceGroup(space: LoadedSpace): Group | null {
	let owner = space.$jazz.owner
	return owner instanceof Group ? owner : null
}

function getRoleLabel(role: string | null): string {
	switch (role) {
		case "admin":
			return "Owner"
		case "manager":
			return "Manager"
		case "writer":
			return "Writer"
		case "reader":
			return "Reader"
		default:
			return "Unknown"
	}
}

async function createSpaceInviteLink(
	space: LoadedSpace,
	role: InviteRole,
): Promise<string> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) {
		throw new Error("Space not shareable - not owned by a Group")
	}

	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can create invite links")
	}

	let inviteGroup = Group.create()
	spaceGroup.addMember(inviteGroup, role)

	let inviteSecret = inviteGroup.$jazz.createInvite(role)
	let baseURL = window.location.origin

	return `${baseURL}/invite#/space/${space.$jazz.id}/invite/${inviteGroup.$jazz.id}/${inviteSecret}`
}

async function getSpaceCollaborators(space: LoadedSpace): Promise<{
	collaborators: Collaborator[]
	pendingInvites: { inviteGroupId: string }[]
}> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) {
		return { collaborators: [], pendingInvites: [] }
	}

	let collaborators: Collaborator[] = []
	let pendingInvites: { inviteGroupId: string }[] = []

	for (let inviteGroup of spaceGroup.getParentGroups()) {
		let members: Collaborator[] = []

		for (let member of inviteGroup.members) {
			if (member.role === "admin") continue

			if (member.account?.$isLoaded) {
				let profile = await member.account.$jazz.ensureLoaded({
					resolve: { profile: true },
				})
				members.push({
					id: member.id,
					name:
						(profile as { profile?: { name?: string } }).profile?.name ??
						"Unknown",
					role: member.role,
					inviteGroupId: inviteGroup.$jazz.id,
				})
			}
		}

		if (members.length > 0) {
			collaborators.push(...members)
		} else {
			pendingInvites.push({ inviteGroupId: inviteGroup.$jazz.id })
		}
	}

	return { collaborators, pendingInvites }
}

async function getSpaceOwner(
	space: LoadedSpace,
): Promise<{ id: string; name: string } | null> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) return null

	for (let member of spaceGroup.members) {
		if (member.role === "admin" && member.account?.$isLoaded) {
			let profile = await member.account.$jazz.ensureLoaded({
				resolve: { profile: true },
			})
			return {
				id: member.id,
				name:
					(profile as { profile?: { name?: string } }).profile?.name ??
					"Unknown",
			}
		}
	}
	return null
}

function revokeSpaceInvite(space: LoadedSpace, inviteGroupId: string): void {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")

	let parentGroups = spaceGroup.getParentGroups()
	let inviteGroup = parentGroups.find(g => g.$jazz.id === inviteGroupId)
	if (!inviteGroup) throw new Error("Invite group not found")

	spaceGroup.removeMember(inviteGroup)
}

function changeCollaboratorRole(
	space: LoadedSpace,
	inviteGroupId: string,
	newRole: InviteRole,
): void {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")
	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can change roles")
	}

	let parentGroups = spaceGroup.getParentGroups()
	let inviteGroup = parentGroups.find(g => g.$jazz.id === inviteGroupId)
	if (!inviteGroup) throw new Error("Invite group not found")

	spaceGroup.addMember(inviteGroup, newRole)
}

async function handleLeaveSpace(
	space: LoadedSpace,
	me: co.loaded<typeof UserAccount, { root: { spaces: true } }>,
	navigate: ReturnType<typeof useNavigate>,
	setOpen: (open: boolean) => void,
) {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")

	// Find the invite group the user belongs to and remove self
	for (let inviteGroup of spaceGroup.getParentGroups()) {
		let isMember = inviteGroup.members.some(m => m.id === me.$jazz.id)
		if (isMember) {
			inviteGroup.removeMember(me)
			break
		}
	}

	// Remove from user's spaces list
	let idx = me.root?.spaces?.findIndex(s => s?.$jazz.id === space.$jazz.id)
	if (idx !== undefined && idx !== -1 && me.root?.spaces) {
		me.root.spaces.$jazz.splice(idx, 1)
	}

	setOpen(false)
	navigate({ to: "/" })
}

function isSpacePublic(space: LoadedSpace): boolean {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) return false
	let everyoneRole = spaceGroup.getRoleOf("everyone")
	return everyoneRole === "reader" || everyoneRole === "writer"
}

function makeSpacePublic(space: LoadedSpace): void {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")
	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can make spaces public")
	}
	spaceGroup.makePublic()
	space.$jazz.set("updatedAt", new Date())
}

function makeSpacePrivate(space: LoadedSpace): void {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")
	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can make spaces private")
	}
	spaceGroup.removeMember("everyone")
	space.$jazz.set("updatedAt", new Date())
}

function getSpacePublicLink(space: LoadedSpace): string {
	let baseURL = window.location.origin
	return `${baseURL}/spaces/${space.$jazz.id}`
}
