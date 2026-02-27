import { useMemo, useState, useCallback, useEffect, type FormEvent } from "react"
import { co } from "jazz-tools"
import { createFileRoute } from "@tanstack/react-router"
import { useAccount } from "jazz-tools/react"
import { UserAccount, Space, Document, createSpaceDocument } from "@/schema"
import { createPersonalDocument } from "@/lib/documents"
import { getDocumentTitle } from "@/lib/document-utils"
import { parseFrontmatter } from "@/editor/frontmatter"

export { Route }

let Route = createFileRoute("/agents")({
	component: AgentsRoute,
})

type AgentAction =
	| "listSpaces"
	| "listDocs"
	| "getDoc"
	| "createDoc"
	| "updateDoc"
	| "appendDoc"
	| "setFrontmatter"
	| "findDocByTitle"
	| "clearLog"

type ActionParams = {
	spaceId?: string
	docId?: string
	title?: string
	content?: string
	query?: string
	frontmatterJson?: string
}

type AgentRequest = {
	type: "alkalye:agents:request"
	requestId: string
	action: AgentAction
	params?: ActionParams
}

type AgentResponse = {
	type: "alkalye:agents:response"
	requestId: string
	action: AgentAction
	ok: boolean
	result?: unknown
	error?: string
}

type LogEntry = {
	id: string
	at: string
	source: "ui" | "message"
	requestId: string
	action: AgentAction
	ok: boolean
	result?: unknown
	error?: string
}

let meResolve = {
	root: {
		documents: { $each: { content: true } },
		spaces: { $each: { documents: { $each: { content: true } } } },
	},
} as const

/**
 * /agents prototype
 *
 * Message protocol:
 * - request:  { type: "alkalye:agents:request", requestId, action, params }
 * - response: { type: "alkalye:agents:response", requestId, action, ok, result|error }
 */
