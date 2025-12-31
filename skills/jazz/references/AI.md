# Jazz AI Streaming Patterns

How to build AI chat with Jazz for real-time streaming, tool calling, and offline support.

## Why Jazz for AI Chat?

Traditional AI chat streams tokens via HTTP/WebSocket. Jazz offers a different approach:

1. **Server writes to Jazz** - AI responses sync to Jazz CoValues
2. **Client subscribes** - React hooks auto-update on changes
3. **Offline-first** - Messages persist, resume on reconnect
4. **Multi-device** - All devices see responses in real-time
5. **Abort support** - Client sets flag, server subscribes and aborts

```
┌─────────────┐     HTTP POST      ┌─────────────┐
│   Client    │ ─────────────────► │   Server    │
│             │   (trigger only)   │             │
│  useAccount │                    │   worker    │
│      ▲      │                    │      │      │
│      │      │                    │      ▼      │
│   subscribe │                    │  streamText │
│      │      │                    │      │      │
└──────┼──────┘                    └──────┼──────┘
       │                                  │
       │        ┌─────────────┐           │
       └────────│  Jazz Sync  │◄──────────┘
                │   Server    │   writes messages
                └─────────────┘
```

## Schema Design

Store chat state in the user's account:

```ts
export let Assistant = co.map({
	version: z.literal(1),
	stringifiedMessages: co.list(z.string()), // JSON-serialized messages
	submittedAt: z.date().optional(), // Generation in progress
	abortRequestedAt: z.date().optional(), // Client wants to stop
	errorMessage: z.string().optional(), // Last error
	notificationCheckId: z.string().optional(), // For presence check
	notificationAcknowledgedId: z.string().optional(),
})

export let UserAccountRoot = co.map({
	// ...other fields
	assistant: Assistant.optional(),
})
```

**Why `stringifiedMessages`?** AI SDK message types are complex with unions. Storing as JSON strings avoids schema complexity while preserving all data.

## Client: Sending Messages

```tsx
function useChatMessaging(me: LoadedAccount) {
	let [isSending, setIsSending] = useState(false)
	let [failedToSend, setFailedToSend] = useState<Error | null>(null)

	async function sendMessage(message: TillyUIMessage) {
		setIsSending(true)
		setFailedToSend(null)

		// Ensure assistant exists
		let assistant = me.root.assistant
		if (!assistant) {
			assistant = Assistant.create({
				version: 1,
				stringifiedMessages: [],
			})
			me.root.$jazz.set("assistant", assistant)
		}

		// Add message to Jazz
		assistant.stringifiedMessages.$jazz.push(JSON.stringify(message))
		assistant.$jazz.set("submittedAt", new Date())

		// Wait for sync before calling API
		await me.$jazz.waitForAllCoValuesSync()

		try {
			// Trigger server generation
			let response = await fetch("/api/chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			})

			if (!response.ok) throw new Error(await response.text())

			// Wait for server to start (SSE marker)
			await consumeUntil(response.body.getReader(), "generation-started")
		} catch (error) {
			assistant.$jazz.set("submittedAt", undefined)
			setFailedToSend(error as Error)
		} finally {
			setIsSending(false)
		}
	}

	async function abort() {
		me.root.assistant?.$jazz.set("abortRequestedAt", new Date())
		setIsSending(false)
	}

	return { isSending, failedToSend, sendMessage, abort }
}
```

## Client: Subscribing to Messages

```tsx
function AuthenticatedChat() {
	let me = useAccount(UserAccount, { resolve })
	let assistant = me.root.assistant

	// Messages auto-update when Jazz syncs
	let messages = useMemo(
		() =>
			assistant?.stringifiedMessages?.map(
				s => JSON.parse(s) as TillyUIMessage,
			) ?? [],
		[assistant?.stringifiedMessages],
	)

	let isGenerating = !!assistant?.submittedAt

	return (
		<>
			{messages.map(message => (
				<MessageRenderer key={message.id} message={message} />
			))}

			{isGenerating && <LoadingIndicator />}

			<GenerationError error={assistant?.errorMessage} />
		</>
	)
}
```

## Server: Streaming via Jazz

