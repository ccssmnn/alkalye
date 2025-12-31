import { useState } from "react"
import { Folder, Plus, Check } from "lucide-react"
import { Combobox } from "@base-ui/react/combobox"
import { co } from "jazz-tools"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Document } from "@/schema"
import { parseFrontmatter, getPath } from "@/editor/frontmatter"
import { cn } from "@/lib/utils"

export { MoveToFolderDialog }

type LoadedDocument = co.loaded<typeof Document, { content: true }>

interface MoveToFolderDialogProps {
	doc: LoadedDocument
	existingFolders: string[]
	open?: boolean
	onOpenChange?: (open: boolean) => void
}

function MoveToFolderDialog({
	doc,
	existingFolders,
	open: controlledOpen,
	onOpenChange,
}: MoveToFolderDialogProps) {
	let [internalOpen, setInternalOpen] = useState(false)
	let open = controlledOpen ?? internalOpen
	let setOpen = onOpenChange ?? setInternalOpen

	let [inputValue, setInputValue] = useState("")
	let currentPath = getPath(doc.content?.toString() ?? "")

	let filteredFolders = existingFolders.filter(folder =>
		folder.toLowerCase().includes(inputValue.toLowerCase()),
	)
	let showCreateOption =
		inputValue.trim() &&
		!existingFolders.some(f => f.toLowerCase() === inputValue.toLowerCase())

	function handleSelect(value: string | null) {
		if (!value) return
		moveToFolder(doc, value === "__root__" ? null : value)
		setOpen(false)
		setInputValue("")
	}

	function handleCreateAndMove() {
		if (!inputValue.trim()) return
		moveToFolder(doc, inputValue.trim())
		setOpen(false)
		setInputValue("")
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Move to folder</DialogTitle>
					<DialogDescription>
						{currentPath ? `Currently in: ${currentPath}` : "Not in a folder"}
					</DialogDescription>
				</DialogHeader>

				<Combobox.Root
					value={null}
					onValueChange={handleSelect}
					onInputValueChange={value => setInputValue(value)}
				>
					<div className="relative">
						<Combobox.Input
							placeholder="Search or create folder..."
							className="border-input bg-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-none border px-3 py-1 text-sm focus-visible:ring-1 focus-visible:outline-none"
						/>
					</div>

					<Combobox.Portal>
						<Combobox.Positioner sideOffset={4} className="z-50">
							<Combobox.Popup className="bg-popover text-popover-foreground ring-foreground/10 max-h-60 w-[var(--anchor-width)] overflow-auto rounded-none shadow-md ring-1">
								{filteredFolders.length === 0 && !showCreateOption && (
									<div className="text-muted-foreground px-3 py-2 text-sm">
										No folders found
									</div>
								)}

								{currentPath && (
									<Combobox.Item
										value="__root__"
										className="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none"
									>
										<Folder className="text-muted-foreground size-4" />
										<span className="text-muted-foreground italic">
											Move to root
										</span>
									</Combobox.Item>
								)}

								{filteredFolders.map(folder => (
									<Combobox.Item
										key={folder}
										value={folder}
										className={cn(
											"data-highlighted:bg-accent data-highlighted:text-accent-foreground flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none",
											folder === currentPath && "bg-accent/50",
										)}
									>
										<Folder className="text-muted-foreground size-4" />
										<span className="flex-1 truncate">{folder}</span>
										{folder === currentPath && (
											<Check className="text-muted-foreground size-4" />
										)}
									</Combobox.Item>
								))}

								{showCreateOption && (
									<button
										type="button"
										onClick={handleCreateAndMove}
										className="hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none"
									>
										<Plus className="text-muted-foreground size-4" />
										<span>
											Create "<span className="font-medium">{inputValue}</span>"
										</span>
									</button>
								)}
							</Combobox.Popup>
						</Combobox.Positioner>
					</Combobox.Portal>
				</Combobox.Root>

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
						Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

// Handlers

function moveToFolder(doc: LoadedDocument, newPath: string | null) {
	if (!doc.content) return

	let content = doc.content.toString()
	let { frontmatter } = parseFrontmatter(content)
	let currentPath = getPath(content)

	// No change needed
	if (currentPath === newPath) return

	let newContent: string

	if (!frontmatter) {
		// No frontmatter - add it with path
		if (newPath) {
			newContent = `---\npath: ${newPath}\n---\n\n${content}`
		} else {
			newContent = content // No path to set, no frontmatter to modify
		}
	} else if (currentPath && !newPath) {
		// Remove path from frontmatter
		newContent = content.replace(
			/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*\r?\n([\s\S]*?---)/,
			"$1$2",
		)
	} else if (currentPath && newPath) {
		// Replace existing path
		newContent = content.replace(
			/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*/,
			`$1path: ${newPath}`,
		)
	} else {
		// Add path to existing frontmatter
		newContent = content.replace(/^(---\r?\n)/, `$1path: ${newPath}\n`)
	}

	doc.content.$jazz.applyDiff(newContent)
	doc.$jazz.set("updatedAt", new Date())
}
