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
