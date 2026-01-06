import { beforeEach, describe, expect, test } from "vitest"
import {
	createJazzTestAccount,
	setActiveAccount,
	setupJazzTestSync,
} from "jazz-tools/testing"
import { co } from "jazz-tools"
import {
	Document,
	Space,
	UserAccount,
	createSpace,
	createSpaceDocument,
} from "@/schema"
import {
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
} from "@/lib/spaces"
import {
	listCollaborators,
	hasIndividualShares,
	createDocumentInvite,
	acceptDocumentInvite,
	parseInviteLink,
} from "@/lib/documents"

describe("Space Collaboration", () => {
	let adminAccount: co.loaded<typeof UserAccount>
	let otherAccount: co.loaded<typeof UserAccount>
	let space: co.loaded<typeof Space>

	beforeEach(async () => {
		await setupJazzTestSync()

		adminAccount = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		otherAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		let { root } = await adminAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true } },
		})
		space = createSpace("Test Space", root)
	})

	test("admin can access their own space", async () => {
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		expect(loadedSpace?.$isLoaded).toBe(true)
	})

	test("other user cannot access space they are not invited to", async () => {
		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		expect(loadedSpace?.$jazz.loadingState).toEqual("unauthorized")
	})

	test("admin can find space in personal spaces list", async () => {
		let { root } = await adminAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true } },
		})
		expect(root.spaces?.some(s => s?.$jazz.id === space.$jazz.id)).toBe(true)
	})

	test("invited user can find space in personal spaces after accepting invite", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)

		let { root: afterRoot } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true } },
		})
		expect(afterRoot.spaces?.some(s => s?.$jazz.id === space.$jazz.id)).toBe(
			true,
		)
	})

	test("revoked user cannot access space", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id)
		expect(loadedSpace?.$isLoaded).toBe(true)

		setActiveAccount(adminAccount)
		revokeSpaceInvite(space, inviteData.inviteGroupId)

		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpaceAfterRevoke = await Space.load(space.$jazz.id)
		expect(loadedSpaceAfterRevoke?.$jazz.loadingState).toEqual("unauthorized")
	})

	test("accepting a revoked invite should throw", async () => {
		setActiveAccount(adminAccount)
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		revokeSpaceInvite(space, inviteData.inviteGroupId)

		await adminAccount.$jazz.waitForAllCoValuesSync()
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		await expect(acceptSpaceInvite(otherAccount, inviteData)).rejects.toThrow()
	})

	test("list collaborators returns all invited users with their roles", async () => {
		let writerAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		let readerAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		let { link: writerInvite } = await createSpaceInvite(space, "writer")
		let { link: readerInvite } = await createSpaceInvite(space, "reader")

		let writerData = parseSpaceInviteLink(writerInvite)
		let readerData = parseSpaceInviteLink(readerInvite)

		await acceptSpaceInvite(writerAccount, writerData)
		await acceptSpaceInvite(readerAccount, readerData)

		let result = await listSpaceCollaborators(space, false)
		expect(result.collaborators.length).toBe(2)

		let writerCollabs = result.collaborators.filter(c => c.role === "writer")
		let readerCollabs = result.collaborators.filter(c => c.role === "reader")

		expect(writerCollabs.length).toBe(1)
		expect(readerCollabs.length).toBe(1)
		expect(writerCollabs[0].id).toBe(writerAccount.$jazz.id)
		expect(readerCollabs[0].id).toBe(readerAccount.$jazz.id)
	}, 30000)

	test("leaving space removes it from personal spaces and collaborator list", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)

		let { root: beforeRoot } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true } },
		})
		expect(beforeRoot.spaces?.some(s => s?.$jazz.id === space.$jazz.id)).toBe(
			true,
		)

		setActiveAccount(adminAccount)
		let collaboratorsBefore = await listSpaceCollaborators(space, false)
		expect(
			collaboratorsBefore.collaborators.some(
				c => c.id === otherAccount.$jazz.id,
			),
		).toBe(true)

		setActiveAccount(otherAccount)
		let loadedSpaceAsOther = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpaceAsOther?.$isLoaded) throw new Error("Space not loaded")
		await leaveSpace(loadedSpaceAsOther, otherAccount)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		let { root: afterRoot } = await otherAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true } },
		})
		expect(afterRoot.spaces?.some(s => s?.$jazz.id === space.$jazz.id)).toBe(
			false,
		)

		setActiveAccount(adminAccount)
		let collaboratorsAfter = await listSpaceCollaborators(space, false)
		expect(
			collaboratorsAfter.collaborators.some(
				c => c.id === otherAccount.$jazz.id,
			),
		).toBe(false)
	}, 30000)

	test("changing collaborator role is reflected in listCollaborators", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "reader")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		let collaboratorsBefore = await listSpaceCollaborators(space, false)
		let otherCollabsBefore = collaboratorsBefore.collaborators.filter(
			c => c.id === otherAccount.$jazz.id,
		)
		expect(otherCollabsBefore.length).toBe(1)
		expect(otherCollabsBefore[0].role).toBe("reader")

		await changeSpaceCollaboratorRole(space, inviteData.inviteGroupId, "writer")

		let collaboratorsAfter = await listSpaceCollaborators(space, false)
		let otherCollabsAfter = collaboratorsAfter.collaborators.filter(
			c => c.id === otherAccount.$jazz.id,
		)
		expect(otherCollabsAfter.length).toBe(1)
		expect(otherCollabsAfter[0].role).toBe("writer")
	}, 30000)

	test("listCollaborators returns pending invites for empty invite groups", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		let result = await listSpaceCollaborators(space)
		expect(result.pendingInvites.length).toBe(1)
		expect(result.pendingInvites[0].inviteGroupId).toBe(
			inviteData.inviteGroupId,
		)
		expect(result.collaborators.length).toBe(0)
	})

	test("non-admin cannot create invite links", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		await expect(createSpaceInvite(loadedSpace, "reader")).rejects.toThrow(
			"Only admins can create invite links",
		)
	})

	test("non-admin cannot delete space", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let result = deleteSpace(loadedSpace)
		expect(result.type).toBe("error")
		expect(loadedSpace.deletedAt).toBeUndefined()
	})

	test("admin can soft delete space", async () => {
		let result = deleteSpace(space)
		expect(result.type).toBe("success")
		expect(space.deletedAt).toBeInstanceOf(Date)

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		expect(loadedSpace?.$isLoaded).toBe(true)
	})

	test("admin cannot leave their own space", async () => {
		await expect(leaveSpace(space, adminAccount)).rejects.toThrow(
			"Admins cannot leave their own space",
		)
	})

	test("multiple invites create separate access paths", async () => {
		let thirdAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		let { link: invite1 } = await createSpaceInvite(space, "writer")
		let { link: invite2 } = await createSpaceInvite(space, "reader")

		let data1 = parseSpaceInviteLink(invite1)
		let data2 = parseSpaceInviteLink(invite2)

		await acceptSpaceInvite(otherAccount, data1)
		await acceptSpaceInvite(thirdAccount, data2)

		// Revoke first invite - otherAccount loses access
		revokeSpaceInvite(space, data1.inviteGroupId)
		await adminAccount.$jazz.waitForAllCoValuesSync()

		// thirdAccount should still have access
		setActiveAccount(thirdAccount)
		let loadedSpace = await Space.load(space.$jazz.id)
		expect(loadedSpace?.$isLoaded).toBe(true)

		// otherAccount should not
		setActiveAccount(otherAccount)
		let loadedSpace2 = await Space.load(space.$jazz.id)
		expect(loadedSpace2?.$jazz.loadingState).toBe("unauthorized")
	})

	test("parseSpaceInviteLink throws on invalid format", () => {
		expect(() => parseSpaceInviteLink("invalid")).toThrow("Invalid invite link")
		expect(() => parseSpaceInviteLink("http://example.com/wrong")).toThrow(
			"Invalid invite link",
		)
	})

	test("getSpaceOwner returns the admin", async () => {
		let owner = await getSpaceOwner(space, false)
		expect(owner).not.toBeNull()
		expect(owner?.id).toBe(adminAccount.$jazz.id)
	})

	test("reader role restricts to read-only access", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "reader")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		expect(loadedSpace?.$isLoaded).toBe(true)
		if (!loadedSpace?.$isLoaded) return

		let spaceGroup = getSpaceGroup(loadedSpace)
		let role = spaceGroup?.myRole()
		expect(role).toBe("reader")
	})

	test("writer can access but cannot change roles", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		await expect(
			changeSpaceCollaboratorRole(
				loadedSpace,
				inviteData.inviteGroupId,
				"reader",
			),
		).rejects.toThrow("Only admins can change collaborator roles")
	})

	test("manager role can add/remove readers and writers", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		// Add manager directly to space
		let managerAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})
		spaceGroup.addMember(managerAccount, "manager")

		// Manager can add a writer
		setActiveAccount(managerAccount)
		let writerAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})
		spaceGroup.addMember(writerAccount, "writer")

		// Verify writer was added
		let writerMember = spaceGroup.members.find(
			m => m.id === writerAccount.$jazz.id,
		)
		expect(writerMember?.role).toBe("writer")

		// Manager can remove the writer
		spaceGroup.removeMember(writerAccount)
		let writerMemberAfter = spaceGroup.members.find(
			m => m.id === writerAccount.$jazz.id,
		)
		expect(writerMemberAfter).toBeUndefined()
	})

	test("manager cannot remove admins", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		let managerAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})
		spaceGroup.addMember(managerAccount, "manager")

		setActiveAccount(managerAccount)

		// Manager cannot remove the existing admin
		expect(() => spaceGroup.removeMember(adminAccount)).toThrow()
	})

	test("changing collaborator role to manager works", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		let collaboratorsBefore = await listSpaceCollaborators(space, false)
		let otherBefore = collaboratorsBefore.collaborators.find(
			c => c.id === otherAccount.$jazz.id,
		)
		expect(otherBefore?.role).toBe("writer")

		await changeSpaceCollaboratorRole(
			space,
			inviteData.inviteGroupId,
			"manager",
		)

		let collaboratorsAfter = await listSpaceCollaborators(space, false)
		let otherAfter = collaboratorsAfter.collaborators.find(
			c => c.id === otherAccount.$jazz.id,
		)
		expect(otherAfter?.role).toBe("manager")
	}, 30000)
})

