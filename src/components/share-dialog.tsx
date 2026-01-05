import { useState, useEffect, useRef } from "react"
import { useAccount, useIsAuthenticated, useCoState } from "jazz-tools/react"
import { useNavigate, Link, useLocation } from "@tanstack/react-router"
import {
	Copy,
	Check,
	Link as LinkIcon,
	Trash2,
	X,
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Document, UserAccount } from "@/schema"
import {
	migrateDocumentToGroup,
	createInviteLink,
	getDocumentGroup,
	isGroupOwned,
	getCollaborators,
	getDocumentOwner,
	revokeInvite,
	makeDocumentPublic,
	makeDocumentPrivate,
	isDocumentPublic,
	getPublicLink,
	type Collaborator,
	type InviteRole,
} from "@/lib/sharing"
import { leavePersonalDocument } from "@/lib/documents"

export { ShareDialog }

type LoadedDocument = co.loaded<typeof Document, { content: true }>

interface ShareDialogProps {
	doc: LoadedDocument
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

function ShareDialog({
	doc,
	open: controlledOpen,
	onOpenChange,
}: ShareDialogProps) {
	let navigate = useNavigate()
	let location = useLocation()
	let isAuthenticated = useIsAuthenticated()
	let [internalOpen, setInternalOpen] = useState(false)

	let open = controlledOpen ?? internalOpen
	let setOpen = onOpenChange ?? setInternalOpen
	let [inviteLink, setInviteLink] = useState<string | null>(null)
	let [copied, setCopied] = useState(false)
	let [publicCopied, setPublicCopied] = useState(false)
	let [loading, setLoading] = useState(false)
	let [collaborators, setCollaborators] = useState<Collaborator[]>([])
	let [pendingInvites, setPendingInvites] = useState<
		{ inviteGroupId: string }[]
	>([])
	let [owner, setOwner] = useState<{ id: string; name: string } | null>(null)
	let [currentDocId, setCurrentDocId] = useState(doc.$jazz.id)
	let [docIsPublic, setDocIsPublic] = useState(() => isDocumentPublic(doc))
	let me = useAccount(UserAccount, { resolve: { root: { documents: true } } })

	// Subscribe to the document for reactive updates
	let subscribedDoc = useCoState(
		Document,
		currentDocId as Parameters<typeof useCoState>[1],
		{ resolve: { content: true } },
	)
	let currentDoc = subscribedDoc?.$isLoaded ? subscribedDoc : doc

	// Reset currentDocId when doc prop changes (e.g., navigating to different doc)
	let [prevDocId, setPrevDocId] = useState(doc.$jazz.id)
	if (doc.$jazz.id !== prevDocId) {
		setPrevDocId(doc.$jazz.id)
		setCurrentDocId(doc.$jazz.id)
	}

	// Sync public state when dialog opens (calculate from current state)
	let [prevOpen, setPrevOpen] = useState(open)
	if (open && !prevOpen) {
		setPrevOpen(open)
		setDocIsPublic(isDocumentPublic(currentDoc))
	} else if (!open && prevOpen) {
		setPrevOpen(open)
	}

	let docGroup = getDocumentGroup(currentDoc)
	let isAdmin = docGroup?.myRole() === "admin"
	let isOwner = !isGroupOwned(currentDoc) || isAdmin
	let isCollaborator = isGroupOwned(currentDoc) && !isAdmin

	let refreshCollaboratorsRef = useRef(async () => {
		let result = await getCollaborators(currentDoc)
		setCollaborators(result.collaborators)
		setPendingInvites(result.pendingInvites)
		let docOwner = await getDocumentOwner(currentDoc)
		setOwner(docOwner)
	})
	useEffect(() => {
		refreshCollaboratorsRef.current = async () => {
			let result = await getCollaborators(currentDoc)
			setCollaborators(result.collaborators)
			setPendingInvites(result.pendingInvites)
			let docOwner = await getDocumentOwner(currentDoc)
			setOwner(docOwner)
		}
	})

	useEffect(() => {
		if (!open) return
		refreshCollaboratorsRef.current()
	}, [open, currentDoc])

	async function handleCreateLink(role: InviteRole) {
		if (!me.$isLoaded) return
		setLoading(true)

		try {
			let currentDoc = doc
			if (!isGroupOwned(doc)) {
				let result = await migrateDocumentToGroup(doc, me.$jazz.id)
				currentDoc = result.document
			}

			let link = await createInviteLink(currentDoc, role)
			setInviteLink(link)
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

	async function handleCopyPublicLink() {
		let link = getPublicLink(currentDoc)
		await navigator.clipboard.writeText(link)
		setPublicCopied(true)
		setTimeout(() => setPublicCopied(false), 2000)
	}

	async function handleMakePublic() {
		if (!me.$isLoaded) return
		setLoading(true)

		try {
			let updatedDoc = await makeDocumentPublic(currentDoc, me.$jazz.id)
			// Update the doc ID in case migration created a new document
			setCurrentDocId(updatedDoc.$jazz.id)
			setDocIsPublic(true)
		} catch (e) {
			console.error("Failed to make document public:", e)
		} finally {
			setLoading(false)
		}
	}

	function handleMakePrivate() {
		setLoading(true)
		try {
			makeDocumentPrivate(currentDoc)
			setDocIsPublic(false)
		} catch (e) {
			console.error("Failed to make document private:", e)
		} finally {
			setLoading(false)
		}
	}

	function handleRevoke(inviteGroupId: string) {
		revokeInvite(doc, inviteGroupId)
		refreshCollaboratorsRef.current()
		if (inviteLink?.includes(inviteGroupId)) {
			setInviteLink(null)
		}
	}

	async function handleLeave() {
		if (!me.$isLoaded) return
		setLoading(true)
		try {
			await handleLeaveDocument(doc, me, navigate, setOpen)
		} finally {
			setLoading(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Share document</DialogTitle>
					<DialogDescription>
						{!isAuthenticated
							? "Sign in to share documents with others"
							: isOwner
								? "Invite others to view or edit this document"
								: owner
									? `Shared with you by ${owner.name}`
									: "You're viewing a shared document"}
					</DialogDescription>
				</DialogHeader>

				{!isAuthenticated && isOwner && (
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

				{isAuthenticated && isOwner && (
					<div className="space-y-4">
						{inviteLink ? (
							<div className="space-y-2">
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
									onClick={() => setInviteLink(null)}
								>
									<X className="mr-1 size-3.5" />
									Dismiss
								</Button>
							</div>
						) : (
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									className="flex-1"
									onClick={() => handleCreateLink("writer")}
									disabled={loading}
								>
									<LinkIcon className="mr-1 size-3.5" />
									Can edit
								</Button>
								<Button
									variant="outline"
									size="sm"
									className="flex-1"
									onClick={() => handleCreateLink("reader")}
									disabled={loading}
								>
									<LinkIcon className="mr-1 size-3.5" />
									Can view
								</Button>
							</div>
						)}

						<div className="border-border space-y-2 border-t pt-3">
							<div className="text-muted-foreground text-xs font-medium">
								Public access
							</div>
							{docIsPublic ? (
								<div className="space-y-2">
									<div className="bg-muted flex items-center gap-2 rounded p-2 text-xs">
										<Globe className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
										<input
											type="text"
											value={getPublicLink(currentDoc)}
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
										Anyone with this link can view this document
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
										Make this document publicly readable by anyone with the link
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
							Collaborators
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
										<span className="text-muted-foreground text-xs capitalize">
											{c.role === "writer" ? "Can edit" : "Can view"}
										</span>
										{isAdmin && (
											<Button
												variant="ghost"
												size="icon-sm"
												onClick={() => handleRevoke(c.inviteGroupId)}
												aria-label="Remove access"
											>
												<Trash2 className="text-destructive size-3" />
											</Button>
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
							Leave document
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}

async function handleLeaveDocument(
	doc: LoadedDocument,
	me: co.loaded<typeof UserAccount, { root: { documents: true } }>,
	navigate: ReturnType<typeof useNavigate>,
	setOpen: (open: boolean) => void,
) {
	await leavePersonalDocument(doc, me)

	setOpen(false)
	navigate({ to: "/" })
}
