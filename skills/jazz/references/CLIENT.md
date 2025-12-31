# Jazz Client Patterns

How to use Jazz in React for real-time, offline-first UIs.

## Why This Matters

Jazz gives you automatic real-time updates - when data changes (locally or from sync), your components re-render. But you must handle loading states correctly or your app will crash on undefined data.

## React Provider Setup

Wrap your app with Jazz + your auth provider:

```tsx
import { ClerkProvider } from "@clerk/clerk-react"
import { JazzReactProviderWithClerk, useAccount } from "jazz-tools/react"

function App() {
	return (
		<ClerkProvider publishableKey={CLERK_KEY}>
			<JazzWithClerk />
		</ClerkProvider>
	)
}

function JazzWithClerk() {
	let clerk = useClerk()

	return (
		<JazzReactProviderWithClerk
			clerk={clerk}
			AccountSchema={UserAccount}
			sync={{ peer: "wss://cloud.jazz.tools", when: "signedUp" }}
			fallback={<SplashScreen />}
		>
			<RouterWithJazz />
		</JazzReactProviderWithClerk>
	)
}

function RouterWithJazz() {
	let me = useAccount(UserAccount, { resolve: { root: true } })

	if (me.$jazz.loadingState === "loading") return <SplashScreen />

	let contextMe = me.$isLoaded ? me : null
	return <RouterProvider router={router} context={{ me: contextMe }} />
}
```

**Why `when: "signedUp"`?** Data only syncs after auth. Anonymous users get local-only storage until they sign up.

## Loading with useCoState

Use when you have an entity ID:

```tsx
import { useCoState } from "jazz-tools/react"

function PersonDetail({ personId }: { personId: string }) {
	let person = useCoState(Person, personId, {
		resolve: {
			avatar: true,
			notes: { $each: true },
		},
	})

	// ALWAYS check loading state first
	if (!person.$isLoaded) {
		switch (person.$jazz.loadingState) {
			case "loading":
				return <Loading />
			case "unauthorized":
				return <AccessDenied /> // User lost access (revoked share)
			case "unavailable":
				return <NotFound /> // Doesn't exist
		}
	}

	// Now TypeScript knows all resolved fields are available
	return (
		<div>
			<h1>{person.name}</h1>
			{person.notes.map(note => (
				<NoteCard key={note.$jazz.id} note={note} />
			))}
		</div>
	)
}
```

**Why check all states?** Shared items can become inaccessible when collaborators revoke access. Handle gracefully.

## Loading with useAccount

Use for the current user's data:

```tsx
function PeopleList() {
	let me = useAccount(UserAccount, {
		resolve: {
			root: {
				people: {
					$each: {
						avatar: true,
						reminders: { $each: true },
						$onError: "catch", // Don't crash on inaccessible shared people
					},
				},
			},
		},
	})

	if (me.$jazz.loadingState === "loading") return <Loading />
	if (!me.$isLoaded) return <SignIn />

	return (
		<ul>
			{me.root.people.map(person => {
				// Filter out null and inaccessible items
				if (!person?.$isLoaded) return null
				if (person.permanentlyDeletedAt) return null

				return <PersonCard key={person.$jazz.id} person={person} />
			})}
		</ul>
	)
}
```

**Why `$onError: "catch"`?** Your people list may contain shared items. If access is revoked, without this flag the entire load fails. With it, inaccessible items return `$isLoaded: false`.

## Resolve Queries Explained

Control how deep to load with resolve queries:

```ts
import { type ResolveQuery } from "jazz-tools"

// Just the person, nested refs are IDs only
{
}

// Load person + avatar, but notes are just IDs
{
	avatar: true
}

// Load person + each note's content
{
	notes: {
		$each: true
	}
}

// Deep nesting
{
	notes: {
		$each: {
			images: {
				$each: true
			}
		}
	}
}

// Type-safe query definition
let personResolve = {
	avatar: true,
	notes: { $each: true },
	reminders: { $each: true },
} as const satisfies ResolveQuery<typeof Person>

// Extract the loaded type
type LoadedPerson = co.loaded<typeof Person, typeof personResolve>
```

**Why `as const satisfies`?** Gives you type inference while ensuring the query matches the schema.

## Route Loaders (SSR/Prefetch)

Load data before rendering:

```ts
export let Route = createFileRoute("/_app/people/$personID")({
  loader: async ({ params }) => {
    let person = await Person.load(params.personID, { resolve })

    if (!person.$isLoaded) {
      return {
        person: null,
        loadingState: person.$jazz.loadingState,
      }
    }

    return { person, loadingState: null }
  },
  component: PersonScreen,
})

function PersonScreen() {
  let data = Route.useLoaderData()

  // Subscribe for live updates
  let subscribedPerson = useCoState(Person, data.person?.$jazz.id, { resolve })

  // Use subscribed data if loaded, fall back to loader data
  let person = subscribedPerson.$isLoaded ? subscribedPerson : data.person

  if (!person) {
    if (data.loadingState === "unauthorized") return <AccessDenied />
    return <NotFound />
  }

  return <PersonDetails person={person} />
}
```

**Why both loader and useCoState?** Loader gives instant render. useCoState subscribes for real-time updates after initial load.

## Loader + Subscription Fallback Pattern

The pattern `subscribedData.$isLoaded ? subscribedData : loaderData` is essential for avoiding flicker:

