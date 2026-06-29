import { Buffer } from "node:buffer"
import { readFile } from "node:fs/promises"
import process from "node:process"
import { Effect } from "effect"
import * as Option from "effect/Option"
import { co } from "jazz-tools"
import { createPersonalDocument } from "@/app/features/documents"
import { getDocumentTitle } from "@/app/features/documents"
import { moveDocumentToSpace } from "@/app/features/documents"
import { parseInviteLink } from "@/app/features/sharing"
import { parseSpaceInviteLink } from "@/app/features/spaces"
import { resolveCliConfig } from "@/cli/config"
import type { CliConfig } from "@/cli/config"
import {
	AuthError,
	CliUsageError,
	ConfigError,
	FilesystemError,
	NotFoundError,
	PermissionError,
	SyncPeerError,
	UnexpectedCliError,
	ValidationError,
} from "@/cli/errors"
import { createAuthenticatedJazz } from "@/cli/jazz"
import type { GlobalArgs } from "@/cli/options"
import { printData, printError } from "@/cli/output"
import { interpretEscapes, parseScope } from "@/cli/parse"
import { Document } from "@/schema"

export {
	runCommand,
	loadAccount,
	listDocs,
	findDocument,
	loadDocumentContent,
	loadDocumentMetadata,
	findSpace,
	createSpaceScopedDoc,
	summarizeDoc,
	maybeSync,
	syncMutation,
	readRequiredContentInput,
	readRequiredSecretInput,
	readSecretInput,
	inspectInvite,
	getOptionString,
}
export type { JazzContext, LoadedAccount, LoadedCliDocument }

type JazzContext = Awaited<ReturnType<typeof createAuthenticatedJazz>>
type LoadedAccount = Awaited<ReturnType<typeof loadAccount>>
type CliDocumentResolve = {
	content: true
	comments: { $each: { replies: true } }
}
type CliDocumentMetadataResolve = {
	content: true
}
type LoadedCliDocument = co.loaded<typeof Document, CliDocumentResolve>
type LoadedCliDocumentMetadata = co.loaded<
	typeof Document,
	CliDocumentMetadataResolve
>
type MaybeLoadedCliDocumentMetadata = Awaited<
	ReturnType<typeof loadRawDocumentMetadata>
>
type FreshnessOptions = {
	allowStale: boolean
	timeoutMs: number
}

function runCommand<A extends GlobalArgs>(
	command: string,
	args: A,
	handler: (config: CliConfig) => Promise<unknown>,
) {
	return Effect.tryPromise({
		try: async () => {
			let config = await resolveFlags(args)
			let data = await handler(config)
			if (!config.quiet && data !== undefined) {
				printData({
					json: config.json,
					command,
					data,
					meta: config.verbose
						? {
								serverUrl: config.serverUrl,
								syncPeer: config.syncPeer,
								timeoutMs: config.timeoutMs,
								homeDir: config.homeDir,
							}
						: undefined,
				})
			}
		},
		catch: normalizeCliError,
	}).pipe(
		Effect.tapError(error =>
			Effect.sync(() =>
				printError({
					json: args.json,
					command,
					error: { type: error._tag, message: error.message },
				}),
			),
		),
	)
}

async function loadAccount(jazz: JazzContext, timeoutMs: number = 10_000) {
	if (jazz.isConnected()) {
		try {
			await jazz.account.$jazz.waitForAllCoValuesSync({ timeout: timeoutMs })
		} catch {
			// offline or slow — continue with local data
		}
	}
	return jazz.account.$jazz.ensureLoaded({
		resolve: {
			profile: true,
			root: {
				documents: {
					$each: { content: true, comments: { $each: { replies: true } } },
				},
				inactiveDocuments: {
					$each: { content: true, comments: { $each: { replies: true } } },
				},
				spaces: {
					$each: {
						documents: {
							$each: {
								content: true,
								comments: { $each: { replies: true } },
							},
						},
					},
				},
			},
		},
	})
}

async function listDocs(
	account: LoadedAccount,
	scopeValue: string | undefined,
	deleted: boolean,
) {
	let scope = parseScope(scopeValue)
	let entries = collectDocsForScope(account, scope)
		.flatMap(entry =>
			entry.doc ? [{ doc: entry.doc, spaceId: entry.spaceId }] : [],
		)
		.filter(entry =>
			deleted ? Boolean(entry.doc.deletedAt) : !entry.doc.deletedAt,
		)
	let summaries = entries.map(entry => summarizeDoc(entry.doc, entry.spaceId))
	return summaries.sort((left, right) =>
		right.updatedAt.localeCompare(left.updatedAt),
	)
}

async function findDocument(account: LoadedAccount, docId: string) {
	for (let doc of account.root.documents) {
		if (doc?.$jazz.id === docId) {
			return { doc: await ensureDocLoaded(doc), space: null }
		}
	}
	for (let doc of account.root.inactiveDocuments ?? []) {
		if (doc?.$jazz.id === docId) {
			return { doc: await ensureDocLoaded(doc), space: null }
		}
	}
	for (let space of account.root.spaces ?? []) {
		for (let doc of space.documents) {
			if (doc?.$jazz.id === docId) {
				return { doc: await ensureDocLoaded(doc), space }
			}
		}
	}
	throw new NotFoundError({ message: `Document not found: ${docId}` })
}

