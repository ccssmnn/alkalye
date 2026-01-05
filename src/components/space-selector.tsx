import { useState, useRef } from "react"
import { co } from "jazz-tools"
import { useAccount, useIsAuthenticated, Image } from "jazz-tools/react"
import { useParams, useNavigate, Link } from "@tanstack/react-router"
import {
	ChevronDown,
	User,
	Users,
	Check,
	Plus,
	SettingsIcon,
} from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { UserAccount, createSpace } from "@/schema"

export { SpaceSelector, SpaceInitials }

let spacesQuery = { root: { spaces: { $each: { avatar: true } } } } as const
type LoadedSpaces = co.loaded<typeof UserAccount, typeof spacesQuery>

function SpaceSelector() {
	let me = useAccount(UserAccount, { resolve: spacesQuery })
	let isAuthenticated = useIsAuthenticated()
	let params = useParams({ strict: false })
	let spaceId = "spaceId" in params ? (params.spaceId as string) : null
	let [dialogOpen, setDialogOpen] = useState(false)

	let spaces = me?.$isLoaded ? getSortedSpaces(me.root.spaces) : []
	let currentSpace = spaceId ? spaces.find(s => s.$jazz.id === spaceId) : null
	let displayName = currentSpace?.name ?? "Personal"
	let Icon = currentSpace ? Users : User

	return (
		<>
			<DropdownMenu>
				<div className="flex items-center gap-1 border-b p-2">
					<DropdownMenuTrigger
						render={
							<Button
								variant="ghost"
								className="flex-1 justify-between"
								nativeButton={false}
							>
								<span className="inline-flex gap-3">
									<Icon />
									<span className="truncate">{displayName}</span>
								</span>
								<ChevronDown />
							</Button>
						}
					/>
					{currentSpace && (
						<Button
							variant="ghost"
							size="icon"
							render={
								<Link
									to="/spaces/$spaceId/settings"
									params={{ spaceId: currentSpace.$jazz.id }}
								/>
							}
						>
							<SettingsIcon />
							<span className="sr-only">Space Settings</span>
						</Button>
					)}
				</div>
				<DropdownMenuContent align="center" sideOffset={4}>
					<DropdownMenuItem render={<Link to="/" />}>
						<User className="size-4" />
						<span>Personal</span>
						{!spaceId && <Check className="ml-auto size-4" />}
					</DropdownMenuItem>
					{spaces.map(space => (
						<DropdownMenuItem
							key={space.$jazz.id}
							render={
								<Link
									to="/spaces/$spaceId"
									params={{ spaceId: space.$jazz.id }}
								/>
							}
						>
							<SpaceAvatar space={space} />
							<span>{space.name}</span>
							{spaceId === space.$jazz.id && (
								<Check className="ml-auto size-4" />
							)}
						</DropdownMenuItem>
					))}
					{isAuthenticated && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setDialogOpen(true)}>
								<Plus className="size-4" />
								<span>New Space</span>
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			<CreateSpaceDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				me={me}
			/>
		</>
	)
}

function CreateSpaceDialog({
	open,
	onOpenChange,
	me,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	me: ReturnType<typeof useAccount<typeof UserAccount, typeof spacesQuery>>
}) {
	let navigate = useNavigate()
	let [name, setName] = useState("")
	let inputRef = useRef<HTMLInputElement>(null)

	function handleOpenChangeComplete(open: boolean) {
		if (!open) setName("")
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		let trimmed = name.trim()
		if (!trimmed || !me.$isLoaded || !me.root) return

		let space = createSpace(trimmed, me.root)
		onOpenChange(false)
		setName("")
		navigate({ to: "/spaces/$spaceId", params: { spaceId: space.$jazz.id } })
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
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
							onClick={() => onOpenChange(false)}
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

function SpaceAvatar({ space }: { space: LoadedSpaceWithAvatar }) {
	let avatarId = space.avatar?.$jazz.id

	if (avatarId) {
		return (
			<Image
				imageId={avatarId}
				width={16}
				height={16}
				alt={space.name}
				className="size-4 shrink-0 rounded object-cover"
			/>
		)
	}

	return <SpaceInitials name={space.name} size="sm" />
}

function SpaceInitials({
	name,
	size = "sm",
}: {
	name: string
	size?: "sm" | "md"
}) {
	let initials = getInitials(name)
	let sizeClasses = size === "sm" ? "size-4 text-[8px]" : "size-12 text-base"

	return (
		<div
			className={`bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded font-medium ${sizeClasses}`}
		>
			{initials}
		</div>
	)
}

function getInitials(name: string): string {
	let words = name.trim().split(/\s+/)
	if (words.length === 0 || words[0] === "") return "?"
	if (words.length === 1) return words[0].charAt(0).toUpperCase()
	return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase()
}