```tsx
function PersonScreen() {
	let data = Route.useLoaderData()
	let subscribedPerson = useCoState(Person, data.person?.$jazz.id, { resolve })

	// Fallback chain: subscription → loader → null
	let person = subscribedPerson.$isLoaded ? subscribedPerson : data.person

	// Handle loading states from subscription (not loader)
	if (
		!subscribedPerson.$isLoaded &&
		subscribedPerson.$jazz.loadingState !== "loading"
	) {
		if (subscribedPerson.$jazz.loadingState === "unauthorized") {
			return <AccessDenied />
		}
		return <NotFound />
	}

	if (!person) return <Loading />

	return <PersonDetails person={person} />
}
```

**Why this order?**

1. Loader data appears instantly (no loading spinner on navigation)
2. Subscription takes over once loaded (enables real-time updates)
3. If subscription fails (unauthorized/unavailable), show appropriate error

## Mutations in Components

Keep components focused on UI, extract handlers:

```tsx
function NoteListItem({ note, person }) {
	let [dialogOpen, setDialogOpen] = useState(false)

	return (
		<Button
			onClick={() => {
				setDialogOpen(false)
				handleNoteEdit(data, person.$jazz.id, note.$jazz.id)
			}}
		>
			Edit
		</Button>
	)
}

// Handler at module scope
async function handleNoteEdit(
	data: NoteFormData,
	personId: string,
	noteId: string,
) {
	let result = await tryCatch(updateNote(noteId, data, { personId }))

	if (!result.ok) {
		toast.error(result.error.message)
		return
	}

	toast.success("Note updated", {
		action: {
			label: "Undo",
			onClick: () => undoNoteUpdate(result.data),
		},
	})
}
```

## Undo Pattern

Capture previous state before mutations to enable undo:

```ts
type NoteUpdated = {
	_ref: co.loaded<typeof Note>
	operation: "update"
	noteID: string
	current: NoteData
	previous: NoteData // Captured before mutation
}

async function updateNote(noteId: string, updates: Partial<NoteData>): Promise<NoteUpdated> {
	let note = await Note.load(noteId)
	if (!note.$isLoaded) throw new Error("Note not found")

	// Capture before mutation
	let previous = {
		title: note.title,
		content: note.content,
		pinned: note.pinned,
		updatedAt: note.updatedAt,
	}

	// Apply updates
	if (updates.title !== undefined) note.$jazz.set("title", updates.title)
	if (updates.content !== undefined) note.$jazz.set("content", updates.content)
	note.$jazz.set("updatedAt", new Date())

	return {
		operation: "update",
		noteID: noteId,
		current: { title: note.title, content: note.content, ... },
		previous,
		_ref: note,
	}
}

// Undo by applying previous values
async function undoNoteUpdate(result: NoteUpdated) {
	let note = result._ref
	note.$jazz.set("title", result.previous.title)
	note.$jazz.set("content", result.previous.content)
	note.$jazz.set("updatedAt", result.previous.updatedAt)
}
```

**Why return `_ref`?** Allows undo without reloading the entity.

## Custom Hooks for Data Access

Encapsulate query logic:

```ts
function usePersonNotes(personId: string, searchQuery: string) {
	let person = useCoState(Person, personId, {
		resolve: {
			notes: { $each: true },
			inactiveNotes: { $each: true },
		},
	})

	if (!person.$isLoaded) return { active: [], deleted: [] }

	let allNotes = [
		...person.notes.filter(n => n?.$isLoaded && !n.permanentlyDeletedAt),
		...(person.inactiveNotes?.filter(
			n => n?.$isLoaded && !n.permanentlyDeletedAt,
		) ?? []),
	]

	let filtered = searchQuery
		? allNotes.filter(n =>
				n.content.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: allNotes

	let active = filtered.filter(n => !n.deletedAt)
	let deleted = filtered.filter(n => n.deletedAt && !n.permanentlyDeletedAt)

	return { active: sortByCreatedAt(active), deleted: sortByDeletedAt(deleted) }
}
```

## Images

```tsx
import { createImage } from "jazz-tools/media"
import { Image as JazzImage } from "jazz-tools/react"

// Upload
async function uploadAvatar(file: File, person: LoadedPerson) {
	let avatar = await createImage(file, {
		owner: person.$jazz.owner,
		maxSize: 2048,
		placeholder: "blur",
		progressive: true,
	})
	person.$jazz.set("avatar", avatar)
}

// Display
function Avatar({ person }: { person: LoadedPerson }) {
	if (!person.avatar) return <Placeholder />
	return <JazzImage image={person.avatar} className="rounded-full" />
}

// Remove - use $jazz.delete() for optional fields
function removeAvatar(person: LoadedPerson) {
	person.$jazz.delete("avatar")
}
```

## Deleting Optional Fields

Use `$jazz.delete()` to remove optional fields (sets to `undefined`):

```ts
// Remove optional field
person.$jazz.delete("avatar")
note.$jazz.delete("deletedAt") // Restore from soft-delete
note.$jazz.delete("images")
note.$jazz.delete("imageCount")

// vs setting to undefined explicitly (same effect)
person.$jazz.set("summary", undefined)
```

**When to use `$jazz.delete()` vs `$jazz.set(key, undefined)`:**

Both work identically. Use `$jazz.delete()` for clarity when "removing" something.

## Common Mistakes

1. **Accessing fields before checking `$isLoaded`** - Always guard with loading check
2. **Not handling all loading states** - `unauthorized` and `unavailable` need different UX
3. **Missing `$onError: "catch"`** on lists with shared items - One revoked item crashes the whole load
4. **Using `$jazz.createdAt` for display** - It's sync time, not user intent. Use your own fields.
