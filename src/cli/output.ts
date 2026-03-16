import process from "node:process"
import { Effect } from "effect"

export { printData, printContent, printError }

function printData(args: {
	json: boolean
	command: string
	data: unknown
	meta?: unknown
}): Effect.Effect<void> {
	let text = args.json
		? JSON.stringify(
				{ ok: true, command: args.command, data: args.data, meta: args.meta },
				null,
				2,
			)
		: formatHumanWithMeta(args.data, args.meta)
	return Effect.sync(() => {
		process.stdout.write(`${text}\n`)
	})
}

function printContent(content: string): Effect.Effect<void> {
	return Effect.sync(() => {
		process.stdout.write(content)
		if (!content.endsWith("\n")) process.stdout.write("\n")
	})
}

function printError(args: {
	json: boolean
	command: string
	error: { type: string; message: string }
}): void {
	let text = args.json
		? JSON.stringify(
				{ ok: false, command: args.command, error: args.error },
				null,
				2,
			)
		: args.error.message
	process.stderr.write(`${text}\n`)
}

function formatHuman(value: unknown): string {
	if (typeof value === "string") return value
	if (Array.isArray(value)) {
		if (value.length === 0) return ""
		let separator = value.every(
			item => typeof item === "object" && item !== null && !Array.isArray(item),
		)
			? "\n\n"
			: "\n"
		return value.map(item => formatHuman(item)).join(separator)
	}
	if (typeof value === "object" && value !== null) {
		return Object.entries(value)
			.map(([key, entry]) => `${key}: ${formatScalar(entry)}`)
			.join("\n")
	}
	return formatScalar(value)
}

function formatHumanWithMeta(value: unknown, meta: unknown): string {
	if (!meta) return formatHuman(value)
	let body = formatHuman(value)
	let runtime = formatHuman(meta)
	return body ? `${body}\n\n${runtime}` : runtime
}

function formatScalar(value: unknown): string {
	if (value === null || value === undefined) return ""
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean")
		return String(value)
	if (value instanceof Date) return value.toISOString()
	return JSON.stringify(value)
}
