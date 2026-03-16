import { Group, co } from "jazz-tools"
import { Document, UserAccount } from "@/schema"
import { getDocumentGroup } from "@/lib/documents"
import { getSpaceGroup } from "@/lib/spaces"

export { moveDocumentToSpace }
export type { MoveDocumentDestination, MoveDocumentOptions }

type LoadedDocument = co.loaded<typeof Document, { content: true }>

type MoveDocumentDestination = {
	id: string
	name: string
} | null

type MoveDocumentOptions = {
	doc: LoadedDocument
	destination: MoveDocumentDestination
	currentSpaceId?: string
	me: co.loaded<
		typeof UserAccount,
		{
			root: {
				documents: true
				spaces: { $each: { documents: true } }
			}
		}
	>
}

async function moveDocumentToSpace(opts: MoveDocumentOptions): Promise<void> {
	let { doc, destination, currentSpaceId, me } = opts
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) {
		throw new Error("Document group not found")
	}

	if (currentSpaceId) {
		let currentSpace = me.root.spaces?.find(s => s?.$jazz.id === currentSpaceId)
		if (currentSpace?.$isLoaded && currentSpace.documents?.$isLoaded) {
			let index = currentSpace.documents.findIndex(
				item => item?.$jazz.id === doc.$jazz.id,
			)
			if (index !== -1) {
				currentSpace.documents.$jazz.splice(index, 1)
			}
		}
	} else if (me.root.documents?.$isLoaded) {
		let index = me.root.documents.findIndex(
			item => item?.$jazz.id === doc.$jazz.id,
		)
		if (index !== -1) {
			me.root.documents.$jazz.splice(index, 1)
		}
	}

	if (!destination) {
		doc.$jazz.set("spaceId", undefined)
		me.root.documents.$jazz.push(doc)
		doc.$jazz.set("updatedAt", new Date())
		return
	}

	let targetSpace = me.root.spaces?.find(
		space => space?.$jazz.id === destination.id,
	)
	if (!targetSpace?.$isLoaded || !targetSpace.documents?.$isLoaded) {
		throw new Error("Target space not found or not loaded")
	}

	let spaceGroup = getSpaceGroup(targetSpace)
	if (!spaceGroup) {
		throw new Error("Space group not found")
	}

	docGroup.addMember(spaceGroup)

	let loadedDoc = await doc.$jazz.ensureLoaded({
		resolve: { assets: { $each: true } },
	})
	if (loadedDoc.assets) {
		let assetsOwner = loadedDoc.assets.$jazz.owner
		if (assetsOwner instanceof Group) {
			assetsOwner.addMember(spaceGroup)
		}
		for (let asset of loadedDoc.assets.values()) {
			if (!asset?.$isLoaded) continue
			let assetOwner = asset.$jazz.owner
			if (assetOwner instanceof Group) {
				assetOwner.addMember(spaceGroup)
			}
		}
	}

	doc.$jazz.set("spaceId", destination.id)
	targetSpace.documents.$jazz.push(doc)
	doc.$jazz.set("updatedAt", new Date())
}
