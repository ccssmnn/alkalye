import { useEffect, useRef, useState } from "react"
import { useForm } from "@tanstack/react-form"
import { co } from "jazz-tools"
import { useAccount } from "jazz-tools/react"
import { User, Plus, Copy } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
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
import {
	Document,
	UserAccount,
	createSpace,
	createSpaceDocument,
} from "@/schema"
import { getSpaceGroup } from "@/lib/spaces"

export { CopyToSyncedDialog }
export type { CopyToSyncedDialogProps }

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

interface CopyToSyncedDialogProps {
	content: string
	filename: string | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onCopy?: (destination: SpaceOption | null) => void
}

function CopyToSyncedDialog({
	content,
	filename,
	open,
	onOpenChange,
	onCopy,
}: CopyToSyncedDialogProps) {
	let me = useAccount(UserAccount, { resolve: spacesQuery })
	let [isSubmitting, setIsSubmitting] = useState(false)
	let navigate = useNavigate()
	let lastOpenRef = useRef(false)

	let spaces = me?.$isLoaded ? getSortedSpaces(me.root.spaces) : []
	let defaultDestination = spaces[0]?.$jazz.id ?? "personal"

	let form = useForm({
		defaultValues: {
			destination: defaultDestination,
			newSpaceName: "",
		},
		onSubmit: async ({ value }) => {
			if (!me?.$isLoaded) return

			setIsSubmitting(true)
			let destination = value.destination
			let newSpaceName = value.newSpaceName.trim()

			try {
				if (destination === "__new__") {
					// Create new space and add document
					if (!newSpaceName) {
						setIsSubmitting(false)
						return
					}
					let space = createSpace(newSpaceName, me.root)
					if (!space.documents?.$isLoaded) {
						setIsSubmitting(false)
						return
					}
					let newDoc = createSpaceDocument(space.$jazz.owner, content)
					space.documents.$jazz.push(newDoc)

					onCopy?.({ id: space.$jazz.id, name: newSpaceName })
					onOpenChange(false)
					void navigate({
						to: "/spaces/$spaceId/doc/$id",
						params: { spaceId: space.$jazz.id, id: newDoc.$jazz.id },
					})
				} else if (destination === "personal") {
					// Add to personal documents
					let newDoc = Document.create(
						{
							version: 1,
							content: co.plainText().create(content, me.$jazz.owner),
							createdAt: new Date(),
							updatedAt: new Date(),
						},
						me.$jazz.owner,
					)

					// Ensure documents list exists before pushing
					if (!me.root.documents) {
						me.root.$jazz.set("documents", co.list(Document).create([]))
					}
					me.root.documents.$jazz.push(newDoc)

					onCopy?.({ id: "personal", name: "Personal" })
					onOpenChange(false)
					void navigate({
						to: "/doc/$id",
						params: { id: newDoc.$jazz.id },
					})
				} else {
					// Add to existing space
					let space = spaces.find(s => s.$jazz.id === destination)
					if (!space?.documents?.$isLoaded) {
						setIsSubmitting(false)
						return
					}
					let newDoc = createSpaceDocument(space.$jazz.owner, content)
					space.documents.$jazz.push(newDoc)

					onCopy?.({ id: space.$jazz.id, name: space.name })
					onOpenChange(false)
					void navigate({
						to: "/spaces/$spaceId/doc/$id",
						params: { spaceId: space.$jazz.id, id: newDoc.$jazz.id },
					})
				}
			} finally {
				setIsSubmitting(false)
			}
		},
	})

	useEffect(() => {
		if (open && !lastOpenRef.current) {
			form.reset({ destination: defaultDestination, newSpaceName: "" })
			setIsSubmitting(false)
		}
		lastOpenRef.current = open
	}, [open, defaultDestination, form])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Copy to Synced Documents</DialogTitle>
					<DialogDescription>
						Copy &quot;{filename ?? "Untitled"}&quot; to your synced documents.
					</DialogDescription>
				</DialogHeader>

				<form
					onSubmit={e => {
						e.preventDefault()
						e.stopPropagation()
						void form.handleSubmit()
					}}
					className="flex flex-col gap-4"
				>
					<form.Field name="destination">
						{field => (
							<Field>
								<FieldLabel>Destination</FieldLabel>
								<Select
									value={field.state.value}
									onValueChange={v => {
										if (!v) return
										field.handleChange(v)
									}}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="personal">
											<User className="mr-2 size-4" />
											Personal
										</SelectItem>
										{spaces.map(space => (
											<SelectItem key={space.$jazz.id} value={space.$jazz.id}>
												<SpaceInitials name={space.name} />
												{space.name}
											</SelectItem>
										))}
										<SelectItem value="__new__">
											<Plus className="mr-2 size-4" />
											Create new space
										</SelectItem>
									</SelectContent>
								</Select>
							</Field>
						)}
					</form.Field>

					<form.Subscribe selector={s => s.values.destination}>
						{destination =>
							destination === "__new__" ? (
								<form.Field name="newSpaceName">
									{field => (
										<Field>
											<FieldLabel>New Space Name</FieldLabel>
											<Input
												value={field.state.value}
												onChange={e => field.handleChange(e.target.value)}
												placeholder="Enter space name"
											/>
										</Field>
									)}
								</form.Field>
							) : null
						}
					</form.Subscribe>

					<DialogFooter>
						<Button
							type="button"
							variant="ghost"
							onClick={() => onOpenChange(false)}
							nativeButton
						>
							Cancel
						</Button>
						<form.Subscribe
							selector={s => ({
								destination: s.values.destination,
								newSpaceName: s.values.newSpaceName,
							})}
						>
							{({ destination, newSpaceName }) => (
								<Button
									type="submit"
									disabled={
										isSubmitting ||
										(destination === "__new__" && !newSpaceName.trim())
									}
									nativeButton
								>
									{isSubmitting ? (
										<>Copying...</>
									) : (
										<>
											<Copy className="mr-2 size-4" />
											Copy Document
										</>
									)}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

// --- Helpers ---

type LoadedSpaceWithAvatar = NonNullable<
	NonNullable<LoadedSpaces["root"]["spaces"]>[number]
>

function getSortedSpaces(
	spaces: LoadedSpaces["root"]["spaces"],
): LoadedSpaceWithAvatar[] {
	if (!spaces) return []

	return [...spaces.values()]
		.filter((s): s is LoadedSpaceWithAvatar => {
			if (!s?.$isLoaded) return false
			let spaceGroup = getSpaceGroup(s)
			let role = spaceGroup?.myRole()
			return role === "admin" || role === "writer"
		})
		.sort((a, b) => a.name.localeCompare(b.name))
}
