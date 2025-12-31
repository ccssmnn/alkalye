# Jazz Server Patterns

How to use Jazz on the server for AI processing, background jobs, and push notifications.

## Why Server Workers?

Your server needs to read/write Jazz data for:

- **AI processing** - Load user context, stream responses back
- **Push notifications** - Read reminder data, send alerts
- **Background jobs** - Cleanup, migrations, scheduled tasks
- **API endpoints** - Server-side data access

Jazz workers connect to the same sync server as clients, so changes sync in real-time.

## User Workers

Act as a specific user to access their data:

```ts
import { startWorker } from "jazz-tools/worker"

async function initUserWorker(user: ClerkUser) {
	// Jazz credentials stored in Clerk user metadata
	let jazzAccountId = user.unsafeMetadata.jazzAccountID as string
	let jazzAccountSecret = user.unsafeMetadata.jazzAccountSecret as string

	let result = await startWorker({
		AccountSchema: UserAccount,
		syncServer: "wss://cloud.jazz.tools",
		accountID: jazzAccountId,
		accountSecret: jazzAccountSecret,
		skipInboxLoad: true, // Performance: skip inbox if not needed
	})

	return { worker: result.worker }
}
```

**Why `skipInboxLoad`?** Workers typically don't need inbox functionality. Skipping it speeds up startup.

## Server Workers (System Account)

For operations that don't act as a user:

```ts
export let ServerAccount = co.account({
	profile: co.map({ name: z.string() }),
	root: co.map({}),
})

async function initServerWorker() {
	return await startWorker({
		AccountSchema: ServerAccount,
		syncServer: "wss://cloud.jazz.tools",
		accountID: SERVER_JAZZ_ACCOUNT,
		accountSecret: SERVER_JAZZ_SECRET,
		skipInboxLoad: true,
		asActiveAccount: false, // Don't mark as active
	})
}
```

**Why `asActiveAccount: false`?** Prevents sync conflicts when multiple server instances run.

## Loading Data as a User

```ts
async function processUserRequest(user: ClerkUser) {
	let { worker } = await initUserWorker(user)

	// Load with specific query
	let userWorker = await worker.$jazz.ensureLoaded({
		resolve: {
			root: {
				assistant: { stringifiedMessages: true },
				people: { $each: { notes: { $each: true } } },
			},
		},
	})

	// Access data
	let messages = userWorker.root.assistant?.stringifiedMessages ?? []

	return { worker: userWorker, messages }
}
```

## Loading Entities Directly

When loading entities outside of React hooks, use `loadAs` to specify permissions context:

```ts
import { type Loaded } from "jazz-tools"

async function loadPersonAsWorker(
	personId: string,
	worker: Loaded<typeof UserAccount>,
) {
	let person = await Person.load(personId, {
		resolve: { notes: true, reminders: true },
		loadAs: worker, // Load with this user's permissions
	})

	if (!person.$isLoaded) {
		throw new Error("Person not found or not accessible")
	}

	return person
}
```

**When to use `loadAs`:**

| Context                                  | Need `loadAs`? | Why                                      |
| ---------------------------------------- | -------------- | ---------------------------------------- |
| React hooks (`useCoState`, `useAccount`) | No             | Hook uses current auth context           |
| Server worker loading user's data        | Yes            | Worker has no implicit context           |
| Loading shared entity by ID              | Yes            | Must specify whose permissions to check  |
| Loading within `withMigration`           | No             | Migration runs as account being migrated |

**`Loaded<>` vs `co.loaded<>`:**

```ts
import { type Loaded } from "jazz-tools"
import { co } from "jazz-tools"

// Loaded<> - for worker/account instances (from startWorker)
type WorkerAccount = Loaded<typeof UserAccount>

// co.loaded<> - for entities with specific resolve queries
type LoadedPerson = co.loaded<typeof Person, typeof personResolve>
```

Use `Loaded<typeof UserAccount>` for worker parameters. Use `co.loaded<>` when you need to specify which nested fields are resolved.

## Writing Data

```ts
async function updateUserData(user: ClerkUser, updates: UpdateData) {
	let { worker } = await initUserWorker(user)

	let userWorker = await worker.$jazz.ensureLoaded({
		resolve: { root: { assistant: true } },
	})

	// Make changes
	userWorker.root.assistant.$jazz.set("submittedAt", new Date())
	userWorker.root.assistant.$jazz.set("errorMessage", undefined)

	// CRITICAL: Wait for sync before returning
	await worker.$jazz.waitForAllCoValuesSync()

	return { success: true }
}
```

