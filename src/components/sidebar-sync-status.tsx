import { useState } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { useAccount, useIsAuthenticated, useLogOut } from "jazz-tools/react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AuthDialog } from "@/components/auth-form"
import { ThemeSubmenu, useTheme } from "@/lib/theme"
import { usePWA } from "@/lib/pwa"
import { useIsOnline } from "@/lib/use-online"
import { UserAccount } from "@/schema"
import {
	ChevronUp,
	Cloud,
	CloudOff,
	LogOut,
	Settings,
	WifiOff,
} from "lucide-react"

export { SidebarSyncStatus }

function SidebarSyncStatus() {
	let navigate = useNavigate()
	let location = useLocation()
	let logOut = useLogOut()
	let isAuthenticated = useIsAuthenticated()
	let me = useAccount(UserAccount, { resolve: { profile: true } })
	let [authOpen, setAuthOpen] = useState(false)
	let isOnline = useIsOnline()
	let { theme, setTheme } = useTheme()
	let { needRefresh } = usePWA()

	let name = me?.$isLoaded ? me.profile.name.trim() || null : null
	let statusLabel = isAuthenticated
		? isOnline
			? "Syncing"
			: "Offline"
		: "Local only"
	let accountLabel = name ?? (isAuthenticated ? "Signed in" : "Local only")
	let StatusIcon = isAuthenticated ? (isOnline ? Cloud : WifiOff) : CloudOff
	let statusIconClassName = isAuthenticated
		? isOnline
			? "text-green-600 dark:text-green-400"
			: "text-muted-foreground"
		: "text-destructive"

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						nativeButton
						className="relative h-auto w-full flex-1 justify-start gap-2 px-2 py-2"
					>
						<StatusIcon className={statusIconClassName} />
						<div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
							<span className="truncate text-sm font-medium">
								{accountLabel}
							</span>
							<span className="text-muted-foreground truncate text-xs">
								{statusLabel}
							</span>
						</div>
						<ChevronUp className="text-muted-foreground size-4" />
						{needRefresh && (
							<span className="bg-destructive absolute top-1.5 right-1.5 size-2 rounded-full" />
						)}
					</Button>
				}
			/>
			<DropdownMenuContent align="end" side="top" className="w-56">
				<DropdownMenuItem
					onClick={() =>
						navigate({
							to: "/settings",
							search: { from: location.pathname },
						})
					}
				>
					<Settings />
					Settings
				</DropdownMenuItem>
				{!isAuthenticated && (
					<DropdownMenuItem onClick={() => setAuthOpen(true)}>
						<CloudOff />
						Sign in
					</DropdownMenuItem>
				)}
				<ThemeSubmenu theme={theme} setTheme={setTheme} />
				{isAuthenticated && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => logOut()}>
							<LogOut />
							Log out
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
			<AuthDialog
				open={authOpen}
				onOpenChange={setAuthOpen}
				onSuccess={() => navigate({ to: "/" })}
			/>
		</DropdownMenu>
	)
}
