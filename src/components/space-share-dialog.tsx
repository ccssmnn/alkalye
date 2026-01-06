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
import { co } from "jazz-tools"
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
import {
	createSpaceInvite,
	listSpaceCollaborators,
	getSpaceOwner,
	revokeSpaceInvite,
	changeSpaceCollaboratorRole,
	leaveSpace,
	isSpacePublic,
	makeSpacePublic,
	makeSpacePrivate,
	getSpaceGroup,
} from "@/lib/spaces"

export { SpaceShareDialog }
export type { SpaceShareDialogProps }

type InviteRole = "writer" | "reader"

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
		let result = await listSpaceCollaborators(space)
		setCollaborators(result.collaborators)
		setPendingInvites(result.pendingInvites)
		let spaceOwner = await getSpaceOwner(space)
		setOwner(spaceOwner)
	})
	useEffect(() => {
		refreshCollaboratorsRef.current = async () => {
			let result = await listSpaceCollaborators(space)
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
			let { link } = await createSpaceInvite(space, role)
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
			await leaveSpace(space, me)
			setOpen(false)
			navigate({ to: "/" })
		} catch (e) {
			console.error("Failed to leave space:", e)
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

	async function handleChangeRole(inviteGroupId: string, newRole: InviteRole) {
		try {
			await changeSpaceCollaboratorRole(space, inviteGroupId, newRole)
			await refreshCollaboratorsRef.current()
		} catch (e) {
			console.error("Failed to change role:", e)
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
													onValueChange={newRole =>
														handleChangeRole(
															c.inviteGroupId,
															newRole as InviteRole,
														)
													}
												>
													<SelectTrigger size="sm" className="h-6 text-xs">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
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

function getRoleLabel(role: string | null): string {
	switch (role) {
		case "admin":
			return "Owner"
		case "writer":
			return "Writer"
		case "reader":
			return "Reader"
		default:
			return "Unknown"
	}
}

function getSpacePublicLink(space: LoadedSpace): string {
	let baseURL = window.location.origin
	return `${baseURL}/spaces/${space.$jazz.id}`
}
