import { Link } from "@tanstack/react-router"
import { FileX, ShieldOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
	EmptyContent,
} from "@/components/ui/empty"

export { DocumentNotFound, DocumentUnauthorized }

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
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => window.history.back()}>
							Go back
						</Button>
						<Button render={<Link to="/" />}>Go to documents</Button>
					</div>
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
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => window.history.back()}>
							Go back
						</Button>
						<Button render={<Link to="/" />}>Go to documents</Button>
					</div>
				</EmptyContent>
			</Empty>
		</div>
	)
}
