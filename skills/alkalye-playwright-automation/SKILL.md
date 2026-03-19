---
name: alkalye-playwright-automation
description: Drive Alkalye via browser automation (Playwright) for auth, documents, spaces, and collaboration. Manage documents, share with others, and collaborate — all through the UI.
compatibility: Requires Bun and Playwright Chromium.
metadata:
  author: alkalye
  version: "0.3"
---

## What is Alkalye?

Alkalye is an offline-capable collaborative document editor. This skill lets an agent drive the full Alkalye UI via Playwright — creating accounts, managing documents and spaces, sharing, and collaborating.

## Pointing at a target

Set `baseURL` in the payload or via environment variable. The default is a local preview server.

```bash
# Production
export PLAYWRIGHT_BASE_URL=https://alkalye.com

# Local preview (default)
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173

# Local dev server
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321
```

For local targets, start the app first (`bun run preview` or `bun run dev`).

## Running tasks

Use `scripts/run-task.ts` — a JSON step runner that chains helper calls:

```bash
# Inline JSON
bun run skills/alkalye-playwright-automation/scripts/run-task.ts '{"baseURL":"https://alkalye.com","steps":[{"task":"auth.waitForEditorBoot"},{"task":"auth.createAccount"},{"task":"doc.create","args":{"title":"Hello","body":"from Playwright"}},{"task":"doc.list"}]}'

# From a payload file
bun run skills/alkalye-playwright-automation/scripts/run-task.ts --file payload.json
```

Output is JSON: `{ ok: true, baseURL, steps: [{ task, result }] }`.

Payload options:

| Field      | Default                     | Description                    |
| ---------- | --------------------------- | ------------------------------ |
| `baseURL`  | `$PLAYWRIGHT_BASE_URL` or `http://127.0.0.1:4173` | Target Alkalye instance |
| `headless` | `true`                      | Run browser headlessly         |
| `steps`    | (required)                  | Array of `{ task, args? }`     |

## Available tasks

### Auth

| Task                      | Args                                | Returns                |
| ------------------------- | ----------------------------------- | ---------------------- |
| `auth.waitForEditorBoot`  | `path?`                             | boot confirmation      |
| `auth.openSettings`       | `fromPath?`                         | —                      |
| `auth.createAccount`      | `openSettings?`                     | passphrase, account ID |
| `auth.signIn`             | `passphrase`, `openSettings?`       | account ID             |
| `auth.signOut`            | `openSettings?`                     | —                      |

### Documents

| Task             | Args                                              | Returns          |
| ---------------- | ------------------------------------------------- | ---------------- |
| `doc.create`     | `title?`, `body?`, `content?`, `tags?`, `path?`, `spaceId?` | doc metadata |
| `doc.readById`   | `id`, `spaceId?`                                  | doc with content |
| `doc.updateById` | `id`, `title?`, `body?`, `content?`, `tags?`, `path?`, `spaceId?` | updated doc |
| `doc.list`       | `search?`, `spaceId?`                             | doc array        |
| `doc.deleteById` | `id`, `spaceId?`                                  | confirmation     |

### Spaces

| Task                 | Args                        | Returns             |
| -------------------- | --------------------------- | ------------------- |
| `space.create`       | `name`                      | space metadata      |
| `space.readById`     | `spaceId`                   | space with members  |
| `space.updateById`   | `spaceId`, `name`           | updated space       |
| `space.list`         | —                           | space array         |
| `space.deleteById`   | `spaceId`                   | confirmation        |
| `space.createInvite` | `spaceId`, `role`           | invite link         |
| `space.listInvites`  | `spaceId`                   | invite array        |
| `space.revokeInvite` | `spaceId`, `inviteGroupId?` | confirmation        |
| `space.acceptInvite` | `link`                      | space ID            |

### Document collaboration

| Task                       | Args                                   | Returns        |
| -------------------------- | -------------------------------------- | -------------- |
| `collab.doc.createInvite`  | `docId`, `spaceId?`, `role`            | invite link    |
| `collab.doc.listInvites`   | `docId`, `spaceId?`                    | invite array   |
| `collab.doc.revokeInvite`  | `docId`, `spaceId?`, `inviteGroupId?`  | confirmation   |
| `collab.doc.acceptInvite`  | `link`                                 | doc ID (creates new account) |

### Invites

| Task             | Args   | Returns                    |
| ---------------- | ------ | -------------------------- |
| `invite.accept`  | `link` | doc/space ID + redirect URL |

`invite.accept` accepts a doc or space invite as the **currently logged-in user**. Use this for collaboration flows where you've already created an account via `auth.createAccount` or `auth.signIn`. The older `collab.doc.acceptInvite` and `space.acceptInvite` tasks create a fresh account in a new browser context — use `invite.accept` instead for multi-step workflows.

### Public access

| Task                 | Args                  | Returns                    |
| -------------------- | --------------------- | -------------------------- |
| `doc.public.enable`  | `docId`, `spaceId?`   | public link                |
| `doc.public.disable` | `docId`, `spaceId?`   | confirmation               |
| `doc.public.link`    | `docId`, `spaceId?`   | public link (or null)      |

## Writing custom scripts

For flows beyond what `run-task.ts` covers, write a script that imports helpers directly:

```ts
import { chromium } from "@playwright/test"
import { createAccount, waitForEditorBoot } from "../helpers/auth-helpers"
import { create, list } from "../helpers/doc-helpers"

async function run() {
	let browser = await chromium.launch()
	let context = await browser.newContext({
		baseURL: "https://alkalye.com",
		permissions: ["clipboard-read", "clipboard-write"],
	})
	let page = await context.newPage()

	await waitForEditorBoot(page)
	await createAccount(page)
	let created = await create(page, { title: "Automated Doc", body: "Hello" })
	let listed = await list(page, { search: "Automated Doc" })

	console.log(JSON.stringify({ ok: true, created, listed }, null, 2))

	await context.close()
	await browser.close()
}

void run()
```

Run from repo root: `bun run skills/alkalye-playwright-automation/scripts/my-script.ts`

## Helper contract

- Every helper receives `page` plus an args object
- Every helper returns JSON
- All selectors use `data-testid` attributes (contract: `src/lib/test-ids.ts`)

## Helper files

Helpers live in `e2e/` and are shared with e2e tests:

- `e2e/auth-helpers.ts` — account creation, sign in/out, editor boot
- `e2e/doc-helpers.ts` — document CRUD
- `e2e/space-helpers.ts` — space CRUD + invites
- `e2e/document-collab-helpers.ts` — document-level invites

## Validation

```bash
bun run test:e2e:auth
bun run test:e2e:doc
bun run test:e2e:spaces
bun run test:e2e:doc-collab
```
