import { useState } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { Combobox } from "@base-ui/react/combobox"
import { co } from "jazz-tools"
import {
	Folder,
	ChevronRight,
	ChevronDown,
	Pencil,
	FolderInput,
	Trash2,
	Plus,
} from "lucide-react"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
import { Document } from "@/schema"
import { parseFrontmatter, getPath } from "@/editor/frontmatter"
export { FolderRow, useFolderStore }
export type { FolderState }

type LoadedDocument = co.loaded<typeof Document, { content: true }>
type ViewMode = "folders" | "flat"

interface FolderState {
	viewMode: ViewMode
	collapsedFolders: Set<string>
	setViewMode: (mode: ViewMode) => void
	toggleFolder: (path: string) => void
	isCollapsed: (path: string) => boolean
	renameFolder: (oldPath: string, newPath: string) => void
	removeFolder: (path: string) => void
}

interface PersistedFolderState {
	viewMode?: ViewMode
	collapsedFolders?: string[]
}

function parsePersistedFolderState(persisted: unknown): PersistedFolderState {
	if (!persisted || typeof persisted !== "object") return {}
	let p = persisted as Record<string, unknown>
	return {
		viewMode:
			p.viewMode === "folders" || p.viewMode === "flat"
				? p.viewMode
				: undefined,
		collapsedFolders: Array.isArray(p.collapsedFolders)
			? p.collapsedFolders
			: undefined,
	}
}

let useFolderStore = create<FolderState>()(
	persist(
		(set, get) => ({
			viewMode: "folders",
			collapsedFolders: new Set<string>(),
			setViewMode: mode => set({ viewMode: mode }),
			toggleFolder: path =>
				set(state => {
					let next = new Set(state.collapsedFolders)
					if (next.has(path)) {
						next.delete(path)
					} else {
						next.add(path)
					}
					return { collapsedFolders: next }
				}),
			isCollapsed: path => get().collapsedFolders.has(path),
			renameFolder: (oldPath, newPath) =>
				set(state => {
					let next = new Set<string>()
					for (let p of state.collapsedFolders) {
						if (p === oldPath) {
							next.add(newPath)
						} else if (p.startsWith(oldPath + "/")) {
							next.add(newPath + p.slice(oldPath.length))
						} else {
							next.add(p)
						}
					}
					return { collapsedFolders: next }
				}),
			removeFolder: path =>
				set(state => {
					let next = new Set<string>()
					for (let p of state.collapsedFolders) {
						if (p !== path && !p.startsWith(path + "/")) {
							next.add(p)
						}
					}
					return { collapsedFolders: next }
				}),
		}),
		{
			name: "folder-state",
			partialize: state => ({
				viewMode: state.viewMode,
				collapsedFolders: Array.from(state.collapsedFolders),
			}),
			merge: (persisted, current) => {
				let p = parsePersistedFolderState(persisted)
				return {
					...current,
					viewMode: p.viewMode ?? current.viewMode,
					collapsedFolders: new Set(p.collapsedFolders ?? []),
				}
			},
		},
	),
)

interface FolderRowProps {
	path: string
	depth: number
	docCount: number
	isCollapsed: boolean
	onToggle: () => void
	docsInFolder: LoadedDocument[]
	existingFolders: string[]
}

