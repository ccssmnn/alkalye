import { exportedTopDown } from "./exported-top-down.js"

export let plugin = {
	meta: {
		name: "eslint-plugin-local",
		version: "1.0.0",
	},
	rules: {
		"exported-top-down": exportedTopDown,
	},
}