describe("Space Public Access", () => {
	let adminAccount: co.loaded<typeof UserAccount>
	let otherAccount: co.loaded<typeof UserAccount>
	let space: co.loaded<typeof Space>

	beforeEach(async () => {
		await setupJazzTestSync()

		adminAccount = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		otherAccount = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		let { root } = await adminAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true } },
		})
		space = createSpace("Test Space", root)
	})

	test("space is private by default", () => {
		expect(isSpacePublic(space)).toBe(false)
	})

	test("admin can make space public", () => {
		makeSpacePublic(space)
		expect(isSpacePublic(space)).toBe(true)
	})

	test("admin can make space private again", () => {
		makeSpacePublic(space)
		expect(isSpacePublic(space)).toBe(true)

		makeSpacePrivate(space)
		expect(isSpacePublic(space)).toBe(false)
	})

	test("non-admin cannot make space public", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		expect(() => makeSpacePublic(loadedSpace)).toThrow(
			"Only admins can make spaces public",
		)
	})

	test("non-admin cannot make space private", async () => {
		makeSpacePublic(space)

		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)

		await acceptSpaceInvite(otherAccount, inviteData)
		await otherAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		expect(() => makeSpacePrivate(loadedSpace)).toThrow(
			"Only admins can make spaces private",
		)
	})

	test("public space can be accessed by anyone", async () => {
		makeSpacePublic(space)
		await adminAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		expect(loadedSpace?.$isLoaded).toBe(true)
	})

	test("making space private removes public access", async () => {
		makeSpacePublic(space)
		await adminAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace = await Space.load(space.$jazz.id)
		expect(loadedSpace?.$isLoaded).toBe(true)

		setActiveAccount(adminAccount)
		makeSpacePrivate(space)
		await adminAccount.$jazz.waitForAllCoValuesSync()

		setActiveAccount(otherAccount)
		let loadedSpace2 = await Space.load(space.$jazz.id)
		expect(loadedSpace2?.$jazz.loadingState).toBe("unauthorized")
	})
})

