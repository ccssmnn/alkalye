import { defineConfig, devices } from "@playwright/test"

let appUrl = "https://alkalye.localhost"

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
})
