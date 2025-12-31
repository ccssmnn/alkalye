# Jazz Collaboration Patterns

How to share data between users with invite links and access control.

## Why This Architecture?

Jazz uses **Groups** for permissions. Every CoValue has an owner (Account or Group). If owned by a Group, all Group members can access based on their role.

**Key constraint:** Jazz invite secrets cannot be revoked once created. This drives the entire sharing architecture.

## The Invite Group Pattern

Since secrets can't be revoked, we create a **separate Group per invite link**. To revoke, remove the invite group from the parent - the secret still works but the group has no access.

```
┌─────────────────────────────────────────────────────────┐
│                    Person Group                          │
│  (owns the Person and all its data)                     │
│                                                          │
│  Members:                                                │
│    - You (admin)                                         │
│    - Invite Group A (writer) ←── remove to revoke       │
│    - Invite Group B (writer)                            │
└─────────────────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼                             ▼
┌─────────────────────┐    ┌─────────────────────┐
│   Invite Group A    │    │   Invite Group B    │
│                     │    │                     │
│  Members:           │    │  Members:           │
│    - You (admin)    │    │    - You (admin)    │
│    - Alice (writer) │    │    (pending...)     │
└─────────────────────┘    └─────────────────────┘
```

## Creating Shareable Data

Always use Groups for items you might share later:

```ts
import { Group, co } from "jazz-tools"

async function createPerson(account: LoadedAccount, data: { name: string }) {
	let group = Group.create() // You're automatically admin

	let person = Person.create(
		{
			version: 1,
			name: data.name,
			notes: co.list(Note).create([], group), // Same owner!
			reminders: co.list(Reminder).create([], group),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		group,
	)

	account.root.people.$jazz.push(person)
	return person
}
```

**Why pass `group` to nested lists?** All nested data must have the same owner. Otherwise collaborators can't access notes/reminders even if they can access the person.

## Creating Invite Links

The URL must include **4 pieces**:

1. **CoValue type** - What kind of thing (e.g., "person")
2. **CoValue ID** - The specific item being shared
3. **Invite group ID** - The group to join
4. **Invite secret** - The key to join that group

```ts
async function createInviteLink(person: LoadedPerson): Promise<string> {
	let personGroup = person.$jazz.owner
	if (!(personGroup instanceof Group)) {
		throw new Error("Person not shareable - not owned by a Group")
	}

	if (personGroup.myRole() !== "admin") {
		throw new Error("Only admins can create invite links")
	}

	// Create a NEW invite group for this link
	let inviteGroup = Group.create()

	// Add invite group as member of person's group
	personGroup.addMember(inviteGroup, "writer")

	// Create invite secret for the invite group
	let inviteSecret = inviteGroup.$jazz.createInvite("writer")

	// URL format: /invite#/{type}/{covalueId}/invite/{inviteGroupId}/{secret}
	return `${baseURL}/invite#/person/${person.$jazz.id}/invite/${inviteGroup.$jazz.id}/${inviteSecret}`
}
```

**Why all 4 pieces?**

- Type + ID: Know what to load after accepting
- Invite group ID + secret: Accept the invite

Without all 4, you can't complete the flow.

## Accepting Invites

```ts
async function acceptInvite(
	account: LoadedAccount,
	covalueType: string,
	covalueId: string,
	inviteGroupId: string,
	inviteSecret: string,
) {
	// 1. Join the invite group
	await account.acceptInvite(
		inviteGroupId as ID<Group>,
		inviteSecret as `inviteSecret_z${string}`,
		Group,
	)

	// 2. Load the shared item (now accessible via group chain)
	if (covalueType === "person") {
		let person = await Person.load(covalueId as ID<typeof Person>, {
			resolve: { avatar: true },
		})

		if (!person?.$isLoaded) {
			throw new Error("Access was revoked before you could join")
		}

		// 3. Add to user's list for easy access
		let alreadyHas = account.root.people.some(p => p?.$jazz.id === covalueId)
		if (!alreadyHas) {
			account.root.people.$jazz.push(person)
		}

		return person
	}

	throw new Error(`Unknown covalue type: ${covalueType}`)
}
```

## Revoking Access

Remove the invite group from the person's group:

```ts
function revokeInvite(person: LoadedPerson, inviteGroupId: string) {
	let personGroup = person.$jazz.owner
	if (!(personGroup instanceof Group)) return

	personGroup.removeMember(inviteGroupId as ID<Group>)
}
```

**What happens to the invite link?** It still "works" - users can join the invite group. But that group no longer has access to anything, so they get `unauthorized` when trying to load the person.

## Revoking All Access (Permanent Delete)

When permanently deleting shared data:

```ts
function revokeAllCollaborators(person: LoadedPerson) {
	let group = person.$jazz.owner
	if (!(group instanceof Group)) return

	for (let member of group.members) {
		if (member.role !== "admin") {
			group.removeMember(member.account)
		}
	}
}

// Then mark as permanently deleted
person.$jazz.set("permanentlyDeletedAt", new Date())
```

## Understanding getParentGroups()

When you add an invite group as a member of a person's group, that invite group becomes a "parent group". Use `getParentGroups()` to enumerate all invite groups:

```ts
let personGroup = person.$jazz.owner
if (!(personGroup instanceof Group)) return