describe("Space-Document Permission Cascade", () => {
	let adminAccount: co.loaded<typeof UserAccount>
	let spaceMember: co.loaded<typeof UserAccount>
	let docOnlyUser: co.loaded<typeof UserAccount>
	let outsider: co.loaded<typeof UserAccount>
	let space: co.loaded<typeof Space>

	beforeEach(async () => {
		await setupJazzTestSync()

		adminAccount = await createJazzTestAccount({
			isCurrentActiveAccount: true,
			AccountSchema: UserAccount,
		})

		spaceMember = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		docOnlyUser = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		outsider = await createJazzTestAccount({
			AccountSchema: UserAccount,
		})

		let { root } = await adminAccount.$jazz.ensureLoaded({
			resolve: { root: { spaces: true } },
		})
		space = createSpace("Test Space", root)
	})

	test("space member can access all documents in the space", async () => {
		// Add spaceMember directly to spaceGroup
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")
		spaceGroup.addMember(spaceMember, "writer")

		// Get the welcome doc ID
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Space member should be able to access the doc via space group membership
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			loadAs: spaceMember,
			resolve: { content: true },
		})
		expect(loadedDoc?.$isLoaded).toBe(true)
	})

	test("new documents in space inherit space group membership", async () => {
		// This tests that createSpaceDocument correctly sets up group inheritance
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let newDoc = createSpaceDocument(spaceGroup, "New content")

		// Verify the doc's group has spaceGroup as a parent
		let docGroup = newDoc.$jazz.owner
		let parentGroups = docGroup.getParentGroups()
		expect(parentGroups.some(g => g.$jazz.id === spaceGroup.$jazz.id)).toBe(
			true,
		)
	})

	test("document invite does NOT grant space access", async () => {
		// Get the welcome doc
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Add docOnlyUser directly to the doc's group (not the space group)
		let docGroup = welcomeDoc.$jazz.owner
		docGroup.addMember(docOnlyUser, "writer")

		// docOnlyUser should be able to access the document
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			loadAs: docOnlyUser,
			resolve: { content: true },
		})
		expect(loadedDoc?.$isLoaded).toBe(true)

		// BUT docOnlyUser should NOT be able to access the space
		let loadedSpaceAsDocUser = await Space.load(space.$jazz.id, {
			loadAs: docOnlyUser,
			resolve: { documents: true },
		})
		expect(loadedSpaceAsDocUser?.$jazz.loadingState).toBe("unauthorized")
	})

	test("document invite user cannot access other docs in space", async () => {
		// Get the welcome doc and create another doc
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		let secondDoc = createSpaceDocument(spaceGroup, "Second doc content")
		loadedSpace.documents.$jazz.push(secondDoc)

		// Add docOnlyUser directly to the welcome doc's group only
		let docGroup = welcomeDoc.$jazz.owner
		docGroup.addMember(docOnlyUser, "writer")

		// docOnlyUser can access the shared doc
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			loadAs: docOnlyUser,
			resolve: { content: true },
		})
		expect(loadedDoc?.$isLoaded).toBe(true)

		// But cannot access the second doc
		let loadedSecondDoc = await Document.load(secondDoc.$jazz.id, {
			loadAs: docOnlyUser,
			resolve: { content: true },
		})
		expect(loadedSecondDoc?.$jazz.loadingState).toBe("unauthorized")
	})

	test("outsider cannot access space or its documents", async () => {
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Outsider cannot access space
		let loadedSpaceAsOutsider = await Space.load(space.$jazz.id, {
			loadAs: outsider,
		})
		expect(loadedSpaceAsOutsider?.$jazz.loadingState).toBe("unauthorized")

		// Outsider cannot access doc
		let loadedDocAsOutsider = await Document.load(welcomeDoc.$jazz.id, {
			loadAs: outsider,
		})
		expect(loadedDocAsOutsider?.$jazz.loadingState).toBe("unauthorized")
	})

	test("removing member from space group removes them from membership list", async () => {
		// Add spaceMember directly to spaceGroup
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")
		spaceGroup.addMember(spaceMember, "writer")

		// Verify member was added
		let memberBefore = spaceGroup.members.find(
			m => m.id === spaceMember.$jazz.id,
		)
		expect(memberBefore).toBeDefined()
		expect(memberBefore?.role).toBe("writer")

		// Admin revokes space access
		spaceGroup.removeMember(spaceMember)

		// Member should be removed from the list
		let memberAfter = spaceGroup.members.find(
			m => m.id === spaceMember.$jazz.id,
		)
		expect(memberAfter).toBeUndefined()
	})

	test("document-level revoke does not affect space member access", async () => {
		// Add spaceMember directly to spaceGroup
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")
		spaceGroup.addMember(spaceMember, "writer")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Also add spaceMember directly to the doc's group
		let docGroup = welcomeDoc.$jazz.owner
		docGroup.addMember(spaceMember, "writer")

		// Revoke the doc-level access
		docGroup.removeMember(spaceMember)

		// Space member should STILL have access via space membership
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			loadAs: spaceMember,
			resolve: { content: true },
		})
		expect(loadedDoc?.$isLoaded).toBe(true)
	})

	test("space reader has read access to all docs", async () => {
		// Add spaceMember as reader to spaceGroup
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")
		spaceGroup.addMember(spaceMember, "reader")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			loadAs: spaceMember,
			resolve: { content: true },
		})
		expect(loadedDoc?.$isLoaded).toBe(true)

		// Verify reader role on doc
		if (!loadedDoc?.$isLoaded) return
		let docGroup = loadedDoc.$jazz.owner
		expect(docGroup.myRole()).toBe("reader")
	})

	test("space writer has write access to all docs", async () => {
		// Add spaceMember as writer to spaceGroup
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")
		spaceGroup.addMember(spaceMember, "writer")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			loadAs: spaceMember,
			resolve: { content: true },
		})
		expect(loadedDoc?.$isLoaded).toBe(true)

		// Verify writer role on doc
		if (!loadedDoc?.$isLoaded) return
		let docGroup = loadedDoc.$jazz.owner
		expect(docGroup.myRole()).toBe("writer")
	})

	test("space reader has read-only role on documents", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")
		spaceGroup.addMember(spaceMember, "reader")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		setActiveAccount(spaceMember)
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			resolve: { content: true },
		})
		expect(loadedDoc?.$isLoaded).toBe(true)
		if (!loadedDoc?.$isLoaded) return

		// Jazz doesn't throw locally on unauthorized writes - it accepts
		// the mutation locally but rejects it at sync time. The app uses
		// canEdit() to prevent UI writes for readers.
		let docGroup = loadedDoc.$jazz.owner
		expect(docGroup.myRole()).toBe("reader")
	})

	test("space writer can write to documents", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")
		spaceGroup.addMember(spaceMember, "writer")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		setActiveAccount(spaceMember)
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			resolve: { content: true },
		})
		expect(loadedDoc?.$isLoaded).toBe(true)
		if (!loadedDoc?.$isLoaded) return

		// Writer should be able to modify content without throwing
		expect(() => {
			loadedDoc.content!.$jazz.applyDiff("Modified content")
		}).not.toThrow()
	})

	test("space writer cannot create invite links", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)
		await acceptSpaceInvite(spaceMember, inviteData)

		setActiveAccount(spaceMember)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		// Writer should not be able to create invite links
		await expect(createSpaceInvite(loadedSpace, "reader")).rejects.toThrow(
			"Only admins can create invite links",
		)
	})

	test("space reader cannot create invite links", async () => {
		let { link: inviteLink } = await createSpaceInvite(space, "reader")
		let inviteData = parseSpaceInviteLink(inviteLink)
		await acceptSpaceInvite(spaceMember, inviteData)

		setActiveAccount(spaceMember)
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: true },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		await expect(createSpaceInvite(loadedSpace, "reader")).rejects.toThrow(
			"Only admins can create invite links",
		)
	})

	test("listCollaborators excludes space members when spaceGroupId passed", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		// Add spaceMember via invite group (normal flow)
		let { link: inviteLink } = await createSpaceInvite(space, "writer")
		let inviteData = parseSpaceInviteLink(inviteLink)
		await acceptSpaceInvite(spaceMember, inviteData)

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Also add a doc-level collaborator
		let { link: docInvite } = await createDocumentInvite(welcomeDoc, "reader")
		let docInviteData = parseInviteLink(docInvite)
		await acceptDocumentInvite(docOnlyUser, docInviteData)

		// List collaborators WITH spaceGroupId - should exclude space members
		let result = await listCollaborators(welcomeDoc, spaceGroup.$jazz.id, false)

		// Should only have docOnlyUser, not spaceMember
		expect(result.collaborators.length).toBe(1)
		expect(result.collaborators[0].id).toBe(docOnlyUser.$jazz.id)
		expect(result.collaborators.some(c => c.id === spaceMember.$jazz.id)).toBe(
			false,
		)
	})

	test("listCollaborators includes all when spaceGroupId not passed", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Add a doc-level collaborator
		let { link: docInvite } = await createDocumentInvite(welcomeDoc, "reader")
		let docInviteData = parseInviteLink(docInvite)
		await acceptDocumentInvite(docOnlyUser, docInviteData)

		// List collaborators WITHOUT spaceGroupId
		let result = await listCollaborators(welcomeDoc, undefined, false)

		// Should have docOnlyUser
		expect(result.collaborators.length).toBe(1)
		expect(result.collaborators[0].id).toBe(docOnlyUser.$jazz.id)
	})

	test("hasIndividualShares returns false for space doc without doc-level invites", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// No doc-level invites, only space membership
		let result = hasIndividualShares(welcomeDoc, spaceGroup.$jazz.id)
		expect(result).toBe(false)
	})

	test("hasIndividualShares returns true for space doc with doc-level invites", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Add doc-level invite
		let { link: docInvite } = await createDocumentInvite(welcomeDoc, "reader")
		let docInviteData = parseInviteLink(docInvite)
		await acceptDocumentInvite(docOnlyUser, docInviteData)

		let result = hasIndividualShares(welcomeDoc, spaceGroup.$jazz.id)
		expect(result).toBe(true)
	})

	test("doc-level writer cannot create invite links for space doc", async () => {
		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Add docOnlyUser as writer to the doc
		let { link: docInvite } = await createDocumentInvite(welcomeDoc, "writer")
		let docInviteData = parseInviteLink(docInvite)
		await acceptDocumentInvite(docOnlyUser, docInviteData)

		setActiveAccount(docOnlyUser)
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			resolve: { content: true },
		})
		if (!loadedDoc?.$isLoaded) throw new Error("Doc not loaded")

		// Writer should not be able to create invite links
		await expect(createDocumentInvite(loadedDoc, "reader")).rejects.toThrow(
			"Only admins can create invite links",
		)
	})

	test("space reader with doc-level writer invite gets writer role", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		// Add spaceMember as READER to the space
		let { link: spaceInvite } = await createSpaceInvite(space, "reader")
		let spaceInviteData = parseSpaceInviteLink(spaceInvite)
		await acceptSpaceInvite(spaceMember, spaceInviteData)

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Also add spaceMember as WRITER directly to the doc
		let { link: docInvite } = await createDocumentInvite(welcomeDoc, "writer")
		let docInviteData = parseInviteLink(docInvite)
		await acceptDocumentInvite(spaceMember, docInviteData)

		// User gets the HIGHER permission (writer from doc invite)
		setActiveAccount(spaceMember)
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			resolve: { content: true },
		})
		if (!loadedDoc?.$isLoaded) throw new Error("Doc not loaded")

		let docGroup = loadedDoc.$jazz.owner
		expect(docGroup.myRole()).toBe("writer")

		// User IS listed as collaborator (because they have doc-level invite)
		setActiveAccount(adminAccount)
		let result = await listCollaborators(welcomeDoc, spaceGroup.$jazz.id, false)
		expect(result.collaborators.some(c => c.id === spaceMember.$jazz.id)).toBe(
			true,
		)
		expect(
			result.collaborators.find(c => c.id === spaceMember.$jazz.id)?.role,
		).toBe("writer")

		// hasIndividualShares is true (doc-level invite exists)
		expect(hasIndividualShares(welcomeDoc, spaceGroup.$jazz.id)).toBe(true)
	})

	test("space writer with doc-level reader invite keeps writer role", async () => {
		let spaceGroup = getSpaceGroup(space)
		if (!spaceGroup) throw new Error("Space group not found")

		// Add spaceMember as WRITER to the space
		let { link: spaceInvite } = await createSpaceInvite(space, "writer")
		let spaceInviteData = parseSpaceInviteLink(spaceInvite)
		await acceptSpaceInvite(spaceMember, spaceInviteData)

		let loadedSpace = await Space.load(space.$jazz.id, {
			resolve: { documents: { $each: { content: true } } },
		})
		if (!loadedSpace?.$isLoaded) throw new Error("Space not loaded")

		let welcomeDoc = loadedSpace.documents[0]
		if (!welcomeDoc) throw new Error("Welcome doc not found")

		// Also add spaceMember as READER directly to the doc
		let { link: docInvite } = await createDocumentInvite(welcomeDoc, "reader")
		let docInviteData = parseInviteLink(docInvite)
		await acceptDocumentInvite(spaceMember, docInviteData)

		// User gets the HIGHER permission (writer from space)
		setActiveAccount(spaceMember)
		let loadedDoc = await Document.load(welcomeDoc.$jazz.id, {
			resolve: { content: true },
		})
		if (!loadedDoc?.$isLoaded) throw new Error("Doc not loaded")

		let docGroup = loadedDoc.$jazz.owner
		expect(docGroup.myRole()).toBe("writer")

		// User IS listed as collaborator with their doc-level role (reader)
		// even though their effective role is writer from space
		setActiveAccount(adminAccount)
		let result = await listCollaborators(welcomeDoc, spaceGroup.$jazz.id, false)
		expect(result.collaborators.some(c => c.id === spaceMember.$jazz.id)).toBe(
			true,
		)

		// hasIndividualShares is true (doc-level invite exists)
		expect(hasIndividualShares(welcomeDoc, spaceGroup.$jazz.id)).toBe(true)
	})
})
