import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { dirname } from "node:path"
import * as bip39 from "@scure/bip39"
import { cojsonInternals } from "cojson"
import { WasmCrypto } from "cojson/crypto/WasmCrypto"
import { createJazzContextForNewAccount, MockSessionProvider } from "jazz-tools"
import { startWorker } from "jazz-tools/worker"
import { WebSocketPeerWithReconnection } from "cojson-transport-ws"
import { parseArgs } from "./args"
import { resolvePassphrase } from "./passphrase"
import { Document, Space, UserAccount, createSpaceDocument } from "../schema"
import { wordlist } from "../lib/wordlist"
import { permanentlyDeleteDocument } from "../lib/delete-covalue"
import type { CliResult, JsonValue, ParsedArgs, RuntimeDeps } from "./types"

export { runCli }

async function runCli(argv: string[], deps: RuntimeDeps): Promise<CliResult> {
	let parsed = parseArgs(argv)
	if (!parsed.ok) return failure("cli", parsed.code, parsed.message)
	if (parsed.value.command === "auth") return runAuth(parsed.value, deps)
	if (parsed.value.command === "docs") return runDocs(parsed.value, deps)
	return failure("cli", "invalid_command", "Unsupported command")
}

async function runAuth(args: ParsedArgs, deps: RuntimeDeps): Promise<CliResult> {
	let command = `auth.${args.action}`
	if (args.action === "status") {
		let session = await resolveSession(args, deps, false)
		return success(command, { authenticated: session.ok })
	}
	if (args.action === "sign-out") return success(command, { signedOut: true })
	if (args.action === "sign-in") {
		let passphrase = await resolvePassphrase(args, deps, true)
		if (!passphrase.ok || !passphrase.value) return failure(command, passphrase.code, passphrase.message)
		try {
			let creds = await credentialsFromPassphrase(passphrase.value)
			await persistSessionIfRequested(args, deps, creds)
			return success(command, { session: creds })
		} catch {
			return failure(command, "invalid_passphrase", "Invalid passphrase")
		}
	}
	if (args.action === "create-account") {
		let passphrase = await resolvePassphrase(args, deps, true)
		if (!passphrase.ok || !passphrase.value) return failure(command, passphrase.code, passphrase.message)
		try {
			let creds = await credentialsFromPassphrase(passphrase.value)
			let crypto = await WasmCrypto.create()
			let peerConn = connectPeer(args.syncUrl)
			let context = await createJazzContextForNewAccount({
				creationProps: { name: args.name ?? "CLI User" },
				initialAgentSecret: creds.accountSecret,
				peers: peerConn.peers,
				crypto,
				sessionProvider: new MockSessionProvider(),
				AccountSchema: UserAccount,
			})
			peerConn.setNode(context.node)
			await context.account.$jazz.waitForAllCoValuesSync()
			await persistSessionIfRequested(args, deps, creds)
			context.done()
			peerConn.stop()
			return success(command, { created: true, session: creds })
		} catch (error) {
			let message = error instanceof Error ? error.message : "Failed to create account"
			let code = message === "sync_connect_timeout" ? "sync_connect_timeout" : "create_account_failed"
			return failure(command, code, message)
		}
	}
	return failure(command, "invalid_action", "Unsupported auth action")
}

