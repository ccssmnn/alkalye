import { Group, co, type ID } from "jazz-tools"
import { Space, UserAccount } from "@/schema"

export {
	createSpaceInvite,
	acceptSpaceInvite,
	revokeSpaceInvite,
	listSpaceCollaborators,
	leaveSpace,
	changeSpaceCollaboratorRole,
	parseSpaceInviteLink,
	getSpaceOwner,
	isSpacePublic,
	makeSpacePublic,
	makeSpacePrivate,
	deleteSpace,
	getSpaceGroup,
}

export type {
	SpaceInviteData,
	SpaceCollaborator,
	SpaceCollaboratorsResult,
	SpaceInviteResult,
}

type SpaceCollaborator = {
	id: string
	name: string
	role: string
	inviteGroupId: string
}

type SpaceCollaboratorsResult = {
	collaborators: SpaceCollaborator[]
	pendingInvites: { inviteGroupId: string }[]
}

type SpaceInviteData = {
	spaceId: ID<typeof Space>
	inviteGroupId: ID<Group>
	inviteSecret: `inviteSecret_z${string}`
}

type SpaceInviteResult = {
	link: string
	inviteGroup: Group
}

function getSpaceGroup(space: co.loaded<typeof Space>): Group | null {
	let owner = space.$jazz.owner
	return owner instanceof Group ? owner : null
}

async function createSpaceInvite(
	space: co.loaded<typeof Space>,
	role: "writer" | "reader",
): Promise<SpaceInviteResult> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) {
		throw new Error("Space not shareable - not owned by a Group")
	}

	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can create invite links")
	}

	let inviteGroup = Group.create()
	spaceGroup.addMember(inviteGroup, role)

	let inviteSecret = inviteGroup.$jazz.createInvite(role)
	let baseURL = typeof window !== "undefined" ? window.location.origin : ""

	let link = `${baseURL}/invite#/space/${space.$jazz.id}/invite/${inviteGroup.$jazz.id}/${inviteSecret}`
	return { link, inviteGroup }
}

function revokeSpaceInvite(
	space: co.loaded<typeof Space>,
	inviteGroupId: string,
): void {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")

	let parentGroups = spaceGroup.getParentGroups()
	let inviteGroup = parentGroups.find(g => g.$jazz.id === inviteGroupId)
	if (!inviteGroup) throw new Error("Invite group not found")

	spaceGroup.removeMember(inviteGroup)
}

