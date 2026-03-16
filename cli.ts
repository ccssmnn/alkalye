#!/usr/bin/env bun

import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { createRequire } from "node:module"
import { cli } from "@/cli/app"
import { getExitCode } from "@/cli/errors"
import { renderCustomHelp } from "@/cli/help"
import process from "node:process"

let packageJson = createRequire(import.meta.url)("./package.json") as {
	version?: string
}
let help = renderCustomHelp(
	process.argv.slice(2),
	packageJson.version ?? "0.0.0",
)

if (help) {
	process.stdout.write(`${help}\n`)
	process.exit(0)
}

cli(process.argv).pipe(
	Effect.provide(NodeContext.layer),
	Effect.catchAll(error =>
		Effect.sync(() => {
			process.exit(getExitCode(error))
		}),
	),
	NodeRuntime.runMain,
)