function FolderRow({
	path,
	depth,
	docCount,
	isCollapsed,
	onToggle,
	docsInFolder,
	existingFolders,
}: FolderRowProps) {
	let folderName = path.split("/").pop() || path
	let { renameFolder, removeFolder } = useFolderStore()

	let [renameOpen, setRenameOpen] = useState(false)
	let [moveOpen, setMoveOpen] = useState(false)
	let [deleteOpen, setDeleteOpen] = useState(false)

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger
					render={
						<button
							onClick={onToggle}
							className="hover:bg-accent flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left"
							style={{ paddingLeft: `${8 + depth * 8}px` }}
						>
							{isCollapsed ? (
								<ChevronRight className="text-muted-foreground size-4 shrink-0" />
							) : (
								<ChevronDown className="text-muted-foreground size-4 shrink-0" />
							)}
							<Folder className="text-muted-foreground size-4 shrink-0" />
							<span className="truncate text-sm font-medium">{folderName}</span>
							<span className="text-muted-foreground ml-auto text-xs">
								{docCount}
							</span>
						</button>
					}
				/>
				<ContextMenuContent>
					<ContextMenuItem onClick={() => setRenameOpen(true)}>
						<Pencil />
						Rename
					</ContextMenuItem>
					<ContextMenuItem onClick={() => setMoveOpen(true)}>
						<FolderInput />
						Move to folder
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => setDeleteOpen(true)}
						variant="destructive"
					>
						<Trash2 />
						Delete
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<RenameFolderDialog
				open={renameOpen}
				onOpenChange={setRenameOpen}
				path={path}
				existingFolders={existingFolders}
				onRename={newPath => {
					handleRenameFolder(docsInFolder, path, newPath)
					renameFolder(path, newPath)
				}}
			/>

			<MoveFolderDialog
				open={moveOpen}
				onOpenChange={setMoveOpen}
				path={path}
				existingFolders={existingFolders}
				onMove={targetPath => {
					handleMoveFolder(docsInFolder, path, targetPath)
					removeFolder(path)
				}}
			/>

			<DeleteFolderDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				path={path}
				docCount={docCount}
				onDelete={deleteDocuments => {
					handleDeleteFolder(docsInFolder, path, deleteDocuments)
					removeFolder(path)
				}}
			/>
		</>
	)
}

// Dialogs

interface RenameFolderDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	path: string
	existingFolders: string[]
	onRename: (newPath: string) => void
}

