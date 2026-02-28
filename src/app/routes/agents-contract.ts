import { z } from "zod"

export {
	agentActionSchema,
	AGENT_ACTIONS,
	AGENT_ACTION_LABELS,
	type AgentAction,
	type AgentActionParams,
	type AgentActionAuth,
	type AgentFormField,
	getActionSchema,
	getActionFormFields,
	parseActionParams,
	parseAgentAction,
	runAuthAction,
}

let agentActionSchema = z.enum([
	"listSpaces",
	"listDocs",
	"getDoc",
	"createDoc",
	"updateDoc",
	"appendDoc",
	"setFrontmatter",
	"findDocByTitle",
	"createAccount",
	"signIn",
	"clearLog",
])

type AgentAction = z.infer<typeof agentActionSchema>
type AgentActionParams = Record<string, string | undefined>

type AgentActionAuth = {
	registerNewAccount: (passphrase: string, name: string) => Promise<unknown>
	logIn: (passphrase: string) => Promise<unknown>
}

type FieldUi = {
	label: string
	placeholder?: string
	multiline?: boolean
}

type AgentActionDefinition = {
	schema: z.ZodObject<Record<string, z.ZodType>>
	label: string
	fields: Record<string, FieldUi>
}

type AgentFormField = {
	key: string
	label: string
	placeholder?: string
	multiline: boolean
	required: boolean
}

let AGENT_ACTIONS: AgentAction[] = agentActionSchema.options

let AGENT_ACTIONS_DEFINITION: Record<AgentAction, AgentActionDefinition> = {
	listSpaces: {
		label: "List Spaces",
		schema: z.object({}),
		fields: {},
	},
	listDocs: {
		label: "List Docs",
		schema: z.object({
			spaceId: z.string().optional(),
		}),
		fields: {
			spaceId: {
				label: "spaceId (optional)",
				placeholder: "Leave empty to list personal docs",
			},
		},
	},
	getDoc: {
		label: "Get Doc",
		schema: z.object({
			docId: z.string().min(1, "docId is required"),
		}),
		fields: {
			docId: { label: "docId" },
		},
	},
	createDoc: {
		label: "Create Doc",
		schema: z.object({
			spaceId: z.string().optional(),
			title: z.string().optional(),
			content: z.string().optional(),
		}),
		fields: {
			spaceId: { label: "spaceId (optional)" },
			title: { label: "title (optional)" },
			content: { label: "content", multiline: true },
		},
	},
	updateDoc: {
		label: "Update Doc",
		schema: z.object({
			docId: z.string().min(1, "docId is required"),
			content: z.string(),
		}),
		fields: {
			docId: { label: "docId" },
			content: { label: "content", multiline: true },
		},
	},
	appendDoc: {
		label: "Append Doc",
		schema: z.object({
			docId: z.string().min(1, "docId is required"),
			content: z.string().min(1, "content is required"),
		}),
		fields: {
			docId: { label: "docId" },
			content: { label: "contentToAppend", multiline: true },
		},
	},
	setFrontmatter: {
		label: "Set Frontmatter",
		schema: z.object({
			docId: z.string().min(1, "docId is required"),
			frontmatterJson: z.string().min(1, "frontmatterJson is required"),
		}),
		fields: {
			docId: { label: "docId" },
			frontmatterJson: {
				label: "frontmatter JSON",
				placeholder: '{"title":"New title","pinned":true}',
				multiline: true,
			},
		},
	},
	findDocByTitle: {
		label: "Find Doc By Title",
		schema: z.object({
			query: z.string().min(1, "query is required"),
			spaceId: z.string().optional(),
		}),
		fields: {
			query: { label: "query" },
			spaceId: { label: "spaceId (optional)" },
		},
	},
	createAccount: {
		label: "Create Account",
		schema: z.object({
			passphrase: z.string().min(1, "passphrase is required"),
			name: z.string().optional(),
		}),
		fields: {
			passphrase: {
				label: "recovery phrase",
				multiline: true,
				placeholder: "word1 word2 word3 ...",
			},
			name: {
				label: "display name (optional)",
				placeholder: "Leave empty for random writer name",
			},
		},
	},
	signIn: {
		label: "Sign In",
		schema: z.object({
			passphrase: z.string().min(1, "passphrase is required"),
		}),
		fields: {
			passphrase: {
				label: "recovery phrase",
				multiline: true,
				placeholder: "word1 word2 word3 ...",
			},
		},
	},
	clearLog: {
		label: "Clear Log",
		schema: z.object({}),
		fields: {},
	},
}