```ts
import { streamText, convertToModelMessages } from "ai"

async function generateAIResponse(params: {
	userWorker: LoadedUserAccount
	modelMessages: ModelMessage[]
}) {
	let assistant = params.userWorker.root.assistant!

	// Subscribe to abort requests
	let abortController = new AbortController()
	let unsubscribe = assistant.$jazz.subscribe(({ abortRequestedAt }) => {
		if (abortRequestedAt) {
			abortController.abort()
		}
	})

	// Mark generation started
	assistant.$jazz.set("submittedAt", new Date())
	assistant.$jazz.set("errorMessage", undefined)

	try {
		let handleChunk = createChunkHandler()

		let result = streamText({
			model: google("gemini-2.5-flash"),
			messages: params.modelMessages,
			system: makeSystemPrompt(),
			tools: allTools,
			abortSignal: abortController.signal,

			// Stream chunks to Jazz
			onChunk: async event => {
				let result = handleChunk(event.chunk)

				if (result?.insertMode === "append") {
					assistant.stringifiedMessages.$jazz.push(
						JSON.stringify(result.message),
					)
				}
				if (result?.insertMode === "replace") {
					let lastIdx = assistant.stringifiedMessages.length - 1
					assistant.stringifiedMessages.$jazz.set(
						lastIdx,
						JSON.stringify(result.message),
					)
				}
			},

			onFinish: async () => {
				assistant.$jazz.set("submittedAt", undefined)
				assistant.$jazz.set("abortRequestedAt", undefined)
			},

			onError: async ({ error }) => {
				let isAbort = (error as Error).name === "AbortError"
				if (!isAbort) {
					assistant.$jazz.set("errorMessage", error.message)
				}
				assistant.$jazz.set("submittedAt", undefined)
				assistant.$jazz.set("abortRequestedAt", undefined)
			},
		})

		await result.consumeStream()
		await params.userWorker.$jazz.waitForAllCoValuesSync()
	} finally {
		unsubscribe()
	}
}
```

## Chunk Handler: Building Messages

Convert AI SDK chunks into UI messages:

```ts
function createChunkHandler() {
	let currentMessage: TillyUIMessage | null = null

	return function handleChunk(chunk): { message; insertMode } | null {
		// Skip non-content chunks
		if (chunk.type === "raw") return null
		if (chunk.type === "reasoning-delta") return null

		let insertMode: "append" | "replace" = "replace"

		// Text streaming
		if (chunk.type === "text-delta") {
			if (!currentMessage) {
				currentMessage = {
					id: nanoid(),
					role: "assistant",
					parts: [{ type: "text", text: chunk.text }],
				}
				return { message: currentMessage, insertMode: "append" }
			}

			// Append to existing text part
			let parts = currentMessage.parts || []
			let lastPart = parts.at(-1)

			if (lastPart?.type === "text") {
				currentMessage.parts = [
					...parts.slice(0, -1),
					{ type: "text", text: lastPart.text + chunk.text },
				]
			} else {
				currentMessage.parts = [...parts, { type: "text", text: chunk.text }]
			}

			return { message: currentMessage, insertMode: "replace" }
		}

		// Tool calls
		if (chunk.type === "tool-call") {
			if (!currentMessage) {
				currentMessage = { id: nanoid(), role: "assistant", parts: [] }
				insertMode = "append"
			}

			currentMessage.parts = [
				...(currentMessage.parts || []),
				{
					type: `tool-${chunk.toolName}`,
					toolCallId: chunk.toolCallId,
					toolName: chunk.toolName,
					input: chunk.input,
					state: "input-available",
				},
			]

			return { message: currentMessage, insertMode }
		}

		// Tool results
		if (chunk.type === "tool-result") {
			// Find and update the tool call part
			let toolIdx = currentMessage?.parts?.findIndex(
				p => "toolCallId" in p && p.toolCallId === chunk.toolCallId,
			)

			if (toolIdx !== -1) {
				currentMessage.parts[toolIdx] = {
					...currentMessage.parts[toolIdx],
					output: chunk.output,
					state: "output-available",
				}
			}

			return { message: currentMessage, insertMode: "replace" }
		}

		return null
	}
}
```

