---
name: jazz
description: Build real-time, offline-first, collaborative apps with Jazz (jazz-tools). Use when working with Jazz schemas, CoValues, sync, Groups, sharing, or any jazz-tools imports.
metadata:
  author: tilly
  version: "1.0"
---

# Jazz Sync Engine

Jazz makes your data real-time, offline-first, and collaborative. Define schemas, Jazz handles sync, persistence, and access control.

## Quick Start

### Define a Schema

```ts
import { co, z } from "jazz-tools"

export let Note = co.map({
	version: z.literal(1),
	content: z.string(),
	pinned: z.boolean().optional(),
	deletedAt: z.date().optional(),
	createdAt: z.date(), // Track your own timestamps!
	updatedAt: z.date(),
})

export let Person = co.map({
	version: z.literal(1),
	name: z.string(),
	notes: co.list(Note),
	inactiveNotes: co.list(Note).optional(), // For soft-deleted items
})
```

### Load Data

```tsx
import { useCoState, useAccount } from "jazz-tools/react"

// Load by ID
let person = useCoState(Person, personId, {
	resolve: { notes: { $each: true } },
})

// Always check loading state
if (!person.$isLoaded) {
	if (person.$jazz.loadingState === "unauthorized") return <Denied />
	return <Loading />
}
```

### Create & Update

```ts
import { Group, co } from "jazz-tools"

// Create with Group for sharing
let group = Group.create()
let person = Person.create(
	{
		version: 1,
		name: "John",
		notes: co.list(Note).create([], group),
		createdAt: new Date(),
		updatedAt: new Date(),
	},
	group,
)

// Update
person.$jazz.set("name", "Jane")
person.$jazz.set("updatedAt", new Date())

// List operations
list.$jazz.push(item)
list.$jazz.splice(idx, 1)
```

## Key Patterns

### Custom Timestamps

Always track `createdAt`/`updatedAt`/`deletedAt` yourself. Jazz's `$jazz.createdAt` is sync time, not user intent - breaks on migrations/imports.

### Soft Delete

Use parallel active/inactive lists:

```ts
// Delete
note.$jazz.set("deletedAt", new Date())
person.inactiveNotes.$jazz.push(note)
person.notes.$jazz.splice(idx, 1)

// Restore
note.$jazz.delete("deletedAt")
person.notes.$jazz.push(note)
person.inactiveNotes.$jazz.splice(idx, 1)
```

### Sharing (Invite Groups)

Jazz invite secrets **cannot be revoked**. Use invite groups instead:

```ts
let inviteGroup = Group.create()
personGroup.addMember(inviteGroup, "writer")
let secret = inviteGroup.$jazz.createInvite("writer")

// URL needs 4 pieces: type, covalueId, inviteGroupId, secret
let url = `/invite#/person/${person.$jazz.id}/invite/${inviteGroup.$jazz.id}/${secret}`

// Revoke by removing the group
personGroup.removeMember(inviteGroup)
```

### Handle Inaccessible Items

```ts
let query = {
	root: { people: { $each: { $onError: "catch" } } },
} as const satisfies ResolveQuery<typeof UserAccount>
```

### Server Workers

```ts
import { startWorker } from "jazz-tools/worker"

let { worker } = await startWorker({
	AccountSchema: UserAccount,
	syncServer: "wss://cloud.jazz.tools",
	accountID,
	accountSecret,
})

// Always wait for sync
await worker.$jazz.waitForAllCoValuesSync()
```

## $jazz API

```ts
item.$jazz.id // Unique ID
item.$jazz.owner // Group | Account
item.$isLoaded // boolean
item.$jazz.loadingState // "loading" | "unauthorized" | "unavailable"

item.$jazz.set(key, value)
item.$jazz.delete(key)
list.$jazz.push(item)
list.$jazz.splice(idx, count)

await item.$jazz.waitForSync()
let unsub = item.$jazz.subscribe(updated => {})
```

## Common Mistakes

1. **Not checking `$isLoaded`** before accessing fields
2. **Creating without Group** when sharing needed later
3. **Nested lists with wrong owner** - pass same group
4. **Using `$jazz.createdAt` for display** - use your own timestamps
5. **Thinking invite secrets can be revoked** - use invite groups
6. **Server code not waiting for sync** - always `await waitForAllCoValuesSync()`

## Detailed References

- [Schema Patterns](references/SCHEMA.md) - Schema design, migrations, types
- [Client Patterns](references/CLIENT.md) - React hooks, loading, mutations
- [Server Patterns](references/SERVER.md) - Workers, background jobs, notifications
- [Collaboration Patterns](references/COLLABORATION.md) - Sharing, invites, permissions
- [AI Patterns](references/AI.md) - Chat via Jazz, tool factories, abort handling
