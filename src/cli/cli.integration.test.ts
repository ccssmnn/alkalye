import { describe, expect, it } from "vitest"
import { runCli } from "./commands"
import type { JsonValue, RuntimeDeps } from "./types"

describe("cli integration smoke", () => {
	it("runs auth sign-in and docs upsert flow", async () => {
		let calls: Array<{ url: string; method: string; body?: JsonValue }> = []

		let deps = createDeps(async (url, init) => {
			let method = init?.method ?? "GET"
			let body = parseBody(typeof init?.body === "string" ? init.body : undefined)
			calls.push({ url, method, body })

			if (url.endsWith("/auth/sign-in") && method === "POST") {
				return new Response(JSON.stringify({ session: "ok" }), { status: 200 })
			}

			if (url.includes("/docs?") && method === "GET") {
				return new Response(JSON.stringify([]), { status: 200 })
			}

			if (url.endsWith("/docs") && method === "POST") {
				return new Response(JSON.stringify({ docId: "doc-1" }), { status: 201 })
			}

			return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 })
		})

		let authResult = await runCli(
			["auth", "sign-in", "--passphrase", "word1 word2"],
			deps,
		)
		expect(authResult).toEqual({
			ok: true,
			command: "auth.sign-in",
			data: { session: "ok" },
		})

		let upsertResult = await runCli(
			[
				"docs",
				"upsert",
				"--space-id",
				"space-1",
				"--title",
				"Roadmap",
				"--content",
				"Q2",
			],
			deps,
		)
		expect(upsertResult.ok).toBe(true)
		if (!upsertResult.ok) return
		expect(upsertResult.command).toBe("docs.upsert")
		expect(calls.map(c => `${c.method} ${stripHost(c.url)}`)).toEqual([
			"POST /api/agent/v1/auth/sign-in",
			"GET /api/agent/v1/docs?spaceId=space-1&q=Roadmap",
			"POST /api/agent/v1/docs",
		])
	})
})

function createDeps(fetchImpl: RuntimeDeps["fetch"]): RuntimeDeps {
	return {
		fetch: fetchImpl,
		env: {},
		readFile: async () => "",
		readStdin: async () => "",
		now: () => "2026-03-09T00:00:00.000Z",
	}
}

function parseBody(body: string | undefined): JsonValue | undefined {
	if (typeof body !== "string") return undefined
	try {
		let parsed: unknown = JSON.parse(body)
		if (!isJsonValue(parsed)) return undefined
		return parsed
	} catch {
		return undefined
	}
}

function stripHost(url: string): string {
	let parsed = new URL(url)
	return `${parsed.pathname}${parsed.search}`
}

function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) return true
	if (typeof value === "string") return true
	if (typeof value === "number") return true
	if (typeof value === "boolean") return true
	if (Array.isArray(value)) {
		for (let entry of value) {
			if (!isJsonValue(entry)) return false
		}
		return true
	}
	if (typeof value === "object") {
		for (let entry of Object.values(value)) {
			if (!isJsonValue(entry)) return false
		}
		return true
	}
	return false
}