## Tool Architecture

Split tools between client and server:

```ts
// Client tools - require user interaction (confirmations, questions)
export let clientTools = {
	createPerson: createPersonTool, // Shows confirmation UI
	userQuestion: userQuestionTool, // Asks user a question
} as const

// Server tools - execute directly with Jazz data
export function createServerTools(worker: Loaded<typeof UserAccount>) {
	return {
		listPeople: createListPeopleTool(worker),
		getPersonDetails: createGetPersonDetailsTool(worker),
		addNote: createAddNoteTool(worker),
		updateReminder: createUpdateReminderTool(worker),
		// ...etc
	}
}

// Combine for AI
let allTools = {
	...clientTools,
	...createServerTools(userWorker),
}
```

**Why split?**

- **Client tools**: Need UI rendering, user confirmation, or client context
- **Server tools**: Direct CRUD on Jazz data via worker

## Tool Factory Pattern

Server tools need access to the worker to load/write Jazz data. Use factory functions:

```ts
import { tool, type Loaded } from "ai"
import { type Loaded } from "jazz-tools"

function createEditNoteTool(worker: Loaded<typeof UserAccount>) {
	return tool({
		description: "Edit a note by ID",
		inputSchema: z.object({
			personId: z.string(),
			noteId: z.string(),
			content: z.string().optional(),
			pinned: z.boolean().optional(),
		}),
		execute: async input => {
			// Load with worker's permissions
			let person = await Person.load(input.personId, {
				resolve: { notes: true },
				loadAs: worker,
			})
			if (!person.$isLoaded) return { error: "Person not found" }

			let note = await Note.load(input.noteId, { loadAs: worker })
			if (!note.$isLoaded) return { error: "Note not found" }

			// Update
			if (input.content !== undefined) {
				note.$jazz.set("content", input.content)
			}
			if (input.pinned !== undefined) {
				note.$jazz.set("pinned", input.pinned)
			}
			note.$jazz.set("updatedAt", new Date())

			return {
				noteId: note.$jazz.id,
				content: note.content,
				pinned: note.pinned,
				updatedAt: note.updatedAt.toISOString(),
			}
		},
	})
}
```

**Key points:**

1. Factory takes `worker: Loaded<typeof UserAccount>`
2. All loads use `loadAs: worker`
3. Return sanitized data (no `_ref` or Jazz internals)
4. Handle errors with `{ error: string }` returns

## Client Tool Results

When client tools need user input, the AI pauses. User interacts, client sends result back:

```tsx
function createAddToolResult(
	messages: TillyUIMessage[],
	sendMessage: (msg: TillyUIMessage, idx?: number) => Promise<void>,
) {
	return async ({ toolCallId, output }) => {
		// Find message containing this tool call
		let messageIndex = messages.findIndex(msg =>
			msg.parts?.some(p => "toolCallId" in p && p.toolCallId === toolCallId),
		)

		if (messageIndex === -1) return

		// Update the tool call with output
		let msg = messages[messageIndex]
		let updatedParts = msg.parts?.map(part => {
			if (!("toolCallId" in part)) return part
			if (part.toolCallId !== toolCallId) return part
			return { ...part, output, state: "output-available" }
		})

		let updatedMessage = { ...msg, parts: updatedParts }

		// Send updated message to trigger continuation
		await sendMessage(updatedMessage, messageIndex)
	}
}
```

## Tool UI Rendering

Render tool calls with custom components:

```tsx
function ToolResultRenderer({ toolName, result }: ToolResultProps) {
	switch (toolName) {
		case "createPerson":
			return <CreatePersonResult result={result} />
		case "addNote":
			return <AddNoteResult result={result} />
		case "userQuestion":
			return <UserQuestionResult result={result} />
		// ...etc
		default:
			return null
	}
}
```

## User Context Injection

Add user context to messages before sending to AI:

