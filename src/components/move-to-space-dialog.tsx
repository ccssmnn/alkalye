import { useState } from "react"
import { co, Group } from "jazz-tools"
import { useAccount } from "jazz-tools/react"
import { User, ArrowRight } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { SpaceInitials } from "@/components/space-selector"
import { Document, UserAccount } from "@/schema"
import { getSpaceGroup } from "@/lib/spaces"
import { getDocumentGroup } from "@/lib/documents"

export { MoveToSpaceDialog, moveDocumentToSpace }
export type { MoveToSpaceDialogProps }

type LoadedDocument = co.loaded<typeof Document, { content: true }>

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

interface MoveToSpaceDialogProps {
	doc: LoadedDocument
	open: boolean
	onOpenChange: (open: boolean) => void
	currentSpaceId?: string
	onMove?: (destination: SpaceOption | null) => void
}

function MoveToSpaceDialog({
	doc,
	open,
	onOpenChange,
	currentSpaceId,
	onMove,
}: MoveToSpaceDialogProps) {
	let me = useAccount(UserAccount, { resolve: spacesQuery })
	let [destination, setDestination] = useState<string>("")
	let [isMoving, setIsMoving] = useState(false)
	let [lastOpen, setLastOpen] = useState(false)

	let spaces = me?.$isLoaded ? getSortedSpaces(me.root.spaces) : []
	let availableSpaces = currentSpaceId
		? spaces.filter(s => s.$jazz.id !== currentSpaceId)
		: spaces

	if (open && !lastOpen) {
		let defaultDest = currentSpaceId
			? "personal"
			: (availableSpaces[0]?.$jazz.id ?? "")
		setDestination(defaultDest)
		setIsMoving(false)
	}
	if (open !== lastOpen) {
		setLastOpen(open)
	}

	let currentLocation = currentSpaceId
		? (spaces.find(s => s.$jazz.id === currentSpaceId)?.name ?? "Space")
		: "Personal"

	let isDisabled =
		isMoving ||
		(destination === "personal" && !currentSpaceId) ||
		destination === currentSpaceId

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Move to space</DialogTitle>
					<DialogDescription>
						Move this document to a different space or your personal documents.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={makeSubmit({
						me,
						doc,
						destination,
						spaces,
						currentSpaceId,
						setIsMoving,
						onMove,
						onOpenChange,
					})}
				>
					<div className="space-y-4">
						<div className="text-muted-foreground flex items-center gap-2 text-sm">
							<span>From:</span>
							<span className="text-foreground font-medium">
								{currentLocation}
							</span>
						</div>

						<div className="flex items-center gap-2">
							<ArrowRight className="text-muted-foreground size-4" />
							<Select
								value={destination}
								onValueChange={v => v && setDestination(v)}
							>
								<SelectTrigger className="flex-1">
									{destination === "personal" ? (
										<div className="inline-flex items-center gap-3">
											<User />
											<span>Personal</span>
										</div>
									) : (
										(() => {
											let space = availableSpaces.find(
												s => s.$jazz.id === destination,
											)
											return space ? (
												<div className="inline-flex items-center gap-3">
													<SpaceInitials name={space.name} size="sm" />
													<span>{space.name}</span>
												</div>
											) : (
												<SelectValue />
											)
										})()
									)}
								</SelectTrigger>
								<SelectContent>
									{!currentSpaceId ? null : (
										<SelectItem value="personal">
											<User className="size-4" />
											<span>Personal</span>
										</SelectItem>
									)}
									{availableSpaces.map(space => (
										<SelectItem key={space.$jazz.id} value={space.$jazz.id}>
											<SpaceInitials name={space.name} size="sm" />
											<span>{space.name}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onOpenChange(false)}
							disabled={isMoving}
						>
							Cancel
						</Button>
						<Button type="submit" size="sm" disabled={isDisabled}>
							{isMoving ? "Moving..." : "Move"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

type SubmitOptions = {
	me: ReturnType<typeof useAccount<typeof UserAccount, typeof spacesQuery>>
	doc: LoadedDocument
	destination: string
	spaces: LoadedSpaceWithAvatar[]
	currentSpaceId?: string
	setIsMoving: (v: boolean) => void
	onMove?: (destination: SpaceOption | null) => void
	onOpenChange: (open: boolean) => void
}

function makeSubmit(opts: SubmitOptions) {
	let {
		me,
		doc,
		destination,
		spaces,
		currentSpaceId,
		setIsMoving,
		onMove,
		onOpenChange,
	} = opts

	return async function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (!me?.$isLoaded) return

		if (destination === "personal" && !currentSpaceId) return
		if (destination === currentSpaceId) return

		setIsMoving(true)

		try {
			let selectedSpace: SpaceOption | null = null
			if (destination !== "personal") {
				let space = spaces.find(s => s.$jazz.id === destination)
				if (space) {
					selectedSpace = { id: space.$jazz.id, name: space.name }
				}
			}

			await moveDocumentToSpace({
				doc,
				destination: selectedSpace,
				currentSpaceId,
				me,
			})

			onMove?.(selectedSpace)
			onOpenChange(false)
		} catch (err) {
			console.error("Failed to move document:", err)
			setIsMoving(false)
		}
	}
}

type LoadedSpaceWithAvatar = NonNullable<
	NonNullable<LoadedSpaces["root"]["spaces"]>[number]
>

function getSortedSpaces(
	spaces: LoadedSpaces["root"]["spaces"],
): LoadedSpaceWithAvatar[] {
	if (!spaces) return []

	return [...spaces.values()]
		.filter((s): s is LoadedSpaceWithAvatar => {
			if (!s?.$isLoaded || s.deletedAt) return false
			let spaceGroup = getSpaceGroup(s)
			let role = spaceGroup?.myRole()
			return role === "admin" || role === "writer"
		})
		.sort((a, b) => a.name.localeCompare(b.name))
}

type MoveUser = co.loaded<
	typeof UserAccount,
	{ root: { documents: true; spaces: { $each: { documents: true } } } }
>

type MoveOptions = {
	doc: LoadedDocument
	destination: SpaceOption | null
	currentSpaceId?: string
	me: MoveUser
}

async function moveDocumentToSpace(opts: MoveOptions): Promise<void> {
	let { doc, destination, currentSpaceId, me } = opts

	let docGroup = getDocumentGroup(doc)
	if (!docGroup) {
		throw new Error("Document group not found")
	}

	if (currentSpaceId) {
		let currentSpace = me.root.spaces?.find(s => s?.$jazz.id === currentSpaceId)
		if (currentSpace?.$isLoaded && currentSpace.documents?.$isLoaded) {
			let idx = currentSpace.documents.findIndex(
				d => d?.$jazz.id === doc.$jazz.id,
			)
			if (idx !== -1) {
				currentSpace.documents.$jazz.splice(idx, 1)
			}
		}
	} else {
		if (me.root.documents?.$isLoaded) {
			let idx = me.root.documents.findIndex(d => d?.$jazz.id === doc.$jazz.id)
			if (idx !== -1) {
				me.root.documents.$jazz.splice(idx, 1)
			}
		}
	}

	if (destination) {
		let targetSpace = me.root.spaces?.find(s => s?.$jazz.id === destination.id)
		if (!targetSpace?.$isLoaded || !targetSpace.documents?.$isLoaded) {
			throw new Error("Target space not found or not loaded")
		}

		let spaceGroup = getSpaceGroup(targetSpace)
		if (!spaceGroup) {
			throw new Error("Space group not found")
		}

		docGroup.addMember(spaceGroup)

		let loadedDoc = await doc.$jazz.ensureLoaded({
			resolve: { assets: { $each: true } },
		})
		if (loadedDoc.assets) {
			let assetsOwner = loadedDoc.assets.$jazz.owner
			if (assetsOwner instanceof Group) {
				assetsOwner.addMember(spaceGroup)
			}
			for (let asset of loadedDoc.assets.values()) {
				if (asset?.$isLoaded) {
					let assetOwner = asset.$jazz.owner
					if (assetOwner instanceof Group) {
						assetOwner.addMember(spaceGroup)
					}
				}
			}
		}

		doc.$jazz.set("spaceId", destination.id)
		targetSpace.documents.$jazz.push(doc)
	} else {
		doc.$jazz.set("spaceId", undefined)
		me.root.documents.$jazz.push(doc)
	}

	doc.$jazz.set("updatedAt", new Date())
}
