import { createContext, useContext, useState } from "react"
import { co } from "jazz-tools"
import { useAccount } from "jazz-tools/react"
import { ChevronDown, User, Users, Check, Plus } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { UserAccount, Space } from "@/schema"

export { SpaceSelector, SpaceProvider, useSelectedSpace, useCreateSpaceDialog }
export type { SelectedSpace }

type SelectedSpace = { id: string; name: string } | null

type SpaceContextValue = {
	selectedSpace: SelectedSpace
	setSelectedSpace: (space: SelectedSpace) => void
	isCreateDialogOpen: boolean
	setCreateDialogOpen: (open: boolean) => void
}

let SpaceContext = createContext<SpaceContextValue | null>(null)

function SpaceProvider({
	children,
	initialSpace,
}: {
	children: React.ReactNode
	initialSpace?: SelectedSpace
}) {
	let [selectedSpace, setSelectedSpace] = useState<SelectedSpace>(
		initialSpace ?? null,
	)
	let [isCreateDialogOpen, setCreateDialogOpen] = useState(false)
	return (
		<SpaceContext.Provider
			value={{
				selectedSpace,
				setSelectedSpace,
				isCreateDialogOpen,
				setCreateDialogOpen,
			}}
		>
			{children}
		</SpaceContext.Provider>
	)
}

function useSelectedSpace(): Pick<
	SpaceContextValue,
	"selectedSpace" | "setSelectedSpace"
> {
	let ctx = useContext(SpaceContext)
	if (!ctx)
		throw new Error("useSelectedSpace must be used within SpaceProvider")
	return ctx
}

function useCreateSpaceDialog(): Pick<
	SpaceContextValue,
	"isCreateDialogOpen" | "setCreateDialogOpen"
> {
	let ctx = useContext(SpaceContext)
	if (!ctx)
		throw new Error("useCreateSpaceDialog must be used within SpaceProvider")
	return ctx
}

let spacesQuery = { root: { spaces: { $each: true } } } as const
type LoadedSpaces = co.loaded<typeof UserAccount, typeof spacesQuery>

function SpaceSelector() {
	let me = useAccount(UserAccount, { resolve: spacesQuery })
	let { selectedSpace, setSelectedSpace } = useSelectedSpace()
	let { setCreateDialogOpen } = useCreateSpaceDialog()

	let spaces = me?.$isLoaded ? getSortedSpaces(me.root.spaces) : []
	let displayName = selectedSpace?.name ?? "Personal"
	let Icon = selectedSpace ? Users : User

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						className="gap-1 px-2 font-semibold"
						nativeButton={false}
					>
						<Icon className="size-4" />
						<span className="max-w-24 truncate">{displayName}</span>
						<ChevronDown className="size-3 opacity-50" />
					</Button>
				}
			/>
			<DropdownMenuContent align="start" sideOffset={4}>
				<DropdownMenuItem onClick={() => setSelectedSpace(null)}>
					<User className="size-4" />
					<span>Personal</span>
					{!selectedSpace && <Check className="ml-auto size-4" />}
				</DropdownMenuItem>
				{spaces.map(space => (
					<DropdownMenuItem
						key={space.$jazz.id}
						onClick={() =>
							setSelectedSpace({ id: space.$jazz.id, name: space.name })
						}
					>
						<Users className="size-4" />
						<span>{space.name}</span>
						{selectedSpace?.id === space.$jazz.id && (
							<Check className="ml-auto size-4" />
						)}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={makeOpenCreateDialog(setCreateDialogOpen)}>
					<Plus className="size-4" />
					<span>New Space</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function getSortedSpaces(
	spaces: LoadedSpaces["root"]["spaces"],
): co.loaded<typeof Space>[] {
	if (!spaces) return []

	return Array.from(spaces)
		.filter(
			(s): s is co.loaded<typeof Space> =>
				s != null && s.$isLoaded && !s.deletedAt,
		)
		.sort((a, b) => a.name.localeCompare(b.name))
}

function makeOpenCreateDialog(setOpen: (open: boolean) => void) {
	return function handleOpenCreateDialog() {
		setOpen(true)
	}
}
