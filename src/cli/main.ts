import { Buffer } from "node:buffer"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { argv, env, exit, stdin, stdout } from "node:process"
import { runCli } from "./commands"
import type { CliResult, RuntimeDeps } from "./types"

let deps: RuntimeDeps = {
	env,
	readFile: path => readFile(path, "utf8"),
	writeFile,
	mkdir: path => mkdir(path, { recursive: true }),
	readStdin,
	now: () => new Date().toISOString(),
}

let result = await safeRun(argv.slice(2))
writeJson(result)
exit(result.ok ? 0 : 1)

async function safeRun(args: string[]): Promise<CliResult> {
	try {
		return await runCli(args, deps)
	} catch {
		return { ok: false, command: "cli", error: { code: "internal_error", message: "Unhandled CLI error" } }
	}
}

async function readStdin(): Promise<string> {
	let chunks: Buffer[] = []
	for await (let chunk of stdin) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
	return Buffer.concat(chunks).toString("utf-8")
}

function writeJson(result: CliResult): void { stdout.write(`${JSON.stringify(result)}\n`) }
