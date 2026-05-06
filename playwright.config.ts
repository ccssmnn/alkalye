import { defineConfig, devices } from "@playwright/test"

let appUrl = "https://alkalye-e2e.localhost"
let syncUrl = "https://alkalye-sync-e2e.localhost"

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
		baseURL: appUrl,
		ignoreHTTPSErrors: true,
		trace: "on-first-retry",
		permissions: ["clipboard-read", "clipboard-write"],
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			command: `portless alkalye-sync-e2e sh -c 'bunx jazz-run sync --in-memory --port "$PORT" --host "$HOST"'`,
			url: syncUrl,
			reuseExistingServer: !process.env.CI,
			ignoreHTTPSErrors: true,
			timeout: 60_000,
		},
		{
			command: `portless alkalye-e2e astro dev`,
			url: `${appUrl}/app`,
			env: { PUBLIC_JAZZ_SYNC_SERVER: syncUrl.replace(/^https/, "wss") },
			reuseExistingServer: !process.env.CI,
			ignoreHTTPSErrors: true,
			timeout: 120_000,
		},
	],
})