async function listSpaceCollaborators(
	space: co.loaded<typeof Space>,
	resolveNames: boolean = true,
): Promise<SpaceCollaboratorsResult> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) {
		return { collaborators: [], pendingInvites: [] }
	}

	let collaborators: SpaceCollaborator[] = []
	let pendingInvites: { inviteGroupId: string }[] = []

	for (let inviteGroup of spaceGroup.getParentGroups()) {
		let members: SpaceCollaborator[] = []

		for (let member of inviteGroup.members) {
			if (member.role === "admin") continue

			if (member.account?.$isLoaded) {
				// Get the role from spaceGroup.members (which resolves inheritance)
				let spaceMember = spaceGroup.members.find(m => m.id === member.id)
				let memberRole = spaceMember?.role ?? "reader"

				let name = "Unknown"
				if (resolveNames) {
					let profile = await member.account.$jazz.ensureLoaded({
						resolve: { profile: true },
					})
					name =
						(profile as { profile?: { name?: string } }).profile?.name ??
						"Unknown"
				}
				members.push({
					id: member.id,
					name,
					role: memberRole,
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

async function acceptSpaceInvite(
	account: co.loaded<typeof UserAccount>,
	inviteData: SpaceInviteData,
): Promise<void> {
	await account.acceptInvite(
		inviteData.inviteGroupId,
		inviteData.inviteSecret,
		Group,
	)

	let space = null
	for (let i = 0; i < 3; i++) {
		space = await Space.load(inviteData.spaceId, {
			resolve: { documents: true },
		})
		if (space?.$isLoaded) break
		await new Promise(resolve => setTimeout(resolve, 500))
	}

	if (!space || !space.$isLoaded) {
		throw new Error("Space not found or invite was revoked")
	}

	let loadedAccount = await account.$jazz.ensureLoaded({
		resolve: { root: { spaces: true } },
	})

	let alreadyHas = loadedAccount.root?.spaces?.some(
		s => s?.$jazz.id === inviteData.spaceId,
	)
	if (!alreadyHas && loadedAccount.root?.spaces?.$isLoaded) {
		loadedAccount.root.spaces.$jazz.push(space)
	}
}

async function leaveSpace(
	space: co.loaded<typeof Space>,
	account: co.loaded<typeof UserAccount>,
): Promise<void> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")

	if (spaceGroup.myRole() === "admin") {
		throw new Error("Admins cannot leave their own space")
	}

	for (let inviteGroup of spaceGroup.getParentGroups()) {
		let isMember = inviteGroup.members.some(m => m.id === account.$jazz.id)
		if (isMember) {
			inviteGroup.removeMember(account)
			break
		}
	}

	let loadedAccount = await account.$jazz.ensureLoaded({
		resolve: { root: { spaces: true } },
	})

	let idx = loadedAccount.root?.spaces?.findIndex(
		s => s?.$jazz.id === space.$jazz.id,
	)
	if (
		idx !== undefined &&
		idx !== -1 &&
		loadedAccount.root?.spaces?.$isLoaded
	) {
		loadedAccount.root.spaces.$jazz.splice(idx, 1)
	}
}

function parseSpaceInviteLink(link: string): SpaceInviteData {
	let match = link.match(/#\/space\/([^/]+)\/invite\/([^/]+)\/([^/]+)$/)
	if (!match) {
		throw new Error("Invalid invite link format")
	}
	let spaceId = match[1] as ID<typeof Space>
	let inviteGroupId = match[2] as ID<Group>
	let inviteSecret = match[3] as `inviteSecret_z${string}`
	return { spaceId, inviteGroupId, inviteSecret }
}

async function changeSpaceCollaboratorRole(
	space: co.loaded<typeof Space>,
	inviteGroupId: string,
	newRole: "writer" | "reader",
): Promise<void> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")

	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can change collaborator roles")
	}

	let parentGroups = spaceGroup.getParentGroups()
	let inviteGroup = parentGroups.find(g => g.$jazz.id === inviteGroupId)
	if (!inviteGroup) throw new Error("Invite group not found")

	spaceGroup.addMember(inviteGroup, newRole)
}

async function getSpaceOwner(
	space: co.loaded<typeof Space>,
	resolveNames: boolean = true,
): Promise<{ id: string; name: string } | null> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) return null

	for (let member of spaceGroup.members) {
		if (member.role === "admin" && member.account?.$isLoaded) {
			let name = "Unknown"
			if (resolveNames) {
				let profile = await member.account.$jazz.ensureLoaded({
					resolve: { profile: true },
				})
				name =
					(profile as { profile?: { name?: string } }).profile?.name ??
					"Unknown"
			}
			return { id: member.id, name }
		}
	}
	return null
}

function isSpacePublic(space: co.loaded<typeof Space>): boolean {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) return false
	let everyoneRole = spaceGroup.getRoleOf("everyone")
	return everyoneRole === "reader" || everyoneRole === "writer"
}

function makeSpacePublic(space: co.loaded<typeof Space>): void {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")
	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can make spaces public")
	}
	spaceGroup.makePublic()
	space.$jazz.set("updatedAt", new Date())
}

function makeSpacePrivate(space: co.loaded<typeof Space>): void {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) throw new Error("Space is not group-owned")
	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can make spaces private")
	}
	spaceGroup.removeMember("everyone")
	space.$jazz.set("updatedAt", new Date())
}

function deleteSpace(
	space: co.loaded<typeof Space>,
): { type: "success" } | { type: "error"; error: string } {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) {
		return { type: "error", error: "Space is not group-owned" }
	}

	if (spaceGroup.myRole() !== "admin") {
		return { type: "error", error: "Only admins can delete spaces" }
	}

	space.$jazz.set("deletedAt", new Date())
	space.$jazz.set("updatedAt", new Date())
	return { type: "success" }
}
