# Folder Support Feature

## Overview

Add folder organization via frontmatter `path` field with folder-grouped UI in sidebar.

## Decisions Made

1. **Path storage**: frontmatter `path: Daily Notes/2025` (no leading slash required)
2. **Root docs**: stay in flat list, folders appear as expandable sections in list
3. **View modes**: "folders" (default, grouped) vs "flat" (all docs with path badge)
4. **Collapse state**: zustand + persist per device
5. **Folders are virtual**: only exist when docs have that path

## Implementation Plan

### Phase 1: Core Infrastructure (done)

- [x] Add zustand with persist (`src/lib/folder-store.ts`)
- [x] Add `path` to frontmatter interface
- [x] Add `getPath()` helper function

### Phase 2: Import/Export Path Preservation (done)

- [x] **Import folders**: when importing a directory, set `path` from folder structure
  - `Daily Notes/2025/note.md` → `path: Daily Notes/2025`
  - Same for zip files with nested folders
- [x] **Export with folders**: export creates folder structure matching paths
  - `path: Daily Notes/2025` → `Daily Notes/2025/note.md` in zip
  - Assets go in `assets/` at root with relative paths

### Phase 3: Sidebar UI (done)

- [x] Add "flat/folders" toggle button next to filters
- [x] Refactor `DocumentList` to support folder grouping:
  - Group docs by path
  - Root docs (no path) listed first
  - Folders sorted alphabetically after root docs
- [x] Add `FolderRow` component:
  - Chevron icon + folder name + doc count
  - Click to expand/collapse
  - Nested indentation for sub-paths
- [x] Add path badge in flat view mode

### Phase 4: Editor UX

- [ ] Path autocomplete in frontmatter
- [x] Move to folder context menu action with autocomplete dialog
- [x] Create new folder from move dialog input

## Data Model

```yaml
---
title: My Note
path: Daily Notes/2025
---
```

Path normalization:

- No leading/trailing slashes
- Segments separated by `/`
- Empty string = root (no path)

## UI Mockup

```
Alkalye                          [+] New
─────────────────────────────────────────
[Search...]                      [Filters]
─────────────────────────────────────────
Today       My root note
Yesterday   Another note
─────────────────────────────────────────
▼ Daily Notes                        (12)
  ▼ 2025                              (5)
      Today    January notes
      Yesterday December recap
  ▶ 2024                              (7)
▶ Projects                            (3)
```

Flat view shows path as badge:

```
Today       My note              Daily Notes/2025
Yesterday   Another note         Projects
```

## Open Questions

1. Export assets: per-folder `assets/` or single root `assets/`?
   → **Decision**: single root `assets/` for simplicity
2. Should sub-folders be collapsible independently?
   → **Decision**: yes, each path segment is collapsible
3. What if path has special characters?
   → Normalize on read, allow unicode but strip `/` from segments

---

# Knowledge Base Features

## Overview

Add wiki-style linking between documents:

- `[[doc_id]]` syntax stored in markdown
- Titles displayed via editor decorations (hydration)
- Backlinks tracked in frontmatter as comma-separated IDs
- Real-time background sync of backlinks

## Decisions Made

1. **Storage format**: `[[doc_id]]` in raw markdown, display title via decoration
2. **Backlinks format**: `backlinks: id1, id2, id3` in frontmatter, display as titles
3. **Navigation**: click = navigate, ctrl+click = new tab, right-click = context menu
4. **Broken links**: red underline for nonexistent docs
5. **Create new**: offer to create new doc when no match in autocomplete
6. **Access control**: only link to docs with write access (so backlinks can be updated)
7. **Sync timing**: real-time background, debounced ~1-2s, non-blocking

## Implementation Plan

### Step 1: Frontmatter Utilities for Backlinks

**Files:** `src/editor/frontmatter.ts`

**Tasks:**

- [ ] Add `getBacklinks(content): string[]` - parse backlinks from frontmatter
- [ ] Add `setBacklinks(content, ids: string[]): string` - update backlinks
- [ ] Add `addBacklink(content, id): string` - append single backlink
- [ ] Add `removeBacklink(content, id): string` - remove single backlink

**Test:** manually verify frontmatter parsing/updating

---

### Step 2: WikiLink Parser & Types

**Files:** `src/editor/wikilink-parser.ts`

**Tasks:**

- [ ] Regex to find all `[[doc_id]]` in content
- [ ] Extract doc IDs from matches
- [ ] Type definitions: `WikiLink = { id: string; from: number; to: number }`
- [ ] Function `parseWikiLinks(content): WikiLink[]`

**Test:** parse sample markdown with multiple links

---

### Step 3: Document Title Resolution

**Files:** `src/lib/doc-resolver.ts`