function AgentsRoute() {
	let me = useAccount(UserAccount, { resolve: meResolve })
	let [action, setAction] = useState<AgentAction>("listSpaces")
	let [params, setParams] = useState<ActionParams>({})
	let [logs, setLogs] = useState<LogEntry[]>([])

	let actionFields = useMemo(() => getActionFields(action), [action])

	let appendLog = useCallback((entry: Omit<LogEntry, "id" | "at">) => {
		setLogs(current => [
			{
				id: crypto.randomUUID(),
				at: new Date().toISOString(),
				...entry,
			},
			...current,
		])
	}, [])

	let runAction = useCallback(
		async (
			actionToRun: AgentAction,
			input: ActionParams,
			source: "ui" | "message",
			requestId: string,
		): Promise<AgentResponse> => {
			if (actionToRun === "clearLog") {
				setLogs([])
				return {
					type: "alkalye:agents:response",
					requestId,
					action: actionToRun,
					ok: true,
					result: { cleared: true },
				}
			}

			try {
				let loadedMe = await me.$jazz.ensureLoaded({ resolve: meResolve })
				if (!loadedMe.root) {
					throw new Error("User root is not loaded")
				}

				let result = await executeAction(loadedMe, actionToRun, input)
				appendLog({
					source,
					requestId,
					action: actionToRun,
					ok: true,
					result,
				})
				return {
					type: "alkalye:agents:response",
					requestId,
					action: actionToRun,
					ok: true,
					result,
				}
			} catch (error) {
				let message = error instanceof Error ? error.message : String(error)
				appendLog({
					source,
					requestId,
					action: actionToRun,
					ok: false,
					error: message,
				})
				return {
					type: "alkalye:agents:response",
					requestId,
					action: actionToRun,
					ok: false,
					error: message,
				}
			}
		},
		[appendLog, me],
	)

	useEffect(() => {
		async function onMessage(event: MessageEvent<unknown>) {
			let data = event.data
			if (!isAgentRequest(data)) return

			let response = await runAction(
				data.action,
				data.params ?? {},
				"message",
				data.requestId,
			)

			if (event.source && "postMessage" in event.source) {
				;(event.source as Window).postMessage(response, "*")
			}
		}

		window.addEventListener("message", onMessage)
		return () => window.removeEventListener("message", onMessage)
	}, [runAction])

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault()
		let requestId = crypto.randomUUID()
		await runAction(action, params, "ui", requestId)
	}

	function updateParam<K extends keyof ActionParams>(key: K, value: string) {
		setParams(current => ({ ...current, [key]: value }))
	}

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4" data-testid="agents-page" id="agents-page">
			<title>Agents</title>
			<h1 className="text-xl font-semibold">Agents</h1>
			<p className="text-muted-foreground text-sm">
				Prototype automation surface for humans and browser agents.
			</p>

			<form
				id="agents-form"
				data-testid="agents-form"
				onSubmit={handleSubmit}
				className="border-border grid gap-3 rounded border p-3"
			>
				<label className="grid gap-1" htmlFor="agents-action-select">
					<span className="text-sm font-medium">Action</span>
					<select
						id="agents-action-select"
						data-testid="agents-action-select"
						value={action}
						onChange={e => setAction(e.target.value as AgentAction)}
						className="border-border bg-background rounded border px-2 py-1 text-sm"
					>
						{ACTIONS.map(actionName => (
							<option key={actionName} value={actionName}>
								{actionName}
							</option>
						))}
					</select>
				</label>

				<div
					id="agents-dynamic-fields"
					data-testid="agents-dynamic-fields"
					className="grid gap-2"
				>
					{actionFields.map(field => (
						<label key={field.key} className="grid gap-1" htmlFor={`agents-field-${field.key}`}>
							<span className="text-sm font-medium">{field.label}</span>
							{field.multiline ? (
								<textarea
									id={`agents-field-${field.key}`}
									data-testid={`agents-field-${field.key}`}
									value={params[field.key] ?? ""}
									onChange={e => updateParam(field.key, e.target.value)}
									placeholder={field.placeholder}
									className="border-border bg-background min-h-24 rounded border px-2 py-1 font-mono text-xs"
								/>
							) : (
								<input
									id={`agents-field-${field.key}`}
									data-testid={`agents-field-${field.key}`}
									type="text"
									value={params[field.key] ?? ""}
									onChange={e => updateParam(field.key, e.target.value)}
									placeholder={field.placeholder}
									className="border-border bg-background rounded border px-2 py-1 text-sm"
								/>
							)}
						</label>
					))}
				</div>

				<button
					id="agents-submit"
					data-testid="agents-submit"
					type="submit"
					className="bg-primary text-primary-foreground w-fit rounded px-3 py-1.5 text-sm"
				>
					Run Action
				</button>
			</form>

			<section className="border-border rounded border p-3" id="agents-log" data-testid="agents-log">
				<h2 className="mb-2 text-sm font-semibold">Result log</h2>
				<ul className="grid gap-2" id="agents-log-list" data-testid="agents-log-list">
					{logs.length === 0 && <li className="text-muted-foreground text-sm">No results yet.</li>}
					{logs.map(entry => (
						<li
							key={entry.id}
							className="bg-muted/30 rounded border p-2"
							data-testid="agents-log-entry"
						>
							<div className="mb-1 flex flex-wrap gap-2 text-xs">
								<strong>{entry.action}</strong>
								<span>{entry.ok ? "ok" : "error"}</span>
								<span>source: {entry.source}</span>
								<span>requestId: {entry.requestId}</span>
							</div>
							<pre className="overflow-auto text-xs">
								{JSON.stringify(
									{
										at: entry.at,
										result: entry.result,
										error: entry.error,
									},
									null,
									2,
								)}
							</pre>
						</li>
					))}
				</ul>
			</section>
		</main>
	)
}