async function loadDocumentMetadata(
	jazz: JazzContext,
	docId: string,
	options: FreshnessOptions,
): Promise<LoadedCliDocumentMetadata> {
	if (!options.allowStale) await waitForRemote(jazz, docId, options.timeoutMs)
	let loadTimeoutMessage = options.allowStale
		? `Timed out loading target document ${docId} from local cache after ${options.timeoutMs}ms`
		: `Remote sync timed out while loading target document ${docId} after ${options.timeoutMs}ms. Pass --offline, --local, or --stale-ok to use cached data.`
	let doc = await withTimeout(
		loadRawDocumentMetadata(docId),
		options.timeoutMs,
		loadTimeoutMessage,
	)
	assertLoadedDocumentMetadata(docId, doc)
	if (!options.allowStale) {
		await waitForTargetSync(doc, "document", options)
		await waitForTargetSync(doc.content, "document content", options)
	}
	return doc
}

async function loadDocumentContent(
	jazz: JazzContext,
	docId: string,
	options: FreshnessOptions,
): Promise<LoadedCliDocumentMetadata> {
	let doc = await loadDocumentMetadata(jazz, docId, options)
	return doc
}

function findSpace(account: LoadedAccount, spaceId: string) {
	let space = account.root.spaces?.find(item => item?.$jazz.id === spaceId)
	if (!space) {
		throw new NotFoundError({ message: `Space not found: ${spaceId}` })
	}
	return space
}

async function createSpaceScopedDoc(
	account: LoadedAccount,
	spaceId: string,
	content: string,
) {
	let space = findSpace(account, spaceId)
	let doc = await createPersonalDocument(account, content)
	await moveDocumentToSpace({
		doc,
		destination: { id: space.$jazz.id, name: space.name },
		me: account,
	})
	return doc
}

function summarizeDoc(
	doc: {
		$jazz: { id: string }
		content?: { toString(): string }
		createdAt: Date
		updatedAt: Date
		deletedAt?: Date
		spaceId?: string
	},
	spaceId?: string | null,
) {
	return {
		docId: doc.$jazz.id,
		title: getDocumentTitle(doc),
		spaceId: spaceId ?? doc.spaceId ?? null,
		createdAt: doc.createdAt.toISOString(),
		updatedAt: doc.updatedAt.toISOString(),
		deletedAt: doc.deletedAt?.toISOString() ?? null,
	}
}

async function maybeSync(
	account: JazzContext["account"],
	enabled: boolean,
	timeoutMs: number,
) {
	if (!enabled) return
	await account.$jazz.waitForAllCoValuesSync({ timeout: timeoutMs })
}

async function syncMutation(
	account: JazzContext["account"],
	timeoutMs: number,
) {
	await account.$jazz.waitForAllCoValuesSync({ timeout: timeoutMs })
}

async function readRequiredContentInput(
	content: Option.Option<string>,
	contentFile: Option.Option<string>,
	stdin: boolean,
) {
	let next = await readContentInput(content, contentFile, stdin)
	if (next === undefined) {
		throw new CliUsageError({
			message: "Provide one of --content, --content-file, --stdin",
		})
	}
	return next
}

async function readRequiredSecretInput(
	passphrase: Option.Option<string>,
	passphraseFile: Option.Option<string>,
	passphraseStdin: boolean,
) {
	let next = await readSecretInput(passphrase, passphraseFile, passphraseStdin)
	if (!next) {
		throw new CliUsageError({
			message:
				"Provide one of --passphrase, --passphrase-file, --passphrase-stdin",
		})
	}
	return next
}

async function readSecretInput(
	passphrase: Option.Option<string>,
	passphraseFile: Option.Option<string>,
	passphraseStdin: boolean,
): Promise<string | undefined> {
	let sources = [
		Option.isSome(passphrase),
		Option.isSome(passphraseFile),
		passphraseStdin,
	].filter(Boolean)
	if (sources.length > 1) {
		throw new CliUsageError({
			message: "Provide exactly one passphrase source",
		})
	}
	if (Option.isSome(passphrase)) return passphrase.value.trim()
	if (Option.isSome(passphraseFile)) {
		return (await readFile(passphraseFile.value, "utf8")).trim()
	}
	if (passphraseStdin) return (await readStdin()).trim()
	return undefined
}

function inspectInvite(link: string) {
	try {
		let invite = parseInviteLink(link)
		return { kind: "doc" as const, ...invite }
	} catch {
		// not a doc invite, try space
	}
	try {
		let invite = parseSpaceInviteLink(link)
		return { kind: "space" as const, ...invite }
	} catch {
		// not a space invite either
	}
	throw new ValidationError({ message: "Invalid invite link" })
}

function getOptionString(value: Option.Option<string> | undefined) {
	return value && Option.isSome(value) ? value.value : undefined
}

