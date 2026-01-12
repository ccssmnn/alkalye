import { useRef, useState } from "react"
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
	Image as ImageIcon,
	Pencil,
	Trash2,
	Plus,
	Download,
} from "lucide-react"

export { SidebarAssets }
export type { SidebarAsset }

interface SidebarAsset {
	id: string
	name: string
	imageId?: string
}

interface SidebarAssetsProps {
	assets: SidebarAsset[]
	readOnly?: boolean
	onUpload?: (files: FileList) => void
	onRename?: (assetId: string, newName: string) => void
	onDelete?: (assetId: string) => void
	onDownload?: (assetId: string, name: string) => void
	onInsert?: (assetId: string, name: string) => void
	isAssetUsed?: (assetId: string) => boolean
}

function SidebarAssets({
	assets,
	readOnly,
	onUpload,
	onRename,
	onDelete,
	onDownload,
	onInsert,
	isAssetUsed,
}: SidebarAssetsProps) {
	let { isMobile } = useSidebar()
	let fileInputRef = useRef<HTMLInputElement>(null)
	let [renameOpen, setRenameOpen] = useState(false)
	let [renamingAsset, setRenamingAsset] = useState<SidebarAsset | null>(null)
	let [deleteOpen, setDeleteOpen] = useState(false)
	let [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)

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
		<>
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
				accept="image/*"
				multiple
				className="hidden"
				onChange={e => {
					if (e.target.files && onUpload) {
						onUpload(e.target.files)
					}
				}}
			/>
			<SidebarGroupContent>
				{assets.length === 0 ? (
					<div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-8 text-xs">
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
											<SidebarMenuButton disabled={readOnly}>
												<div className="bg-muted size-8 shrink-0 overflow-hidden rounded">
													{asset.imageId ? (
														<JazzImage
															imageId={asset.imageId}
															className="size-full object-cover"
														/>
													) : (
														<div className="flex size-full items-center justify-center">
															<ImageIcon className="text-muted-foreground size-4" />
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
		</>
	)
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
