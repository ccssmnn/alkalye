import { createFileRoute } from "@tanstack/react-router"
import { tutorLoader } from "@/app/features/onboarding"

export { Route }

let Route = createFileRoute("/tutor/$slug")({
	loader: ({ context, params }) => tutorLoader(context.me, params.slug),
})
