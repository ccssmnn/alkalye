import { co } from "jazz-tools"
import { useNavigate } from "@tanstack/react-router"
import { UserAccount } from "@/schema"
import { copyDocumentToMyList } from "./documents"
import type { LoadedDocument } from "./queries"

export { handleSaveCopy }

async function handleSaveCopy(
	doc: LoadedDocument,
	me: co.loaded<typeof UserAccount, { root: { documents: true } }>,
	setSaveCopyState: (state: "idle" | "saving" | "saved") => void,
	navigate: ReturnType<typeof useNavigate>,
) {
	if (!me.$isLoaded) return
	setSaveCopyState("saving")

	try {
		let newDoc = await copyDocumentToMyList(doc, me)
		setSaveCopyState("saved")
		setTimeout(() => {
			navigate({ to: "/doc/$id", params: { id: newDoc.$jazz.id } })
		}, 1000)
	} catch (e) {
		console.error("Failed to save copy:", e)
		setSaveCopyState("idle")
	}
}
