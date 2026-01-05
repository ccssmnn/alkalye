import { Group, co, type ID } from "jazz-tools"
import { Document, UserAccount } from "@/schema"

export {
	migrateDocumentToGroup,
	createInviteLink,
	getDocumentGroup,
	isGroupOwned,
	canEdit,
	getMyRole,
	getCollaborators,
	getDocumentOwner,
	revokeInvite,
	leaveDocument,
	getSharingStatus,
	hasPendingInvites,
	hasIndividualShares,
	makeDocumentPublic,
	makeDocumentPrivate,
	isDocumentPublic,
	getPublicLink,
	copyDocumentToMyList,
}
export type { Collaborator, InviteRole, SharingStatus }

type InviteRole = "writer" | "reader"

type Collaborator = {
	id: string
	name: string
	role: string
	inviteGroupId: string
}

type LoadedDocument = co.loaded<typeof Document, { content: true }>

function isGroupOwned(doc: LoadedDocument): boolean {
	return doc.$jazz.owner instanceof Group
}

function getDocumentGroup(doc: LoadedDocument): Group | null {
	let owner = doc.$jazz.owner
	return owner instanceof Group ? owner : null
}

function canEdit(doc: LoadedDocument): boolean {
	let group = getDocumentGroup(doc)
	if (!group) return true
	let role = group.myRole()
	return role === "admin" || role === "writer"
}

function getMyRole(doc: LoadedDocument): "admin" | "writer" | "reader" | null {
	let group = getDocumentGroup(doc)
	if (!group) return null
	let role = group.myRole()
	if (role === "admin" || role === "writer" || role === "reader") return role
	return null
}

async function migrateDocumentToGroup(
	doc: LoadedDocument,
	userId: string,
): Promise<{ group: Group; document: LoadedDocument }> {
	if (isGroupOwned(doc)) {
		return { group: getDocumentGroup(doc)!, document: doc }
	}

	let group = Group.create()

	let newDoc = Document.create(
		{
			version: 1,
			content: co.plainText().create(doc.content?.toString() ?? "", group),
			deletedAt: doc.deletedAt,
			permanentlyDeletedAt: doc.permanentlyDeletedAt,
			createdAt: doc.createdAt,
			updatedAt: new Date(),
		},
		group,
	)

	let account = await UserAccount.load(userId as ID<typeof UserAccount>, {
		resolve: { root: { documents: true } },
	})

	if (account?.$isLoaded && account.root?.documents) {
		let idx = account.root.documents.findIndex(
			d => d?.$jazz.id === doc.$jazz.id,
		)
		if (idx !== -1) {
			account.root.documents.$jazz.set(idx, newDoc)
		}
	}

	let loaded = await Document.load(newDoc.$jazz.id, {
		resolve: { content: true },
	})
	return { group, document: loaded as LoadedDocument }
}

async function createInviteLink(
	doc: LoadedDocument,
	role: InviteRole,
): Promise<string> {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) {
		throw new Error("Document not shareable - not owned by a Group")
	}

	if (docGroup.myRole() !== "admin") {
		throw new Error("Only admins can create invite links")
	}

	let inviteGroup = Group.create()
	docGroup.addMember(inviteGroup, role)

	let inviteSecret = inviteGroup.$jazz.createInvite(role)
	let baseURL = window.location.origin

	return `${baseURL}/invite#/doc/${doc.$jazz.id}/invite/${inviteGroup.$jazz.id}/${inviteSecret}`
}

async function getCollaborators(
	doc: LoadedDocument,
	spaceGroupId?: string,
): Promise<{
	collaborators: Collaborator[]
	pendingInvites: { inviteGroupId: string }[]
}> {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) {
		return { collaborators: [], pendingInvites: [] }
	}

	let docGroupId = (docGroup as unknown as { $jazz: { id: string } }).$jazz.id

	// If doc uses the space group directly, it has no individual collaborators
	if (spaceGroupId && docGroupId === spaceGroupId) {
		return { collaborators: [], pendingInvites: [] }
	}

	let collaborators: Collaborator[] = []
	let pendingInvites: { inviteGroupId: string }[] = []

	let parentGroups = docGroup.getParentGroups()
	// Exclude the space group if provided (space members aren't individual collaborators)
	if (spaceGroupId) {
		parentGroups = parentGroups.filter(
			g =>
				(g as unknown as { $jazz: { id: string } }).$jazz.id !== spaceGroupId,
		)
	}

	for (let inviteGroup of parentGroups) {
		let members: Collaborator[] = []

		for (let member of inviteGroup.members) {
			if (member.role === "admin") continue

			if (member.account?.$isLoaded) {
				let profile = await member.account.$jazz.ensureLoaded({
					resolve: { profile: true },
				})
				members.push({
					id: member.id,
					name:
						(profile as { profile?: { name?: string } }).profile?.name ??
						"Unknown",
					role: member.role,
					inviteGroupId: inviteGroup.$jazz.id,
				})
			}
		}

		if (members.length > 0) {
			collaborators.push(...members)
		} else {
			pendingInvites.push({ inviteGroupId: inviteGroup.$jazz.id })
		}
	}

	return { collaborators, pendingInvites }
}