function RenameFolderDialog({
	open,
	onOpenChange,
	path,
	existingFolders,
	onRename,
}: RenameFolderDialogProps) {
	let folderName = path.split("/").pop() || path
	let parentPath = path.includes("/")
		? path.slice(0, path.lastIndexOf("/"))
		: ""
	let [name, setName] = useState(folderName)
	let [error, setError] = useState("")

	let newPath = parentPath ? `${parentPath}/${name.trim()}` : name.trim()
	let isDuplicate =
		name.trim().toLowerCase() !== folderName.toLowerCase() &&
		existingFolders.some(f => f.toLowerCase() === newPath.toLowerCase())

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		if (!name.trim()) {
			setError("Name required")
			return
		}
		if (isDuplicate) {
			setError("Folder already exists")
			return
		}
		onRename(newPath)
		onOpenChange(false)
	}

	function handleOpenChange(open: boolean) {
		if (open) {
			setName(folderName)
			setError("")
		}
		onOpenChange(open)
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-sm">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Rename folder</DialogTitle>
						<DialogDescription>
							{parentPath ? `In: ${parentPath}` : "Root folder"}
						</DialogDescription>
					</DialogHeader>
					<div className="py-4">
						<Label htmlFor="folder-name" className="sr-only">
							Folder name
						</Label>
						<Input
							id="folder-name"
							value={name}
							onChange={e => {
								setName(e.target.value)
								setError("")
							}}
							autoFocus
						/>
						{(error || isDuplicate) && (
							<p className="text-destructive mt-2 text-sm">
								{error || "Folder already exists"}
							</p>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!name.trim() || isDuplicate}>
							Rename
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

interface MoveFolderDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	path: string
	existingFolders: string[]
	onMove: (targetPath: string) => void
}

function MoveFolderDialog({
	open,
	onOpenChange,
	path,
	existingFolders,
	onMove,
}: MoveFolderDialogProps) {
	let [inputValue, setInputValue] = useState("")
	let folderName = path.split("/").pop() || path

	// Filter out self, parent paths, and child paths
	let filteredFolders = existingFolders.filter(folder => {
		if (folder === path) return false
		if (path.startsWith(folder + "/")) return false // parent
		if (folder.startsWith(path + "/")) return false // child
		return folder.toLowerCase().includes(inputValue.toLowerCase())
	})

	let showCreateOption =
		inputValue.trim() &&
		!existingFolders.some(f => f.toLowerCase() === inputValue.toLowerCase()) &&
		inputValue.trim().toLowerCase() !== path.toLowerCase()

	function handleSelect(value: string | null) {
		if (!value) return
		let targetPath =
			value === "__root__" ? folderName : `${value}/${folderName}`
		onMove(targetPath)
		onOpenChange(false)
		setInputValue("")
	}

	function handleCreateAndMove() {
		if (!inputValue.trim()) return
		let targetPath = `${inputValue.trim()}/${folderName}`
		onMove(targetPath)
		onOpenChange(false)
		setInputValue("")
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Move folder</DialogTitle>
					<DialogDescription>
						Move &ldquo;{folderName}&rdquo; to another folder
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

								{path.includes("/") && (
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
										className="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex cursor-pointer items-center gap-2 px-3 py-2 text-sm outline-none"
									>
										<Folder className="text-muted-foreground size-4" />
										<span className="flex-1 truncate">{folder}</span>
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
											Create &ldquo;
											<span className="font-medium">{inputValue}</span>&rdquo;
										</span>
									</button>
								)}
							</Combobox.Popup>
						</Combobox.Positioner>
					</Combobox.Portal>
				</Combobox.Root>

				<div className="flex justify-end gap-2 pt-2">
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}

interface DeleteFolderDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	path: string
	docCount: number
	onDelete: (deleteDocuments: boolean) => void
}

function DeleteFolderDialog({
	open,
	onOpenChange,
	path,
	docCount,
	onDelete,
}: DeleteFolderDialogProps) {
	let folderName = path.split("/").pop() || path

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Delete folder &ldquo;{folderName}&rdquo;?</DialogTitle>
					<DialogDescription>
						This folder contains {docCount} document{docCount !== 1 ? "s" : ""}.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="flex-col gap-2 sm:flex-col">
					<Button
						variant="outline"
						className="w-full"
						onClick={() => {
							onDelete(false)
							onOpenChange(false)
						}}
					>
						Move documents to root
					</Button>
					<Button
						variant="destructive"
						className="w-full"
						onClick={() => {
							onDelete(true)
							onOpenChange(false)
						}}
					>
						Delete {docCount} document{docCount !== 1 ? "s" : ""}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// Handlers

function handleRenameFolder(
	docs: LoadedDocument[],
	oldPath: string,
	newPath: string,
) {
	for (let doc of docs) {
		if (!doc.content) continue
		let content = doc.content.toString()
		let docPath = getPath(content)
		if (!docPath) continue

		let updatedPath: string
		if (docPath === oldPath) {
			updatedPath = newPath
		} else if (docPath.startsWith(oldPath + "/")) {
			updatedPath = newPath + docPath.slice(oldPath.length)
		} else {
			continue
		}

		let newContent = updatePathInContent(content, updatedPath)
		doc.content.$jazz.applyDiff(newContent)
		doc.$jazz.set("updatedAt", new Date())
	}
}

function handleMoveFolder(
	docs: LoadedDocument[],
	oldPath: string,
	newPath: string,
) {
	// Same logic as rename - just updating paths
	handleRenameFolder(docs, oldPath, newPath)
}

function handleDeleteFolder(
	docs: LoadedDocument[],
	path: string,
	deleteDocuments: boolean,
) {
	for (let doc of docs) {
		if (!doc.content) continue
		let content = doc.content.toString()
		let docPath = getPath(content)
		if (!docPath) continue

		let isInFolder = docPath === path || docPath.startsWith(path + "/")
		if (!isInFolder) continue

		if (deleteDocuments) {
			doc.$jazz.set("deletedAt", new Date())
		} else {
			let newContent = removePathFromContent(content)
			doc.content.$jazz.applyDiff(newContent)
			doc.$jazz.set("updatedAt", new Date())
		}
	}
}

function updatePathInContent(content: string, newPath: string): string {
	let { frontmatter } = parseFrontmatter(content)
	if (!frontmatter) return content

	return content.replace(
		/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*/,
		`$1path: ${newPath}`,
	)
}

function removePathFromContent(content: string): string {
	return content.replace(
		/^(---\r?\n[\s\S]*?)path:\s*[^\r\n]*\r?\n([\s\S]*?---)/,
		"$1$2",
	)
}
