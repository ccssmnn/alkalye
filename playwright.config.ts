import { defineConfig, devices } from "@playwright/test"

let port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "4173", 10)
let baseUrl = `http://127.0.0.1:${port}`

export default defineConfig({
	testDir: "./e2e",
	timeout: 60_000,
	expect: {
		timeout: 10_000,
	},
	fullyParallel: true,
	retries: process.env.CI ? 2 : 0,
	reporter: "list",
	use: {
		baseURL: baseUrl,
		trace: "on-first-retry",
		permissions: ["clipboard-read", "clipboard-write"],
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		command: `sh -c 'if ! lsof -iTCP:4200 -sTCP:LISTEN >/dev/null 2>&1; then bunx jazz-run sync --in-memory & fi; bun run dev --host 127.0.0.1 --port ${port}'`,
		url: `${baseUrl}/app`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
})