function revokeInvite(doc: LoadedDocument, inviteGroupId: string): void {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) throw new Error("Document is not group-owned")

	let parentGroups = docGroup.getParentGroups()
	let inviteGroup = parentGroups.find(g => g.$jazz.id === inviteGroupId)
	if (!inviteGroup) throw new Error("Invite group not found")

	docGroup.removeMember(inviteGroup)
}

async function leaveDocument(
	doc: LoadedDocument,
	account: co.loaded<typeof UserAccount>,
): Promise<void> {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) throw new Error("Document is not group-owned")

	// Find the invite group the user belongs to and remove self
	for (let inviteGroup of docGroup.getParentGroups()) {
		let isMember = inviteGroup.members.some(m => m.id === account.$jazz.id)
		if (isMember) {
			inviteGroup.removeMember(account)
			return
		}
	}

	throw new Error("You are not a collaborator on this document")
}

type SharingStatus = "none" | "owner" | "collaborator"

async function getDocumentOwner(
	doc: LoadedDocument,
): Promise<{ id: string; name: string } | null> {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) return null

	for (let member of docGroup.members) {
		if (member.role === "admin" && member.account?.$isLoaded) {
			let profile = await member.account.$jazz.ensureLoaded({
				resolve: { profile: true },
			})
			return {
				id: member.id,
				name:
					(profile as { profile?: { name?: string } }).profile?.name ??
					"Unknown",
			}
		}
	}
	return null
}

function getSharingStatus(doc: LoadedDocument): SharingStatus {
	let owner = doc.$jazz.owner
	if (!(owner instanceof Group)) return "none"

	let myRole = owner.myRole()
	if (myRole !== "admin") return "collaborator"

	// Check if there are collaborators via invite groups
	for (let inviteGroup of owner.getParentGroups()) {
		let hasMembers = inviteGroup.members.some(
			m => m.role !== "admin" && (m.role === "writer" || m.role === "reader"),
		)
		if (hasMembers) return "owner"
	}

	return "none"
}

function hasPendingInvites(doc: LoadedDocument): boolean {
	let owner = doc.$jazz.owner
	if (!(owner instanceof Group)) return false
	if (owner.myRole() !== "admin") return false

	for (let inviteGroup of owner.getParentGroups()) {
		let hasMembers = inviteGroup.members.some(
			m => m.role !== "admin" && (m.role === "writer" || m.role === "reader"),
		)
		if (!hasMembers) return true
	}
	return false
}

function hasIndividualShares(
	doc: LoadedDocument,
	spaceGroupId?: string,
): boolean {
	let owner = doc.$jazz.owner
	if (!(owner instanceof Group)) return false

	let ownerId = (owner as unknown as { $jazz: { id: string } }).$jazz.id

	// If doc uses the space group directly, it has no individual shares
	// (any parent groups belong to the space, not the doc)
	if (spaceGroupId && ownerId === spaceGroupId) return false

	// Doc has its own group - check for invite groups (individual shares)
	let parentGroups = owner.getParentGroups()
	// Exclude the space group if it's a parent (that's space membership, not individual sharing)
	if (spaceGroupId) {
		parentGroups = parentGroups.filter(
			g =>
				(g as unknown as { $jazz: { id: string } }).$jazz.id !== spaceGroupId,
		)
	}
	return parentGroups.length > 0
}

function isDocumentPublic(doc: LoadedDocument): boolean {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) return false

	// Check if "everyone" has a role in the group (added by makePublic())
	let everyoneRole = docGroup.getRoleOf("everyone")
	return everyoneRole === "reader" || everyoneRole === "writer"
}

async function makeDocumentPublic(
	doc: LoadedDocument,
	userId: string,
): Promise<LoadedDocument> {
	let currentDoc = doc

	// First ensure document is group-owned
	if (!isGroupOwned(doc)) {
		let result = await migrateDocumentToGroup(doc, userId)
		currentDoc = result.document
	}

	let docGroup = getDocumentGroup(currentDoc)
	if (!docGroup) {
		throw new Error("Document group not found")
	}

	// Make the group public (readable by everyone)
	docGroup.makePublic()
	currentDoc.$jazz.set("updatedAt", new Date())

	return currentDoc
}

function makeDocumentPrivate(doc: LoadedDocument): void {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) {
		throw new Error("Document is not group-owned")
	}

	if (docGroup.myRole() !== "admin") {
		throw new Error("Only admins can make documents private")
	}

	// Remove public access - makePublic() adds "everyone" as a reader
	docGroup.removeMember("everyone")
	doc.$jazz.set("updatedAt", new Date())
}

function getPublicLink(doc: LoadedDocument): string {
	let baseURL = window.location.origin
	return `${baseURL}/doc/${doc.$jazz.id}`
}

async function copyDocumentToMyList(
	doc: LoadedDocument,
	me: co.loaded<typeof UserAccount, { root: { documents: true } }>,
): Promise<{ $jazz: { id: string } }> {
	if (!me.root?.documents) {
		throw new Error("User documents list not loaded")
	}

	// Create a new group for the copy (owned by the user)
	let group = Group.create()

	let now = new Date()
	let newDoc = Document.create(
		{
			version: 1,
			content: co.plainText().create(doc.content?.toString() ?? "", group),
			createdAt: now,
			updatedAt: now,
		},
		group,
	)

	me.root.documents.$jazz.push(newDoc)

	return newDoc
}
