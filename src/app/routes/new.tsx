import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { newDocLoader } from "@/app/features/documents"

export { Route }

let Route = createFileRoute("/new")({
	validateSearch: z.object({
		spaceId: z.string().optional(),
	}),
	loaderDeps: ({ search }) => ({ spaceId: search.spaceId }),
	loader: ({ context, deps }) =>
		newDocLoader({ context, spaceId: deps.spaceId }),
})
