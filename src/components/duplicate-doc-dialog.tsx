import { useState, useRef, useEffect } from "react"
import { co, Group } from "jazz-tools"
import { createImage } from "jazz-tools/media"
import { useAccount } from "jazz-tools/react"
import { toast } from "sonner"
import { User } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { SpaceInitials } from "@/components/space-selector"
import { Asset, ImageAsset, Document, Space, UserAccount } from "@/schema"
import { getSpaceGroup } from "@/lib/spaces"

export { DuplicateDocDialog, duplicateDocument }
export type { DuplicateDocDialogProps, DuplicateProgress }

type LoadedDocument = co.loaded<
	typeof Document,
	{ content: true; assets: { $each: { image: true } } }
>

type DuplicateProgress = {
	total: number
	copied: number
	status: "idle" | "copying" | "done" | "error"
	error?: string
}

let spacesQuery = {
	root: {
		documents: true,
		spaces: { $each: { avatar: true, documents: true } },
	},
} as const
type LoadedSpaces = co.loaded<typeof UserAccount, typeof spacesQuery>

type SpaceOption = {
	id: string
	name: string
}

interface DuplicateDocDialogProps {
	doc: LoadedDocument
	open: boolean
	onOpenChange: (open: boolean) => void
	onDuplicate?: (newDocId: string, destination: SpaceOption | null) => void
}

