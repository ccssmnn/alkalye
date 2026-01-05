import { useState, useRef, useEffect } from "react"
import { co } from "jazz-tools"
import { useAccount } from "jazz-tools/react"
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
	useCreateSpaceDialog,
	useSelectedSpace,
} from "@/components/space-selector"
import { UserAccount, createSpace } from "@/schema"

export { CreateSpaceDialog }

let spacesResolve = { root: { spaces: true } } as const
type LoadedMe = co.loaded<typeof UserAccount, typeof spacesResolve>

function CreateSpaceDialog() {
	let { isCreateDialogOpen, setCreateDialogOpen } = useCreateSpaceDialog()
	let { setSelectedSpace } = useSelectedSpace()
	let me = useAccount(UserAccount, { resolve: spacesResolve })
	let [name, setName] = useState("")
	let inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (isCreateDialogOpen) {
			setTimeout(() => inputRef.current?.focus(), 0)
		}
	}, [isCreateDialogOpen])

	function handleOpenChangeComplete(open: boolean) {
		if (!open) setName("")
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		let trimmed = name.trim()
		if (!trimmed || !me.$isLoaded || !me.root) return

		let space = createSpace(trimmed, me.root as LoadedMe["root"])
		setSelectedSpace({ id: space.$jazz.id, name: space.name })
		setCreateDialogOpen(false)
		setName("")
	}

	return (
		<Dialog
			open={isCreateDialogOpen}
			onOpenChange={setCreateDialogOpen}
			onOpenChangeComplete={handleOpenChangeComplete}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create space</DialogTitle>
					<DialogDescription>
						Spaces let you organize documents and collaborate with others.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="space-name">Name</Label>
						<Input
							ref={inputRef}
							id="space-name"
							placeholder="My Space"
							value={name}
							onChange={e => setName(e.target.value)}
							autoComplete="off"
						/>
					</div>

					<DialogFooter className="mt-4">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setCreateDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button type="submit" size="sm" disabled={!name.trim()}>
							Create
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
