import { parseArgs } from "./args"
import { requestJson } from "./http"
import { resolvePassphrase } from "./passphrase"
import type { CliResult, JsonValue, ParsedArgs, RuntimeDeps } from "./types"

export { runCli }

async function runCli(argv: string[], deps: RuntimeDeps): Promise<CliResult> {
	let parsed = parseArgs(argv)
	if (!parsed.ok) {
		return failure("cli", parsed.code, parsed.message)
	}

	if (parsed.value.command === "auth") {
		return runAuth(parsed.value, deps)
	}

	if (parsed.value.command === "docs") {
		return runDocs(parsed.value, deps)
	}

	return failure("cli", "invalid_command", "Unsupported command")
}

async function runAuth(args: ParsedArgs, deps: RuntimeDeps): Promise<CliResult> {
	let command = `auth.${args.action}`

	if (args.action === "status") {
		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: "/auth/status",
			method: "GET",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
		})
	}

	if (args.action === "sign-out") {
		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: "/auth/sign-out",
			method: "POST",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
		})
	}

	if (args.action === "sign-in") {
		let passphrase = await resolvePassphrase(args, deps, true)
		if (!passphrase.ok) {
			return failure(command, passphrase.code, passphrase.message)
		}

		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: "/auth/sign-in",
			method: "POST",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
			body: {
				passphrase: passphrase.value ?? "",
			},
		})
	}

	if (args.action === "create-account") {
		let passphrase = await resolvePassphrase(args, deps, false)
		let body: Record<string, JsonValue> = {}
		if (!passphrase.ok) {
			return failure(command, passphrase.code, passphrase.message)
		}
		if (passphrase.value) {
			body.passphrase = passphrase.value
		}
		if (args.name) {
			body.name = args.name
		}

		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: "/auth/create-account",
			method: "POST",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
			body,
		})
	}

	return failure(command, "invalid_action", "Unsupported auth action")
}

async function runDocs(args: ParsedArgs, deps: RuntimeDeps): Promise<CliResult> {
	let command = `docs.${args.action}`

	if (args.action === "create") {
		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: "/docs",
			method: "POST",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
			body: {
				spaceId: args.spaceId ?? "",
				title: args.title ?? "",
				content: args.content ?? "",
			},
		})
	}

	if (args.action === "read") {
		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: `/docs/${args.docId ?? ""}`,
			method: "GET",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
		})
	}

	if (args.action === "update") {
		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: `/docs/${args.docId ?? ""}`,
			method: "PATCH",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
			body: {
				content: args.content ?? "",
				mode: args.append ? "append" : "replace",
			},
		})
	}

	if (args.action === "list" || args.action === "search") {
		let queryString = new URLSearchParams()
		queryString.set("spaceId", args.spaceId ?? "")
		if (args.query) queryString.set("q", args.query)

		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: `/docs?${queryString.toString()}`,
			method: "GET",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
		})
	}

	if (args.action === "delete") {
		let queryString = new URLSearchParams()
		queryString.set("soft", args.softDelete ? "1" : "0")
		return executeHttp(command, deps, {
			baseUrl: args.baseUrl,
			path: `/docs/${args.docId ?? ""}?${queryString.toString()}`,
			method: "DELETE",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
		})
	}

	if (args.action === "upsert") {
		let listed = await requestJson(deps, {
			baseUrl: args.baseUrl,
			path: `/docs?${new URLSearchParams({ spaceId: args.spaceId ?? "", q: args.title ?? "" }).toString()}`,
			method: "GET",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
		})
		if (!listed.ok) {
			return failure(command, listed.code, listed.message, {
				status: listed.status ?? null,
				details: listed.details ?? null,
			})
		}

		let foundDocId = findDocIdByTitle(listed.data, args.title ?? "")
		if (foundDocId) {
			let updateResult = await requestJson(deps, {
				baseUrl: args.baseUrl,
				path: `/docs/${foundDocId}`,
				method: "PATCH",
				headless: args.headless,
				timeoutMs: args.timeoutMs,
				body: {
					content: args.content ?? "",
					mode: "replace",
				},
			})
			if (!updateResult.ok) {
				return failure(command, updateResult.code, updateResult.message, {
					status: updateResult.status ?? null,
					details: updateResult.details ?? null,
				})
			}

			return success(command, {
				operation: "updated",
				docId: foundDocId,
				result: updateResult.data,
			})
		}

		let createResult = await requestJson(deps, {
			baseUrl: args.baseUrl,
			path: "/docs",
			method: "POST",
			headless: args.headless,
			timeoutMs: args.timeoutMs,
			body: {
				spaceId: args.spaceId ?? "",
				title: args.title ?? "",
				content: args.content ?? "",
			},
		})
		if (!createResult.ok) {
			return failure(command, createResult.code, createResult.message, {
				status: createResult.status ?? null,
				details: createResult.details ?? null,
			})
		}

		return success(command, {
			operation: "created",
			result: createResult.data,
		})
	}

	return failure(command, "invalid_action", "Unsupported docs action")
}

async function executeHttp(
	command: string,
	deps: RuntimeDeps,
	options: Parameters<typeof requestJson>[1],
): Promise<CliResult> {
	let result = await requestJson(deps, options)
	if (!result.ok) {
		return failure(command, result.code, result.message, {
			status: result.status ?? null,
			details: result.details ?? null,
		})
	}
	return success(command, result.data)
}

function findDocIdByTitle(data: JsonValue, title: string): string | undefined {
	if (!Array.isArray(data)) return undefined
	for (let item of data) {
		if (!isObject(item)) continue
		let itemTitle = item.title
		let itemDocId = getString(item, "docId") ?? getString(item, "id")
		if (itemTitle === title && typeof itemDocId === "string" && itemDocId) {
			return itemDocId
		}
	}
	return undefined
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getString(
	value: { [key: string]: JsonValue },
	key: string,
): string | undefined {
	let raw = value[key]
	if (typeof raw !== "string") return undefined
	return raw
}

function success(command: string, data: JsonValue): CliResult {
	return {
		ok: true,
		command,
		data,
	}
}

function failure(
	command: string,
	code: string,
	message: string,
	details?: JsonValue,
): CliResult {
	return {
		ok: false,
		command,
		error: {
			code,
			message,
			details,
		},
	}
}
