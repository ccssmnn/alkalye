import { X } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"

export { UploadProgressDialog }
export type { UploadPhase }

type UploadPhase = "compressing" | "uploading" | "done"

interface UploadProgressDialogProps {
	open: boolean
	fileName: string
	phase: UploadPhase
	progress: number // 0-1
	onCancel: () => void
}

function UploadProgressDialog({
	open,
	fileName,
	phase,
	progress,
	onCancel,
}: UploadProgressDialogProps) {
	let phaseLabel = phase === "compressing" ? "Compressing" : "Uploading"
	let percent = Math.round(progress * 100)

	return (
		<Dialog open={open}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>{phaseLabel} video</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					<p className="text-muted-foreground truncate text-xs">{fileName}</p>
					<Progress value={percent} />
					<p className="text-muted-foreground text-center text-xs">
						{percent}%
					</p>
				</div>

				{phase !== "done" && (
					<Button
						variant="ghost"
						size="sm"
						className="w-full"
						onClick={onCancel}
					>
						<X className="mr-1 size-3.5" />
						Cancel
					</Button>
				)}
			</DialogContent>
		</Dialog>
	)
}
