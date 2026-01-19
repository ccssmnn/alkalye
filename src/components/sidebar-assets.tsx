import { useRef, useState, useEffect } from "react"
import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Image as JazzImage } from "jazz-tools/react"
import {
	SidebarGroupLabel,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
	UploadProgressDialog,
	type UploadPhase,
} from "@/components/upload-progress-dialog"
import {
	Image as ImageIcon,
	Pencil,
	Trash2,
	Plus,
	Download,
	Upload,
	Film,
	VolumeX,
	Volume2,
} from "lucide-react"

export { SidebarAssets }
export type { SidebarAsset }

interface SidebarAsset {
	id: string
	name: string
	type: "image" | "video"
	imageId?: string
	getVideoBlob?: () => Blob | undefined
	muteAudio?: boolean
}

interface VideoUploadState {
	fileName: string
	phase: UploadPhase
	progress: number
	abortController: AbortController
}

interface SidebarAssetsProps {
	assets: SidebarAsset[]
	readOnly?: boolean
	onUploadImages?: (files: FileList) => void
	onUploadVideo?: (
		file: File,
		options: {
			onProgress: (p: { phase: UploadPhase; progress: number }) => void
			signal: AbortSignal
		},
	) => Promise<void>
	onRename?: (assetId: string, newName: string) => void
	onDelete?: (assetId: string) => void
	onDownload?: (assetId: string, name: string) => void
	onInsert?: (assetId: string, name: string) => void
	onToggleMute?: (assetId: string) => void
	isAssetUsed?: (assetId: string) => boolean
	canUploadVideo?: boolean
}

