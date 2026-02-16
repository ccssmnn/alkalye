import { createFileRoute } from "@tanstack/react-router"
import { loadOrCreateDoc } from "@/lib/doc-loader"

export { Route }

let Route = createFileRoute("/privacy")({
	loader: ({ context }) => loadOrCreateDoc(context.me, "/docs/privacy.md"),
})
