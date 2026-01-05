import { useState, useEffect, useRef } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useAccount, useIsAuthenticated } from "jazz-tools/react"
import { Group, type ID } from "jazz-tools"
import { FileText, FolderOpen, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthForm } from "@/components/auth-form"
import { Document, Space, UserAccount } from "@/schema"
import { acceptDocumentInvite } from "@/lib/documents"

export { Route }

type InviteSecret = `inviteSecret_z${string}`

type DocInviteData = {
	type: "doc"
	docId: ID<typeof Document>
	inviteGroupId: ID<Group>
	inviteSecret: InviteSecret
}

type SpaceInviteData = {
	type: "space"
	spaceId: ID<typeof Space>
	inviteGroupId: ID<Group>
	inviteSecret: InviteSecret
}

type InviteData = DocInviteData | SpaceInviteData

function parseInviteHash(hash: string): InviteData | null {
	// Try doc invite format: #/doc/{docId}/invite/{groupId}/{secret}
	let docMatch = hash.match(
		/^#\/doc\/(co_[^/]+)\/invite\/(co_[^/]+)\/(inviteSecret_z[^/]+)$/,
	)
	if (docMatch) {
		return {
			type: "doc",
			docId: docMatch[1] as ID<typeof Document>,
			inviteGroupId: docMatch[2] as ID<Group>,
			inviteSecret: docMatch[3] as InviteSecret,
		}
	}

	// Try space invite format: #/space/{spaceId}/invite/{groupId}/{secret}
	let spaceMatch = hash.match(
		/^#\/space\/(co_[^/]+)\/invite\/(co_[^/]+)\/(inviteSecret_z[^/]+)$/,
	)
	if (spaceMatch) {
		return {
			type: "space",
			spaceId: spaceMatch[1] as ID<typeof Space>,
			inviteGroupId: spaceMatch[2] as ID<Group>,
			inviteSecret: spaceMatch[3] as InviteSecret,
		}
	}

	return null
}

let Route = createFileRoute("/invite")({
	component: InvitePage,
})

