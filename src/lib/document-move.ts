import { Group, co } from "jazz-tools"
import { Document, UserAccount } from "@/schema"
import { getDocumentGroup } from "@/lib/documents"
import { getSpaceGroup } from "@/lib/spaces"

export { moveDocumentToSpace }
export type { MoveDocumentDestination, MoveDocumentOptions }

type LoadedDocument = co.loaded<typeof Document, { content: true }>
type LoadedDocumentWithAssets = co.loaded<
	typeof Document,
	{ content: true; assets: { $each: true } }
>

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

	let sourceSpace = currentSpaceId
		? findLoadedSpace(
				me,
				currentSpaceId,
				"Source space not found or not loaded",
			)
		: null
	let sourceSpaceGroup = sourceSpace ? getRequiredSpaceGroup(sourceSpace) : null
	let targetSpace = destination
		? findLoadedSpace(
				me,
				destination.id,
				"Target space not found or not loaded",
			)
		: null
	let targetSpaceGroup = targetSpace ? getRequiredSpaceGroup(targetSpace) : null

	removeFromCurrentList(me, doc, sourceSpace)

	let loadedDoc = await doc.$jazz.ensureLoaded({
		resolve: { assets: { $each: true } },
	})

	if (
		sourceSpaceGroup &&
		(!targetSpaceGroup || sourceSpaceGroup !== targetSpaceGroup)
	) {
		removeGroupAccess(docGroup, sourceSpaceGroup)
		updateAssetAccess(loadedDoc, sourceSpaceGroup, "remove")
	}

	if (!targetSpace || !targetSpaceGroup) {
		doc.$jazz.set("spaceId", undefined)
		me.root.documents.$jazz.push(doc)
		doc.$jazz.set("updatedAt", new Date())
		return
	}

	if (!sourceSpaceGroup || sourceSpaceGroup !== targetSpaceGroup) {
		docGroup.addMember(targetSpaceGroup)
		updateAssetAccess(loadedDoc, targetSpaceGroup, "add")
	}

	doc.$jazz.set("spaceId", targetSpace.$jazz.id)
	targetSpace.documents.$jazz.push(doc)
	doc.$jazz.set("updatedAt", new Date())
}

function findLoadedSpace(
	me: MoveDocumentOptions["me"],
	spaceId: string,
	errorMessage: string,
) {
	let space = me.root.spaces?.find(item => item?.$jazz.id === spaceId)
	if (!space?.$isLoaded || !space.documents?.$isLoaded) {
		throw new Error(errorMessage)
	}
	return space
}

function getRequiredSpaceGroup(
	space: ReturnType<typeof findLoadedSpace>,
): Group {
	let group = getSpaceGroup(space)
	if (!group) {
		throw new Error("Space group not found")
	}
	return group
}

function removeFromCurrentList(
	me: MoveDocumentOptions["me"],
	doc: LoadedDocument,
	sourceSpace: ReturnType<typeof findLoadedSpace> | null,
) {
	if (sourceSpace) {
		let index = sourceSpace.documents.findIndex(
			item => item?.$jazz.id === doc.$jazz.id,
		)
		if (index !== -1) {
			sourceSpace.documents.$jazz.splice(index, 1)
		}
		return
	}

	let index = me.root.documents.findIndex(
		item => item?.$jazz.id === doc.$jazz.id,
	)
	if (index !== -1) {
		me.root.documents.$jazz.splice(index, 1)
	}
}

function removeGroupAccess(group: Group, member: Group) {
	if (
		group.getParentGroups().some(parent => parent.$jazz.id === member.$jazz.id)
	) {
		group.removeMember(member)
	}
}

function updateAssetAccess(
	doc: LoadedDocumentWithAssets,
	spaceGroup: Group,
	mode: "add" | "remove",
) {
	if (!doc.assets) return

	let assetsOwner = doc.assets.$jazz.owner
	if (assetsOwner instanceof Group) {
		updateGroupMember(assetsOwner, spaceGroup, mode)
	}
	for (let asset of doc.assets.values()) {
		if (!asset?.$isLoaded) continue
		let assetOwner = asset.$jazz.owner
		if (assetOwner instanceof Group) {
			updateGroupMember(assetOwner, spaceGroup, mode)
		}
	}
}

function updateGroupMember(
	group: Group,
	member: Group,
	mode: "add" | "remove",
) {
	if (mode === "add") {
		if (
			!group
				.getParentGroups()
				.some(parent => parent.$jazz.id === member.$jazz.id)
		) {
			group.addMember(member)
		}
		return
	}

	removeGroupAccess(group, member)
}