async function runDocs(args: ParsedArgs, deps: RuntimeDeps): Promise<CliResult> {
	let command = `docs.${args.action}`
	let session = await resolveSession(args, deps, true)
	if (!session.ok) return failure(command, session.code, session.message)
	let workerResult = await startWorker({
		syncServer: args.syncUrl,
		accountID: session.accountID,
		accountSecret: session.secret,
		AccountSchema: UserAccount,
	})
	let worker = workerResult.worker
	try {
		if (args.action === "create") {
			let space = await loadSpace(args.spaceId ?? "")
			if (!space.$isLoaded) return failure(command, "space_not_found", "Space not found")
			let doc = createSpaceDocument(space.$jazz.owner, composeContent(args.title ?? "", args.content ?? ""))
			doc.$jazz.set("spaceId", space.$jazz.id)
			space.documents.$jazz.push(doc)
			await worker.$jazz.waitForAllCoValuesSync()
			return success(command, serializeDoc(doc))
		}
		if (args.action === "read") {
			let doc = await Document.load(args.docId ?? "", { resolve: { content: true } })
			if (!doc.$isLoaded) return failure(command, "doc_not_found", "Document not found")
			return success(command, serializeDoc(doc))
		}
		if (args.action === "update") {
			let doc = await Document.load(args.docId ?? "", { resolve: { content: true } })
			if (!doc.$isLoaded) return failure(command, "doc_not_found", "Document not found")
			let next = args.append ? `${doc.content.toString()}${args.content ?? ""}` : (args.content ?? "")
			doc.$jazz.set("content", co.plainText().create(next, doc.$jazz.owner))
			doc.$jazz.set("updatedAt", new Date())
			await worker.$jazz.waitForAllCoValuesSync()
			return success(command, serializeDoc(doc))
		}
		if (args.action === "list" || args.action === "search") {
			let docs = await listSpaceDocs(args.spaceId ?? "")
			let filtered = args.query ? docs.filter(d => matchesQuery(d, args.query ?? "")) : docs
			return success(command, filtered.map(serializeDoc))
		}
		if (args.action === "delete") {
			let doc = await Document.load(args.docId ?? "", { resolve: { content: true } })
			if (!doc.$isLoaded) return failure(command, "doc_not_found", "Document not found")
			if (args.softDelete) {
				doc.$jazz.set("deletedAt", new Date())
				doc.$jazz.set("updatedAt", new Date())
			} else {
				await permanentlyDeleteDocument(doc)
			}
			await worker.$jazz.waitForAllCoValuesSync()
			return success(command, { deleted: true, soft: args.softDelete })
		}
		if (args.action === "upsert") {
			let docs = await listSpaceDocs(args.spaceId ?? "")
			let existing = docs.find(d => extractTitle(d.content?.toString() ?? "") === (args.title ?? ""))
			if (existing?.$isLoaded) {
				existing.$jazz.set("content", co.plainText().create(composeContent(args.title ?? "", args.content ?? ""), existing.$jazz.owner))
				existing.$jazz.set("updatedAt", new Date())
				await worker.$jazz.waitForAllCoValuesSync()
				return success(command, { operation: "updated", result: serializeDoc(existing) })
			}
			let space = await loadSpace(args.spaceId ?? "")
			if (!space.$isLoaded) return failure(command, "space_not_found", "Space not found")
			let doc = createSpaceDocument(space.$jazz.owner, composeContent(args.title ?? "", args.content ?? ""))
			doc.$jazz.set("spaceId", space.$jazz.id)
			space.documents.$jazz.push(doc)
			await worker.$jazz.waitForAllCoValuesSync()
			return success(command, { operation: "created", result: serializeDoc(doc) })
		}
		return failure(command, "invalid_action", "Unsupported docs action")
	} finally {
		await workerResult.shutdownWorker()
	}
}

async function loadSpace(spaceId: string) {
	return Space.load(spaceId, { resolve: { documents: { $each: { content: true } } } })
}

async function listSpaceDocs(spaceId: string) {
	let space = await loadSpace(spaceId)
	if (!space.$isLoaded) return []
	return space.documents.filter(doc => doc?.$isLoaded && !doc.deletedAt)
}

function matchesQuery(doc: (typeof Document)["Shape"] extends never ? never : any, query: string): boolean {
	let text = doc.content?.toString() ?? ""
	let title = extractTitle(text)
	let q = query.toLowerCase()
	return text.toLowerCase().includes(q) || title.toLowerCase().includes(q)
}

function composeContent(title: string, content: string): string {
	if (content.trim().startsWith("#")) return content
	return `# ${title}\n\n${content}`
}

