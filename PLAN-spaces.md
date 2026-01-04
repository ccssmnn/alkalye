# Spaces Feature Plan

## Overview

Introduce Spaces - collaborative document collections with shared ownership. Each space has its own document list, collaboration settings, and optional filesystem sync.

## Key Decisions

- **Personal space**: Existing `UserRoot.documents` stays as-is, accessible at `/doc/$id`
- **Space docs**: New `Space` covalue with its own `documents` list, accessible at `/spaces/$spaceId/doc/$id`
- **Ownership**: Space group owns all docs/assets created within the space
- **Doc-level collab**: Additive - space members have base access, doc invites can grant more
- **Wikilinks**: Resolve globally by ID, but suggestions & backlink sync scoped to space
- **Public spaces**: Supported (everyone = reader)
- **Duplicate only**: No "move to space", only deep copy with new name

## Schema Changes

```ts
let Space = co.map({
	name: z.string(),
	avatar: co.optional(co.image()),
	documents: co.list(Document),
	createdAt: z.date(),
	updatedAt: z.date(),
	deletedAt: z.date().optional(),
})

let UserRoot = co.map({
	documents: co.list(Document), // personal space (unchanged)
	spaces: co.optional(co.list(Space)), // new
	inactiveDocuments: co.optional(co.list(Document)),
	settings: co.optional(Settings),
	migrationVersion: z.number().optional(),
})

let Document = co.map({
	// ... existing fields
	spaceId: z.string().optional(), // new - for redirect detection
})
```

## Route Structure

| Route                                                | Purpose                                       |
| ---------------------------------------------------- | --------------------------------------------- |
| `/doc/$id`                                           | Personal space doc (existing)                 |
| `/doc/$id/preview`                                   | Personal space preview (existing)             |
| `/doc/$id/slideshow`                                 | Personal space slideshow (existing)           |
| `/doc/$id/teleprompter`                              | Personal space teleprompter (existing)        |
| `/spaces/$spaceId/doc/$id`                           | Space doc editor                              |
| `/spaces/$spaceId/doc/$id/preview`                   | Space doc preview                             |
| `/spaces/$spaceId/doc/$id/slideshow`                 | Space doc slideshow                           |
| `/spaces/$spaceId/doc/$id/teleprompter`              | Space doc teleprompter                        |
| `/spaces/$spaceId/settings`                          | Space settings (name, collab, backup, delete) |
| `/invite#/space/{spaceId}/invite/{groupId}/{secret}` | Space invite acceptance                       |

## Redirect Logic

- `/doc/$docId` where `doc.spaceId` matches a space user is member of → redirect to `/spaces/$spaceId/doc/$docId`
- `/doc/$docId` where user is NOT member of space → stays at `/doc/$docId`, doc added to personal space (existing invite flow)
- `/spaces/$spaceId` → redirect to latest doc or create new
- `/spaces/$spaceId` where space deleted/unauthorized → error page

---

## Implementation Phases

### Phase 1: Schema & Basic Space CRUD

**Goal**: Create spaces, see them in a list, delete them.

**Tasks**:

1. Add `Space` schema with `name`, `documents`, `createdAt`, `updatedAt`, `deletedAt`
2. Add `spaces: co.optional(co.list(Space))` to `UserRoot`
3. Create helper functions: `createSpace(name)`, `deleteSpace(space)`
4. Add migration to initialize `spaces` list for existing users

**Testable**: Console/devtools - create space, verify in Jazz, delete space.

---

### Phase 2: Space Selector Dropdown

**Goal**: UI to switch between personal space and created spaces.

**Tasks**:

1. Create `SpaceSelector` dropdown component in left sidebar header
2. Show "Personal" + all spaces from `UserRoot.spaces` (alphabetical)
3. Store selected space in URL or React state (prep for routing)
4. Filter document list based on selected space
5. "New Space" button in dropdown opens modal

**Testable**: Switch between personal/spaces in dropdown, see different doc lists.

---

### Phase 3: Create Space Modal

**Goal**: Full space creation flow from UI.

**Tasks**:

1. Create `CreateSpaceDialog` component with name input
2. On submit: create Space with group, add to `UserRoot.spaces`
3. Auto-select newly created space in dropdown
4. Create welcome doc in new space

**Testable**: Create space via modal, see welcome doc, switch back to personal.

---

### Phase 4: Space Doc Routes

**Goal**: Navigate to space docs via `/spaces/$spaceId/doc/$id`.

**Tasks**:

1. Create route files:
   - `spaces.$spaceId.doc.$id.index.tsx`
   - `spaces.$spaceId.doc.$id.preview.tsx`
   - `spaces.$spaceId.doc.$id.slideshow.tsx`
   - `spaces.$spaceId.doc.$id.teleprompter.tsx`
