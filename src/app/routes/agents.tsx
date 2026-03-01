import { useEffect, useState, type FormEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useAccount, usePassphraseAuth } from "jazz-tools/react"
import { UserAccount } from "@/schema"
import { wordlist } from "@/lib/wordlist"
import {
	AGENT_ACTIONS,
	type AgentAction,
	type AgentActionParams,
	AGENT_DEFAULT_CONTEXT,
	buildAgentUtilities,
	executeAgentAction,
	getActionFormFields,
	getActionLabel,
	getActionDescription,
	parseActionParams,
	parseAgentAction,
} from "@/app/agents/actions"
import {
	AGENTS_STABLE_IDS,
	makeAgentFieldId,
	makeAgentFieldTestId,
} from "@/app/agents/automation"

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

declare global {
	interface Window {
		alkalyeAgents?: ReturnType<typeof buildAgentUtilities>
	}
}

function AgentsRoute() {
	let me = useAccount(UserAccount, { resolve: AGENT_DEFAULT_CONTEXT.meResolve })
	let auth = usePassphraseAuth({ wordlist })
	let [action, setAction] = useState<AgentAction>("listSpaces")
	let [params, setParams] = useState<Record<string, string>>({})
	let [logs, setLogs] = useState<LogEntry[]>([])

	let actionFields = getActionFormFields(action)

	useEffect(() => {
		for (let field of actionFields) {
			if (!field.defaultValue) continue
			setParams(current => {
				if (current[field.key] !== undefined) return current
				return { ...current, [field.key]: field.defaultValue! }
			})
		}
	}, [actionFields])

	async function runAction(
		actionToRun: AgentAction,
		input: AgentActionParams,
		requestId = crypto.randomUUID(),
	) {
		try {
			let loadedMe = await (me as any).$jazz.ensureLoaded({ resolve: AGENT_DEFAULT_CONTEXT.meResolve })
			if (!loadedMe.root) {
				throw new Error("User root is not loaded")
			}

			let result = await executeAgentAction(actionToRun, input, {
				me: loadedMe,
				auth,
				getFallbackName: AGENT_DEFAULT_CONTEXT.defaultFallbackName,
			})

			if (result && typeof result === "object" && "clearLog" in result) {
				setLogs([])
				return result
			}

			appendLog({ requestId, action: actionToRun, ok: true, result })
			return result
		} catch (error) {
			let message = error instanceof Error ? error.message : String(error)
			appendLog({ requestId, action: actionToRun, ok: false, error: message })
			throw error
		}
	}

	useEffect(() => {
		window.alkalyeAgents = buildAgentUtilities((nextAction, nextParams = {}) =>
			runAction(nextAction, nextParams),
		)
		return () => {
			delete window.alkalyeAgents
		}
	}, [me, auth])

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		let requestId = crypto.randomUUID()
		let parsed = parseActionParams(action, params)
		if (!parsed.ok) {
			appendLog({ requestId, action, ok: false, error: parsed.error })
			return
		}
		try {
			await runAction(action, parsed.data, requestId)
		} catch {
			// logging is handled in runAction
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
								{getActionLabel(actionName)}
							</option>
						))}
					</select>
				</label>
				<p className="text-muted-foreground text-xs">{getActionDescription(action)}</p>

				<div
					id={AGENTS_STABLE_IDS.dynamicFields}
					data-testid={AGENTS_STABLE_IDS.dynamicFields}
					className="grid gap-2"
				>
					{actionFields.map(field => (
						<label key={field.key} className="grid gap-1" htmlFor={makeAgentFieldId(field.key)}>
							<span className="text-sm font-medium">{field.label}</span>
							{field.kind === "textarea" ? (
								<textarea
									id={makeAgentFieldId(field.key)}
									data-testid={makeAgentFieldTestId(field.key)}
									value={params[field.key] ?? ""}
									onChange={event => updateParam(field.key, event.target.value)}
									placeholder={field.placeholder}
									className="border-border bg-background min-h-24 rounded border px-2 py-1 font-mono text-xs"
								/>
							) : field.kind === "select" ? (
								<select
									id={makeAgentFieldId(field.key)}
									data-testid={makeAgentFieldTestId(field.key)}
									value={params[field.key] ?? field.defaultValue ?? ""}
									onChange={event => updateParam(field.key, event.target.value)}
									className="border-border bg-background rounded border px-2 py-1 text-sm"
								>
									{field.options?.map(option => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
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
				<ul className="grid gap-2" id={AGENTS_STABLE_IDS.logList} data-testid={AGENTS_STABLE_IDS.logList}>
					{logs.length === 0 && <li className="text-muted-foreground text-sm">No results yet.</li>}
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