function InvitePage() {
	let navigate = useNavigate()
	let isAuthenticated = useIsAuthenticated()
	let me = useAccount(UserAccount, {
		resolve: { root: { documents: true, spaces: true } },
	})

	let [inviteData] = useState(() => {
		let hash = typeof window !== "undefined" ? window.location.hash : ""
		return parseInviteHash(hash)
	})

	let [status, setStatus] = useState<
		"loading" | "needs-auth" | "accepting" | "success" | "error" | "revoked"
	>(inviteData ? "loading" : "error")
	let [error, setError] = useState<string | null>(
		inviteData ? null : "Invalid invite link",
	)

	let isSpaceInvite = inviteData?.type === "space"

	let acceptInviteRef = useRef(async () => {
		if (!me.$isLoaded || !inviteData) return
		setStatus("accepting")

		try {
			await me.acceptInvite(
				inviteData.inviteGroupId,
				inviteData.inviteSecret,
				Group,
			)

			await new Promise(resolve => setTimeout(resolve, 500))

			if (inviteData.type === "doc") {
				await acceptDocumentInvite(me, {
					docId: inviteData.docId,
					inviteGroupId: inviteData.inviteGroupId,
					inviteSecret: inviteData.inviteSecret,
				})

				setStatus("success")
				setTimeout(() => {
					navigate({ to: "/doc/$id", params: { id: inviteData.docId } })
				}, 1000)
			} else {
				// Space invite
				let space = null
				for (let i = 0; i < 3; i++) {
					space = await Space.load(inviteData.spaceId, {
						resolve: { documents: true },
					})
					if (space) break
					await new Promise(resolve => setTimeout(resolve, 500))
				}

				if (!space) {
					setStatus("revoked")
					return
				}

				let alreadyHas = me.root?.spaces?.some(
					s => s?.$jazz.id === inviteData.spaceId,
				)
				if (!alreadyHas && me.root?.spaces) {
					me.root.spaces.$jazz.push(space)
				}

				setStatus("success")
				setTimeout(() => {
					navigate({
						to: "/spaces/$spaceId",
						params: { spaceId: inviteData.spaceId },
					})
				}, 1000)
			}
		} catch (e) {
			console.error("Failed to accept invite:", e)
			setStatus("error")
			setError(e instanceof Error ? e.message : "Failed to accept invite")
		}
	})
	useEffect(() => {
		acceptInviteRef.current = async () => {
			if (!me.$isLoaded || !inviteData) return
			setStatus("accepting")

			try {
				await me.acceptInvite(
					inviteData.inviteGroupId,
					inviteData.inviteSecret,
					Group,
				)

				await new Promise(resolve => setTimeout(resolve, 500))

				if (inviteData.type === "doc") {
					await acceptDocumentInvite(me, {
						docId: inviteData.docId,
						inviteGroupId: inviteData.inviteGroupId,
						inviteSecret: inviteData.inviteSecret,
					})

					setStatus("success")
					setTimeout(() => {
						navigate({ to: "/doc/$id", params: { id: inviteData.docId } })
					}, 1000)
				} else {
					// Space invite
					let space = null
					for (let i = 0; i < 3; i++) {
						space = await Space.load(inviteData.spaceId, {
							resolve: { documents: true },
						})
						if (space) break
						await new Promise(resolve => setTimeout(resolve, 500))
					}

					if (!space) {
						setStatus("revoked")
						return
					}

					let alreadyHas = me.root?.spaces?.some(
						s => s?.$jazz.id === inviteData.spaceId,
					)
					if (!alreadyHas && me.root?.spaces) {
						me.root.spaces.$jazz.push(space)
					}

					setStatus("success")
					setTimeout(() => {
						navigate({
							to: "/spaces/$spaceId",
							params: { spaceId: inviteData.spaceId },
						})
					}, 1000)
				}
			} catch (e) {
				console.error("Failed to accept invite:", e)
				setStatus("error")
				setError(e instanceof Error ? e.message : "Failed to accept invite")
			}
		}
	})

	// Adjust state during render: switch to needs-auth when user is loaded but not authenticated
	let shouldNeedAuth =
		inviteData && me.$isLoaded && status === "loading" && !isAuthenticated
	let [prevShouldNeedAuth, setPrevShouldNeedAuth] = useState(shouldNeedAuth)
	if (shouldNeedAuth && !prevShouldNeedAuth) {
		setPrevShouldNeedAuth(shouldNeedAuth)
		setStatus("needs-auth")
	} else if (!shouldNeedAuth && prevShouldNeedAuth) {
		setPrevShouldNeedAuth(shouldNeedAuth)
	}

	useEffect(() => {
		if (!inviteData || !me.$isLoaded || status !== "loading") return
		if (!isAuthenticated) return
		acceptInviteRef.current()
	}, [me.$isLoaded, status, isAuthenticated, inviteData])

	let pageTitle = isSpaceInvite ? "Join Space" : "Join Document"

	return (
		<>
			<title>{pageTitle}</title>
			<div
				className="bg-background fixed inset-0"
				style={{
					paddingTop: "env(safe-area-inset-top)",
					paddingBottom: "env(safe-area-inset-bottom)",
					paddingLeft: "env(safe-area-inset-left)",
					paddingRight: "env(safe-area-inset-right)",
				}}
			>
				<TopBar />
				<div className="flex min-h-[calc(100dvh-48px)] items-center justify-center px-4">
					<div className="w-full max-w-sm">
						{status === "loading" || status === "accepting" ? (
							<LoadingState status={status} isSpace={isSpaceInvite} />
						) : status === "success" ? (
							<SuccessState isSpace={isSpaceInvite} />
						) : status === "needs-auth" ? (
							<NeedsAuthState
								onAuthSuccess={() => acceptInviteRef.current()}
								isSpace={isSpaceInvite}
							/>
						) : status === "revoked" ? (
							<RevokedState />
						) : (
							<ErrorState error={error} />
						)}
					</div>
				</div>
			</div>
		</>
	)
}

