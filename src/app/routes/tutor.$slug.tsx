import { createFileRoute, redirect } from "@tanstack/react-router"
import { loadOrCreateDoc } from "@/lib/doc-loader"

export { Route }

let TUTOR_URLS: Record<string, string> = {
	markdown: "/docs/tutor-markdown.md",
	alkalye: "/docs/tutor-alkalye.md",
	presentation: "/docs/tutor-presentations.md",
}

let Route = createFileRoute("/tutor/$slug")({
	loader: ({ context, params }) => {
		let url = TUTOR_URLS[params.slug]
		if (!url) throw redirect({ to: "/" })
		return loadOrCreateDoc(context.me, url)
	},
})
