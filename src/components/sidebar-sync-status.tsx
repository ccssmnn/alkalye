import { Link, useLocation } from "@tanstack/react-router"
import { useIsAuthenticated } from "jazz-tools/react"
import { Button } from "@/components/ui/button"
import { usePWA } from "@/lib/pwa"
import { Cloud, CloudOff } from "lucide-react"

export { SidebarSyncStatus }

function SidebarSyncStatus() {
	let location = useLocation()
	let isAuthenticated = useIsAuthenticated()
	let { needRefresh } = usePWA()

	if (isAuthenticated) {
		return (
			<Button
				variant="ghost"
				size="sm"
				nativeButton={false}
				render={<Link to="/settings" search={{ from: location.pathname }} />}
				className="relative flex-1"
			>
				<Cloud className="text-green-600 dark:text-green-400" />
				<span>Syncing</span>
				{needRefresh && (
					<span className="bg-destructive absolute top-1 right-1 size-2 rounded-full" />
				)}
			</Button>
		)
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			nativeButton={false}
			className="relative w-full flex-1"
			render={<Link to="/settings" search={{ from: location.pathname }} />}
		>
			<CloudOff className="text-destructive" />
			Local Only - Sign in
			{needRefresh && (
				<span className="bg-destructive absolute top-1 right-1 size-2 rounded-full" />
			)}
		</Button>
	)
}
