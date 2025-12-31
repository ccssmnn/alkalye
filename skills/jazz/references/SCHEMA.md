# Jazz Schema Patterns

How to design Jazz schemas for real-world applications.

## Why Schema Design Matters

Jazz schemas define your data model, sync behavior, and what's possible with collaboration. Good schema design enables:

- Efficient syncing (only changed data transfers)
- Proper access control (group ownership)
- Undo/restore functionality (soft delete)
- Schema evolution (migrations)

## Basic Schema Definition

```ts
import { co, z } from "jazz-tools"

export let Note = co.map({
	version: z.literal(1), // Required for migrations
	title: z.string().optional(),
	content: z.string(),
	pinned: z.boolean().optional(),
	deletedAt: z.date().optional(),
	permanentlyDeletedAt: z.date().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
})
```

## Field Types

Jazz uses Zod for validation:

```ts
// Primitives
z.string()
z.number()
z.boolean()
z.date()

// Optional
z.string().optional()

// Enums
z.enum(["draft", "published", "archived"])

// Literals (for versioning)
z.literal(1)

// Nested objects
z.object({
	interval: z.number().min(1),
	unit: z.enum(["day", "week", "month", "year"]),
})

// Arrays (non-collaborative, stored as JSON)
z.array(
	z.object({
		endpoint: z.string(),
		keys: z.object({ p256dh: z.string(), auth: z.string() }),
	}),
)
```

## Lists vs Arrays

**Use `co.list()`** for collaborative, syncable collections:

```ts
notes: co.list(Note) // Each item syncs independently
```

**Use `z.array()`** for simple data stored as JSON:

```ts
pushDevices: z.array(PushDevice) // Entire array syncs as one
```

**When to use which:**

- `co.list()`: Items edited independently, need individual sync, may be large
- `z.array()`: Small config data, always read/written together

## Nested References

```ts
export let Person = co.map({
	avatar: co.image().optional(), // Reference to image
	notes: co.list(Note), // List of Note refs
	inactiveNotes: co.list(Note).optional(),
})
```

### Image Lists

For multiple images, use `co.list(co.image())`:

```ts
export let Note = co.map({
	content: z.string(),
	images: co.list(co.image()).optional(), // List of images
	imageCount: z.number().optional(), // Denormalized count for UI
})
```

**Why `imageCount`?** Loading a list just to get `.length` is wasteful. Store count separately for list views.

## The Version Field

**Always include `version: z.literal(N)`:**

```ts
export let Note = co.map({
	version: z.literal(1), // Increment when schema changes
	// ...
})
```

**Why?** Enables migrations. When you add/remove/change fields, increment the version and write migration code.

## Custom Timestamps

**Always track your own timestamps:**

```ts
export let Note = co.map({
	createdAt: z.date(),
	updatedAt: z.date(),
	deletedAt: z.date().optional(),
	permanentlyDeletedAt: z.date().optional(),
})
```

**Why not `$jazz.createdAt`?** Jazz's internal timestamps reflect sync time, not user intent. They become wrong after:

- **Migrations** - Bulk updates touch all items
- **Data import** - Imported data gets current timestamps
- **Offline sync** - Timestamps reflect sync time, not action time

## Soft Delete Fields

For undo support and data recovery:

```ts
deletedAt: z.date().optional(),           // Soft deleted
permanentlyDeletedAt: z.date().optional(), // Purged (after 30 days)
```

**Lifecycle:**

1. Active: both undefined
2. Deleted (restorable): `deletedAt` set
3. Permanently deleted: `permanentlyDeletedAt` set, removed from lists

## Active/Inactive List Pattern

Parallel lists for performance and organization:

```ts
export let Person = co.map({
	notes: co.list(Note), // Active notes
	inactiveNotes: co.list(Note).optional(), // Deleted/archived notes
	reminders: co.list(Reminder),
	inactiveReminders: co.list(Reminder).optional(),
})

export let UserAccountRoot = co.map({
	people: co.list(Person),
	inactivePeople: co.list(Person).optional(),
})
```

**Why separate lists?**

1. **Performance** - UI only loads active items
2. **Organization** - Clear separation of active vs deleted
3. **Sync efficiency** - Inactive items don't sync unless requested

## Account Schema

```ts
export let UserProfile = co.profile({
	name: z.string(),
})

export let UserAccountRoot = co.map({
	people: co.list(Person),
	inactivePeople: co.list(Person).optional(),
	notificationSettings: NotificationSettings.optional(),
	language: z.enum(["de", "en"]).optional(),
	assistant: Assistant.optional(),
	migrationVersion: z.number().optional(),
})

export let UserAccount = co
	.account({
		profile: UserProfile,
		root: UserAccountRoot,
	})
	.withMigration(async account => {
		initializeRootIfUndefined(account)
		initializeProfileIfUndefined(account)
		await runMigrations(account)
	})
```

**Why `co.profile()`?** Profiles can be made public so collaborators see each other's names.

## Server Account

For server-side workers that don't need user data structure:

```ts
export let ServerAccount = co.account({
	profile: co.map({ name: z.string() }),
	root: co.map({}),
})
```

## Type Extraction

Get TypeScript types from schemas:

```ts
import { co, type Loaded, type ResolveQuery } from "jazz-tools"

// Loaded type with specific query
let resolve = {
	avatar: true,
	notes: { $each: true },
} as const satisfies ResolveQuery<typeof Person>

type LoadedPerson = co.loaded<typeof Person, typeof resolve>

// Create parameters
type NoteData = Parameters<typeof Note.create>[0]

// Return types with internal ref
type NoteCreated = {
	_ref: co.loaded<typeof Note>
	operation: "create"
	noteID: string
	current: NoteData
}
```

