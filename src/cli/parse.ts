import { ValidationError } from "@/cli/errors"

export { interpretEscapes, parseScope, parseDocScope }

function interpretEscapes(value: string): string {
	return value
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t")
		.replace(/\\\\/g, "\\")
}

function parseScope(value: string | undefined) {
	if (!value || value === "personal") return { kind: "personal" as const }
	if (value === "all") return { kind: "all" as const }
	if (value.startsWith("space:")) {
		let spaceId = value.slice("space:".length)
		if (!spaceId) throw new ValidationError({ message: "Invalid scope" })
		return { kind: "space" as const, spaceId }
	}
	throw new ValidationError({
		message: "Scope must be personal, all, or space:<id>",
	})
}

function parseDocScope(value: string | undefined) {
	let scope = parseScope(value)
	if (scope.kind === "all") {
		throw new ValidationError({
			message: "Scope must be personal or space:<id>",
		})
	}
	return scope
}
