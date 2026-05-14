import { redirect } from "@tanstack/react-router"
import type { co } from "jazz-tools"
import type { UserAccount } from "@/schema"
import { loadOrCreateDocFromUrl } from "../lib/load-or-create-doc-from-url"

export { tutorLoader }

let TUTOR_URLS: Record<string, string> = {
	markdown: "/docs/tutor-markdown.md",
	alkalye: "/docs/tutor-alkalye.md",
	presentation: "/docs/tutor-presentations.md",
}

function tutorLoader(
	me: co.loaded<typeof UserAccount> | null,
	slug: string,
): Promise<never> {
	let url = TUTOR_URLS[slug]
	if (!url) throw redirect({ to: "/" })
	return loadOrCreateDocFromUrl(me, url)
}
