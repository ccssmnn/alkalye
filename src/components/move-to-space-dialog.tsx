import { useState } from "react"
import { useForm } from "@tanstack/react-form"
import { co, Group } from "jazz-tools"
import { useAccount } from "jazz-tools/react"
import { User, ArrowRight, Plus } from "lucide-react"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Document, UserAccount, createSpace } from "@/schema"
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
	let [lastOpen, setLastOpen] = useState(false)
	let [destination, setDestination] = useState("")
	let [newSpaceName, setNewSpaceName] = useState("")
	let [isSubmitting, setIsSubmitting] = useState(false)

	let spaces = me?.$isLoaded ? getSortedSpaces(me.root.spaces) : []
	let availableSpaces = currentSpaceId
		? spaces.filter(s => s.$jazz.id !== currentSpaceId)
		: spaces

	let defaultDestination = currentSpaceId
		? "personal"
		: (availableSpaces[0]?.$jazz.id ?? "")

	let form = useForm({
		defaultValues: {
			destination: defaultDestination,
			newSpaceName: "",
		},
		onSubmit: async ({ value }) => {
			if (!me?.$isLoaded || !me.root) return

			let { destination, newSpaceName } = value
			if (destination === "personal" && !currentSpaceId) return
			if (destination === currentSpaceId) return
			if (destination === "__new__" && !newSpaceName.trim()) return

			setIsSubmitting(true)
			try {
				let selectedSpace: SpaceOption | null = null

				if (destination === "__new__") {
					let space = createSpace(newSpaceName.trim(), me.root)
					selectedSpace = { id: space.$jazz.id, name: space.name }
				} else if (destination !== "personal") {
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
			} finally {
				setIsSubmitting(false)
			}
		},
	})

	if (open && !lastOpen) {
		form.reset({
			destination: defaultDestination,
			newSpaceName: "",
		})
		setDestination(defaultDestination)
		setNewSpaceName("")
		setIsSubmitting(false)
	}
	if (open !== lastOpen) {
		setLastOpen(open)
	}

	let isCreatingNew = destination === "__new__"

	let currentLocation = currentSpaceId
		? (spaces.find(s => s.$jazz.id === currentSpaceId)?.name ?? "Space")
		: "Personal"

	let isDisabled =
		isSubmitting ||
		(destination === "personal" && !currentSpaceId) ||
		destination === currentSpaceId ||
		(isCreatingNew && !newSpaceName.trim())

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
					onSubmit={e => {
						e.preventDefault()
						form.handleSubmit()
					}}
				>
					<div className="space-y-4">
						<div className="text-muted-foreground flex items-center gap-2 text-sm">
							<span>From:</span>
							<span className="text-foreground font-medium">
								{currentLocation}
							</span>
						</div>

						<form.Field name="destination">
							{field => (
								<div className="flex items-center gap-2">
									<ArrowRight className="text-muted-foreground size-4" />
									<Select
										value={field.state.value}
										onValueChange={v => {
											if (!v) return
											field.handleChange(v)
											setDestination(v)
										}}
									>
										<SelectTrigger className="flex-1">
											{field.state.value === "personal" ? (
												<div className="inline-flex items-center gap-3">
													<User />
													<span>Personal</span>
												</div>
											) : field.state.value === "__new__" ? (
												<div className="inline-flex items-center gap-3">
													<Plus className="size-4" />
													<span>Create new space</span>
												</div>
											) : (
												(() => {
													let space = availableSpaces.find(
														s => s.$jazz.id === field.state.value,
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
											<SelectItem value="__new__">
												<Plus className="size-4" />
												<span>Create new space</span>
											</SelectItem>
										</SelectContent>
									</Select>
								</div>
							)}
						</form.Field>

						{isCreatingNew && (
							<form.Field name="newSpaceName">
								{field => (
									<Field>
										<FieldLabel htmlFor={field.name}>Space name</FieldLabel>
										<Input
											id={field.name}
											name={field.name}
											value={field.state.value}
											onChange={e => {
												field.handleChange(e.target.value)
												setNewSpaceName(e.target.value)
											}}
											placeholder="My Space"
											autoComplete="off"
											autoFocus
										/>
									</Field>
								)}
							</form.Field>
						)}
					</div>

					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" size="sm" disabled={isDisabled}>
							{isSubmitting ? "Moving..." : "Move"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
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
