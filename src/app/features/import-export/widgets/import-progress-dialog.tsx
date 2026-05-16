import { X } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/app/components/ui/dialog"
import { Progress } from "@/app/components/ui/progress"
import { Button } from "@/app/components/ui/button"
import { T, useIntl } from "@/shared/intl/setup"

export { ImportProgressDialog }
export type { ImportPhase, ImportProgress }

type ImportPhase = "reading" | "compressing" | "creating"

interface ImportProgress {
	phase: ImportPhase
	currentFile: string
	fileIndex: number
	totalFiles: number
	assetIndex: number
	totalAssets: number
	compressionProgress: number // 0-1 for current video
}

interface ImportProgressDialogProps {
	open: boolean
	progress: ImportProgress
	onCancel: () => void
}

function ImportProgressDialog({
	open,
	progress,
	onCancel,
}: ImportProgressDialogProps) {
	let t = useIntl()
	let { phase, currentFile, fileIndex, totalFiles, assetIndex, totalAssets } =
		progress

	let phaseLabel =
		phase === "reading"
			? t("importExport.progress.readingFiles")
			: phase === "compressing"
				? t("importExport.progress.compressingVideo")
				: t("importExport.progress.creatingDocuments")

	// Overall progress: files done + current file partial progress
	let fileProgress = fileIndex / totalFiles
	let assetProgress =
		totalAssets > 0
			? (assetIndex +
					(phase === "compressing" ? progress.compressionProgress : 0)) /
				totalAssets
			: 1
	let currentFileWeight = 1 / totalFiles
	let overallProgress =
		fileProgress +
		assetProgress * currentFileWeight * 0.8 +
		(phase === "creating" ? currentFileWeight * 0.2 : 0)
	let percent = Math.min(99, Math.round(overallProgress * 100))

	return (
		<Dialog open={open}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>
						<T k="importExport.progress.importing" />
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					<p className="text-muted-foreground truncate text-xs">
						{currentFile}
					</p>
					<Progress value={percent} />
					<p className="text-muted-foreground text-center text-xs">
						{phaseLabel} ({fileIndex + 1}/{totalFiles})
					</p>
					{phase === "compressing" && (
						<p className="text-muted-foreground text-center text-xs">
							{`Processing asset ${assetIndex + 1} of ${totalAssets}`}
						</p>
					)}
				</div>

				<Button variant="ghost" size="sm" className="w-full" onClick={onCancel}>
					<X className="mr-1 size-3.5" />
					<T k="importExport.upload.cancel" />
				</Button>
			</DialogContent>
		</Dialog>
	)
}
