import type { ParsedArgs } from "./types"

export { DEFAULT_SYNC_URL, parseArgs }

let DEFAULT_SYNC_URL = "wss://sync.alkalye.com"

type ParseOutcome =
	| { ok: true; value: ParsedArgs }
	| { ok: false; code: string; message: string }

function parseArgs(argv: string[]): ParseOutcome {
	if (argv.length < 2) {
		return {
			ok: false,
			code: "invalid_arguments",
			message: "Expected command and action",
		}
	}

	let commandToken = argv[0]
	let actionToken = argv[1]
	if (commandToken !== "auth" && commandToken !== "docs") {
		return { ok: false, code: "invalid_command", message: `Unsupported command: ${commandToken}` }
	}

	if (commandToken === "auth") {
		if (actionToken !== "sign-in" && actionToken !== "sign-out" && actionToken !== "status" && actionToken !== "create-account") {
			return { ok: false, code: "invalid_action", message: `Unsupported auth action: ${actionToken}` }
		}
		let parsed: ParsedArgs = baseArgs("auth", actionToken)
		let optionResult = parseOptions(argv, parsed)
		if (!optionResult.ok) return optionResult
		return validate(optionResult.value)
	}

	if (actionToken !== "create" && actionToken !== "read" && actionToken !== "update" && actionToken !== "list" && actionToken !== "search" && actionToken !== "delete" && actionToken !== "upsert") {
		return { ok: false, code: "invalid_action", message: `Unsupported docs action: ${actionToken}` }
	}

	let parsed: ParsedArgs = baseArgs("docs", actionToken)
	let optionResult = parseOptions(argv, parsed)
	if (!optionResult.ok) return optionResult
	return validate(optionResult.value)
}

function baseArgs(command: "auth" | "docs", action: ParsedArgs["action"]): ParsedArgs {
	return {
		command,
		action,
		syncUrl: DEFAULT_SYNC_URL,
		timeoutMs: 10_000,
		append: false,
		softDelete: true,
		passphraseStdin: false,
	}
}

function parseOptions(argv: string[], parsed: ParsedArgs): ParseOutcome {
	let idx = 2
	while (idx < argv.length) {
		let token = argv[idx]
		let next = argv[idx + 1]
		switch (token) {
			case "--sync-url": if (!next) return missingValue(token); parsed.syncUrl = next; idx += 2; break
			case "--space-id": if (!next) return missingValue(token); parsed.spaceId = next; idx += 2; break
			case "--doc-id": if (!next) return missingValue(token); parsed.docId = next; idx += 2; break
			case "--title": if (!next) return missingValue(token); parsed.title = next; idx += 2; break
			case "--content": if (!next) return missingValue(token); parsed.content = next; idx += 2; break
			case "--query": if (!next) return missingValue(token); parsed.query = next; idx += 2; break
			case "--name": if (!next) return missingValue(token); parsed.name = next; idx += 2; break
			case "--passphrase": if (!next) return missingValue(token); parsed.passphrase = next; idx += 2; break
			case "--passphrase-env": if (!next) return missingValue(token); parsed.passphraseEnv = next; idx += 2; break
			case "--passphrase-file": if (!next) return missingValue(token); parsed.passphraseFile = next; idx += 2; break
			case "--passphrase-stdin": parsed.passphraseStdin = true; idx += 1; break
			case "--session-file": if (!next) return missingValue(token); parsed.sessionFile = next; idx += 2; break
			case "--session-account-id": if (!next) return missingValue(token); parsed.sessionAccountId = next; idx += 2; break
			case "--session-secret": if (!next) return missingValue(token); parsed.sessionSecret = next; idx += 2; break
			case "--timeout": {
				if (!next) return missingValue(token)
				let parsedTimeout = Number.parseInt(next, 10)
				if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) return { ok: false, code: "invalid_timeout", message: "Timeout must be a positive integer (milliseconds)" }
				parsed.timeoutMs = parsedTimeout
				idx += 2
				break
			}
			case "--append": parsed.append = true; idx += 1; break
			case "--replace": parsed.append = false; idx += 1; break
			case "--hard-delete": parsed.softDelete = false; idx += 1; break
			case "--soft-delete": parsed.softDelete = true; idx += 1; break
			default: return { ok: false, code: "unknown_flag", message: `Unknown option: ${token}` }
		}
	}
	return { ok: true, value: parsed }
}

function missingValue(flag: string): ParseOutcome {
	return { ok: false, code: "missing_flag_value", message: `Expected value for ${flag}` }
}

function validate(parsed: ParsedArgs): ParseOutcome {
	if (parsed.command === "docs" && parsed.action === "create") {
		if (!parsed.spaceId) return required("space-id")
		if (!parsed.title) return required("title")
		if (parsed.content === undefined) return required("content")
	}
	if (parsed.command === "docs" && parsed.action === "read" && !parsed.docId) return required("doc-id")
	if (parsed.command === "docs" && parsed.action === "update") {
		if (!parsed.docId) return required("doc-id")
		if (parsed.content === undefined) return required("content")
	}
	if (parsed.command === "docs" && (parsed.action === "list" || parsed.action === "search") && !parsed.spaceId) return required("space-id")
	if (parsed.command === "docs" && parsed.action === "delete" && !parsed.docId) return required("doc-id")
	if (parsed.command === "docs" && parsed.action === "upsert") {
		if (!parsed.spaceId) return required("space-id")
		if (!parsed.title) return required("title")
		if (parsed.content === undefined) return required("content")
	}
	return { ok: true, value: parsed }
}

function required(name: string): ParseOutcome {
	return { ok: false, code: "missing_required_option", message: `Missing required option --${name}` }
}
