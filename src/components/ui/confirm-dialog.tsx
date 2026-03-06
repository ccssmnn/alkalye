import { useState, type ReactNode } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export { ConfirmDialog, useConfirmDialog }
export type { ConfirmDialogProps }

interface ConfirmDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description: string
	confirmLabel?: string
	cancelLabel?: string
	variant?: "default" | "destructive"
	onConfirm: () => void
	children?: ReactNode
	confirmTestId?: string
	cancelTestId?: string
}

function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	variant = "default",
	onConfirm,
	children,
	confirmTestId,
	cancelTestId,
}: ConfirmDialogProps) {
	function handleConfirm() {
		onConfirm()
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{children}
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						data-testid={cancelTestId}
					>
						{cancelLabel}
					</Button>
					<Button
						variant={variant === "destructive" ? "destructive" : "default"}
						onClick={handleConfirm}
						data-testid={confirmTestId}
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function useConfirmDialog() {
	let [open, setOpen] = useState(false)
	return { open, setOpen, onOpenChange: setOpen }
}
