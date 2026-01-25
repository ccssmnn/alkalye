# Plan: Implement Jazz 0.20 Deletion API

Replace soft-delete-only pattern with actual `deleteCoValues()`. Move deleted items to inactive lists, then permanently delete after 30 days via background cleanup.

## Files to Create

### 1. `src/lib/delete-covalue.ts`

- [ ] `permanentlyDeleteDocument(doc)` - deletes doc with nested content, assets, cursors
- [ ] `permanentlyDeleteSpace(space)` - deletes space and all its documents
- [ ] `permanentlyDeleteTheme(theme)` - deletes theme with assets

### 2. `src/hooks/use-cleanup-deleted.ts`

- [ ] Move docs with `deletedAt` from `documents` → `inactiveDocuments`
- [ ] Permanently delete items in `inactiveDocuments` where `deletedAt` > 30 days
- [ ] Same pattern for spaces (`spaces` → `inactiveSpaces`)
- [ ] Runs on app load, non-blocking

## Files to Modify

### 3. `src/schema/index.ts`

- [ ] Remove `permanentlyDeletedAt` from Document
- [ ] Add `inactiveSpaces: co.optional(co.list(Space))` to UserRoot
- [ ] Initialize `inactiveSpaces` in migration

### 4. `src/lib/documents.ts`

- [ ] Update `permanentlyDeletePersonalDocument` to call `deleteCoValues`
- [ ] Remove from list before deletion
- [ ] Remove `permanentlyDeletedAt` logic

### 5. `src/lib/spaces.ts`

- [ ] Update `deleteSpace` to move to `inactiveSpaces` (soft delete)
- [ ] Add `permanentlyDeleteSpace` for immediate deletion

### 6. `src/components/sidebar-document-list.tsx`

- [ ] Update `handlePermanentDelete` to use new deletion function
- [ ] Remove `permanentlyDeletedAt` references

### 7. `src/routes/spaces.$spaceId.settings.tsx`

- [ ] Update space deletion to call `permanentlyDeleteSpace`
- [ ] Remove from spaces list before deletion

### 8. Remove `permanentlyDeletedAt` references

- [ ] `src/lib/backup.tsx`
- [ ] `src/routes/index.tsx`
- [ ] `src/routes/spaces.$spaceId.index.tsx`
- [ ] `src/routes/spaces.$spaceId.doc.$id.index.tsx`
- [ ] `src/routes/doc.$id.index.tsx`
- [ ] `src/lib/doc-loader.ts`

### 9. Wire up cleanup hook

- [ ] Add `useCleanupDeleted()` in app root

### 10. Update tests

- [ ] `src/lib/documents.test.ts`
- [ ] `src/lib/spaces.test.ts`
