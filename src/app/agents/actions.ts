import { z } from "zod"
import { co } from "jazz-tools"
import { Space, Document, UserAccount, createSpaceDocument, getRandomWriterName } from "@/schema"
import { createPersonalDocument } from "@/lib/documents"
import { getDocumentTitle } from "@/lib/document-utils"
import { parseFrontmatter } from "@/editor/frontmatter"

export {
	agentActionSchema,
	AGENT_ACTIONS,
	type AgentAction,
	type AgentActionParams,
	type AgentActionContext,
	type AgentFormField,
	isAuthAction,
	parseAgentAction,
	getActionFormFields,
	getActionLabel,
	getActionDescription,
	parseActionParams,
	executeAgentAction,
	buildAgentUtilities,
	AGENT_DEFAULT_CONTEXT,
}

let agentActionSchema = z.enum([
	"listSpaces",
	"listDocs",
	"getDoc",
	"createDoc",
	"updateDoc",
	"appendDoc",
	"upsertDocByTitle",
	"setFrontmatter",
	"findDocByTitle",
	"createAccount",
	"signIn",
	"clearLog",
])

type AgentAction = z.infer<typeof agentActionSchema>
type AgentActionParams = Record<string, string | undefined>

type AgentFormField = {
	key: string
	label: string
	description?: string
	placeholder?: string
	kind: "text" | "textarea" | "select"
	options?: Array<{ value: string; label: string }>
	required: boolean
	defaultValue?: string
}

type AgentActionContext = {
	me: co.loaded<typeof UserAccount, typeof meResolve>
	auth: {
		registerNewAccount: (passphrase: string, name: string) => Promise<unknown>
		logIn: (passphrase: string) => Promise<unknown>
	}
	getFallbackName: () => string
}

type FieldUi = Omit<AgentFormField, "key" | "required">

type AgentActionDefinition = {
	label: string
	description: string
	schema: z.ZodObject<Record<string, z.ZodType>>
	fields: Record<string, FieldUi>
	execute: (context: AgentActionContext, params: AgentActionParams) => Promise<unknown>
}

let AGENT_ACTIONS: AgentAction[] = agentActionSchema.options

