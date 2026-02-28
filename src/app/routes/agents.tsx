import { useState, type FormEvent } from "react"
import { co } from "jazz-tools"
import { createFileRoute } from "@tanstack/react-router"
import { useAccount, usePassphraseAuth } from "jazz-tools/react"
import { UserAccount, Space, Document, createSpaceDocument, getRandomWriterName } from "@/schema"
import { createPersonalDocument } from "@/lib/documents"
import { getDocumentTitle } from "@/lib/document-utils"
import { parseFrontmatter } from "@/editor/frontmatter"
import { wordlist } from "@/lib/wordlist"
import {
	AGENT_ACTIONS,
	AGENT_ACTION_LABELS,
	type AgentAction,
	type AgentActionParams,
	getActionFormFields,
	parseActionParams,
	parseAgentAction,
	runAuthAction,
} from "./agents-contract"
import {
	AGENTS_STABLE_IDS,
	makeAgentFieldId,
	makeAgentFieldTestId,
} from "./agents-automation"

export { Route }

let Route = createFileRoute("/agents")({
	component: AgentsRoute,
})

type LogEntry = {
	id: string
	at: string
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
}

function AgentsRoute() {
	let me = useAccount(UserAccount, { resolve: meResolve })
	let auth = usePassphraseAuth({ wordlist })
	let [action, setAction] = useState<AgentAction>("listSpaces")
	let [params, setParams] = useState<Record<string, string>>({})
	let [logs, setLogs] = useState<LogEntry[]>([])

	let actionFields = getActionFormFields(action)

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		let requestId = crypto.randomUUID()
		let parsed = parseActionParams(action, params)
		if (!parsed.ok) {
			appendLog({
				requestId,
				action,
				ok: false,
				error: parsed.error,
			})
			return
		}
		await runAction(action, parsed.data, requestId)
	}

	async function runAction(
		actionToRun: AgentAction,
		input: AgentActionParams,
		requestId: string,
	) {
		if (actionToRun === "clearLog") {
			setLogs([])
			return
		}

		try {
			if (actionToRun === "createAccount" || actionToRun === "signIn") {
				let result = await runAuthAction(actionToRun, input, auth, getRandomWriterName)
				appendLog({
					requestId,
					action: actionToRun,
					ok: true,
					result,
				})
				return
			}

			let loadedMe = await me.$jazz.ensureLoaded({ resolve: meResolve })
			if (!loadedMe.root) {
				throw new Error("User root is not loaded")
			}

			let result = await executeAction(loadedMe, actionToRun, input)
			appendLog({
				requestId,
				action: actionToRun,
				ok: true,
				result,
			})
		} catch (error) {
			let message = error instanceof Error ? error.message : String(error)
			appendLog({
				requestId,
				action: actionToRun,
				ok: false,
				error: message,
			})
		}
	}

	function appendLog(entry: Omit<LogEntry, "id" | "at">) {
		setLogs(current => [
			{
				id: crypto.randomUUID(),
				at: new Date().toISOString(),
				...entry,
			},
			...current,
		])
	}

	function handleActionChange(value: string) {
		let nextAction = parseAgentAction(value)
		if (!nextAction) return
		setAction(nextAction)
		setParams({})
	}

	function updateParam(key: string, value: string) {
		setParams(current => ({ ...current, [key]: value }))
	}

	return (
		<main
			className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4"
			data-testid={AGENTS_STABLE_IDS.page}
			id={AGENTS_STABLE_IDS.page}
		>
			<title>Agents</title>
			<h1 className="text-xl font-semibold">Agents</h1>
			<p className="text-muted-foreground text-sm">
				Prototype automation surface for humans and browser agents.
			</p>

			<form
				id={AGENTS_STABLE_IDS.form}
				data-testid={AGENTS_STABLE_IDS.form}
				onSubmit={handleSubmit}
				className="border-border grid gap-3 rounded border p-3"
			>
				<label className="grid gap-1" htmlFor={AGENTS_STABLE_IDS.actionSelect}>
					<span className="text-sm font-medium">Action</span>
					<select
						id={AGENTS_STABLE_IDS.actionSelect}
						data-testid={AGENTS_STABLE_IDS.actionSelect}
						value={action}
						onChange={event => handleActionChange(event.target.value)}
						className="border-border bg-background rounded border px-2 py-1 text-sm"
					>
						{AGENT_ACTIONS.map(actionName => (
							<option key={actionName} value={actionName}>
								{AGENT_ACTION_LABELS[actionName]}
							</option>
						))}
					</select>
				</label>

				<div
					id={AGENTS_STABLE_IDS.dynamicFields}
					data-testid={AGENTS_STABLE_IDS.dynamicFields}
					className="grid gap-2"
				>
					{actionFields.map(field => (
						<label
							key={field.key}
							className="grid gap-1"
							htmlFor={makeAgentFieldId(field.key)}
						>
							<span className="text-sm font-medium">{field.label}</span>
							{field.multiline ? (
								<textarea
									id={makeAgentFieldId(field.key)}
									data-testid={makeAgentFieldTestId(field.key)}
									value={params[field.key] ?? ""}
									onChange={event => updateParam(field.key, event.target.value)}
									placeholder={field.placeholder}
									className="border-border bg-background min-h-24 rounded border px-2 py-1 font-mono text-xs"
								/>
							) : (
								<input
									id={makeAgentFieldId(field.key)}
									data-testid={makeAgentFieldTestId(field.key)}
									type="text"
									value={params[field.key] ?? ""}
									onChange={event => updateParam(field.key, event.target.value)}
									placeholder={field.placeholder}
									className="border-border bg-background rounded border px-2 py-1 text-sm"
								/>
							)}
						</label>
					))}
				</div>

				<button
					id={AGENTS_STABLE_IDS.submit}
					data-testid={AGENTS_STABLE_IDS.submit}
					type="submit"
					className="bg-primary text-primary-foreground w-fit rounded px-3 py-1.5 text-sm"
				>
					Run Action
				</button>
			</form>

			<section
				className="border-border rounded border p-3"
				id={AGENTS_STABLE_IDS.log}
				data-testid={AGENTS_STABLE_IDS.log}
			>
				<h2 className="mb-2 text-sm font-semibold">Result log</h2>
				<ul
					className="grid gap-2"
					id={AGENTS_STABLE_IDS.logList}
					data-testid={AGENTS_STABLE_IDS.logList}
				>
					{logs.length === 0 && (
						<li className="text-muted-foreground text-sm">No results yet.</li>
					)}
					{logs.map(entry => (
						<li
							key={entry.id}
							className="bg-muted/30 rounded border p-2"
							data-testid={AGENTS_STABLE_IDS.logEntry}
						>
							<div className="mb-1 flex flex-wrap gap-2 text-xs">
								<strong>{entry.action}</strong>
								<span>{entry.ok ? "ok" : "error"}</span>
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

async function executeAction(
	me: co.loaded<typeof UserAccount, typeof meResolve>,
	action: AgentAction,
	params: AgentActionParams,
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
			let docs: Array<{ id: string; content: string; scope: string }> = []
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
		case "createAccount":
		case "signIn":
		case "clearLog":
			return { handledInRoute: true }
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
