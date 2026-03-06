# Single-Run Script Pattern

Use this pattern when an agent should complete a task in one execution.

```ts
import { chromium } from "@playwright/test"
import { createAccount, waitForEditorBoot } from "../helpers/auth-helpers"
import { create, list } from "../helpers/doc-helpers"

async function run() {
	let browser = await chromium.launch()
	let context = await browser.newContext()
	let page = await context.newPage()

	await waitForEditorBoot(page)
	await createAccount(page)
	let created = await create(page, { title: "Automated Doc", body: "Hello" })
	let listed = await list(page, { search: "Automated Doc" })

	console.log(
		JSON.stringify(
			{
				ok: true,
				created,
				listed,
			},
			null,
			2,
		),
	)

	await context.close()
	await browser.close()
}

void run()
```

Run with Bun from repo root after dev server is available.
