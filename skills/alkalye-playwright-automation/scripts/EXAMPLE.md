# Single-Run Script Pattern

Use this pattern when a task goes beyond what `run-task.ts` supports (e.g. screenshots, custom waits, multi-page flows).

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
