export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue }

export type CliError = {
	code: string
	message: string
	details?: JsonValue
}

export type CliSuccess = {
	ok: true
	command: string
	data: JsonValue
}

export type CliFailure = {
	ok: false
	command: string
	error: CliError
}

export type CliResult = CliSuccess | CliFailure

export type AuthAction = "sign-in" | "sign-out" | "status" | "create-account"

export type DocsAction =
	| "create"
	| "read"
	| "update"
	| "list"
	| "search"
	| "delete"
	| "upsert"

export type ParsedArgs = {
	command: "auth" | "docs"
	action: AuthAction | DocsAction
	baseUrl: string
	timeoutMs: number
	headless: boolean
	spaceId?: string
	docId?: string
	title?: string
	content?: string
	append: boolean
	query?: string
	softDelete: boolean
	passphrase?: string
	passphraseEnv?: string
	passphraseFile?: string
	passphraseStdin: boolean
	name?: string
}

export type FetchInit = Parameters<typeof fetch>[1]

export type FetchLike = (
	input: string,
	init?: FetchInit,
) => Promise<Response>

export type RuntimeDeps = {
	fetch: FetchLike
	env: Record<string, string | undefined>
	readFile: (path: string) => Promise<string>
	readStdin: () => Promise<string>
	now: () => string
}
