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
	parseInviteLink,
	getDocumentGroup,
	canEdit,
	getMyRole,
	isDocumentPublic,
	makeDocumentPublic,
	makeDocumentPrivate,
	getPublicLink,
	getDocumentOwner,
	migrateDocumentToGroup,
	copyDocumentToMyList,
	getSharingStatus,
	hasIndividualShares,
}

export type {
	PersonalDocumentOperation,
	Collaborator,
	DocInviteData,
	CollaboratorsResult,
	DocumentInviteResult,
	SharingStatus,
	InviteRole,
}

type Collaborator = {
	id: string
	name: string
	role: string
	inviteGroupId: string
}

type CollaboratorsResult = {
	collaborators: Collaborator[]
	pendingInvites: { inviteGroupId: string }[]
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

type DocumentInviteResult = {
	link: string
	inviteGroup: Group
}

async function createDocumentInvite(
	doc: co.loaded<typeof Document>,
	role: "writer" | "reader",
): Promise<DocumentInviteResult> {
	let docGroup = doc.$jazz.owner

	if (docGroup.myRole() !== "admin") {
		throw new Error("Only admins can create invite links")
	}

	let inviteGroup = Group.create()
	docGroup.addMember(inviteGroup, role)

	let inviteSecret = inviteGroup.$jazz.createInvite(role)
	let baseURL = typeof window !== "undefined" ? window.location.origin : ""

	let link = `${baseURL}/invite#/doc/${doc.$jazz.id}/invite/${inviteGroup.$jazz.id}/${inviteSecret}`
	return { link, inviteGroup }
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

async function listCollaborators(
	doc: co.loaded<typeof Document>,
	spaceGroupId?: string,
	resolveNames: boolean = true,
): Promise<CollaboratorsResult> {
	let docGroup = doc.$jazz.owner

	if (!(docGroup instanceof Group)) {
		return { collaborators: [], pendingInvites: [] }
	}

	let docGroupId = (docGroup as unknown as { $jazz: { id: string } }).$jazz.id

	if (spaceGroupId && docGroupId === spaceGroupId) {
		return { collaborators: [], pendingInvites: [] }
	}

	let collaborators: Collaborator[] = []
	let pendingInvites: { inviteGroupId: string }[] = []

	let parentGroups = docGroup.getParentGroups()
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
				let name = "Unknown"
				if (resolveNames) {
					let profile = await member.account.$jazz.ensureLoaded({
						resolve: { profile: true },
					})
					name = profile.profile?.name ?? "Unknown"
				}
				members.push({
					id: member.id,
					name,
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

	if (docGroup.myRole() === "admin") {
		throw new Error("Admins cannot leave their own document")
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

function parseInviteLink(link: string): DocInviteData {
	let match = link.match(/#\/doc\/([^/]+)\/invite\/([^/]+)\/([^/]+)$/)
	if (!match) {
		throw new Error("Invalid invite link format")
	}
	let docId = match[1]
	let inviteGroupId = match[2]
	let inviteSecret = match[3] as `inviteSecret_z${string}`
	return { docId, inviteGroupId, inviteSecret }
}

export async function changeCollaboratorRole(
	doc: co.loaded<typeof Document>,
	inviteGroupId: string,
	newRole: "writer" | "reader",
): Promise<void> {
	let docGroup = doc.$jazz.owner
	if (!(docGroup instanceof Group)) {
		throw new Error("Document is not group-owned")
	}

	let parentGroups = docGroup.getParentGroups()
	let oldInviteGroup = parentGroups.find(g => g.$jazz.id === inviteGroupId)
	if (!oldInviteGroup) {
		throw new Error("Invite group not found")
	}

	if (docGroup.myRole() !== "admin") {
		throw new Error("Only admins can change collaborator roles")
	}

	for (let member of oldInviteGroup.members) {
		if (member.role === "writer" || member.role === "reader") {
			let account = await co.account().load(member.id)
			if (account.$isLoaded) {
				let newInviteGroup = Group.create()
				newInviteGroup.addMember(account, newRole)
				docGroup.addMember(newInviteGroup, newRole)
			}
		}
	}

	docGroup.removeMember(oldInviteGroup)
}

type LoadedDocument = co.loaded<typeof Document, { content: true }>
type SharingStatus = "none" | "owner" | "collaborator"
type InviteRole = "writer" | "reader"

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

function isDocumentPublic(doc: LoadedDocument): boolean {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) return false
	let everyoneRole = docGroup.getRoleOf("everyone")
	return everyoneRole === "reader" || everyoneRole === "writer"
}

async function makeDocumentPublic(
	doc: LoadedDocument,
	userId: string,
): Promise<LoadedDocument> {
	let currentDoc = doc

	if (!getDocumentGroup(doc)) {
		let result = await migrateDocumentToGroup(doc, userId)
		currentDoc = result.document
	}

	let docGroup = getDocumentGroup(currentDoc)
	if (!docGroup) throw new Error("Document group not found")

	docGroup.makePublic()
	currentDoc.$jazz.set("updatedAt", new Date())
	return currentDoc
}

function makeDocumentPrivate(doc: LoadedDocument): void {
	let docGroup = getDocumentGroup(doc)
	if (!docGroup) throw new Error("Document is not group-owned")

	if (docGroup.myRole() !== "admin") {
		throw new Error("Only admins can make documents private")
	}

	docGroup.removeMember("everyone")
	doc.$jazz.set("updatedAt", new Date())
}

function getPublicLink(doc: LoadedDocument): string {
	let baseURL = typeof window !== "undefined" ? window.location.origin : ""
	return `${baseURL}/doc/${doc.$jazz.id}`
}

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

async function migrateDocumentToGroup(
	doc: LoadedDocument,
	userId: string,
): Promise<{ group: Group; document: LoadedDocument }> {
	if (getDocumentGroup(doc)) {
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

async function copyDocumentToMyList(
	doc: LoadedDocument,
	me: co.loaded<typeof UserAccount, { root: { documents: true } }>,
): Promise<{ $jazz: { id: string } }> {
	if (!me.root?.documents) throw new Error("User documents list not loaded")

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

function getSharingStatus(doc: LoadedDocument): SharingStatus {
	let owner = doc.$jazz.owner
	if (!(owner instanceof Group)) return "none"

	let myRole = owner.myRole()
	if (myRole !== "admin") return "collaborator"

	for (let inviteGroup of owner.getParentGroups()) {
		let hasMembers = inviteGroup.members.some(
			m => m.role !== "admin" && (m.role === "writer" || m.role === "reader"),
		)
		if (hasMembers) return "owner"
	}

	return "none"
}

function hasIndividualShares(
	doc: LoadedDocument,
	spaceGroupId?: string,
): boolean {
	let owner = doc.$jazz.owner
	if (!(owner instanceof Group)) return false

	let ownerId = (owner as unknown as { $jazz: { id: string } }).$jazz.id

	if (spaceGroupId && ownerId === spaceGroupId) return false

	let parentGroups = owner.getParentGroups()
	if (spaceGroupId) {
		parentGroups = parentGroups.filter(
			g =>
				(g as unknown as { $jazz: { id: string } }).$jazz.id !== spaceGroupId,
		)
	}
	return parentGroups.length > 0
}
