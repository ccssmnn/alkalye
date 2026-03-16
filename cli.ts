#!/usr/bin/env bun

import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import process from "node:process"
import { cli } from "@/cli/app"
import { getExitCode } from "@/cli/errors"
import { renderCustomHelp } from "@/cli/help"
import { version } from "@/cli/version"

let help = renderCustomHelp(process.argv.slice(2), version)

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
