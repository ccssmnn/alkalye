import { useState, useEffect } from "react"
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useAccount, useIsAuthenticated } from "jazz-tools/react"
import { Group, type ID } from "jazz-tools"
import { FileText, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthForm } from "@/components/auth-form"
import { Document, UserAccount } from "@/schema"

export { Route }

type InviteSecret = `inviteSecret_z${string}`

type InviteData = {
	docId: ID<typeof Document>
	inviteGroupId: ID<Group>
	inviteSecret: InviteSecret
}

function parseInviteHash(hash: string): InviteData | null {
	let match = hash.match(
		/^#\/doc\/(co_[^/]+)\/invite\/(co_[^/]+)\/(inviteSecret_z[^/]+)$/,
	)
	if (!match) return null
	return {
		docId: match[1] as ID<typeof Document>,
		inviteGroupId: match[2] as ID<Group>,
		inviteSecret: match[3] as InviteSecret,
	}
}

let Route = createFileRoute("/invite")({
	component: InvitePage,
})

function InvitePage() {
	let navigate = useNavigate()
	let isAuthenticated = useIsAuthenticated()
	let me = useAccount(UserAccount, {
		resolve: { root: { documents: true } },
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

	async function acceptInvite() {
		if (!me.$isLoaded || !inviteData) return
		setStatus("accepting")

		try {
			await me.acceptInvite(
				inviteData.inviteGroupId,
				inviteData.inviteSecret,
				Group,
			)

			await new Promise(resolve => setTimeout(resolve, 500))

			let doc = null
			for (let i = 0; i < 3; i++) {
				doc = await Document.load(inviteData.docId, {
					resolve: { content: true },
				})
				if (doc) break
				await new Promise(resolve => setTimeout(resolve, 500))
			}

			if (!doc) {
				setStatus("revoked")
				return
			}

			let alreadyHas = me.root?.documents?.some(
				d => d?.$jazz.id === inviteData.docId,
			)
			if (!alreadyHas && me.root?.documents) {
				me.root.documents.$jazz.push(doc)
			}

			setStatus("success")
			setTimeout(() => {
				navigate({ to: "/doc/$id", params: { id: inviteData.docId } })
			}, 1000)
		} catch (e) {
			console.error("Failed to accept invite:", e)
			setStatus("error")
			setError(e instanceof Error ? e.message : "Failed to accept invite")
		}
	}

	useEffect(() => {
		if (!inviteData || !me.$isLoaded || status !== "loading") return
		if (!isAuthenticated) {
			setStatus("needs-auth")
			return
		}
		acceptInvite()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [me.$isLoaded, status, isAuthenticated, inviteData])

	return (
		<>
			<title>Join Document</title>
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
							<LoadingState status={status} />
						) : status === "success" ? (
							<SuccessState />
						) : status === "needs-auth" ? (
							<NeedsAuthState onAuthSuccess={acceptInvite} />
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

function LoadingState({ status }: { status: "loading" | "accepting" }) {
	return (
		<div className="space-y-4 text-center">
			<Loader2 className="text-muted-foreground mx-auto size-12 animate-spin" />
			<p className="text-muted-foreground text-sm">
				{status === "loading" ? "Loading invite..." : "Joining document..."}
			</p>
		</div>
	)
}

function SuccessState() {
	return (
		<div className="space-y-4 text-center">
			<FileText className="mx-auto size-12 text-green-600 dark:text-green-400" />
			<div className="space-y-2">
				<h1 className="text-lg font-semibold">Joined successfully</h1>
				<p className="text-muted-foreground text-sm">Opening document...</p>
			</div>
		</div>
	)
}

function NeedsAuthState({ onAuthSuccess }: { onAuthSuccess: () => void }) {
	return (
		<div className="space-y-6">
			<div className="space-y-2 text-center">
				<FileText className="text-muted-foreground mx-auto size-12" />
				<h1 className="text-lg font-semibold">You&apos;ve been invited</h1>
				<p className="text-muted-foreground text-sm">
					Sign in to join this document and start collaborating.
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