function TopBar() {
	return (
		<div
			className="bg-background border-border flex h-12 items-center justify-between border-b px-3"
			style={{
				marginTop: "env(safe-area-inset-top)",
			}}
		>
			<div className="flex items-center gap-2">
				<Button variant="ghost" nativeButton={false} render={<Link to="/" />}>
					<span className="text-foreground text-lg font-semibold">Alkalye</span>
				</Button>
			</div>
			<Link to="/">
				<Button size="sm">Go to App</Button>
			</Link>
		</div>
	)
}

function LoadingState({
	status,
	isSpace,
}: {
	status: "loading" | "accepting"
	isSpace: boolean
}) {
	return (
		<div className="space-y-4 text-center">
			<Loader2 className="text-muted-foreground mx-auto size-12 animate-spin" />
			<p className="text-muted-foreground text-sm">
				{status === "loading"
					? "Loading invite..."
					: isSpace
						? "Joining space..."
						: "Joining document..."}
			</p>
		</div>
	)
}

function SuccessState({ isSpace }: { isSpace: boolean }) {
	return (
		<div className="space-y-4 text-center">
			{isSpace ? (
				<FolderOpen className="mx-auto size-12 text-green-600 dark:text-green-400" />
			) : (
				<FileText className="mx-auto size-12 text-green-600 dark:text-green-400" />
			)}
			<div className="space-y-2">
				<h1 className="text-lg font-semibold">Joined successfully</h1>
				<p className="text-muted-foreground text-sm">
					{isSpace ? "Opening space..." : "Opening document..."}
				</p>
			</div>
		</div>
	)
}

function NeedsAuthState({
	onAuthSuccess,
	isSpace,
}: {
	onAuthSuccess: () => void
	isSpace: boolean
}) {
	return (
		<div className="space-y-6">
			<div className="space-y-2 text-center">
				{isSpace ? (
					<FolderOpen className="text-muted-foreground mx-auto size-12" />
				) : (
					<FileText className="text-muted-foreground mx-auto size-12" />
				)}
				<h1 className="text-lg font-semibold">You&apos;ve been invited</h1>
				<p className="text-muted-foreground text-sm">
					{isSpace
						? "Sign in to join this space and start collaborating."
						: "Sign in to join this document and start collaborating."}
				</p>
			</div>
			<AuthForm onSuccess={onAuthSuccess} />
		</div>
	)
}

function RevokedState() {
	return (
		<div className="space-y-6 text-center">
			<AlertCircle className="text-muted-foreground mx-auto size-12" />
			<div className="space-y-2">
				<h1 className="text-lg font-semibold">Sorry, this invite expired :(</h1>
				<p className="text-muted-foreground text-sm">
					The invite link is no longer valid. Ask for a new one or continue to
					the app.
				</p>
			</div>
			<div className="flex justify-center gap-2">
				<Button variant="outline" nativeButton={false} render={<Link to="/" />}>
					Go to App
				</Button>
			</div>
		</div>
	)
}

function ErrorState({ error }: { error: string | null }) {
	return (
		<div className="space-y-6 text-center">
			<AlertCircle className="text-destructive mx-auto size-12" />
			<div className="space-y-2">
				<h1 className="text-lg font-semibold">
					Oh, this invite link does not work :(
				</h1>
				<p className="border-border text-muted-foreground border p-1 font-mono text-sm">
					Reason: {error ?? "We couldn't process this invite."}
				</p>
				<p className="text-muted-foreground text-sm">
					Ask for a new invite link or continue to the app.
				</p>
			</div>
			<div className="flex justify-center gap-2">
				<Button variant="outline" nativeButton={false} render={<Link to="/" />}>
					Go to App
				</Button>
			</div>
		</div>
	)
}