2. Reuse existing editor/preview/slideshow/teleprompter components
3. Load space + doc, pass space context to sidebar
4. Update sidebar to show space-specific doc list

**Testable**: Open space doc via URL, see correct sidebar, navigate between space docs.

---

### Phase 5: Create Doc in Space

**Goal**: New doc button creates doc in currently selected space.

**Tasks**:

1. Update `makeCreateDocument` to accept optional space parameter
2. When in space context, create doc with space group as owner
3. Add `spaceId` field to doc on creation
4. Push doc to `space.documents` instead of `UserRoot.documents`

**Testable**: Create doc in space, verify it appears in space doc list, not personal.

---

### Phase 6: Space Index Route & Redirect

**Goal**: `/spaces/$spaceId` works, redirects from `/doc/$id` for space docs.

**Tasks**:

1. Create `spaces.$spaceId.index.tsx` - redirect to latest doc or create new
2. Add `spaceId` field to Document schema
3. In `/doc/$id` loader: check `doc.spaceId`, if user is space member → redirect
4. Handle deleted space case (error page)

**Testable**: Open `/spaces/$spaceId`, lands on doc. Open `/doc/$id` for space doc, redirects.

---

### Phase 7: Space Settings Page

**Goal**: View and edit space settings.

**Tasks**:

1. Create `spaces.$spaceId.settings.tsx` route
2. Show space name (editable by owner/admin)
3. Show member list with roles
4. Delete space button (owner only, with confirmation)
5. Disable controls based on user's role in space group

**Testable**: Open space settings, edit name, see members, delete space.

---

### Phase 8: Space Avatar

**Goal**: Upload and display space avatar.

**Tasks**:

1. Add `avatar: co.optional(co.image())` to Space schema
2. Add avatar upload in space settings
3. Show avatar in space selector dropdown
4. Fallback to initials if no avatar

**Testable**: Upload avatar, see it in dropdown and settings.

---

### Phase 9: Space Invites

**Goal**: Invite others to a space.

**Tasks**:

1. Create `SpaceShareDialog` component (similar to doc share dialog)
2. Support reader/writer/admin invite links
3. Create invite URL: `/invite#/space/{spaceId}/invite/{groupId}/{secret}`
4. Update `/invite` route to handle space invites
5. On accept: add space to user's `spaces` list, redirect to space

**Testable**: Generate space invite, accept in another account, see space in their list.

---

### Phase 10: Public Spaces

**Goal**: Make spaces publicly readable.

**Tasks**:

1. Add public toggle in space share dialog
2. `spaceGroup.makePublic()` / `spaceGroup.removeMember("everyone")`
3. Public space URL works without invite

**Testable**: Make space public, open in incognito, can read docs.

---

### Phase 11: Wikilink Scoping

**Goal**: Wikilink suggestions and backlink sync respect space boundaries.

**Tasks**:

1. Update wikilink autocomplete to filter by current space/personal
2. Update backlink sync to only update links within same space
3. Wikilink resolution (by ID) unchanged - still works globally

**Testable**: In space doc, wikilink suggestions only show space docs. Rename doc, only space backlinks update.

---

### Phase 12: Duplicate to Space

**Goal**: Copy a doc to another space or personal.

**Tasks**:

1. Create `DuplicateDocDialog` component
2. Show destination picker: Personal + all spaces
3. Prompt for new name (default: "Original (copy)")
4. Deep copy: new doc, new content covalue, new assets
5. Show progress indicator for asset copying
6. Add to file menu in right sidebar

**Testable**: Duplicate doc to another space, verify independent copy with assets.

---

### Phase 13: Space Error Pages

**Goal**: Proper error states for space routes.

**Tasks**:

1. Create `SpaceNotFound` component
2. Create `SpaceUnauthorized` component
3. Use in space routes when space doesn't exist or user lacks access

**Testable**: Open invalid space URL, see error page. Open space you're not member of, see unauthorized.

---

### Phase 14: Per-Space Filesystem Backup

**Goal**: Sync space docs to a local folder.

**Tasks**:

1. Add backup path setting in space settings (local storage, not Jazz)
2. Extend backup sync to handle space-specific paths
3. Personal space backup remains in global settings

**Testable**: Set backup path for space, verify docs sync to that folder.

---

## Open Questions (Resolved)

- ~~Doc in multiple spaces?~~ No, one space owns doc.
- ~~Move vs duplicate?~~ Duplicate only.
- ~~Wikilinks across spaces?~~ No, scoped to space.
- ~~Personal space URL?~~ Stays at `/doc/$id`.

## Future Considerations (Out of Scope)

- Cross-space search
- Space folders/organization
- Space templates
- Notifications for space activity