function normalizeCliError(error: unknown) {
	if (
		error instanceof CliUsageError ||
		error instanceof ValidationError ||
		error instanceof AuthError ||
		error instanceof NotFoundError ||
		error instanceof PermissionError ||
		error instanceof SyncPeerError ||
		error instanceof FilesystemError ||
		error instanceof ConfigError
	) {
		return error
	}

	return new UnexpectedCliError({
		message: getErrorMessage(error),
	})
}

function resolveFlags(args: GlobalArgs) {
	return resolveCliConfig({
		json: args.json,
		verbose: args.verbose,
		quiet: args.quiet,
		server: getOptionString(args.server),
		syncPeer: getOptionString(args.syncPeer),
		timeout: getOptionNumber(args.timeout),
		home: getOptionString(args.home),
	})
}

function collectDocsForScope(
	account: LoadedAccount,
	scope: ReturnType<typeof parseScope>,
) {
	if (scope.kind === "space") {
		let space = findSpace(account, scope.spaceId)
		return space.documents.map(doc => ({ doc, spaceId: space.$jazz.id }))
	}
	let personal = [
		...account.root.documents,
		...(account.root.inactiveDocuments ?? []),
	].map(doc => ({ doc, spaceId: null as string | null }))
	if (scope.kind === "personal") return personal
	let spaceDocs = (account.root.spaces ?? []).flatMap(space =>
		space.documents.map(doc => ({
			doc,
			spaceId: space.$jazz.id as string | null,
		})),
	)
	return [...personal, ...spaceDocs]
}

async function readContentInput(
	content: Option.Option<string>,
	contentFile: Option.Option<string>,
	stdin: boolean,
): Promise<string | undefined> {
	let sources = [
		Option.isSome(content),
		Option.isSome(contentFile),
		stdin,
	].filter(Boolean)
	if (sources.length > 1) {
		throw new CliUsageError({ message: "Provide exactly one content source" })
	}
	if (Option.isSome(content)) return interpretEscapes(content.value)
	if (Option.isSome(contentFile))
		return await readFile(contentFile.value, "utf8")
	if (stdin) return await readStdin()
	return undefined
}

function getOptionNumber(value: Option.Option<number> | undefined) {
	return value && Option.isSome(value) ? value.value : undefined
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

async function readStdin(): Promise<string> {
	let chunks: Buffer[] = []
	for await (let chunk of process.stdin) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
	}
	return Buffer.concat(chunks).toString("utf8")
}

async function ensureDocLoaded(
	doc:
		| LoadedCliDocument
		| {
				$jazz: {
					ensureLoaded(args: {
						resolve: CliDocumentResolve
					}): Promise<LoadedCliDocument>
				}
		  },
): Promise<LoadedCliDocument> {
	if ("content" in doc) {
		return doc
	}
	return doc.$jazz.ensureLoaded({
		resolve: { content: true, comments: { $each: { replies: true } } },
	})
}

async function waitForRemote(
	jazz: JazzContext,
	docId: string,
	timeoutMs: number,
) {
	try {
		await jazz.waitForConnection(timeoutMs)
	} catch {
		throw new SyncPeerError({
			message:
				`Remote sync timed out before loading target document ${docId} ` +
				`after ${timeoutMs}ms. Pass --offline, --local, or --stale-ok to use cached data.`,
		})
	}
}

async function waitForTargetSync(
	value: LoadedCliDocumentMetadata | LoadedCliDocumentMetadata["content"],
	label: string,
	options: FreshnessOptions,
) {
	try {
		await withTimeout(
			value.$jazz.raw.core.waitForSync({ timeout: options.timeoutMs }),
			options.timeoutMs,
			`Remote sync timed out for target ${label} ${value.$jazz.id} ` +
				`after ${options.timeoutMs}ms. Pass --offline, --local, or --stale-ok to use cached data.`,
		)
	} catch (error) {
		if (error instanceof SyncPeerError) throw error
		throw new SyncPeerError({
			message:
				`Remote sync timed out for target ${label} ${value.$jazz.id} ` +
				`after ${options.timeoutMs}ms. Pass --offline, --local, or --stale-ok to use cached data.`,
		})
	}
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined
	let timeoutPromise = new Promise<never>((_, reject) => {
		timeout = setTimeout(() => {
			reject(new SyncPeerError({ message }))
		}, timeoutMs)
	})
	try {
		return await Promise.race([promise, timeoutPromise])
	} finally {
		if (timeout) clearTimeout(timeout)
	}
}

function throwDocumentLoadError(docId: string, loadingState: string) {
	if (loadingState === "unauthorized") {
		throw new PermissionError({ message: `Document not accessible: ${docId}` })
	}
	throw new NotFoundError({ message: `Document not found: ${docId}` })
}

function loadRawDocumentMetadata(docId: string) {
	return Document.load(docId, { resolve: { content: true } })
}

function assertLoadedDocumentMetadata(
	docId: string,
	doc: MaybeLoadedCliDocumentMetadata,
): asserts doc is LoadedCliDocumentMetadata {
	if (doc.$isLoaded) return
	throwDocumentLoadError(docId, doc.$jazz.loadingState)
}