function DuplicateDocDialog({
	doc,
	open,
	onOpenChange,
	onDuplicate,
}: DuplicateDocDialogProps) {
	let me = useAccount(UserAccount, { resolve: spacesQuery })
	let [name, setName] = useState("")
	let [destination, setDestination] = useState<string>("personal")
	let [progress, setProgress] = useState<DuplicateProgress>({
		total: 0,
		copied: 0,
		status: "idle",
	})
	let inputRef = useRef<HTMLInputElement>(null)

	let docName = getDocName(doc)
	let spaces = me?.$isLoaded ? getSortedSpaces(me.root.spaces) : []
	let isDuplicating = progress.status === "copying"

	useEffect(() => {
		if (open) {
			setName(`${docName} (copy)`)
			setDestination("personal")
			setProgress({ total: 0, copied: 0, status: "idle" })
			setTimeout(() => {
				inputRef.current?.focus()
				inputRef.current?.select()
			}, 0)
		}
	}, [open, docName])

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		let trimmed = name.trim()
		if (!trimmed || !me?.$isLoaded) return

		let selectedSpace: SpaceOption | null = null
		if (destination !== "personal") {
			let space = spaces.find(s => s.$jazz.id === destination)
			if (space) {
				selectedSpace = { id: space.$jazz.id, name: space.name }
			}
		}

		try {
			let newDocId = await duplicateDocument({
				doc,
				newName: trimmed,
				destination: selectedSpace,
				me,
				onProgress: setProgress,
			})
			onDuplicate?.(newDocId, selectedSpace)
			onOpenChange(false)
		} catch (err) {
			setProgress(p => ({
				...p,
				status: "error",
				error: err instanceof Error ? err.message : "Unknown error",
			}))
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Duplicate document</DialogTitle>
					<DialogDescription>
						Create a copy of this document with a new name.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit}>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="doc-name">Name</Label>
							<Input
								ref={inputRef}
								id="doc-name"
								value={name}
								onChange={e => setName(e.target.value)}
								autoComplete="off"
							/>
						</div>

						<div className="space-y-2">
							<Label>Destination</Label>
							<Select
								value={destination}
								onValueChange={v => v && setDestination(v)}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="personal">
										<User className="size-4" />
										<span>Personal</span>
									</SelectItem>
									{spaces.map(space => (
										<SelectItem key={space.$jazz.id} value={space.$jazz.id}>
											<SpaceInitials name={space.name} size="sm" />
											<span>{space.name}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{isDuplicating && progress.total > 0 && (
						<div className="space-y-2 pt-2">
							<div className="text-muted-foreground flex justify-between text-sm">
								<span>Copying assets...</span>
								<span>
									{progress.copied}/{progress.total}
								</span>
							</div>
							<Progress value={progress.copied} max={progress.total} />
						</div>
					)}

					{progress.status === "error" && (
						<p className="text-destructive text-sm">{progress.error}</p>
					)}

					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onOpenChange(false)}
							disabled={isDuplicating}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							size="sm"
							disabled={!name.trim() || isDuplicating}
						>
							{isDuplicating
								? progress.total > 0
									? `Copying assets (${progress.copied}/${progress.total})...`
									: "Duplicating..."
								: "Duplicate"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

type DuplicateOptions = {
	doc: LoadedDocument
	newName: string
	destination: SpaceOption | null
	me: co.loaded<typeof UserAccount, { root: { documents: true; spaces: true } }>
	onProgress?: (progress: DuplicateProgress) => void
}

type LoadedSpace = co.loaded<typeof Space, { documents: true }>

async function duplicateDocument(opts: DuplicateOptions): Promise<string> {
	let { doc, newName, destination, me, onProgress } = opts
	let content = doc.content?.toString() ?? ""
	let assets = doc.assets ?? []
	let totalAssets = assets.filter(
		a => a?.$isLoaded && a.type === "image" && a.image?.$isLoaded,
	).length
	let progress: DuplicateProgress = {
		total: totalAssets,
		copied: 0,
		status: "copying",
	}
	onProgress?.(progress)

	// Determine the owner group for the new document
	let owner: Group
	let targetSpace: LoadedSpace | undefined

	if (destination) {
		// Find the target space
		let space = me.root.spaces?.find(s => s?.$jazz.id === destination.id)
		if (!space?.$isLoaded) {
			throw new Error("Target space not found or not loaded")
		}
		targetSpace = space as LoadedSpace
		// Create document-specific group with space group as parent (no role = inherit)
		// Space members inherit their space role: reader→reader, writer→writer, admin→admin
		let spaceGroup = getSpaceGroup(space as LoadedSpace)
		if (!spaceGroup) {
			throw new Error("Space group not found")
		}
		owner = Group.create()
		owner.addMember(spaceGroup)
	} else {
		// Personal document - create new group
		owner = Group.create()
	}

	// Build a map of old asset ID -> new asset ID for content replacement
	let assetIdMap = new Map<string, string>()

	// Create the new assets list
	let newAssets = co.list(Asset).create([], owner)

	// Deep copy each image asset (video assets not yet supported for duplication)
	for (let asset of [...assets]) {
		if (!asset?.$isLoaded || asset.type !== "image" || !asset.image?.$isLoaded)
			continue

		let original = asset.image.original
		if (!original?.$isLoaded) continue

		let blob = original.toBlob()
		if (!blob) continue

		try {
			// Create a new image from the blob
			let newImage = await createImage(blob, {
				owner,
				maxSize: 2048,
			})

			// Create a new asset with the copied image
			let newAsset = ImageAsset.create(
				{
					type: "image",
					name: asset.name,
					image: newImage,
					createdAt: new Date(),
				},
				owner,
			)

			newAssets.$jazz.push(newAsset)
			assetIdMap.set(asset.$jazz.id, newAsset.$jazz.id)

			progress = { ...progress, copied: progress.copied + 1 }
			onProgress?.(progress)
		} catch (err) {
			console.error("Failed to copy asset:", err)
			toast.error(`Failed to copy asset: ${asset.name}`)
		}
	}

	// Replace asset references in content with new asset IDs
	let newContent = content
	for (let [oldId, newId] of assetIdMap) {
		// Replace asset:oldId with asset:newId in markdown image syntax
		newContent = newContent.replace(
			new RegExp(`\\(asset:${oldId}\\)`, "g"),
			`(asset:${newId})`,
		)
	}

	// Replace the first heading with the new name
	let lines = newContent.split("\n")
	if (lines[0]?.startsWith("#")) {
		lines[0] = `# ${newName}`
		newContent = lines.join("\n")
	} else {
		// If no heading, prepend one
		newContent = `# ${newName}\n\n${newContent}`
	}

	// Create the new document
	let now = new Date()
	let newDoc = Document.create(
		{
			version: 1,
			content: co.plainText().create(newContent, owner),
			assets: newAssets,
			createdAt: now,
			updatedAt: now,
			spaceId: destination?.id,
		},
		owner,
	)

	// Add to the appropriate list
	if (targetSpace) {
		targetSpace.documents.$jazz.push(newDoc)
	} else {
		me.root.documents.$jazz.push(newDoc)
	}

	progress = { ...progress, status: "done" }
	onProgress?.(progress)

	return newDoc.$jazz.id
}

// --- Helpers ---

type LoadedSpaceWithAvatar = NonNullable<
	NonNullable<LoadedSpaces["root"]["spaces"]>[number]
>

function getSortedSpaces(
	spaces: LoadedSpaces["root"]["spaces"],
): LoadedSpaceWithAvatar[] {
	if (!spaces) return []

	return Array.from(spaces)
		.filter(
			(s): s is LoadedSpaceWithAvatar =>
				s != null && s.$isLoaded && !s.deletedAt,
		)
		.sort((a, b) => a.name.localeCompare(b.name))
}

function getDocName(doc: LoadedDocument): string {
	let content = doc.content?.toString() ?? ""
	let firstLine = content.split("\n")[0] ?? ""
	let title = firstLine.replace(/^#\s*/, "").trim()
	return title || "Untitled"
}