### `Loaded<>` vs `co.loaded<>`

Two different type helpers for different use cases:

```ts
import { type Loaded } from "jazz-tools"
import { co } from "jazz-tools"

// Loaded<> - account/worker instances from startWorker
// Use for function parameters that accept a worker
type WorkerAccount = Loaded<typeof UserAccount>

function createTool(worker: Loaded<typeof UserAccount>) {
	// worker is fully loaded, can access worker.root, etc.
}

// co.loaded<> - entities with specific resolve queries
// Use when you need to express which nested fields are loaded
let personResolve = { notes: { $each: true } } as const
type LoadedPerson = co.loaded<typeof Person, typeof personResolve>

// Without second arg, assumes no nested resolution
type BasicPerson = co.loaded<typeof Person>
```

**When to use which:**

| Type                                       | Use Case                                      |
| ------------------------------------------ | --------------------------------------------- |
| `Loaded<typeof UserAccount>`               | Worker parameters, server-side account access |
| `co.loaded<typeof Person>`                 | Entity with no nested loading specified       |
| `co.loaded<typeof Person, typeof resolve>` | Entity with specific nested fields loaded     |

## Initialization Pattern

Initialize new accounts in migration:

```ts
function initializeRootIfUndefined(account) {
	if (account.root === undefined) {
		let deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

		account.$jazz.set(
			"root",
			UserAccountRoot.create({
				people: co.list(Person).create([]),
				inactivePeople: co.list(Person).create([]),
				notificationSettings: NotificationSettings.create({
					version: 1,
					timezone: deviceTimezone,
					notificationTime: "12:00",
					pushDevices: [],
				}),
				language: navigator.language.startsWith("de") ? "de" : "en",
				migrationVersion: 1,
			}),
		)
	}
}
```

## Migration Pattern

```ts
export let UserAccount = co
	.account({ profile: UserProfile, root: UserAccountRoot })
	.withMigration(async account => {
		initializeRootIfUndefined(account)
		initializeProfileIfUndefined(account)

		let { root } = await account.$jazz.ensureLoaded({
			resolve: { root: true },
		})

		if (!root.migrationVersion || root.migrationVersion < 1) {
			await runMigrationV1(account)
			root.$jazz.set("migrationVersion", 1)
		}

		if (root.migrationVersion < 2) {
			await runMigrationV2(account)
			root.$jazz.set("migrationVersion", 2)
		}
	})

async function runMigrationV1(account) {
	let { root } = await account.$jazz.ensureLoaded({
		resolve: {
			root: {
				people: { $each: { reminders: true, notes: true } },
			},
		},
	})

	// Add inactivePeople list
	if (!root.inactivePeople) {
		root.$jazz.set("inactivePeople", co.list(Person).create([]))
	}

	// Add inactive sublists to each person
	for (let person of root.people.values()) {
		if (!person) continue
		if (!person.inactiveReminders) {
			person.$jazz.set(
				"inactiveReminders",
				co.list(Reminder).create([], person.$jazz.owner),
			)
		}
		if (!person.inactiveNotes) {
			person.$jazz.set(
				"inactiveNotes",
				co.list(Note).create([], person.$jazz.owner),
			)
		}
	}
}
```

## Helper Functions

Define helpers alongside schemas:

```ts
export function isDeleted(item: {
	deletedAt?: Date
	permanentlyDeletedAt?: Date
}): boolean {
	return item.permanentlyDeletedAt !== undefined || item.deletedAt !== undefined
}

export function isPermanentlyDeleted(item: {
	permanentlyDeletedAt?: Date
}): boolean {
	return item.permanentlyDeletedAt !== undefined
}

export function sortByCreatedAt<
	T extends { createdAt?: Date; $jazz: { createdAt: number } },
>(arr: T[]): T[] {
	return arr.sort((a, b) => {
		let aTime = (a.createdAt || new Date(a.$jazz.createdAt)).getTime()
		let bTime = (b.createdAt || new Date(b.$jazz.createdAt)).getTime()
		return bTime - aTime
	})
}
```

## Lazy List Initialization

Optional lists may not exist on older data. Initialize on-demand during operations:

```ts
async function addNote(personId: string, noteData: NoteData) {
	let person = await Person.load(personId, {
		resolve: { notes: true, inactiveNotes: true },
	})

	// Initialize if missing (handles pre-migration data)
	if (!person.inactiveNotes) {
		person.$jazz.set(
			"inactiveNotes",
			co.list(Note).create([], person.$jazz.owner), // Same owner!
		)
	}

	// Now safe to use
	let note = Note.create({ ...noteData }, person.$jazz.owner)
	person.notes.$jazz.push(note)
}
```

**Why same owner?** Nested data must share the owner for collaboration to work. Always pass `person.$jazz.owner` when creating nested items.

## Common Mistakes

1. **Missing version field** - Can't migrate later
2. **Using `$jazz.createdAt` for display** - Wrong after migrations/imports
3. **Single list for active + deleted** - Performance and sync issues
4. **Nested lists without matching owner** - Collaboration breaks
5. **Using `z.array()` for large collections** - Sync is all-or-nothing
6. **Not initializing optional lists** - Crashes on `.push()` if undefined