let AGENT_ACTION_DEFINITIONS: Record<AgentAction, AgentActionDefinition> = {
	listSpaces: {
		label: "List Spaces",
		description: "List all accessible spaces with document counts.",
		schema: z.object({}),
		fields: {},
		execute: async context => {
			let spaces = context.me.root.spaces?.$isLoaded ? [...context.me.root.spaces] : []
			return spaces.filter(space => space?.$isLoaded).map(space => ({
				id: space.$jazz.id,
				name: space.name,
				docCount: space.documents?.length ?? 0,
			}))
		},
	},
	listDocs: {
		label: "List Docs",
		description: "List docs from personal scope or from a provided space.",
		schema: z.object({ spaceId: z.string().optional() }),
		fields: {
			spaceId: {
				label: "spaceId (optional)",
				kind: "text",
				placeholder: "Leave empty to list personal docs",
			},
		},
		execute: async (context, params) => {
			if (params.spaceId) {
				let space = await Space.load(params.spaceId, {
					resolve: { documents: { $each: { content: true } } },
				})
				if (!space?.$isLoaded || !space.documents?.$isLoaded) {
					throw new Error("Space not found or inaccessible")
				}
				return [...space.documents].filter(doc => doc?.$isLoaded).map(doc => ({
					id: doc.$jazz.id,
					title: getDocumentTitle(doc.content?.toString() ?? ""),
					updatedAt: doc.updatedAt,
				}))
			}
			return [...context.me.root.documents].filter(doc => doc?.$isLoaded).map(doc => ({
				id: doc.$jazz.id,
				title: getDocumentTitle(doc.content?.toString() ?? ""),
				updatedAt: doc.updatedAt,
			}))
		},
	},
	getDoc: {
		label: "Get Doc",
		description: "Load one document with title and full content.",
		schema: z.object({ docId: z.string().min(1, "docId is required") }),
		fields: {
			docId: { label: "docId", kind: "text" },
		},
		execute: async (_context, params) => {
			if (!params.docId) throw new Error("docId is required")
			let doc = await Document.load(params.docId, { resolve: { content: true } })
			if (!doc?.$isLoaded) throw new Error("Document not found")
			return {
				id: doc.$jazz.id,
				title: getDocumentTitle(doc.content?.toString() ?? ""),
				content: doc.content?.toString() ?? "",
				updatedAt: doc.updatedAt,
			}
		},
	},
	createDoc: {
		label: "Create Doc",
		description: "Create a new personal or space document.",
		schema: z.object({
			spaceId: z.string().optional(),
			title: z.string().optional(),
			content: z.string().optional(),
		}),
		fields: {
			spaceId: { label: "spaceId (optional)", kind: "text" },
			title: { label: "title (optional)", kind: "text" },
			content: {
				label: "content",
				kind: "textarea",
				placeholder: "If title is set and content is empty, we'll seed '# title'",
			},
		},
		execute: async (context, params) => {
			let title = (params.title ?? "").trim()
			let content = params.content ?? ""
			if (title && !content.trim()) content = `# ${title}\n\n`
			if (params.spaceId) {
				let space = await Space.load(params.spaceId, { resolve: { documents: true } })
				if (!space?.$isLoaded || !space.documents?.$isLoaded) {
					throw new Error("Space not found or inaccessible")
				}
				let newDoc = createSpaceDocument(space.$jazz.owner, content)
				space.documents.$jazz.push(newDoc)
				return { id: newDoc.$jazz.id, spaceId: space.$jazz.id, created: true }
			}
			let newDoc = await createPersonalDocument(context.me, content)
			return { id: newDoc.$jazz.id, created: true }
		},
	},
	updateDoc: {
		label: "Update Doc",
		description: "Replace full document content.",
		schema: z.object({
			docId: z.string().min(1, "docId is required"),
			content: z.string(),
		}),
		fields: {
			docId: { label: "docId", kind: "text" },
			content: { label: "content", kind: "textarea" },
		},
		execute: async (_context, params) => {
			if (!params.docId) throw new Error("docId is required")
			if (params.content === undefined) throw new Error("content is required")
			let doc = await Document.load(params.docId, { resolve: { content: true } })
			if (!doc?.$isLoaded) throw new Error("Document not found")
			// @ts-expect-error jazz text supports applyDiff
			doc.content?.applyDiff(doc.content.toString(), params.content)
			doc.$jazz.set("updatedAt", new Date())
			return { id: doc.$jazz.id, updatedAt: doc.updatedAt, mode: "replace" }
		},
	},
	appendDoc: {
		label: "Append Doc",
		description: "Append content to the end of a document.",
		schema: z.object({
			docId: z.string().min(1, "docId is required"),
			content: z.string().min(1, "content is required"),
		}),
		fields: {
			docId: { label: "docId", kind: "text" },
			content: {
				label: "contentToAppend",
				kind: "textarea",
				placeholder: "Will add a newline separator when needed",
			},
		},
		execute: async (_context, params) => {
			if (!params.docId) throw new Error("docId is required")
			if (!params.content) throw new Error("content is required")
			let doc = await Document.load(params.docId, { resolve: { content: true } })
			if (!doc?.$isLoaded) throw new Error("Document not found")
			let current = doc.content?.toString() ?? ""
			let separator = current.endsWith("\n") || current.length === 0 ? "" : "\n"
			let next = `${current}${separator}${params.content}`
			// @ts-expect-error jazz text supports applyDiff
			doc.content?.applyDiff(current, next)
			doc.$jazz.set("updatedAt", new Date())
			return { id: doc.$jazz.id, updatedAt: doc.updatedAt, mode: "append" }
		},
	},
	upsertDocByTitle: {
		label: "Upsert Doc By Title",
		description: "Find doc by exact title; append/replace content if found, otherwise create.",
		schema: z.object({
			title: z.string().min(1, "title is required"),
			content: z.string().min(1, "content is required"),
			spaceId: z.string().optional(),
			mode: z.enum(["append", "replace"]).default("append"),
		}),
		fields: {
			title: { label: "title (exact match)", kind: "text" },
			content: { label: "content", kind: "textarea" },
			spaceId: { label: "spaceId (optional)", kind: "text" },
			mode: {
				label: "mode",
				kind: "select",
				defaultValue: "append",
				options: [
					{ value: "append", label: "append" },
					{ value: "replace", label: "replace" },
				],
			},
		},
		execute: async (context, params) => {
			let title = (params.title ?? "").trim()
			let content = params.content ?? ""
			let mode = params.mode === "replace" ? "replace" : "append"
			if (!title) throw new Error("title is required")
			if (!content) throw new Error("content is required")
			let docs = await AGENT_ACTION_DEFINITIONS.listDocs.execute(context, {
				spaceId: params.spaceId,
			})
			if (!Array.isArray(docs)) throw new Error("Unable to list docs for upsert")
			let existing = docs.find(doc => {
				if (!doc || typeof doc !== "object") return false
				let asDoc = doc as { id?: string; title?: string }
				return typeof asDoc.id === "string" && asDoc.title?.trim() === title
			}) as { id: string } | undefined
			if (!existing) {
				let created = await AGENT_ACTION_DEFINITIONS.createDoc.execute(context, {
					spaceId: params.spaceId,
					title,
					content: `# ${title}\n\n${content}`,
				})
				return { ...(created as object), upsert: "created", mode }
			}
			if (mode === "replace") {
				await AGENT_ACTION_DEFINITIONS.updateDoc.execute(context, {
					docId: existing.id,
					content,
				})
			} else {
				await AGENT_ACTION_DEFINITIONS.appendDoc.execute(context, {
					docId: existing.id,
					content,
				})
			}
			return { id: existing.id, upsert: "updated", mode }
		},
	},
	setFrontmatter: {
		label: "Set Frontmatter",
		description: "Upsert frontmatter keys by JSON patch (null removes key).",
		schema: z.object({
			docId: z.string().min(1, "docId is required"),
			frontmatterJson: z.string().min(1, "frontmatterJson is required"),
		}),
		fields: {
			docId: { label: "docId", kind: "text" },
			frontmatterJson: {
				label: "frontmatter JSON",
				placeholder: '{"title":"New title","pinned":true}',
				kind: "textarea",
			},
		},
		execute: async (_context, params) => {
			if (!params.docId) throw new Error("docId is required")
			if (!params.frontmatterJson) throw new Error("frontmatterJson is required")
			let patch = parseFrontmatterPatch(params.frontmatterJson)
			let doc = await Document.load(params.docId, { resolve: { content: true } })
			if (!doc?.$isLoaded) throw new Error("Document not found")
			let current = doc.content?.toString() ?? ""
			let next = applyFrontmatterPatch(current, patch)
			// @ts-expect-error jazz text supports applyDiff
			doc.content?.applyDiff(current, next)
			doc.$jazz.set("updatedAt", new Date())
			return { id: doc.$jazz.id, updatedAt: doc.updatedAt, frontmatter: parseFrontmatter(next).frontmatter }
		},
	},
	findDocByTitle: {
		label: "Find Doc By Title",
		description: "Find docs by case-insensitive title substring.",
		schema: z.object({
			query: z.string().min(1, "query is required"),
			spaceId: z.string().optional(),
		}),
		fields: {
			query: { label: "query", kind: "text" },
			spaceId: { label: "spaceId (optional)", kind: "text" },
		},
		execute: async (context, params) => {
			let query = (params.query ?? "").trim().toLowerCase()
			if (!query) throw new Error("query is required")
			let docs = await AGENT_ACTION_DEFINITIONS.listDocs.execute(context, {
				spaceId: params.spaceId,
			})
			if (!Array.isArray(docs)) return []
			return docs
				.filter(doc => typeof doc === "object" && doc !== null)
				.map(doc => ({
					id: (doc as { id: string }).id,
					title: (doc as { title: string }).title,
				}))
				.filter(doc => doc.title.toLowerCase().includes(query))
		},
	},
	createAccount: {
		label: "Create Account",
		description: "Create a new account and sign in.",
		schema: z.object({
			passphrase: z.string().min(1, "passphrase is required"),
			name: z.string().optional(),
		}),
		fields: {
			passphrase: {
				label: "recovery phrase",
				kind: "textarea",
				placeholder: "word1 word2 word3 ...",
			},
			name: {
				label: "display name (optional)",
				kind: "text",
				placeholder: "Leave empty for random writer name",
			},
		},
		execute: async (context, params) => {
			let passphrase = params.passphrase
			if (!passphrase) throw new Error("passphrase is required")
			let name = params.name?.trim() || context.getFallbackName()
			await context.auth.registerNewAccount(passphrase, name)
			return { signedIn: true, name }
		},
	},
	signIn: {
		label: "Sign In",
		description: "Sign in with an existing passphrase.",
		schema: z.object({ passphrase: z.string().min(1, "passphrase is required") }),
		fields: {
			passphrase: {
				label: "recovery phrase",
				kind: "textarea",
				placeholder: "word1 word2 word3 ...",
			},
		},
		execute: async (context, params) => {
			let passphrase = params.passphrase
			if (!passphrase) throw new Error("passphrase is required")
			await context.auth.logIn(passphrase)
			return { signedIn: true }
		},
	},
	clearLog: {
		label: "Clear Log",
		description: "Clear local execution log in the route.",
		schema: z.object({}),
		fields: {},
		execute: async () => ({ clearLog: true }),
	},
}

