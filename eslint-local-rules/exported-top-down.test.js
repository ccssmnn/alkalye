import { RuleTester } from "eslint"
import tsparser from "@typescript-eslint/parser"
import { exportedTopDown } from "./exported-top-down.js"

let ruleTester = new RuleTester({
	languageOptions: {
		parser: tsparser,
		ecmaVersion: "latest",
		sourceType: "module",
	},
})

ruleTester.run("exported-top-down", exportedTopDown, {
	valid: [
		// Single inline export - valid
		{
			code: `export function foo() {}`,
		},
		// Single inline const export - valid
		{
			code: `export const foo = () => {}`,
		},
		// Explicit export list with multiple exports - valid
		{
			code: `
export { foo, bar }

function foo() {}
function bar() {}
			`,
		},
		// Export type list - valid
		{
			code: `
export { foo }
export type { Bar }

function foo() {}
type Bar = string
			`,
		},
		// Exported function calling helper below - valid
		{
			code: `
export { updateReminder }

function updateReminder() {
	helper()
}

function helper() {}
			`,
		},
		// Exported -> exported reference - valid (any position)
		{
			code: `
export { foo, bar }

function foo() {
	bar()
}

function bar() {}
			`,
		},
		// Exported -> exported reference reverse order - valid
		{
			code: `
export { foo, bar }

function bar() {}

function foo() {
	bar()
}
			`,
		},
		// Export list immediately after imports - valid
		{
			code: `
import { something } from 'somewhere'

export { foo }

function foo() {}
			`,
		},
		// Arrow functions as exports - valid
		{
			code: `
export { foo }

let foo = () => {
	helper()
}

function helper() {}
			`,
		},
	],

	invalid: [
		// Multiple inline exports - error
		{
			code: `
export function foo() {}
export function bar() {}
			`,
			errors: [
				{ messageId: "multipleInlineExports" },
				{ messageId: "multipleInlineExports" },
			],
		},
		// Multiple inline const exports - error
		{
			code: `
export const foo = () => {}
export const bar = () => {}
			`,
			errors: [
				{ messageId: "multipleInlineExports" },
				{ messageId: "multipleInlineExports" },
			],
		},
		// Export list after helper - error (also triggers exported before non-exported)
		{
			code: `
function helper() {}

export { foo }

function foo() {}
			`,
			errors: [
				{ messageId: "exportListsAfterImports" },
				{ messageId: "exportedBeforeNonExported" },
			],
		},
		// Exported function calling helper above - error (also triggers exported before non-exported)
		{
			code: `
export { updateReminder }

function helper() {}

function updateReminder() {
	helper()
}
			`,
			errors: [
				{ messageId: "exportedBeforeNonExported" },
				{ messageId: "exportedReferencesAbove" },
			],
		},
		// Exported declaration after non-exported - error
		{
			code: `
export { foo }

function helper() {}

function foo() {}
			`,
			errors: [{ messageId: "exportedBeforeNonExported" }],
		},
		// Mixed: inline export + export list (multi-export) - error
		{
			code: `
export { foo }
export function bar() {}

function foo() {}
			`,
			errors: [{ messageId: "multipleInlineExports" }],
		},
	],
})

console.log("All tests passed!")