let ACTIONS: AgentAction[] = [
	"listSpaces",
	"listDocs",
	"getDoc",
	"createDoc",
	"updateDoc",
	"appendDoc",
	"setFrontmatter",
	"findDocByTitle",
	"clearLog",
]

function getActionFields(action: AgentAction): Array<{
	key: keyof ActionParams
	label: string
	placeholder?: string
	multiline?: boolean
}> {
	switch (action) {
		case "listDocs":
			return [
				{
					key: "spaceId",
					label: "spaceId (optional)",
					placeholder: "Leave empty to list personal docs",
				},
			]
		case "getDoc":
			return [{ key: "docId", label: "docId" }]
		case "createDoc":
			return [
				{ key: "spaceId", label: "spaceId (optional)" },
				{ key: "title", label: "title (optional)" },
				{ key: "content", label: "content", multiline: true },
			]
		case "updateDoc":
			return [
				{ key: "docId", label: "docId" },
				{ key: "content", label: "content", multiline: true },
			]
		case "appendDoc":
			return [
				{ key: "docId", label: "docId" },
				{ key: "content", label: "contentToAppend", multiline: true },
			]
		case "setFrontmatter":
			return [
				{ key: "docId", label: "docId" },
				{
					key: "frontmatterJson",
					label: "frontmatter JSON",
					placeholder: '{"title":"New title","pinned":true}',
					multiline: true,
				},
			]
		case "findDocByTitle":
			return [
				{ key: "query", label: "query" },
				{ key: "spaceId", label: "spaceId (optional)" },
			]
		case "clearLog":
		case "listSpaces":
			return []
	}
}

function isAgentRequest(value: unknown): value is AgentRequest {
	if (!value || typeof value !== "object") return false
	let maybe = value as Partial<AgentRequest>
	return (
		maybe.type === "alkalye:agents:request" &&
		typeof maybe.requestId === "string" &&
		typeof maybe.action === "string"
	)
}