function SidebarAssets({
	assets,
	readOnly,
	onUploadImages,
	onUploadVideo,
	onRename,
	onDelete,
	onDownload,
	onInsert,
	onToggleMute,
	isAssetUsed,
	canUploadVideo,
}: SidebarAssetsProps) {
	let { isMobile } = useSidebar()
	let fileInputRef = useRef<HTMLInputElement>(null)
	let [renameOpen, setRenameOpen] = useState(false)
	let [renamingAsset, setRenamingAsset] = useState<SidebarAsset | null>(null)
	let [deleteOpen, setDeleteOpen] = useState(false)
	let [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
	let [isDragging, setIsDragging] = useState(false)
	let [videoUpload, setVideoUpload] = useState<VideoUploadState | null>(null)

	async function handleDrop(e: React.DragEvent) {
		e.preventDefault()
		setIsDragging(false)
		if (readOnly) return

		let files = Array.from(e.dataTransfer.files)
		await handleFiles(files)
	}

	async function handleFiles(files: File[]) {
		let imageFiles = files.filter(f => f.type.startsWith("image/"))
		let videoFiles = files.filter(f => f.type.startsWith("video/"))

		if (imageFiles.length > 0 && onUploadImages) {
			let dt = new DataTransfer()
			imageFiles.forEach(f => dt.items.add(f))
			onUploadImages(dt.files)
		}

		for (let file of videoFiles) {
			if (!onUploadVideo) continue
			let abortController = new AbortController()
			setVideoUpload({
				fileName: file.name,
				phase: "compressing",
				progress: 0,
				abortController,
			})
			try {
				await onUploadVideo(file, {
					onProgress: p =>
						setVideoUpload(prev =>
							prev ? { ...prev, phase: p.phase, progress: p.progress } : null,
						),
					signal: abortController.signal,
				})
			} catch (err) {
				console.error("Video upload failed:", err)
			} finally {
				setVideoUpload(null)
			}
		}
	}

	function handleCancelUpload() {
		videoUpload?.abortController.abort()
		setVideoUpload(null)
	}

	function handleRename(asset: SidebarAsset) {
		setRenamingAsset(asset)
		setRenameOpen(true)
	}

	function handleSaveRename(newName: string) {
		if (renamingAsset && onRename) {
			onRename(renamingAsset.id, newName)
		}
		setRenameOpen(false)
		setRenamingAsset(null)
	}

	function handleDeleteClick(assetId: string) {
		if (isAssetUsed?.(assetId)) {
			setDeletingAssetId(assetId)
			setDeleteOpen(true)
		} else {
			onDelete?.(assetId)
		}
	}

	function handleConfirmDelete() {
		if (deletingAssetId) {
			onDelete?.(deletingAssetId)
			setDeletingAssetId(null)
		}
	}

	return (
		<div
			className="relative flex flex-1 flex-col"
			onDragOver={e => {
				e.preventDefault()
				if (!readOnly) setIsDragging(true)
			}}
			onDragLeave={e => {
				e.preventDefault()
				if (!e.currentTarget.contains(e.relatedTarget as Node))
					setIsDragging(false)
			}}
			onDrop={handleDrop}
		>
			{isDragging && (
				<div className="bg-background/90 absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
					<div className="text-center">
						<Upload className="text-primary mx-auto mb-2 size-8" />
						<p className="text-sm font-medium">Drop media here</p>
					</div>
				</div>
			)}
			<SidebarGroupLabel className="flex items-center justify-between pr-2">
				<span>Assets</span>
				<Tooltip>
					<TooltipTrigger
						render={
							<button
								onClick={() => fileInputRef.current?.click()}
								disabled={readOnly}
								className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent flex size-5 items-center justify-center rounded disabled:pointer-events-none disabled:opacity-50"
							>
								<Plus className="size-4" />
							</button>
						}
					/>
					<TooltipContent>Add asset</TooltipContent>
				</Tooltip>
			</SidebarGroupLabel>
			<input
				ref={fileInputRef}
				type="file"
				accept={canUploadVideo ? "image/*,video/*" : "image/*"}
				multiple
				className="hidden"
				onChange={e => {
					if (e.target.files) {
						handleFiles(Array.from(e.target.files))
					}
				}}
			/>
			<SidebarGroupContent className="flex flex-1 flex-col">
				{assets.length === 0 ? (
					<div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 text-xs">
						<ImageIcon className="size-6 opacity-50" />
						<p>No assets yet</p>
					</div>
				) : (
					<SidebarMenu>
						{assets.map(asset => (
							<SidebarMenuItem key={asset.id}>
								<DropdownMenu>
									<DropdownMenuTrigger
										disabled={readOnly}
										render={
											<SidebarMenuButton disabled={readOnly} nativeButton>
												<div className="bg-muted size-8 shrink-0 overflow-hidden rounded">
													{asset.type === "image" && asset.imageId ? (
														<JazzImage
															imageId={asset.imageId}
															className="size-full object-cover"
														/>
													) : asset.type === "video" && asset.getVideoBlob ? (
														<VideoThumbnail
															assetId={asset.id}
															getBlob={asset.getVideoBlob}
														/>
													) : (
														<div className="flex size-full items-center justify-center">
															{asset.type === "video" ? (
																<Film className="text-muted-foreground size-4" />
															) : (
																<ImageIcon className="text-muted-foreground size-4" />
															)}
														</div>
													)}
												</div>
												<span className="truncate">{asset.name}</span>
											</SidebarMenuButton>
										}
									/>
									<DropdownMenuContent
										side={isMobile ? "bottom" : "left"}
										align={isMobile ? "center" : "start"}
									>
										{onInsert && (
											<DropdownMenuItem
												onClick={() => onInsert(asset.id, asset.name)}
											>
												<Plus className="size-4" />
												Insert
											</DropdownMenuItem>
										)}
										{onDownload && (
											<DropdownMenuItem
												onClick={() => onDownload(asset.id, asset.name)}
											>
												<Download className="size-4" />
												Download
											</DropdownMenuItem>
										)}
										{onRename && (
											<DropdownMenuItem onClick={() => handleRename(asset)}>
												<Pencil className="size-4" />
												Rename
											</DropdownMenuItem>
										)}
										{asset.type === "video" && onToggleMute && (
											<DropdownMenuItem onClick={() => onToggleMute(asset.id)}>
												{asset.muteAudio ? (
													<>
														<Volume2 className="size-4" />
														Unmute audio
													</>
												) : (
													<>
														<VolumeX className="size-4" />
														Mute audio
													</>
												)}
											</DropdownMenuItem>
										)}
										{onDelete && (
											<DropdownMenuItem
												onClick={() => handleDeleteClick(asset.id)}
												className="text-destructive focus:text-destructive"
											>
												<Trash2 className="size-4" />
												Delete
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				)}
			</SidebarGroupContent>

			<RenameAssetDialog
				open={renameOpen}
				onOpenChange={open => {
					setRenameOpen(open)
					if (!open) setRenamingAsset(null)
				}}
				currentName={renamingAsset?.name ?? ""}
				onRename={handleSaveRename}
			/>
			<ConfirmDialog
				open={deleteOpen}
				onOpenChange={open => {
					setDeleteOpen(open)
					if (!open) setDeletingAssetId(null)
				}}
				title="Delete asset?"
				description="This image is used in the document. Deleting it will remove it from the content."
				confirmLabel="Delete"
				variant="destructive"
				onConfirm={handleConfirmDelete}
			/>
			{videoUpload && (
				<UploadProgressDialog
					open={true}
					fileName={videoUpload.fileName}
					phase={videoUpload.phase}
					progress={videoUpload.progress}
					onCancel={handleCancelUpload}
				/>
			)}
		</div>
	)
}

let thumbnailCache = new Map<string, string>()

function VideoThumbnail({
	assetId,
	getBlob,
}: {
	assetId: string
	getBlob: () => Blob | undefined
}) {
	let cached = thumbnailCache.get(assetId)
	let [thumbnailUrl, setThumbnailUrl] = useState<string | null>(cached ?? null)

	useEffect(() => {
		if (thumbnailCache.has(assetId)) {
			setThumbnailUrl(thumbnailCache.get(assetId)!)
			return
		}

		let blob = getBlob()
		if (!blob) return

		let videoUrl = URL.createObjectURL(blob)
		let video = document.createElement("video")
		video.src = videoUrl
		video.muted = true
		video.preload = "metadata"

		let cancelled = false

		video.onloadeddata = () => {
			if (cancelled) return
			video.currentTime = 0
		}

		video.onseeked = () => {
			if (cancelled) return
			let canvas = document.createElement("canvas")
			canvas.width = video.videoWidth
			canvas.height = video.videoHeight
			let ctx = canvas.getContext("2d")
			if (ctx) {
				ctx.drawImage(video, 0, 0)
				let dataUrl = canvas.toDataURL("image/jpeg", 0.7)
				thumbnailCache.set(assetId, dataUrl)
				setThumbnailUrl(dataUrl)
			}
			URL.revokeObjectURL(videoUrl)
		}

		video.onerror = () => {
			URL.revokeObjectURL(videoUrl)
		}

		return () => {
			cancelled = true
			URL.revokeObjectURL(videoUrl)
		}
	}, [assetId, getBlob])

	if (!thumbnailUrl) {
		return (
			<div className="flex size-full items-center justify-center">
				<Film className="text-muted-foreground size-4" />
			</div>
		)
	}

	return <img src={thumbnailUrl} className="size-full object-cover" alt="" />
}

let assetNameSchema = z.object({
	name: z.string().min(1, "Name is required").max(100, "Name too long"),
})

interface RenameAssetDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	currentName: string
	onRename: (name: string) => void
}

function RenameAssetDialog({
	open,
	onOpenChange,
	currentName,
	onRename,
}: RenameAssetDialogProps) {
	let form = useForm({
		defaultValues: { name: currentName },
		validators: { onSubmit: assetNameSchema },
		onSubmit: ({ value }) => {
			onRename(value.name.trim())
			onOpenChange(false)
		},
	})

	function handleOpenChangeComplete(isOpen: boolean) {
		if (isOpen) {
			form.reset({ name: currentName })
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={handleOpenChangeComplete}
		>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Rename asset</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={e => {
						e.preventDefault()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<form.Field name="name">
						{field => {
							let isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Name</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
										placeholder="Asset name"
										autoFocus
									/>
									{isInvalid && (
										<FieldError>
											{field.state.meta.errors.join(", ")}
										</FieldError>
									)}
								</Field>
							)
						}}
					</form.Field>
					<DialogFooter>
						<Button type="submit">Save</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
