import type { JsonValue, RuntimeDeps } from "./types"

export { requestJson }

type HttpResult =
	| { ok: true; status: number; data: JsonValue }
	| {
			ok: false
			status?: number
			code: string
			message: string
			details?: JsonValue
	  }

async function requestJson(
	deps: RuntimeDeps,
	options: {
		baseUrl: string
		path: string
		method: "GET" | "POST" | "PATCH" | "DELETE"
		timeoutMs: number
		headless: boolean
		body?: Record<string, JsonValue>
	},
): Promise<HttpResult> {
	let controller = new AbortController()
	let timeoutId = setTimeout(() => controller.abort(), options.timeoutMs)
	let url = joinUrl(options.baseUrl, options.path)

	try {
		let response = await deps.fetch(url, {
			method: options.method,
			headers: {
				"content-type": "application/json",
				"x-alk-headless": options.headless ? "1" : "0",
			},
			signal: controller.signal,
			body: options.body ? JSON.stringify(options.body) : undefined,
		})

		let payload: JsonValue = null
		let text = await response.text()
		if (text.length > 0) {
			let parsedPayload = safeParseJson(text)
			payload = parsedPayload ?? { raw: text }
		}

		if (!response.ok) {
			if (
				response.status === 404 ||
				response.status === 405 ||
				response.status === 501
			) {
				return {
					ok: false,
					status: response.status,
					code: "not_supported",
					message: "Operation not supported by backend",
					details: payload,
				}
			}
			return {
				ok: false,
				status: response.status,
				code: "http_error",
				message: `HTTP ${response.status}`,
				details: payload,
			}
		}

		return {
			ok: true,
			status: response.status,
			data: payload,
		}
	} catch (error) {
		if (isAbortError(error)) {
			return {
				ok: false,
				code: "timeout",
				message: `Request timed out after ${options.timeoutMs}ms`,
			}
		}

		return {
			ok: false,
			code: "network_error",
			message: "Network request failed",
			details: {
				timestamp: deps.now(),
			},
		}
	} finally {
		clearTimeout(timeoutId)
	}
}

function joinUrl(baseUrl: string, path: string): string {
	let normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
	let normalizedPath = path.startsWith("/") ? path : `/${path}`
	return `${normalizedBase}${normalizedPath}`
}

function safeParseJson(text: string): JsonValue | undefined {
	try {
		let parsed: unknown = JSON.parse(text)
		if (!isJsonValue(parsed)) return undefined
		return parsed
	} catch {
		return undefined
	}
}

function isAbortError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false
	if (!("name" in error)) return false
	let withName = error
	if (typeof withName.name !== "string") return false
	return withName.name === "AbortError"
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
