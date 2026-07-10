import { co } from "jazz-tools"
import { useNavigate } from "@tanstack/react-router"
import { Document, UserAccount } from "@/schema"
import { copyDocumentToMyList } from "./documents"

export { handleSaveCopy }

async function handleSaveCopy(
	doc: co.loaded<typeof Document, { content: true }>,
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
