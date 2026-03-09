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
	syncUrl: string
	timeoutMs: number
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
	sessionFile?: string
	sessionAccountId?: string
	sessionSecret?: string
}

export type RuntimeDeps = {
	env: Record<string, string | undefined>
	readFile: (path: string) => Promise<string>
	writeFile: (path: string, content: string) => Promise<void>
	mkdir: (path: string) => Promise<void>
	readStdin: () => Promise<string>
	now: () => string
}
