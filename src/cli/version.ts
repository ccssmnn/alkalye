import { createRequire } from "node:module"

export { version }

let packageJson = createRequire(import.meta.url)("../../package.json") as {
	version?: string
}

let version = packageJson.version ?? "0.0.0"
