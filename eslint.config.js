import js from "@eslint/js"
import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"
import reactHooks from "eslint-plugin-react-hooks"
import react from "eslint-plugin-react"
import globals from "globals"
import astro from "eslint-plugin-astro"
import { plugin as localPlugin } from "./eslint-local-rules/index.js"

let commonRules = {
	"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
	"@typescript-eslint/no-explicit-any": "error",
}

let reactRules = {
	...react.configs.recommended.rules,
	...reactHooks.configs.recommended.rules,
	"react/react-in-jsx-scope": "off",
}

let browserGlobals = {
	...globals.browser,
	...globals.serviceworker,
	React: "readonly",
}

export default [
	js.configs.recommended,
	{
		files: ["src/**/*.{ts,tsx,js,jsx}"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { ecmaVersion: "latest", sourceType: "module", jsx: true },
			globals: browserGlobals,
		},
		plugins: {
			"@typescript-eslint": tseslint,
			"react-hooks": reactHooks,
			react,
			local: localPlugin,
		},
		rules: {
			...tseslint.configs.recommended.rules,
			...reactRules,
			...commonRules,
			"local/exported-top-down": "warn",
		},
		settings: { react: { version: "detect" } },
	},
	...astro.configs.recommended,
	{
		files: ["src/**/*.astro"],
		languageOptions: {
			parser: astro.parser,
			parserOptions: { parser: tsparser, extraFileExtensions: [".astro"] },
			globals: { ...browserGlobals, Astro: "readonly" },
		},
		plugins: { "@typescript-eslint": tseslint },
		rules: { ...tseslint.configs.recommended.rules, ...commonRules },
	},
	{
		ignores: [
			"dist/",
			"build/",
			"node_modules/",
			".reference/",
			"*.config.{js,mjs,ts}",
			"src/routeTree.gen.ts",
			"src/app/routeTree.gen.ts",
			".astro/",
			"eslint-local-rules/",
			".vercel/",
		],
	},
]
