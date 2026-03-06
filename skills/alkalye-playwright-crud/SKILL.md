---
name: alkalye-playwright-crud
description: Run stable Playwright CRUD automation for Alkalye auth, documents, spaces, and collaboration invites. Use when implementing or validating user flows, generating reusable automation, or debugging selector stability.
compatibility: Requires Bun, Playwright Chromium, and local app runtime.
metadata:
  author: alkalye
  version: "0.2"
---

Alkalye is an offline-capable, local-first markdown editor and collaboration app built with Astro, React, and Jazz sync.

Use this skill to drive UI flows via stable `data-testid` selectors and JSON-returning helper functions.

Primary purpose: let the agent complete Alkalye tasks without manual UI clicking by writing and running one Playwright script that calls these helpers.

Helpers live in `helpers/` and are symlinked into `e2e/` for tests.

## Execution Model

- Prefer a single script execution for real tasks.
- Compose task scripts in `scripts/` using helper calls.
- Keep scripts deterministic and return JSON results.
- Use e2e specs as reference, but do not require interactive/manual steps.

Example flow for agents:

1. Create/choose one script file in `skills/alkalye-playwright-crud/scripts/`.
2. Import required helpers from `../helpers/*`.
3. Launch Playwright, run helper chain, print JSON.
4. Exit the browser context.

Script template: `scripts/EXAMPLE.md`

Runnable task runner: `scripts/run-task.ts`

## Run Task Script

Run with inline JSON:

```bash
bun run skills/alkalye-playwright-crud/scripts/run-task.ts '{"steps":[{"task":"auth.waitForEditorBoot"},{"task":"auth.createAccount"},{"task":"doc.create","args":{"title":"Script Doc","body":"hello"}},{"task":"doc.list","args":{"search":"Script Doc"}}]}'
```

Run with payload file:

```bash
bun run skills/alkalye-playwright-crud/scripts/run-task.ts --file skills/alkalye-playwright-crud/scripts/payload.json
```

## Helper Contract

- Every helper receives `page` plus args.
- Every helper returns JSON.
- Never use text selectors when a `data-testid` exists.

## Helper Files

- `helpers/auth-helpers.ts`
  - `waitForEditorBoot(page, { path? })`
  - `openSettings(page, { fromPath? })`
  - `createAccount(page, { openSettings? })`
  - `signOut(page, { openSettings? })`
  - `signIn(page, { passphrase, openSettings? })`
  - `getRecoveryPhrase(page)`

- `helpers/doc-helpers.ts`
  - `create(page, { title?, body?, content?, tags?, path?, spaceId? })`
  - `readById(page, { id, spaceId? })`
  - `updateById(page, { id, title?, body?, content?, tags?, path?, spaceId? })`
  - `list(page, { search?, spaceId? })`
  - `deleteById(page, { id, spaceId? })`

- `helpers/space-helpers.ts`
  - `createSpace(page, { name })`
  - `readSpaceById(page, { spaceId })`
  - `updateSpaceById(page, { spaceId, name })`
  - `listSpaces(page)`
  - `deleteSpaceById(page, { spaceId })`
  - `createSpaceInvite(page, { spaceId, role })`
  - `listSpaceInvites(page, { spaceId })`
  - `revokeSpaceInvite(page, { spaceId, inviteGroupId? })`
  - `acceptSpaceInvite(page, { link })`

- `helpers/document-collab-helpers.ts`
  - `createDocumentInvite(page, { docId, spaceId?, role })`
  - `listDocumentInvites(page, { docId, spaceId? })`
  - `revokeDocumentInvite(page, { docId, spaceId?, inviteGroupId? })`
  - `acceptDocumentInvite(page, { link })`

## Validation Commands

- `bun run test:e2e:auth`
- `bun run test:e2e:doc`
- `bun run test:e2e:spaces`
- `bun run test:e2e:doc-collab`

## Selector Source

- Selector contract: `src/lib/test-ids.ts`