async function executeAction(
	me: co.loaded<typeof UserAccount, typeof meResolve>,
	action: AgentAction,
	params: ActionParams,
): Promise<unknown> {
	switch (action) {
		case "listSpaces": {
			let spaces = me.root.spaces?.$isLoaded ? [...me.root.spaces] : []
			return spaces
				.filter(space => space?.$isLoaded)
				.map(space => ({
					id: space.$jazz.id,
					name: space.name,
					docCount: space.documents?.length ?? 0,
				}))
		}
		case "listDocs": {
			if (params.spaceId) {
				let space = await Space.load(params.spaceId, {
					resolve: { documents: { $each: { content: true } } },
				})
				if (!space?.$isLoaded || !space.documents?.$isLoaded) {
					throw new Error("Space not found or inaccessible")
				}
				return [...space.documents]
					.filter(doc => doc?.$isLoaded)
					.map(doc => ({
						id: doc.$jazz.id,
						title: getDocumentTitle(doc.content?.toString() ?? ""),
						updatedAt: doc.updatedAt,
					}))
			}
			return [...me.root.documents]
				.filter(doc => doc?.$isLoaded)
				.map(doc => ({
					id: doc.$jazz.id,
					title: getDocumentTitle(doc.content?.toString() ?? ""),
					updatedAt: doc.updatedAt,
				}))
		}
		case "getDoc": {
			if (!params.docId) throw new Error("docId is required")
			let doc = await Document.load(params.docId, { resolve: { content: true } })
			if (!doc?.$isLoaded) throw new Error("Document not found")
			return {
				id: doc.$jazz.id,
				title: getDocumentTitle(doc.content?.toString() ?? ""),
				content: doc.content?.toString() ?? "",
				updatedAt: doc.updatedAt,
			}
		}
		case "createDoc": {
			let title = (params.title ?? "").trim()
			let content = params.content ?? ""
			if (title && !content.trim()) {
				content = `# ${title}\n\n`
			}
			if (params.spaceId) {
				let space = await Space.load(params.spaceId, { resolve: { documents: true } })
				if (!space?.$isLoaded || !space.documents?.$isLoaded) {
					throw new Error("Space not found or inaccessible")
				}
				let newDoc = createSpaceDocument(space.$jazz.owner, content)
				space.documents.$jazz.push(newDoc)
				return { id: newDoc.$jazz.id, spaceId: space.$jazz.id }
			}
			let newDoc = await createPersonalDocument(me, content)
			return { id: newDoc.$jazz.id }
		}
		case "updateDoc": {
			if (!params.docId) throw new Error("docId is required")
			if (params.content === undefined) throw new Error("content is required")
			let doc = await Document.load(params.docId, { resolve: { content: true } })
			if (!doc?.$isLoaded) throw new Error("Document not found")
			doc.content?.applyDiff(doc.content.toString(), params.content)
			doc.$jazz.set("updatedAt", new Date())
			return { id: doc.$jazz.id, updatedAt: doc.updatedAt }
		}
		case "appendDoc": {
			if (!params.docId) throw new Error("docId is required")
			if (!params.content) throw new Error("content is required")
			let doc = await Document.load(params.docId, { resolve: { content: true } })
			if (!doc?.$isLoaded) throw new Error("Document not found")
			let current = doc.content?.toString() ?? ""
			let separator = current.endsWith("\n") || current.length === 0 ? "" : "\n"
			let next = `${current}${separator}${params.content}`
			doc.content?.applyDiff(current, next)
			doc.$jazz.set("updatedAt", new Date())
			return { id: doc.$jazz.id, updatedAt: doc.updatedAt }
		}
		case "setFrontmatter": {
			if (!params.docId) throw new Error("docId is required")
			if (!params.frontmatterJson) throw new Error("frontmatterJson is required")
			let patch = parseFrontmatterPatch(params.frontmatterJson)
			let doc = await Document.load(params.docId, { resolve: { content: true } })
			if (!doc?.$isLoaded) throw new Error("Document not found")
			let current = doc.content?.toString() ?? ""
			let next = applyFrontmatterPatch(current, patch)
			doc.content?.applyDiff(current, next)
			doc.$jazz.set("updatedAt", new Date())
			return {
				id: doc.$jazz.id,
				updatedAt: doc.updatedAt,
				frontmatter: parseFrontmatter(next).frontmatter,
			}
		}
		case "findDocByTitle": {
			let query = (params.query ?? "").trim().toLowerCase()
			if (!query) throw new Error("query is required")
			let docs = [] as Array<{ id: string; content: string; scope: string }>
			if (params.spaceId) {
				let space = await Space.load(params.spaceId, {
					resolve: { documents: { $each: { content: true } } },
				})
				if (!space?.$isLoaded || !space.documents?.$isLoaded) {
					throw new Error("Space not found or inaccessible")
				}
				docs = [...space.documents]
					.filter(doc => doc?.$isLoaded)
					.map(doc => ({
						id: doc.$jazz.id,
						content: doc.content?.toString() ?? "",
						scope: `space:${space.$jazz.id}`,
					}))
			} else {
				docs = [...me.root.documents]
					.filter(doc => doc?.$isLoaded)
					.map(doc => ({
						id: doc.$jazz.id,
						content: doc.content?.toString() ?? "",
						scope: "personal",
					}))
			}
			return docs
				.map(doc => ({
					id: doc.id,
					title: getDocumentTitle(doc.content),
					scope: doc.scope,
				}))
				.filter(doc => doc.title.toLowerCase().includes(query))
		}
		case "clearLog":
			return { cleared: true }
	}
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
	let entries = Object.entries(parsed as Record<string, unknown>)
	for (let [, value] of entries) {
		if (
			value !== null &&
			typeof value !== "string" &&
			typeof value !== "boolean"
		) {
			throw new Error("frontmatter values must be string, boolean or null")
		}
	}
	return parsed as Record<string, string | boolean | null>
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
