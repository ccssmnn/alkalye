import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { History, EllipsisVertical } from "lucide-react"
import { formatEditDate } from "@/lib/time-machine"

export { TimeMachineToolbar }

interface TimeMachineToolbarProps {
	docTitle: string
	editDate: Date
	authorName: string
	onExit: () => void
	onCreateCopy: () => void
}

function TimeMachineToolbar({
	docTitle,
	editDate,
	authorName,
	onExit,
	onCreateCopy,
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
			<Button
				variant="ghost"
				size="sm"
				nativeButton={false}
				render={<Link to="/" />}
			>
				Alkalye
			</Button>

			<div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center">
				<span className="text-muted-foreground flex items-center gap-1.5 text-xs">
					<History className="size-3" />
					Time Machine: {docTitle}
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
					<DropdownMenuItem onClick={onExit}>
						Exit Time Machine
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onCreateCopy}>
						Create Copy
					</DropdownMenuItem>
					<DropdownMenuItem disabled>Restore This Version</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}