let AGENT_ACTION_LABELS: Record<AgentAction, string> = {
	listSpaces: AGENT_ACTIONS_DEFINITION.listSpaces.label,
	listDocs: AGENT_ACTIONS_DEFINITION.listDocs.label,
	getDoc: AGENT_ACTIONS_DEFINITION.getDoc.label,
	createDoc: AGENT_ACTIONS_DEFINITION.createDoc.label,
	updateDoc: AGENT_ACTIONS_DEFINITION.updateDoc.label,
	appendDoc: AGENT_ACTIONS_DEFINITION.appendDoc.label,
	setFrontmatter: AGENT_ACTIONS_DEFINITION.setFrontmatter.label,
	findDocByTitle: AGENT_ACTIONS_DEFINITION.findDocByTitle.label,
	createAccount: AGENT_ACTIONS_DEFINITION.createAccount.label,
	signIn: AGENT_ACTIONS_DEFINITION.signIn.label,
	clearLog: AGENT_ACTIONS_DEFINITION.clearLog.label,
}

function parseAgentAction(value: string): AgentAction | null {
	let parsed = agentActionSchema.safeParse(value)
	if (!parsed.success) return null
	return parsed.data
}

function getActionSchema(action: AgentAction): z.ZodObject<Record<string, z.ZodType>> {
	return AGENT_ACTIONS_DEFINITION[action].schema
}

function getActionFormFields(action: AgentAction): AgentFormField[] {
	let definition = AGENT_ACTIONS_DEFINITION[action]
	let schema = definition.schema
	let keys = schema.keyof().options
	return keys.map(key => {
		let fieldSchema = schema.shape[key]
		let ui = definition.fields[key]
		return {
			key,
			label: ui?.label ?? key,
			placeholder: ui?.placeholder,
			multiline: ui?.multiline ?? false,
			required: !isOptionalField(fieldSchema),
		}
	})
}

function parseActionParams(
	action: AgentAction,
	input: Record<string, string>,
):
	| { ok: true; data: AgentActionParams }
	| { ok: false; error: string } {
	let schema = getActionSchema(action)
	let schemaInput: Record<string, unknown> = {}

	for (let key of schema.keyof().options) {
		let value = input[key]
		if (value === undefined) {
			schemaInput[key] = undefined
			continue
		}
		if (value.trim() === "" && isOptionalField(schema.shape[key])) {
			schemaInput[key] = undefined
			continue
		}
		schemaInput[key] = value
	}

	let result = schema.safeParse(schemaInput)
	if (!result.success) {
		let message = result.error.issues.map(issue => issue.message).join("; ")
		return { ok: false, error: message }
	}

	let data: AgentActionParams = {}
	for (let [key, value] of Object.entries(result.data)) {
		if (typeof value === "string") {
			data[key] = value
		}
	}
	return { ok: true, data }
}

function isOptionalField(schema: z.ZodType): boolean {
	return schema.safeParse(undefined).success
}

async function runAuthAction(
	action: AgentAction,
	params: AgentActionParams,
	auth: AgentActionAuth,
	getFallbackName: () => string,
): Promise<unknown> {
	if (action === "createAccount") {
		let passphrase = params.passphrase
		if (!passphrase) throw new Error("passphrase is required")
		let name = params.name?.trim() || getFallbackName()
		await auth.registerNewAccount(passphrase, name)
		return { signedIn: true, name }
	}
	if (action === "signIn") {
		let passphrase = params.passphrase
		if (!passphrase) throw new Error("passphrase is required")
		await auth.logIn(passphrase)
		return { signedIn: true }
	}
	throw new Error(`Action ${action} is not an auth action`)
}
