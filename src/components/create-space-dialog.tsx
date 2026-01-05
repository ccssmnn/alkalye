import { useState, useRef, useEffect } from "react"
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
import { useCreateSpaceDialog } from "@/components/space-selector"

export { CreateSpaceDialog }

interface CreateSpaceDialogProps {
	onSubmit?: (name: string) => void
}

function CreateSpaceDialog({ onSubmit }: CreateSpaceDialogProps) {
	let { isCreateDialogOpen, setCreateDialogOpen } = useCreateSpaceDialog()
	let [name, setName] = useState("")
	let inputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (isCreateDialogOpen) {
			setName("")
			setTimeout(() => inputRef.current?.focus(), 0)
		}
	}, [isCreateDialogOpen])

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		let trimmed = name.trim()
		if (!trimmed) return
		onSubmit?.(trimmed)
		setCreateDialogOpen(false)
		setName("")
	}

	return (
		<Dialog open={isCreateDialogOpen} onOpenChange={setCreateDialogOpen}>
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
