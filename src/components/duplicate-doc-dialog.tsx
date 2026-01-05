import { useState, useRef, useEffect } from "react"
import { co } from "jazz-tools"
import { useAccount } from "jazz-tools/react"
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
import { SpaceInitials } from "@/components/space-selector"
import { Document, UserAccount } from "@/schema"

export { DuplicateDocDialog }
export type { DuplicateDocDialogProps }

type LoadedDocument = co.loaded<typeof Document, { content: true }>

let spacesQuery = { root: { spaces: { $each: { avatar: true } } } } as const
type LoadedSpaces = co.loaded<typeof UserAccount, typeof spacesQuery>

type SpaceOption = {
	id: string
	name: string
}

interface DuplicateDocDialogProps {
	doc: LoadedDocument
	open: boolean
	onOpenChange: (open: boolean) => void
	onDuplicate?: (name: string, destination: SpaceOption | null) => void
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
	let inputRef = useRef<HTMLInputElement>(null)

	let docName = getDocName(doc)
	let spaces = me?.$isLoaded ? getSortedSpaces(me.root.spaces) : []

	useEffect(() => {
		if (open) {
			setName(`${docName} (copy)`)
			setDestination("personal")
			setTimeout(() => {
				inputRef.current?.focus()
				inputRef.current?.select()
			}, 0)
		}
	}, [open, docName])

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		let trimmed = name.trim()
		if (!trimmed) return

		let selectedSpace: SpaceOption | null = null
		if (destination !== "personal") {
			let space = spaces.find(s => s.$jazz.id === destination)
			if (space) {
				selectedSpace = { id: space.$jazz.id, name: space.name }
			}
		}

		onDuplicate?.(trimmed, selectedSpace)
		onOpenChange(false)
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

					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" size="sm" disabled={!name.trim()}>
							Duplicate
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