function extractTitle(content: string): string {
	let first = content.split("\n").find(line => line.trim().length > 0) ?? ""
	if (first.startsWith("#")) return first.replace(/^#+\s*/, "").trim()
	return first.slice(0, 80)
}

function serializeDoc(doc: any): JsonValue {
	let text = doc.content?.toString() ?? ""
	return {
		docId: doc.$jazz.id,
		title: extractTitle(text),
		content: text,
		spaceId: doc.spaceId ?? null,
		deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
		updatedAt: doc.updatedAt?.toISOString?.() ?? null,
	}
}

async function credentialsFromPassphrase(passphrase: string): Promise<{ accountID: string; accountSecret: string }> {
	let crypto = await WasmCrypto.create()
	let seed: Buffer
	try {
		let mnemonicSeed = Buffer.from(await bip39.mnemonicToSeed(passphrase, "", wordlist))
		seed = mnemonicSeed.subarray(0, 32)
	} catch {
		seed = createHash("sha256").update(passphrase, "utf8").digest()
	}
	if (seed.length !== 32) {
		seed = createHash("sha256").update(seed).digest()
	}
	let accountSecret = crypto.agentSecretFromSecretSeed(Uint8Array.from(seed))
	let accountID = cojsonInternals.idforHeader(cojsonInternals.accountHeaderForInitialAgentSecret(accountSecret, crypto), crypto)
	return { accountID, accountSecret }
}

function connectPeer(syncUrl: string): { peers: any[]; setNode: (node: any) => void; stop: () => void } {
	let node: any | undefined = undefined
	let peers: any[] = []
	let timeout = setTimeout(() => {
		if (peers.length === 0) {
			wsPeer.disable()
		}
	}, 10_000)
	let wsPeer = new WebSocketPeerWithReconnection({
		peer: syncUrl,
		reconnectionTimeout: 100,
		addPeer: peer => {
			clearTimeout(timeout)
			if (node) {
				node.syncManager.addPeer(peer)
			} else {
				peers.push(peer)
			}
		},
		removePeer: () => {},
	})
	wsPeer.enable()
	return {
		peers,
		setNode(value: any) {
			node = value
		},
		stop: () => {
			clearTimeout(timeout)
			wsPeer.disable()
		},
	}
}

async function persistSessionIfRequested(args: ParsedArgs, deps: RuntimeDeps, creds: { accountID: string; accountSecret: string }) {
	if (!args.sessionFile) return
	let dir = dirname(args.sessionFile)
	await deps.mkdir(dir)
	await deps.writeFile(args.sessionFile, `${JSON.stringify(creds, null, 2)}\n`)
}

async function resolveSession(args: ParsedArgs, deps: RuntimeDeps, required: boolean): Promise<{ ok: true; accountID: string; secret: string } | { ok: false; code: string; message: string }> {
	if (args.sessionAccountId && args.sessionSecret) return { ok: true, accountID: args.sessionAccountId, secret: args.sessionSecret }
	if (args.sessionFile) {
		try {
			let raw = await deps.readFile(args.sessionFile)
			let parsed = JSON.parse(raw) as { accountID?: string; accountSecret?: string }
			if (parsed.accountID && parsed.accountSecret) return { ok: true, accountID: parsed.accountID, secret: parsed.accountSecret }
		} catch {}
	}
	let passphrase = await resolvePassphrase(args, deps, false)
	if (passphrase.ok && passphrase.value) {
		let creds = await credentialsFromPassphrase(passphrase.value)
		return { ok: true, accountID: creds.accountID, secret: creds.accountSecret }
	}
	if (required) return { ok: false, code: "missing_session", message: "Missing auth material. Provide --session-account-id/--session-secret, --session-file, or passphrase flags." }
	return { ok: false, code: "missing_session", message: "No active session" }
}

function success(command: string, data: JsonValue): CliResult { return { ok: true, command, data } }
function failure(command: string, code: string, message: string, details?: JsonValue): CliResult { return { ok: false, command, error: { code, message, details } } }
