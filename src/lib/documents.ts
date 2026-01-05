import { Group, co, type ID } from "jazz-tools"
import { Document, UserAccount } from "@/schema"

export {
	createPersonalDocument,
	deletePersonalDocument,
	permanentlyDeletePersonalDocument,
	createDocumentInvite,
	revokeDocumentInvite,
	listCollaborators,
	acceptDocumentInvite,
	leavePersonalDocument,
}
export type { PersonalDocumentOperation, Collaborator, DocInviteData }

type Collaborator = {
	userId: string
	inviteGroupId: string
	role: "writer" | "reader"
}

type PersonalDocumentOperation =
	| { type: "success" }
	| { type: "error"; error: string }

async function createPersonalDocument(
	account: co.loaded<typeof UserAccount>,
	content: string = "",
) {
	let group = Group.create()
	let now = new Date()
	let doc = Document.create(
		{
			version: 1,
			content: co.plainText().create(content, group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)

	let loadedAccount = await account.$jazz.ensureLoaded({
		resolve: { root: { documents: true } },
	})
	if (loadedAccount.root?.documents?.$isLoaded) {
		loadedAccount.root.documents.$jazz.push(doc)
	}

	return doc
}

async function deletePersonalDocument(
	doc: co.loaded<typeof Document>,
): Promise<PersonalDocumentOperation> {
	let docGroup = doc.$jazz.owner

	let role = docGroup.myRole()
	if (role !== "admin") {
		return { type: "error", error: "Only admins can delete documents" }
	}

	doc.$jazz.set("deletedAt", new Date())
	doc.$jazz.set("updatedAt", new Date())
	return { type: "success" }
}

async function permanentlyDeletePersonalDocument(
	doc: co.loaded<typeof Document>,
	account: co.loaded<typeof UserAccount>,
): Promise<PersonalDocumentOperation> {
	let docGroup = doc.$jazz.owner
	let role = docGroup.myRole()
	if (role !== "admin") {
		return {
			type: "error",
			error: "Only admins can permanently delete documents",
		}
	}

	for (let inviteGroup of docGroup.getParentGroups()) {
		docGroup.removeMember(inviteGroup)
	}

	doc.$jazz.set("permanentlyDeletedAt", new Date())

	let loadedAccount = await account.$jazz.ensureLoaded({
		resolve: { root: { documents: true } },
	})
	if (loadedAccount.root?.documents?.$isLoaded) {
		let idx = loadedAccount.root.documents.findIndex(
			d => d?.$jazz.id === doc.$jazz.id,
		)
		if (idx !== -1) {
			loadedAccount.root.documents.$jazz.splice(idx, 1)
		}
	}

	return { type: "success" }
}

async function createDocumentInvite(
	doc: co.loaded<typeof Document>,
	role: "writer" | "reader",
): Promise<string> {
	let docGroup = doc.$jazz.owner

	if (docGroup.myRole() !== "admin") {
		throw new Error("Only admins can create invite links")
	}

	let inviteGroup = Group.create()
	docGroup.addMember(inviteGroup, role)

	let inviteSecret = inviteGroup.$jazz.createInvite(role)
	let baseURL = typeof window !== "undefined" ? window.location.origin : ""

	return `${baseURL}/invite#/doc/${doc.$jazz.id}/invite/${inviteGroup.$jazz.id}/${inviteSecret}`
}

function revokeDocumentInvite(
	doc: co.loaded<typeof Document>,
	inviteGroupId: string,
): void {
	let docGroup = doc.$jazz.owner
	let parentGroups = docGroup.getParentGroups()
	let inviteGroup = parentGroups.find(g => g.$jazz.id === inviteGroupId)
	if (!inviteGroup) {
		throw new Error("Invite group not found")
	}

	docGroup.removeMember(inviteGroup)
}

function listCollaborators(doc: co.loaded<typeof Document>): Collaborator[] {
	let docGroup = doc.$jazz.owner
	if (!(docGroup instanceof Group)) return []

	let collaborators: Collaborator[] = []

	for (let inviteGroup of docGroup.getParentGroups()) {
		for (let member of inviteGroup.members) {
			if (member.role === "writer" || member.role === "reader") {
				collaborators.push({
					userId: member.id,
					inviteGroupId: inviteGroup.$jazz.id,
					role: member.role,
				})
			}
		}
	}

	return collaborators
}

type DocInviteData = {
	docId: ID<typeof Document>
	inviteGroupId: ID<Group>
	inviteSecret: `inviteSecret_z${string}`
}

async function acceptDocumentInvite(
	account: co.loaded<typeof UserAccount>,
	inviteData: DocInviteData,
): Promise<void> {
	await account.acceptInvite(
		inviteData.inviteGroupId,
		inviteData.inviteSecret,
		Group,
	)

	let doc = await Document.load(inviteData.docId, {
		resolve: { content: true },
	})

	if (doc.$jazz.loadingState !== "loaded") {
		throw new Error("Document not found or invite was revoked")
	}

	let loadedAccount = await account.$jazz.ensureLoaded({
		resolve: { root: { documents: true } },
	})

	let alreadyHas = loadedAccount.root.documents.some(
		d => d.$jazz.id === inviteData.docId,
	)
	if (!alreadyHas && loadedAccount.root.documents.$isLoaded) {
		loadedAccount.root.documents.$jazz.push(doc)
	}
}

async function leavePersonalDocument(
	doc: co.loaded<typeof Document>,
	account: co.loaded<typeof UserAccount>,
): Promise<void> {
	let docGroup = doc.$jazz.owner
	if (!(docGroup instanceof Group)) {
		throw new Error("Document is not group-owned")
	}

	for (let inviteGroup of docGroup.getParentGroups()) {
		let isMember = inviteGroup.members.some(m => m.id === account.$jazz.id)
		if (isMember) {
			inviteGroup.removeMember(account)
			break
		}
	}

	let loadedAccount = await account.$jazz.ensureLoaded({
		resolve: { root: { documents: true } },
	})

	let idx = loadedAccount.root?.documents?.findIndex(
		d => d?.$jazz.id === doc.$jazz.id,
	)
	if (
		idx !== undefined &&
		idx !== -1 &&
		loadedAccount.root?.documents?.$isLoaded
	) {
		loadedAccount.root.documents.$jazz.splice(idx, 1)
	}
}
