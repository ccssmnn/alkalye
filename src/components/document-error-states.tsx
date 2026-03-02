import { Link, useRouter } from "@tanstack/react-router"
import { FileX, FolderLock, FolderSearch, ShieldOff } from "lucide-react"
import { useIsAuthenticated } from "jazz-tools/react"
import { Button } from "@/components/ui/button"
import { AuthForm } from "@/components/auth-form"
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
} from "@/components/ui/empty"

export {
	DocumentNotFound,
	DocumentUnauthorized,
	SpaceNotFound,
	SpaceUnauthorized,
}

function DocumentNotFound() {
	return (
		<div className="bg-background flex min-h-dvh items-center justify-center">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<FileX className="text-muted-foreground size-12" />
					</EmptyMedia>
					<EmptyTitle>Document not found</EmptyTitle>
					<EmptyDescription>
						This document doesn&apos;t exist or has been deleted.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button nativeButton={false} render={<Link to="/" />}>
						Go to App
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	)
}

function DocumentUnauthorized() {
	let isAuthenticated = useIsAuthenticated()
	let router = useRouter()

	return (
		<div className="bg-background flex min-h-dvh items-center justify-center">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<ShieldOff className="text-muted-foreground size-12" />
					</EmptyMedia>
					<EmptyTitle>Access denied</EmptyTitle>
					<EmptyDescription>
						{isAuthenticated
							? "You don't have permission to view this document."
							: "Sign in to access this document."}
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					{isAuthenticated ? (
						<Button nativeButton={false} render={<Link to="/" />}>
							Go to App
						</Button>
					) : (
						<div className="w-full max-w-sm">
							<AuthForm onSuccess={() => router.invalidate()} />
						</div>
					)}
				</EmptyContent>
			</Empty>
		</div>
	)
}

function SpaceNotFound() {
	return (
		<div className="bg-background flex min-h-dvh items-center justify-center">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<FolderSearch className="text-muted-foreground size-12" />
					</EmptyMedia>
					<EmptyTitle>Space not found</EmptyTitle>
					<EmptyDescription>
						This space doesn&apos;t exist or may have been removed.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button nativeButton={false} render={<Link to="/" />}>
						Go to App
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	)
}

function SpaceUnauthorized() {
	let isAuthenticated = useIsAuthenticated()
	let router = useRouter()

	return (
		<div className="bg-background flex min-h-dvh items-center justify-center">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<FolderLock className="text-muted-foreground size-12" />
					</EmptyMedia>
					<EmptyTitle>Access denied</EmptyTitle>
					<EmptyDescription>
						{isAuthenticated
							? "You don't have permission to view this space."
							: "Sign in to access this space."}
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					{isAuthenticated ? (
						<Button nativeButton={false} render={<Link to="/" />}>
							Go to App
						</Button>
					) : (
						<div className="w-full max-w-sm">
							<AuthForm onSuccess={() => router.invalidate()} />
						</div>
					)}
				</EmptyContent>
			</Empty>
		</div>
	)
}
