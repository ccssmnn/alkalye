import { createFileRoute } from "@tanstack/react-router"
import { welcomeLoader } from "@/app/features/onboarding"

export { Route }

let Route = createFileRoute("/welcome")({
	loader: ({ context }) => welcomeLoader(context.me),
})
