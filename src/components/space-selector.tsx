import { co } from "jazz-tools"
import { useAccount } from "jazz-tools/react"
import { ChevronDown, User, Users } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { UserAccount, Space } from "@/schema"

export { SpaceSelector }

let spacesQuery = { root: { spaces: { $each: true } } } as const
type LoadedSpaces = co.loaded<typeof UserAccount, typeof spacesQuery>

function SpaceSelector() {
	let me = useAccount(UserAccount, { resolve: spacesQuery })

	let spaces = me?.$isLoaded ? getSortedSpaces(me.root.spaces) : []

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
						<User className="size-4" />
						<span>Personal</span>
						<ChevronDown className="size-3 opacity-50" />
					</Button>
				}
			/>
			<DropdownMenuContent align="start" sideOffset={4}>
				<DropdownMenuItem>
					<User className="size-4" />
					<span>Personal</span>
				</DropdownMenuItem>
				{spaces.map(space => (
					<DropdownMenuItem key={space.$jazz.id}>
						<Users className="size-4" />
						<span>{space.name}</span>
					</DropdownMenuItem>
				))}
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
