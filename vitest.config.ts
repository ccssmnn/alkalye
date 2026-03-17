import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "src"),
		},
	},
	test: {
		exclude: ["node_modules", ".reference", "e2e"],
		include: ["src/**/*.test.ts"],
		environment: "jsdom",
		sequence: {
			shuffle: false,
		},
	},
})
