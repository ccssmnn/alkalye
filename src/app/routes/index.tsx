import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { homeLoader } from "@/app/features/documents"

export { Route }

let searchSchema = z.object({
	personal: z.boolean().optional(),
})

let Route = createFileRoute("/")({
	validateSearch: searchSchema,
	loaderDeps: ({ search }) => ({ personal: search.personal }),
	loader: homeLoader,
})