const meResolve = {
	root: {
		documents: { $each: { content: true } },
		spaces: { $each: { documents: { $each: { content: true } } } },
	},
}

const AGENT_DEFAULT_CONTEXT = {
	meResolve,
	defaultFallbackName: () => getRandomWriterName(),
}

function parseAgentAction(value: string): AgentAction | null {
	let parsed = agentActionSchema.safeParse(value)
	if (!parsed.success) return null
	return parsed.data
}

function getActionLabel(action: AgentAction): string {
	return AGENT_ACTION_DEFINITIONS[action].label
}

function getActionDescription(action: AgentAction): string {
	return AGENT_ACTION_DEFINITIONS[action].description
}

function getActionFormFields(action: AgentAction): AgentFormField[] {
	let definition = AGENT_ACTION_DEFINITIONS[action]
	let schema = definition.schema
	let keys = schema.keyof().options
	return keys.map(key => {
		let fieldSchema = schema.shape[key]
		let ui = definition.fields[key]
		return {
			key,
			label: ui?.label ?? key,
			description: ui?.description,
			placeholder: ui?.placeholder,
			kind: ui?.kind ?? "text",
			options: ui?.options,
			required: !isOptionalField(fieldSchema),
			defaultValue: ui?.defaultValue,
		}
	})
}

