import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import path, { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { VitePWA } from "vite-plugin-pwa"
import { defineConfig } from "vitest/config"

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	plugins: [
		tanstackRouter(),
		react({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
		tailwindcss(),
		VitePWA({
			registerType: "prompt",
			manifest: {
				id: "/alkalye/",
				name: "Alkalye",
				short_name: "Alkalye",
				description:
					"A beautiful markdown editor, on the web. E2E encrypted, realtime collaboration and sync, great on desktop and mobile.",
				start_url: "/",
				display: "standalone",
				background_color: "#ffffff",
				theme_color: "#000000",
				orientation: "portrait-primary",
				scope: "/",
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
						action: "/local",
						accept: {
							"text/markdown": [".md", ".markdown"],
							"text/plain": [".txt"],
						},
					},
				],
			},
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,woff,ttf}"],
				navigateFallback: "index.html",
				navigateFallbackDenylist: [/^\/invite\.html$/],
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MiB
			},
		}),
	],
	build: {
		rollupOptions: {
			input: {
				main: resolve(__dirname, "index.html"),
				invite: resolve(__dirname, "invite.html"),
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		exclude: ["node_modules", ".reference"],
		environment: "jsdom",
		sequence: {
			shuffle: false,
		},
	},
})
