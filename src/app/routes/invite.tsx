import { createFileRoute } from "@tanstack/react-router"
import { InviteScreen } from "@/app/features/sharing"

export { Route }

let Route = createFileRoute("/invite")({
	component: InviteScreen,
})
