import { Group, co, type ID } from "jazz-tools"
import { Space, UserAccount } from "@/schema"
import { permanentlyDeleteSpace as deleteSpaceCoValue } from "@/lib/delete-covalue"

export {
	createSpaceInvite,
	acceptSpaceInvite,
	revokeSpaceInvite,
	listSpaceCollaborators,
	listSpaceMembers,
	leaveSpace,
	changeSpaceCollaboratorRole,
	parseSpaceInviteLink,
	getSpaceOwner,
	isSpacePublic,
	isSpaceMember,
	makeSpacePublic,
	makeSpacePrivate,
	deleteSpace,
	permanentlyDeleteSpace,
	getSpaceGroup,
}

export type {
	SpaceInviteData,
	SpaceCollaborator,
	SpaceMember,
	SpaceCollaboratorsResult,
	SpaceInviteResult,
}

type SpaceCollaborator = {
	id: string
	name: string
	role: string
	inviteGroupId: string
}

type SpaceMember = {
	id: string
	name: string
	role: string
	inviteGroupId?: string
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
					let account = await member.account.$jazz.ensureLoaded({
						resolve: { profile: true },
					})
					name = account.profile.name ?? "Unknown"
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

async function listSpaceMembers(
	space: co.loaded<typeof Space>,
): Promise<SpaceMember[]> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) return []

	let members: SpaceMember[] = []
	let seenIds = new Set<string>()

	// First, collect inviteGroupIds for collaborators
	let inviteGroupByMemberId = new Map<string, string>()
	for (let inviteGroup of spaceGroup.getParentGroups()) {
		for (let member of inviteGroup.members) {
			if (member.role === "admin") continue
			if (member.account?.$isLoaded) {
				inviteGroupByMemberId.set(member.id, inviteGroup.$jazz.id)
			}
		}
	}

	// Load all members from spaceGroup.members (includes inherited collaborators)
	for (let member of spaceGroup.members) {
		if (member.account?.$isLoaded && !seenIds.has(member.id)) {
			seenIds.add(member.id)
			let profile = await member.account.$jazz.ensureLoaded({
				resolve: { profile: true },
			})
			members.push({
				id: member.id,
				name:
					(profile as { profile?: { name?: string } }).profile?.name ??
					"Unknown",
				role: member.role,
				inviteGroupId: inviteGroupByMemberId.get(member.id),
			})
		}
	}

	return members
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
	newRole: "admin" | "manager" | "writer" | "reader",
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

/**
 * Check if current user is an actual member of the space (not just a public visitor).
 * Returns true for admin/writer/reader members, false for public visitors.
 */
function isSpaceMember(space: co.loaded<typeof Space>): boolean {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) return false

	let myRole = spaceGroup.myRole()
	if (!myRole) return false

	// If space is not public, having any role means you're a member
	if (!isSpacePublic(space)) return true

	// If space is public, check if role comes from actual membership vs "everyone"
	// Admin/writer roles can only come from actual membership
	if (myRole === "admin" || myRole === "writer") return true

	// For reader role, we need to check if user is explicitly in the group
	// If they only have access via "everyone", they're not a real member
	let everyoneRole = spaceGroup.getRoleOf("everyone")
	if (everyoneRole === "reader" && myRole === "reader") {
		// Check if user is in any parent group (invite group) which would make them a real member
		for (let inviteGroup of spaceGroup.getParentGroups()) {
			let myInviteRole = inviteGroup.myRole()
			if (myInviteRole && myInviteRole !== "admin") {
				return true
			}
		}
		return false
	}

	return true
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

function deleteSpace(space: co.loaded<typeof Space>): void {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) {
		throw new Error("Space is not group-owned")
	}

	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can delete spaces")
	}

	space.$jazz.set("deletedAt", new Date())
	space.$jazz.set("updatedAt", new Date())
}

/**
 * Permanently delete a space and all its documents.
 * Removes from user's spaces list first, then calls deleteCoValues.
 */
async function permanentlyDeleteSpace(
	space: co.loaded<typeof Space>,
	account: co.loaded<typeof UserAccount>,
): Promise<void> {
	let spaceGroup = getSpaceGroup(space)
	if (!spaceGroup) {
		throw new Error("Space is not group-owned")
	}

	if (spaceGroup.myRole() !== "admin") {
		throw new Error("Only admins can permanently delete spaces")
	}

	// Remove invite groups first
	for (let inviteGroup of spaceGroup.getParentGroups()) {
		spaceGroup.removeMember(inviteGroup)
	}

	// Remove from spaces list BEFORE deletion (critical - can't access after)
	let loadedAccount = await account.$jazz.ensureLoaded({
		resolve: { root: { spaces: true, inactiveSpaces: true } },
	})
	if (loadedAccount.root?.spaces?.$isLoaded) {
		let idx = loadedAccount.root.spaces.findIndex(
			s => s?.$jazz.id === space.$jazz.id,
		)
		if (idx !== -1) {
			loadedAccount.root.spaces.$jazz.splice(idx, 1)
		}
	}
	// Also check inactive spaces list
	if (loadedAccount.root?.inactiveSpaces?.$isLoaded) {
		let idx = loadedAccount.root.inactiveSpaces.findIndex(
			s => s?.$jazz.id === space.$jazz.id,
		)
		if (idx !== -1) {
			loadedAccount.root.inactiveSpaces.$jazz.splice(idx, 1)
		}
	}

	// Actually delete the CoValue with all nested data
	try {
		await deleteSpaceCoValue(space)
	} catch {
		// May fail if not accessible, but we've already removed from list
	}
}