```ts
function addUserContextToMessage(message: TillyUIMessage): TillyUIMessage {
	if (message.role !== "user") return message

	let meta = message.metadata
	if (!meta) return message

	let context = buildUserContext(meta)

	// Prepend context to first text part
	let parts = message.parts.map(part => ({ ...part }))
	let firstTextIdx = parts.findIndex(p => p.type === "text")

	if (firstTextIdx !== -1 && parts[firstTextIdx].type === "text") {
		parts[firstTextIdx] = {
			...parts[firstTextIdx],
			text: context + parts[firstTextIdx].text,
		}
	}

	return { ...message, parts }
}

function buildUserContext(meta: MessageMetadata): string {
	let userLocalTime = toZonedTime(new Date(meta.timestamp), meta.timezone)

	let payload = JSON.stringify({
		name: meta.userName,
		locale: meta.locale,
		timezone: meta.timezone,
		localTime: {
			weekday: format(userLocalTime, "EEEE"),
			date: format(userLocalTime, "MMMM d, yyyy"),
			time: format(userLocalTime, "h:mm a"),
		},
	})

	return `<context>${payload}</context>`
}
```

## Abort Handling

Client requests abort via Jazz, server subscribes:

```ts
// Client
async function abort() {
	me.root.assistant?.$jazz.set("abortRequestedAt", new Date())
}

// Server
let unsubscribe = assistant.$jazz.subscribe(({ abortRequestedAt }) => {
	if (abortRequestedAt) {
		abortController.abort()
	}
})

// Cleanup in onAbort/onError
assistant.$jazz.set("submittedAt", undefined)
assistant.$jazz.set("abortRequestedAt", undefined)
```

## Stale Generation Timeout

Handle stuck generations on client:

```ts
let GENERATION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

function useStaleGenerationTimeout(assistant: LoadedAssistant | undefined) {
	useEffect(() => {
		if (!assistant?.submittedAt) return

		let age = Date.now() - assistant.submittedAt.getTime()

		if (age >= GENERATION_TIMEOUT_MS) {
			assistant.$jazz.set("submittedAt", undefined)
			assistant.$jazz.set("abortRequestedAt", undefined)
			return
		}

		let timer = setTimeout(() => {
			assistant.$jazz.set("submittedAt", undefined)
			assistant.$jazz.set("abortRequestedAt", undefined)
		}, GENERATION_TIMEOUT_MS - age)

		return () => clearTimeout(timer)
	}, [assistant?.submittedAt])
}
```

## Presence Check Before Notifications

Don't notify if user is active:

```ts
// Server: check if client is present before sending push
async function waitForAcknowledgment(chat: LoadedAssistant, timeoutMs: number) {
	let checkId = nanoid()
	chat.$jazz.set("notificationCheckId", checkId)
	await chat.$jazz.waitForSync()

	return new Promise<boolean>(resolve => {
		let timer = setTimeout(() => {
			unsubscribe()
			resolve(false) // Not present
		}, timeoutMs)

		let unsubscribe = chat.$jazz.subscribe(updated => {
			if (updated.notificationAcknowledgedId === checkId) {
				clearTimeout(timer)
				unsubscribe()
				resolve(true) // Present, skip notification
			}
		})
	})
}

// Client: acknowledge presence
useEffect(() => {
	if (!assistant) return

	let unsubscribe = assistant.$jazz.subscribe(a => {
		if (document.visibilityState !== "visible") return
		if (!a.notificationCheckId) return
		if (a.notificationCheckId === a.notificationAcknowledgedId) return

		a.$jazz.set("notificationAcknowledgedId", a.notificationCheckId)
	})

	return unsubscribe
}, [assistant])
```

## Clear Chat

```ts
function ClearChatButton({ assistant }) {
  return (
    <Button
      onClick={() => {
        assistant?.$jazz.set(
          "stringifiedMessages",
          co.list(z.string()).create([]),
        )
      }}
    >
      Clear Chat
    </Button>
  )
}
```

## Common Mistakes

1. **Not waiting for sync before API call** - Messages may not be on server yet
2. **Forgetting to clean up subscriptions** - Memory leaks in server code
3. **Not handling abort in all callbacks** - `onError`, `onAbort`, `onFinish` all need cleanup
4. **Missing timeout for stale generations** - Server crashes leave `submittedAt` set forever
5. **Sending notifications without presence check** - Annoying if user is active
