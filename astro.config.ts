import { defineConfig, envField } from "astro/config"
import react from "@astrojs/react"
import vercel from "@astrojs/vercel"
import pwa from "@vite-pwa/astro"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"

export default defineConfig({
	adapter: vercel(),
	devToolbar: { enabled: false },
	vite: {
		plugins: [
			tanstackRouter({
				target: "react",
				routesDirectory: "./src/app/routes",
				generatedRouteTree: "./src/app/routeTree.gen.ts",
			}),
			tailwindcss(),
		] as any,
		resolve: {
			alias: {
				"@": new URL("./src", import.meta.url).pathname,
				"#app": new URL("./src/app", import.meta.url).pathname,
				"#www": new URL("./src/www", import.meta.url).pathname,
			},
		},
	},
	integrations: [
		react({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
		pwa({
			registerType: "prompt",
			manifest: {
				id: "/app/",
				name: "Alkalye",
				short_name: "Alkalye",
				description:
					"A beautiful markdown editor, on the web. E2E encrypted, realtime collaboration and sync, great on desktop and mobile.",
				start_url: "/app/",
				display: "standalone",
				background_color: "#ffffff",
				theme_color: "#000000",
				orientation: "portrait-primary",
				scope: "/app/",
				lang: "en",
				icons: [
					{
						src: "/icons/alkalye-icon.png",
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: "/icons/alkalye-icon.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
				file_handlers: [
					{
						action: "/app/local",
						accept: {
							"text/markdown": [".md", ".markdown"],
							"text/plain": [".txt"],
						},
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}"],
				navigateFallback: "app/index.html",
				navigateFallbackDenylist: [/^\/invite$/, /^\/invite\//],
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
			},
		}),
	],
	env: {
		schema: {
			PUBLIC_JAZZ_SYNC_SERVER: envField.string({
				context: "client",
				access: "public",
			}),
		},
	},
})
