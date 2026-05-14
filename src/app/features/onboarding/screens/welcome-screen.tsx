import type { co } from "jazz-tools"
import type { UserAccount } from "@/schema"
import { loadOrCreateDocFromUrl } from "../lib/load-or-create-doc-from-url"

export { welcomeLoader }

function welcomeLoader(
	me: co.loaded<typeof UserAccount> | null,
): Promise<never> {
	return loadOrCreateDocFromUrl(me, "/docs/welcome.md")
}
