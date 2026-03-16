import { test, afterEach, describe } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import process from "node:process"

type CliResult = {
	exitCode: number
	stdout: string
	stderr: string
}

let tempDirs: string[] = []

afterEach(async () => {
	for (let dir of tempDirs.splice(0)) {
		await rm(dir, { recursive: true, force: true })
	}
})

describe("help", () => {
	test("prints minimal root help", async () => {
		let result = await runCli(["--help"])

		assert.equal(result.exitCode, 0)
		assert.match(result.stdout, /Collaborate with alkalye\.com from the CLI\./)
		assert.match(result.stdout, /Built for scripts and AI agents\./)
		assert.doesNotMatch(result.stdout, /doc doc share/)
	})

	test("prints leaf command help for doc create", async () => {
		let result = await runCli(["doc", "create", "--help"])

		assert.equal(result.exitCode, 0)
		assert.match(result.stdout, /Create a document/)
		assert.match(result.stdout, /--content/)
		assert.match(result.stdout, /--stdin/)
		assert.match(result.stdout, /--scope/)
		assert.doesNotMatch(result.stdout, /\[0;1m/) // no ANSI from Effect
	})

	test("prints leaf command help for doc rename", async () => {
		let result = await runCli(["doc", "rename", "--help"])

		assert.equal(result.exitCode, 0)
		assert.match(result.stdout, /--title/)
	})

	test("prints leaf command help for space share create", async () => {
		let result = await runCli(["space", "share", "create", "--help"])

		assert.equal(result.exitCode, 0)
		assert.match(result.stdout, /Create an invite link/)
		assert.match(result.stdout, /--role/)
	})

	test("prints leaf command help for auth signup", async () => {
		let result = await runCli(["auth", "signup", "--help"])

		assert.equal(result.exitCode, 0)
		assert.match(result.stdout, /Create account/)
		assert.match(result.stdout, /--name/)
		assert.match(result.stdout, /--passphrase-stdin/)
	})

	test("root help includes --quiet option", async () => {
		let result = await runCli(["--help"])

		assert.match(result.stdout, /--quiet/)
	})
})

describe("errors", () => {
	test("reports logged out whoami cleanly", async () => {
		let result = await runCli(["auth", "whoami"], {
			ALKALYE_SYNC_PEER: "ws://localhost",
		})

		assert.equal(result.exitCode, 3)
		assert.equal(result.stderr.trim(), "Not logged in")
		assert.doesNotMatch(result.stderr, /UnknownException/)
		assert.doesNotMatch(result.stderr, /Effect\.tryPromise/)
	})

	test("reports config discovery failure cleanly", async () => {
		let result = await runCli(["auth", "whoami"], {
			ALKALYE_SERVER: "http://127.0.0.1:9",
		})

		assert.equal(result.exitCode, 7)
		assert.match(result.stderr, /\/\.well-known\/alkalye-cli\.json/)
		assert.doesNotMatch(result.stderr, /UnknownException/)
	})

	test("missing content source returns exit code 2", async () => {
		let result = await runCli(["doc", "create"], {
			ALKALYE_SYNC_PEER: "ws://localhost",
		})

		assert.equal(result.exitCode, 2)
		assert.match(result.stderr, /--content/)
	})
})

describe("quiet", () => {
	test("--quiet suppresses stdout on auth error", async () => {
		let result = await runCli(["auth", "whoami", "--quiet"], {
			ALKALYE_SYNC_PEER: "ws://localhost",
		})

		assert.equal(result.exitCode, 3)
		assert.equal(result.stdout.trim(), "")
	})

	test("--quiet still outputs errors to stderr", async () => {
		let result = await runCli(["auth", "whoami", "--quiet"], {
			ALKALYE_SYNC_PEER: "ws://localhost",
		})

		assert.match(result.stderr, /Not logged in/)
	})
})

async function runCli(
	args: string[],
	env: Record<string, string> = {},
): Promise<CliResult> {
	let home = await mkdtemp(join(tmpdir(), "alkalye-cli-test-"))
	tempDirs.push(home)

	return await new Promise((resolve, reject) => {
		let proc = spawn("bun", ["cli.ts", ...args], {
			cwd: process.cwd(),
			env: {
				...process.env,
				ALKALYE_CLI_HOME: home,
				...env,
			},
			stdio: ["ignore", "pipe", "pipe"],
		})

		let stdout = ""
		let stderr = ""

		proc.stdout.on("data", chunk => {
			stdout += chunk.toString()
		})

		proc.stderr.on("data", chunk => {
			stderr += chunk.toString()
		})

		proc.on("error", reject)
		proc.on("close", code => {
			resolve({
				exitCode: code ?? 1,
				stdout,
				stderr,
			})
		})
	})
}
