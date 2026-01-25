# Plan: Implement Jazz 0.20 Deletion API

Replace soft-delete-only pattern with actual `deleteCoValues()`. Move deleted items to inactive lists, then permanently delete after 30 days via background cleanup.

## Files to Create

### 1. `src/lib/delete-covalue.ts`

- [x] `permanentlyDeleteDocument(doc)` - deletes doc with nested content, assets, cursors
- [x] `permanentlyDeleteSpace(space)` - deletes space and all its documents
- [x] `permanentlyDeleteTheme(theme)` - deletes theme with assets

### 2. `src/lib/use-cleanup-deleted.ts`

- [x] Move docs with `deletedAt` from `documents` → `inactiveDocuments`
- [x] Permanently delete items in `inactiveDocuments` where `deletedAt` > 30 days
- [x] Same pattern for spaces (`spaces` → `inactiveSpaces`)
- [x] Runs on app load, non-blocking

## Files to Modify

### 3. `src/schema/index.ts`

- [x] Remove `permanentlyDeletedAt` from Document
- [x] Add `inactiveSpaces: co.optional(co.list(Space))` to UserRoot
- [x] Initialize `inactiveSpaces` and `inactiveDocuments` in migration

### 4. `src/lib/documents.ts`

- [x] Update `permanentlyDeletePersonalDocument` to call `deleteCoValues`
- [x] Remove from list before deletion
- [x] Remove `permanentlyDeletedAt` logic

### 5. `src/lib/spaces.ts`

- [x] `deleteSpace` stays as soft delete (sets `deletedAt`)
- [x] Add `permanentlyDeleteSpace` for immediate deletion

### 6. `src/components/sidebar-document-list.tsx`

- [x] Update `handlePermanentDelete` to use new deletion function
- [x] Remove `permanentlyDeletedAt` references

### 7. `src/routes/spaces.$spaceId.settings.tsx`

- [x] Update space deletion to call `permanentlyDeleteSpace`
- [x] Remove from spaces list before deletion

### 8. Remove `permanentlyDeletedAt` references

- [x] `src/lib/backup.tsx`
- [x] `src/routes/index.tsx`
- [x] `src/routes/spaces.$spaceId.index.tsx`
- [x] `src/routes/spaces.$spaceId.doc.$id.index.tsx`
- [x] `src/routes/doc.$id.index.tsx`
- [x] `src/lib/doc-loader.ts`

### 9. Wire up cleanup hook

- [x] Add `useCleanupDeleted()` in `src/main.tsx`

### 10. Update tests

- [x] Tests pass (89 tests across documents.test.ts and spaces.test.ts)