**Why `waitForAllCoValuesSync`?** Server functions return immediately. Without waiting, changes may not sync before the function terminates.

## Subscriptions on Server

Watch for changes (e.g., abort requests):

```ts
async function generateWithAbortSupport(
	assistant: LoadedAssistant,
	abortController: AbortController,
) {
	let unsubscribe = assistant.$jazz.subscribe(updated => {
		if (updated.abortRequestedAt) {
			console.log("Abort requested by client")
			abortController.abort()
		}
	})

	try {
		await doGeneration(abortController.signal)
	} finally {
		unsubscribe()
	}
}
```

## Waiting for Client Acknowledgment

Check if user is active before sending notifications:

```ts
async function waitForAcknowledgment(
	chat: LoadedAssistant,
	timeoutMs: number,
): Promise<boolean> {
	let checkId = nanoid()
	chat.$jazz.set("notificationCheckId", checkId)
	await chat.$jazz.waitForSync()

	return new Promise(resolve => {
		let timer = setTimeout(() => {
			unsubscribe()
			resolve(false) // Timed out - user not active
		}, timeoutMs)

		let unsubscribe = chat.$jazz.subscribe(updated => {
			if (updated.notificationAcknowledgedId === checkId) {
				clearTimeout(timer)
				unsubscribe()
				resolve(true) // User acknowledged - don't send notification
			}
		})
	})
}
```

**Why this pattern?** Before sending push notifications, check if the user has the app open. If they acknowledge the check ID within timeout, skip the notification.

## API Endpoint Pattern

```ts
let chatApp = new Hono()
	.use("*", authMiddleware)
	.use("*", requireAuth)
	.post("/", async c => {
		let user = c.get("user")

		let [{ worker: userWorker }, { worker: serverWorker }] = await Promise.all([
			initUserWorker(user),
			initServerWorker(),
		])

		let userAccount = await userWorker.$jazz.ensureLoaded({
			resolve: messagesQuery,
		})

		// Process request...

		// Stream response via SSE, sync via Jazz
		return streamSSE(c, async stream => {
			await stream.writeSSE({ data: "generation-started" })

			await generateAIResponse({
				user,
				userWorker: userAccount,
				// ...
			})

			await stream.writeSSE({ data: "generation-finished" })
		})
	})
```

## Streaming AI Responses via Jazz

Instead of streaming tokens via HTTP, write to Jazz and let clients subscribe:

```ts
async function generateAIResponse(params: {
	userWorker: LoadedUserAccount
	// ...
}) {
	let assistant = params.userWorker.root.assistant!

	let result = streamText({
		model: google("gemini-2.5-flash"),
		messages: modelMessages,
		onChunk: async event => {
			let result = handleChunk(event.chunk)

			if (result?.insertMode === "append") {
				assistant.stringifiedMessages.$jazz.push(JSON.stringify(result.message))
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
			await params.userWorker.$jazz.waitForAllCoValuesSync()
		},
	})

	await result.consumeStream()
	await params.userWorker.$jazz.waitForAllCoValuesSync()
}
```

**Why write to Jazz instead of streaming HTTP?**

1. **Offline support** - Messages sync when client reconnects
2. **Multi-device** - All devices see the response
3. **Persistence** - Responses are stored automatically
4. **Resume** - If connection drops, client picks up where it left off

## Push Notification Pattern

```ts
async function sendReminderNotifications() {
	let { worker: serverWorker } = await initServerWorker()

	// Load users with due reminders
	// (you'd have your own query mechanism here)

	for (let userId of usersWithDueReminders) {
		let { worker: userWorker } = await initUserWorker(userId)

		let user = await userWorker.$jazz.ensureLoaded({
			resolve: {
				root: {
					notificationSettings: true,
					people: { $each: { reminders: { $each: true } } },
				},
			},
		})

		let devices = getEnabledDevices(user.root.notificationSettings)
		if (devices.length === 0) continue

		let dueReminders = getDueReminders(user.root.people)

		for (let device of devices) {
			await sendNotificationToDevice(device, {
				title: "Reminders due",
				body: formatReminders(dueReminders),
				url: "/app/reminders",
			})
		}
	}
}
```

## Common Mistakes

1. **Not waiting for sync** - Changes may not persist if function returns early
2. **Missing `loadAs`** - Forgetting to specify which user's permissions to use
3. **Blocking on subscriptions** - Always set timeouts, subscriptions can hang forever
4. **Not cleaning up subscriptions** - Memory leaks in long-running processes
5. **Initializing workers per-request without caching** - Slow; consider worker pools for high-traffic