function parseActionParams(
	action: AgentAction,
	input: Record<string, string>,
):
	| { ok: true; data: AgentActionParams }
	| { ok: false; error: string } {
	let schema = AGENT_ACTION_DEFINITIONS[action].schema
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

async function executeAgentAction(
	action: AgentAction,
	params: AgentActionParams,
	context: AgentActionContext,
): Promise<unknown> {
	return AGENT_ACTION_DEFINITIONS[action].execute(context, params)
}

function buildAgentUtilities(
	runAction: (action: AgentAction, params?: Record<string, string>) => Promise<unknown>,
) {
	return {
		runAction,
		listSpaces: () => runAction("listSpaces"),
		listDocs: (spaceId?: string) => runAction("listDocs", spaceId ? { spaceId } : {}),
		getDoc: (docId: string) => runAction("getDoc", { docId }),
		createDoc: (params: { title?: string; content?: string; spaceId?: string }) =>
			runAction("createDoc", asStringRecord(params)),
		upsertDocByTitle: (params: {
			title: string
			content: string
			spaceId?: string
			mode?: "append" | "replace"
		}) => runAction("upsertDocByTitle", asStringRecord(params)),
		setFrontmatter: (docId: string, frontmatterJson: string) =>
			runAction("setFrontmatter", { docId, frontmatterJson }),
		signIn: (passphrase: string) => runAction("signIn", { passphrase }),
		createAccount: (passphrase: string, name?: string) =>
			runAction("createAccount", name ? { passphrase, name } : { passphrase }),
	}
}

function asStringRecord(input: Record<string, string | undefined>): Record<string, string> {
	let output: Record<string, string> = {}
	for (let [key, value] of Object.entries(input)) {
		if (value !== undefined) output[key] = value
	}
	return output
}

function isOptionalField(schema: z.ZodType): boolean {
	return schema.safeParse(undefined).success
}

function isAuthAction(action: AgentAction): boolean {
	return action === "createAccount" || action === "signIn"
}

function parseFrontmatterPatch(input: string): Record<string, string | boolean | null> {
	let parsed: unknown
	try {
		parsed = JSON.parse(input)
	} catch {
		throw new Error("frontmatterJson must be valid JSON")
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("frontmatterJson must be a JSON object")
	}
	let entries = Object.entries(parsed)
	for (let [, value] of entries) {
		if (value !== null && typeof value !== "string" && typeof value !== "boolean") {
			throw new Error("frontmatter values must be string, boolean or null")
		}
	}

	let patch: Record<string, string | boolean | null> = {}
	for (let [key, value] of entries) {
		if (value === null || typeof value === "string" || typeof value === "boolean") {
			patch[key] = value
		}
	}
	return patch
}

function applyFrontmatterPatch(
	content: string,
	patch: Record<string, string | boolean | null>,
): string {
	let parsed = parseFrontmatter(content)
	let current = { ...(parsed.frontmatter ?? {}) }

	for (let [key, value] of Object.entries(patch)) {
		if (value === null) {
			delete current[key]
		} else {
			current[key] = value
		}
	}

	let body = parsed.body
	let entries = Object.entries(current)
	if (entries.length === 0) return body

	let yaml = entries
		.map(([key, value]) => {
			if (typeof value === "boolean") return `${key}: ${value ? "true" : "false"}`
			return `${key}: ${JSON.stringify(value)}`
		})
		.join("\n")

	return `---\n${yaml}\n---\n\n${body}`
}
