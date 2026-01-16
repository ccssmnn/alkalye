import { useEffect } from "react"
import { co, type MaybeLoaded } from "jazz-tools"
import { Document, UserAccount } from "@/schema"

export { useTrackLastOpened }

function useTrackLastOpened(me: Me, doc: Doc) {
	useEffect(() => {
		if (!me.$isLoaded || !me.root) return

		let docId = doc.$jazz.id
		let spaceId = doc.spaceId
		let { lastOpenedDocId, lastOpenedSpaceId } = me.root

		if (lastOpenedDocId === docId && lastOpenedSpaceId === spaceId) return
		if (lastOpenedDocId === docId && !spaceId && !lastOpenedSpaceId) return

		me.root.$jazz.set("lastOpenedDocId", docId)
		me.root.$jazz.set("lastOpenedSpaceId", spaceId)
	}, [me, doc])
}

type Me = MaybeLoaded<co.loaded<typeof UserAccount, { root: true }>>
type Doc = co.loaded<typeof Document>
