import { Link } from "@tanstack/react-router"
import { FileX, FolderX, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
} from "@/components/ui/empty"

export { DocumentNotFound, DocumentUnauthorized, SpaceDeleted }

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
	return (
		<div className="bg-background flex min-h-dvh items-center justify-center">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<ShieldOff className="text-muted-foreground size-12" />
					</EmptyMedia>
					<EmptyTitle>Access denied</EmptyTitle>
					<EmptyDescription>
						You don&apos;t have permission to view this document.
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

function SpaceDeleted() {
	return (
		<div className="bg-background flex min-h-dvh items-center justify-center">
			<Empty>
				<EmptyHeader>
					<EmptyMedia>
						<FolderX className="text-muted-foreground size-12" />
					</EmptyMedia>
					<EmptyTitle>Space deleted</EmptyTitle>
					<EmptyDescription>
						This space has been deleted and is no longer available.
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