// Returns all Groups that are members of personGroup
let parentGroups = personGroup.getParentGroups()

for (let inviteGroup of parentGroups) {
	// Each inviteGroup was added via: personGroup.addMember(inviteGroup, "writer")
	// Check if anyone has joined this invite
	let hasMembers = inviteGroup.members.some(
		m => m.role !== "admin" && m.account?.$isLoaded,
	)
}
```

**Why "parent"?** The invite group grants access to the person group. From a permissions perspective, the invite group is "above" (parent of) the person group.

## Listing Collaborators

```ts
async function getCollaborators(person: LoadedPerson) {
	let personGroup = person.$jazz.owner
	if (!(personGroup instanceof Group)) {
		return { collaborators: [], pending: [] }
	}

	let collaborators = []
	let pending = []

	// Check each invite group (parent groups)
	for (let inviteGroup of personGroup.getParentGroups()) {
		let hasMembers = inviteGroup.members.some(
			m => m.role !== "admin" && m.account?.$isLoaded,
		)

		if (hasMembers) {
			// Accepted invite - get member info
			for (let member of inviteGroup.members) {
				if (member.role === "admin") continue // Skip creator
				if (member.account?.$isLoaded) {
					let profile = await member.account.$jazz.ensureLoaded({
						resolve: { profile: true },
					})
					collaborators.push({
						id: member.id,
						name: profile.profile?.name ?? "Unknown",
						role: member.role,
						inviteGroupId: inviteGroup.$jazz.id,
					})
				}
			}
		} else {
			// No members yet - pending invite
			pending.push({
				inviteGroupId: inviteGroup.$jazz.id,
				createdAt: new Date(inviteGroup.$jazz.createdAt),
			})
		}
	}

	return { collaborators, pending }
}
```

## Checking Permissions

```ts
function canEdit(person: LoadedPerson): boolean {
	let group = person.$jazz.owner
	if (!(group instanceof Group)) return true // Account-owned, you're the owner

	let role = group.myRole()
	return role === "admin" || role === "writer"
}

function isAdmin(person: LoadedPerson): boolean {
	let group = person.$jazz.owner
	if (!(group instanceof Group)) return true
	return group.myRole() === "admin"
}
```

## Migrating Data to Groups

If data wasn't originally created with a Group:

```ts
async function migratePersonToGroup(
	person: LoadedPerson,
	userId: string,
): Promise<LoadedPerson> {
	// Already group-owned?
	if (person.$jazz.owner instanceof Group) {
		return person
	}

	// Create new group and person
	let group = Group.create()
	let newPerson = Person.create(
		{
			version: 1,
			name: person.name,
			summary: person.summary,
			notes: co.list(Note).create([], group),
			reminders: co.list(Reminder).create([], group),
			createdAt: person.createdAt,
			updatedAt: new Date(),
		},
		group,
	)

	// Copy nested data
	for (let note of person.notes.values()) {
		if (!note) continue
		let newNote = Note.create(
			{
				version: 1,
				content: note.content,
				pinned: note.pinned,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
			},
			group,
		)
		newPerson.notes.$jazz.push(newNote)
	}

	// Replace in account
	let account = await UserAccount.load(userId, {
		resolve: { root: { people: true } },
	})
	let idx = account.root.people.findIndex(p => p?.$jazz.id === person.$jazz.id)
	if (idx !== -1) {
		account.root.people.$jazz.set(idx, newPerson)
	}

	// Mark old as deleted
	person.$jazz.set("permanentlyDeletedAt", new Date())

	return newPerson
}
```

## Cleanup: Expired Pending Invites

Remove invite groups that were never accepted:

```ts
function cleanupExpiredInvites(person: LoadedPerson) {
	let personGroup = person.$jazz.owner
	if (!(personGroup instanceof Group)) return

	let EXPIRY_DAYS = 7

	for (let inviteGroup of personGroup.getParentGroups()) {
		// Has any non-admin members?
		let hasMembers = inviteGroup.members.some(
			m => m.role !== "admin" && m.account?.$isLoaded,
		)

		if (hasMembers) continue // Active invite, keep it

		// Check age
		let createdAt = new Date(inviteGroup.$jazz.createdAt)
		let expiryDate = new Date()
		expiryDate.setDate(expiryDate.getDate() - EXPIRY_DAYS)

		if (createdAt < expiryDate) {
			personGroup.removeMember(inviteGroup)
		}
	}
}
```

## Public Profiles

Make user profiles readable by anyone:

```ts
function initializeProfileIfUndefined(account) {
	if (account.profile === undefined) {
		let group = Group.create()
		group.addMember("everyone", "reader") // Public!

		account.$jazz.set(
			"profile",
			UserProfile.create({ name: "Anonymous" }, group),
		)
	}
}
```

## Common Mistakes

1. **Creating without Group** - Data can't be shared later; must migrate
2. **Nested lists with wrong owner** - Collaborators can't access nested data
3. **Thinking secrets can be revoked** - Use invite groups instead
4. **Not checking myRole()** - Show appropriate UI based on permissions
5. **Forgetting to handle `unauthorized`** - Shared items can become inaccessible
