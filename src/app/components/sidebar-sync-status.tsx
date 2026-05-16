import { useState } from "react"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { useAccount, useIsAuthenticated, useLogOut } from "jazz-tools/react"
import { Button } from "@/app/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { AuthDialog } from "@/app/features/auth"
import { ThemeSubmenu, useTheme } from "@/app/components/appearance"
import { usePWA } from "@/app/lib/pwa"
import { useIsOnline } from "@/app/hooks/use-online"
import { UserAccount } from "@/schema"
import {
	ChevronUp,
	Cloud,
	CloudOff,
	LogOut,
	Settings,
	WifiOff,
} from "lucide-react"
import { T, useIntl } from "@/shared/intl/setup"

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
	let t = useIntl()

	let name = me?.$isLoaded ? me.profile.name.trim() || null : null
	let statusLabel = isAuthenticated
		? isOnline
			? t("sync.syncing")
			: t("sync.offline")
		: t("sync.localOnly")
	let accountLabel =
		name ?? (isAuthenticated ? t("sync.signedIn") : t("sync.localOnly"))
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
						nativeButton
						className="relative h-auto w-full flex-1 justify-start gap-2 px-2 py-2 pointer-fine:h-auto"
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
					<T k="common.settings" />
				</DropdownMenuItem>
				{!isAuthenticated && (
					<DropdownMenuItem onClick={() => setAuthOpen(true)}>
						<CloudOff />
						<T k="common.signIn" />
					</DropdownMenuItem>
				)}
				<ThemeSubmenu theme={theme} setTheme={setTheme} />
				{isAuthenticated && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={() => logOut()}>
							<LogOut />
							<T k="common.logOut" />
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