**Tasks:**

- [ ] Create hook/utility to resolve doc ID → title
- [ ] Cache resolved titles (in-memory)
- [ ] Handle missing/deleted docs (return null)
- [ ] Check write access for docs (for autocomplete filtering)

**Test:** resolve a few doc IDs, verify caching

---

### Step 4: WikiLink Decorations (Display as Title)

**Files:** `src/editor/wikilink-decorations.ts`

**Tasks:**

- [ ] CodeMirror ViewPlugin to find `[[doc_id]]` patterns
- [ ] Replace widget decoration showing title instead of ID
- [ ] Style: distinct from regular text
- [ ] Broken link style: red underline for nonexistent docs
- [ ] Click handler: navigate to doc
- [ ] Ctrl+click: open in new tab
- [ ] Integrate into `extensions.ts`

**Test:** open doc with `[[...]]` links, verify title display

---

### Step 5: WikiLink Context Menu

**CANCELLED** - Using floating action instead (Step 7)

---

### Step 6: WikiLink Autocomplete

**Files:** `src/editor/wikilink-autocomplete.ts`

**Tasks:**

- [ ] Trigger autocomplete on `[[` typed
- [ ] Fetch all accessible documents (write access only)
- [ ] Filter by typed text (fuzzy match on title)
- [ ] Display: document title
- [ ] On select: insert `[[doc_id]]`
- [ ] "Create new document" option when no match
- [ ] Integrate into editor extensions

**Test:** type `[[`, verify doc list appears, select inserts ID

---

### Step 7: Floating Action for WikiLinks (done)

**Files:** `src/components/floating-actions.tsx`

**Tasks:**

- [x] Detect cursor inside `[[...]]` pattern
- [x] Show floating action button: open linked doc
- [x] Extend `EditorContext` interface with wikilink detection
- [x] Extend `getContext()` to detect wikilink ranges

**Test:** place cursor in `[[doc]]`, verify action appears

---

### Step 8: Backlink Sync Service (done)

**Files:** `src/lib/backlink-sync.ts`

**Tasks:**

- [x] On document content change (debounced ~1-2s):
  - Parse all `[[doc_id]]` links in current doc
  - For each linked doc: add current doc ID to its backlinks
  - For previously-linked docs no longer linked: remove backlink
- [x] Track "previous links" to detect removals
- [x] Background async, non-blocking
- [x] Skip read-only docs

**Test:** add link to doc B, verify B's frontmatter updates

---

### Step 9: Backlink Display in Frontmatter (done)

**Files:** `src/editor/backlink-decorations.ts`

**Tasks:**

- [x] When rendering frontmatter `backlinks: id1, id2, id3`
- [x] Display as `backlinks: Title 1, Title 2, Title 3` via decoration
- [x] Keep raw storage as IDs
- [x] Make backlinks clickable (navigate to doc)

**Test:** view doc with backlinks, verify titles display

---

### Step 10: Marked Extension for Preview/Slideshow

**Files:** `src/lib/marked-wikilink.ts`

**Tasks:**

- [ ] Create marked extension with tokenizer for `[[doc_id]]`
- [ ] Renderer outputs `<a href="/doc/{id}/preview">Title</a>` (links to preview, not editor)
- [ ] Resolve doc titles (use doc-resolver)
- [ ] Handle broken links (different styling or tooltip)
- [ ] Integrate into preview page (`doc.$id.preview.tsx`)
- [ ] Integrate into slideshow if applicable

**Test:** preview doc with wikilinks, verify clickable links to preview pages

---

### Step 11: Integration & Polish

**Tasks:**

- [ ] Wire all extensions into `editor.tsx`
- [ ] Add keyboard shortcut for inserting link (`Mod-Shift-K`?)
- [ ] Handle edge cases: self-linking, circular links, deleted docs
- [ ] Performance testing with many docs
- [ ] Mobile touch handling for long-tap context menu

**Test:** full flow - create link, navigate, verify backlink, delete link

---

## File Structure

```
src/editor/
  wikilink-parser.ts        # regex parsing, types
  wikilink-decorations.ts   # display titles, click handling
  wikilink-autocomplete.ts  # [[ trigger autocomplete
  wikilink-context-menu.ts  # right-click menu

src/lib/
  doc-resolver.ts           # ID → title resolution + caching
  backlink-sync.ts          # background backlink updates
  marked-wikilink.ts        # marked extension for preview/slideshow

src/editor/frontmatter.ts   # extend with backlink utils
src/components/floating-actions.tsx  # extend context detection
```

## Deferred to v2

- Backlink panel/sidebar UI
- Graph view of connections
- Search by linked docs
- Transclusion (`![[doc_id]]` to embed content)
