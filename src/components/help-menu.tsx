import { Link } from "@tanstack/react-router"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	DropdownMenuLabel,
	DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { ExternalLink } from "lucide-react"

export { HelpMenu }

interface HelpMenuProps {
	trigger: React.ReactElement
	align?: "start" | "center" | "end"
	side?: "top" | "bottom" | "left" | "right"
	onNavigate?: () => void
}

function HelpMenu({
	trigger,
	align = "start",
	side = "bottom",
	onNavigate,
}: HelpMenuProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={trigger} />
			<DropdownMenuContent align={align} side={side}>
				<DropdownMenuGroup>
					<DropdownMenuLabel>Help</DropdownMenuLabel>
					<DropdownMenuItem
						render={<Link to="/welcome" onClick={onNavigate} />}
					>
						Welcome
					</DropdownMenuItem>
					<DropdownMenuItem
						render={
							<Link
								to="/tutor/$slug"
								params={{ slug: "alkalye" }}
								onClick={onNavigate}
							/>
						}
					>
						Alkalye Tutor
					</DropdownMenuItem>
					<DropdownMenuItem
						render={
							<Link
								to="/tutor/$slug"
								params={{ slug: "markdown" }}
								onClick={onNavigate}
							/>
						}
					>
						Markdown Tutor
					</DropdownMenuItem>
					<DropdownMenuItem
						render={
							<Link
								to="/tutor/$slug"
								params={{ slug: "presentation" }}
								onClick={onNavigate}
							/>
						}
					>
						Presentation Tutor
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuLabel>Links</DropdownMenuLabel>
					<DropdownMenuItem
						render={
							<a
								href="https://github.com/ccssmnn/alkalye"
								target="_blank"
								rel="noopener noreferrer"
							/>
						}
					>
						GitHub
						<ExternalLink className="ml-auto size-3 opacity-50" />
					</DropdownMenuItem>
					<DropdownMenuItem
						render={
							<a
								href="https://twitter.com/ccssmnn"
								target="_blank"
								rel="noopener noreferrer"
							/>
						}
					>
						Twitter
						<ExternalLink className="ml-auto size-3 opacity-50" />
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuLabel>Legal</DropdownMenuLabel>
					<DropdownMenuItem
						render={<Link to="/imprint" onClick={onNavigate} />}
					>
						Imprint
					</DropdownMenuItem>
					<DropdownMenuItem
						render={<Link to="/privacy" onClick={onNavigate} />}
					>
						Privacy
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
