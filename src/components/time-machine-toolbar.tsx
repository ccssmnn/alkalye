import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { X, EllipsisVertical } from "lucide-react"
import { formatEditDate } from "@/lib/time-machine"

export { TimeMachineToolbar }

interface TimeMachineToolbarProps {
	editDate: Date
	authorName: string
	onExit: () => void
	onCreateCopy: () => void
	onRestore: () => void
}

function TimeMachineToolbar({
	editDate,
	authorName,
	onExit,
	onCreateCopy,
	onRestore,
}: TimeMachineToolbarProps) {
	return (
		<div
			className="border-border bg-background fixed top-0 right-0 left-0 z-20 flex items-center justify-between border-b px-4 py-2"
			style={{
				paddingTop: "max(0.5rem, env(safe-area-inset-top))",
				paddingLeft: "max(1rem, env(safe-area-inset-left))",
				paddingRight: "max(1rem, env(safe-area-inset-right))",
			}}
		>
			<Button variant="ghost" size="sm" onClick={onExit} className="gap-1.5">
				<X className="size-4" />
				<span className="hidden sm:inline">Exit</span>
			</Button>

			<div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center">
				<span className="text-foreground text-sm font-medium">
					Time Machine
				</span>
				<span className="text-muted-foreground text-xs">
					{formatEditDate(editDate)} by {authorName}
				</span>
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button variant="ghost" size="icon" nativeButton={false}>
							<EllipsisVertical className="size-4" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={onCreateCopy}>
						Create Copy
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onRestore}>
						Restore This Version
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
