import { ChevronDown, User } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"

export { SpaceSelector }

function SpaceSelector() {
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
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
