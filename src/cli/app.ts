import { Args, Command, Options } from "@effect/cli"
import { Buffer } from "node:buffer"
import { createRequire } from "node:module"
import { readFile } from "node:fs/promises"
import process from "node:process"
import { co } from "jazz-tools"
import { Effect } from "effect"
import * as Option from "effect/Option"
import {
	changeCollaboratorRole,
	createDocumentInvite,
	deletePersonalDocument,
	getDocumentOwner,
	leavePersonalDocument,
	listCollaborators,
	makeDocumentPrivate,
	makeDocumentPublic,
	parseInviteLink,
	permanentlyDeletePersonalDocument,
	restorePersonalDocument,
	revokeDocumentInvite,
} from "@/lib/documents"
import { acceptDocumentInvite, createPersonalDocument } from "@/lib/documents"
import {
	acceptSpaceInvite,
	changeSpaceCollaboratorRole,
	createSpaceInvite,
	getSpaceGroup,
	getSpaceOwner,
	isSpaceMember,
	isSpacePublic,
	leaveSpace,
	listSpaceCollaborators,
	listSpaceMembers,
	makeSpacePrivate,
	makeSpacePublic,
	parseSpaceInviteLink,
	permanentlyDeleteSpace,
	revokeSpaceInvite,
} from "@/lib/spaces"
import { getDocumentTitle } from "@/lib/document-utils"
import { moveDocumentToSpace } from "@/lib/document-move"
import {
	buildDocumentPublicLink,
	buildSpacePublicLink,
} from "@/lib/invite-links"
import { setDocumentTitle } from "@/cli/document-title"
import { resolveCliConfig } from "@/cli/config"
import {
	CliUsageError,
	NotFoundError,
	PermissionError,
	UnexpectedCliError,
	ValidationError,
} from "@/cli/errors"
import { interpretEscapes, parseDocScope, parseScope } from "@/cli/parse"
import {
	createAuthenticatedJazz,
	generatePassphrase,
	getPassphraseFromStorage,
	getStoredCredentials,
	logInWithPassphrase,
	logOut,
	signUpWithPassphrase,
} from "@/cli/jazz"
import { printContent, printData, printError } from "@/cli/output"
import { createSpace, Document, getRandomWriterName } from "@/schema"

export { cli }

type ActiveAccount = Awaited<
	ReturnType<typeof createAuthenticatedJazz>
>["account"]
type LoadedAccount = Awaited<ReturnType<typeof loadAccount>>

type GlobalArgs = {
	json: boolean
	verbose: boolean
	quiet: boolean
	server: Option.Option<string>
	syncPeer: Option.Option<string>
	timeout: Option.Option<number>
	home: Option.Option<string>
}

type LoadedCliDocument = co.loaded<typeof Document, { content: true }>

let jsonOption = Options.boolean("json").pipe(
	Options.withDescription("Print machine-readable JSON output."),
)
let verboseOption = Options.boolean("verbose").pipe(
	Options.withDescription("Include extra runtime context in output."),
)
let quietOption = Options.boolean("quiet").pipe(
	Options.withDescription("Suppress output. Exit code only."),
)
let serverOption = Options.optional(Options.text("server")).pipe(
	Options.withDescription(
		"Alkalye deployment URL. Used to discover CLI config and sync peer.",
	),
)
let syncPeerOption = Options.optional(Options.text("sync-peer")).pipe(
	Options.withDescription(
		"Jazz sync peer URL. Defaults to ALKALYE_SYNC_PEER or PUBLIC_JAZZ_SYNC_SERVER.",
	),
)
let timeoutOption = Options.optional(Options.integer("timeout")).pipe(
	Options.withDescription("Sync timeout in milliseconds."),
)
let homeOption = Options.optional(Options.text("home")).pipe(
	Options.withDescription(
		"CLI state directory. Defaults to ALKALYE_CLI_HOME or ~/.alkalye/cli.",
	),
)

let globalOptions = {
	json: jsonOption,
	verbose: verboseOption,
	quiet: quietOption,
	server: serverOption,
	syncPeer: syncPeerOption,
	timeout: timeoutOption,
	home: homeOption,
}

let nameOption = Options.text("name").pipe(
	Options.withDescription("Name to store."),
)
let titleOption = Options.text("title").pipe(
	Options.withDescription("Document title."),
)
let roleOption = Options.choice("role", ["writer", "reader"]).pipe(
	Options.withDescription("Invite role."),
)
let spaceRoleOption = Options.choice("role", [
	"admin",
	"manager",
	"writer",
	"reader",
]).pipe(Options.withDescription("Space collaborator role."))
let linkOption = Options.text("link").pipe(
	Options.withDescription("Invite link to inspect or accept."),
)
let inviteGroupIdOption = Options.text("invite-group-id").pipe(
	Options.withDescription("Invite group ID."),
)
let scopeOption = Options.optional(Options.text("scope")).pipe(
	Options.withDescription("Document scope: personal, all, or space:<id>."),
)
let deletedOption = Options.boolean("deleted").pipe(
	Options.withDescription("Include deleted documents instead of active ones."),
)
let syncOption = Options.boolean("sync").pipe(
	Options.withDescription("Wait for remote sync before exiting."),
)
let passphraseOption = Options.optional(Options.text("passphrase"))
let passphraseFileOption = Options.optional(Options.file("passphrase-file"))
let passphraseStdinOption = Options.boolean("passphrase-stdin").pipe(
	Options.withDescription("Read passphrase from stdin."),
)
let contentOption = Options.optional(Options.text("content"))
let contentFileOption = Options.optional(Options.file("content-file"))
let stdinOption = Options.boolean("stdin")
let docIdArg = Args.text({ name: "doc-id" }).pipe(
	Args.withDescription("Document ID."),
)
let spaceIdArg = Args.text({ name: "space-id" }).pipe(
	Args.withDescription("Space ID."),
)
let packageJson = createRequire(import.meta.url)("../../package.json") as {
	version?: string
}

let authSignup = Command.make(
	"signup",
	{
		...globalOptions,
		name: Options.optional(nameOption),
		passphrase: passphraseOption,
		passphraseFile: passphraseFileOption,
		passphraseStdin: passphraseStdinOption,
	},
	args =>
		runCommand("auth.signup", args, async config => {
			let name = getOptionString(args.name) ?? getRandomWriterName()
			let passphrase =
				(await readSecretInput(
					args.passphrase,
					args.passphraseFile,
					args.passphraseStdin,
				)) ?? (await generatePassphrase())
			let jazz = await signUpWithPassphrase({ config, name, passphrase })
			let account = await jazz.account.$jazz.ensureLoaded({
				resolve: { profile: true },
			})
			await jazz.account.$jazz.waitForAllCoValuesSync({
				timeout: config.timeoutMs,
			})
			await jazz.done()
			return {
				accountId: account.$jazz.id,
				name: account.profile.name,
				passphrase,
			}
		}),
)

let authLogin = Command.make(
	"login",
	{
		...globalOptions,
		passphrase: passphraseOption,
		passphraseFile: passphraseFileOption,
		passphraseStdin: passphraseStdinOption,
	},
	args =>
		runCommand("auth.login", args, async config => {
			let passphrase = await readRequiredSecretInput(
				args.passphrase,
				args.passphraseFile,
				args.passphraseStdin,
			)
			let jazz = await logInWithPassphrase({ config, passphrase })
			let account = await jazz.account.$jazz.ensureLoaded({
				resolve: { profile: true },
			})
			await jazz.done()
			return {
				accountId: account.$jazz.id,
				name: account.profile.name,
				provider: "passphrase",
				syncPeer: config.syncPeer,
			}
		}),
)

let authLogout = Command.make("logout", globalOptions, args =>
	runCommand("auth.logout", args, async config => {
		await logOut(config)
		return { status: "logged out" }
	}),
)

let authWhoami = Command.make("whoami", globalOptions, args =>
	runCommand("auth.whoami", args, async config => {
		let jazz = await createAuthenticatedJazz(config)
		let credentials = await jazz.authSecretStorage.get()
		let account = await jazz.account.$jazz.ensureLoaded({
			resolve: { profile: true },
		})
		await jazz.done()
		return {
			accountId: account.$jazz.id,
			name: account.profile.name,
			provider: credentials?.provider ?? "unknown",
			syncPeer: config.syncPeer,
		}
	}),
)

let authPassphrase = Command.make("passphrase", globalOptions, args =>
	runCommand("auth.passphrase", args, async config => {
		let passphrase = await getPassphraseFromStorage(config)
		return { passphrase }
	}),
)

let authCommand = Command.make("auth").pipe(
	Command.withDescription("Passphrase authentication."),
	Command.withSubcommands([
		authSignup,
		authLogin,
		authLogout,
		authWhoami,
		authPassphrase,
	]),
)

let accountShow = Command.make("show", globalOptions, args =>
	runCommand("account.show", args, async config => {
		let jazz = await createAuthenticatedJazz(config)
		let credentials = await jazz.authSecretStorage.get()
		let account = await loadAccount(jazz.account, config.timeoutMs)
		let personalDocs = account.root.documents.filter(Boolean).length
		let spaces = account.root.spaces?.filter(Boolean) ?? []
		let spaceDocs = spaces.reduce(
			(sum, space) => sum + space.documents.filter(Boolean).length,
			0,
		)
		await jazz.done()
		return {
			accountId: account.$jazz.id,
			name: account.profile.name,
			provider: credentials?.provider ?? "unknown",
			syncPeer: config.syncPeer,
			documents: personalDocs + spaceDocs,
			personalDocuments: personalDocs,
			spaces: spaces.length,
		}
	}),
)

let accountRename = Command.make(
	"rename",
	{
		...globalOptions,
		name: nameOption,
	},
	args =>
		runCommand("account.rename", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await jazz.account.$jazz.ensureLoaded({
				resolve: { profile: true },
			})
			account.profile.$jazz.set("name", args.name)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { accountId: account.$jazz.id, name: account.profile.name }
		}),
)

let accountSync = Command.make("sync", globalOptions, args =>
	runCommand("account.sync", args, async config => {
		let jazz = await createAuthenticatedJazz(config)
		await jazz.account.$jazz.waitForAllCoValuesSync({
			timeout: config.timeoutMs,
		})
		await jazz.done()
		return { synced: true, syncPeer: config.syncPeer }
	}),
)

let accountCommand = Command.make("account").pipe(
	Command.withDescription("Account profile and sync state."),
	Command.withSubcommands([accountShow, accountRename, accountSync]),
)

let syncFlush = Command.make("flush", globalOptions, accountSync.handler)

let syncStatus = Command.make("status", globalOptions, args =>
	runCommand("sync.status", args, async config => {
		let credentials = await getStoredCredentials(config)
		return {
			authenticated: Boolean(credentials),
			accountId: credentials?.accountID ?? null,
			provider: credentials?.provider ?? null,
			syncPeer: config.syncPeer,
		}
	}),
)

let syncCommand = Command.make("sync").pipe(
	Command.withDescription("Explicit remote sync commands."),
	Command.withSubcommands([syncFlush, syncStatus]),
)

let docList = Command.make(
	"list",
	{
		...globalOptions,
		scope: scopeOption,
		deleted: deletedOption,
	},
	args =>
		runCommand("doc.list", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let docs = await listDocs(
				account,
				getOptionString(args.scope),
				args.deleted,
			)
			await jazz.done()
			return docs
		}),
)

let docGet = Command.make(
	"get",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.get", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			let owner = await getDocumentOwner(located.doc)
			await jazz.done()
			return {
				docId: located.doc.$jazz.id,
				title: getDocumentTitle(located.doc),
				spaceId: located.space?.$jazz.id ?? null,
				createdAt: located.doc.createdAt.toISOString(),
				updatedAt: located.doc.updatedAt.toISOString(),
				deletedAt: located.doc.deletedAt?.toISOString() ?? null,
				owner,
			}
		}),
)

let docContent = Command.make(
	"content",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.content", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			let content = located.doc.content.toString()
			await jazz.done()
			if (config.json) return { docId: located.doc.$jazz.id, content }
			if (!config.quiet) await Effect.runPromise(printContent(content))
		}),
)

let docCreate = Command.make(
	"create",
	{
		...globalOptions,
		scope: scopeOption,
		content: contentOption,
		contentFile: contentFileOption,
		stdin: stdinOption,
		sync: syncOption,
	},
	args =>
		runCommand("doc.create", args, async config => {
			let content = await readRequiredContentInput(
				args.content,
				args.contentFile,
				args.stdin,
			)
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let scope = parseDocScope(getOptionString(args.scope))
			let doc =
				scope.kind === "personal"
					? await createPersonalDocument(account, content)
					: await createSpaceScopedDoc(account, scope.spaceId, content)
			await maybeSync(jazz.account, args.sync, config.timeoutMs)
			await jazz.done()
			return summarizeDoc(
				doc,
				scope.kind === "space" ? scope.spaceId : undefined,
			)
		}),
)

let docUpdate = Command.make(
	"update",
	{
		...globalOptions,
		docId: docIdArg,
		content: contentOption,
		contentFile: contentFileOption,
		stdin: stdinOption,
		sync: syncOption,
	},
	args =>
		runCommand("doc.update", args, async config => {
			let content = await readRequiredContentInput(
				args.content,
				args.contentFile,
				args.stdin,
			)
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			located.doc.content.$jazz.applyDiff(content)
			located.doc.$jazz.set("updatedAt", new Date())
			await maybeSync(jazz.account, args.sync, config.timeoutMs)
			await jazz.done()
			return summarizeDoc(located.doc, located.space?.$jazz.id)
		}),
)

let docRename = Command.make(
	"rename",
	{
		...globalOptions,
		docId: docIdArg,
		title: titleOption,
	},
	args =>
		runCommand("doc.rename", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			let nextContent = setDocumentTitle(
				located.doc.content.toString(),
				args.title,
			)
			located.doc.content.$jazz.applyDiff(nextContent)
			located.doc.$jazz.set("updatedAt", new Date())
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return summarizeDoc(located.doc, located.space?.$jazz.id)
		}),
)

let docMove = Command.make(
	"move",
	{
		...globalOptions,
		docId: docIdArg,
		scope: Options.text("scope"),
	},
	args =>
		runCommand("doc.move", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			let nextScope = parseDocScope(args.scope)
			await moveDocumentToSpace({
				doc: located.doc,
				destination:
					nextScope.kind === "personal"
						? null
						: {
								id: nextScope.spaceId,
								name: findSpace(account, nextScope.spaceId).name,
							},
				currentSpaceId: located.space?.$jazz.id,
				me: account,
			})
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return summarizeDoc(
				located.doc,
				nextScope.kind === "space" ? nextScope.spaceId : undefined,
			)
		}),
)

let docDelete = Command.make(
	"delete",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.delete", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			let result = await deletePersonalDocument(located.doc)
			if (result.type === "error")
				throw new PermissionError({ message: result.error })
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return summarizeDoc(located.doc, located.space?.$jazz.id)
		}),
)

let docRestore = Command.make(
	"restore",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.restore", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			if (located.space) {
				located.doc.$jazz.set("deletedAt", undefined)
				located.doc.$jazz.set("updatedAt", new Date())
			} else {
				let result = await restorePersonalDocument(located.doc, account)
				if (result.type === "error")
					throw new PermissionError({ message: result.error })
			}
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return summarizeDoc(located.doc, located.space?.$jazz.id)
		}),
)

let docPurge = Command.make(
	"purge",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.purge", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			if (located.space) {
				let index = located.space.documents.findIndex(
					doc => doc?.$jazz.id === located.doc.$jazz.id,
				)
				if (index !== -1) located.space.documents.$jazz.splice(index, 1)
				let deleteModule = await import("@/lib/delete-covalue")
				await deleteModule.permanentlyDeleteDocument(located.doc)
			} else {
				let result = await permanentlyDeletePersonalDocument(
					located.doc,
					account,
				)
				if (result.type === "error")
					throw new PermissionError({ message: result.error })
			}
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { docId: args.docId, purged: true }
		}),
)

let docLeave = Command.make(
	"leave",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.leave", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			if (located.space)
				throw new CliUsageError({ message: "Use `space leave` for space docs" })
			await leavePersonalDocument(located.doc, account)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { docId: args.docId, left: true }
		}),
)

let docShareCreate = Command.make(
	"create",
	{
		...globalOptions,
		docId: docIdArg,
		role: roleOption,
	},
	args =>
		runCommand("doc.share.create", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			let result = await createDocumentInvite(
				located.doc,
				args.role,
				config.baseUrl,
			)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return {
				docId: args.docId,
				role: args.role,
				inviteGroupId: result.inviteGroup.$jazz.id,
				link: result.link,
			}
		}),
)

let docShareRevoke = Command.make(
	"revoke",
	{
		...globalOptions,
		docId: docIdArg,
		inviteGroupId: inviteGroupIdOption,
	},
	args =>
		runCommand("doc.share.revoke", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			revokeDocumentInvite(located.doc, args.inviteGroupId)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return {
				docId: args.docId,
				inviteGroupId: args.inviteGroupId,
				revoked: true,
			}
		}),
)

let docShareList = Command.make(
	"list",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.share.list", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			let collaborators = await listCollaborators(
				located.doc,
				located.space ? getSpaceGroup(located.space)?.$jazz.id : undefined,
			)
			await jazz.done()
			return collaborators
		}),
)

let docShareRole = Command.make(
	"role",
	{
		...globalOptions,
		docId: docIdArg,
		inviteGroupId: inviteGroupIdOption,
		role: roleOption,
	},
	args =>
		runCommand("doc.share.role", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			await changeCollaboratorRole(located.doc, args.inviteGroupId, args.role)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return {
				docId: args.docId,
				inviteGroupId: args.inviteGroupId,
				role: args.role,
			}
		}),
)

let docShareCommand = Command.make("share").pipe(
	Command.withSubcommands([
		docShareCreate,
		docShareRevoke,
		docShareList,
		docShareRole,
	]),
)

let docPublicEnable = Command.make(
	"enable",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.public.enable", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			await makeDocumentPublic(located.doc, account.$jazz.id)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { docId: args.docId, public: true }
		}),
)

let docPublicDisable = Command.make(
	"disable",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.public.disable", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			makeDocumentPrivate(located.doc)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { docId: args.docId, public: false }
		}),
)

let docPublicLink = Command.make(
	"link",
	{
		...globalOptions,
		docId: docIdArg,
	},
	args =>
		runCommand("doc.public.link", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let located = await findDocument(account, args.docId)
			await jazz.done()
			return {
				docId: args.docId,
				link: buildDocumentPublicLink(config.baseUrl, located.doc.$jazz.id),
			}
		}),
)

let docPublicCommand = Command.make("public").pipe(
	Command.withSubcommands([docPublicEnable, docPublicDisable, docPublicLink]),
)

let docCommand = Command.make("doc").pipe(
	Command.withDescription("Personal and shared document workflows."),
	Command.withSubcommands([
		docList,
		docGet,
		docContent,
		docCreate,
		docUpdate,
		docRename,
		docMove,
		docDelete,
		docRestore,
		docPurge,
		docLeave,
		docShareCommand,
		docPublicCommand,
	]),
)

let spaceList = Command.make("list", globalOptions, args =>
	runCommand("space.list", args, async config => {
		let jazz = await createAuthenticatedJazz(config)
		let account = await loadAccount(jazz.account)
		let spaces = (account.root.spaces ?? [])
			.map(space => ({
				spaceId: space.$jazz.id,
				name: space.name,
				documents: space.documents.length,
				public: isSpacePublic(space),
				member: isSpaceMember(space),
			}))
			.sort((left, right) => left.name.localeCompare(right.name))
		await jazz.done()
		return spaces
	}),
)

let spaceGet = Command.make(
	"get",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.get", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			let owner = await getSpaceOwner(space)
			await jazz.done()
			return {
				spaceId: space.$jazz.id,
				name: space.name,
				documents: space.documents.length,
				public: isSpacePublic(space),
				owner,
			}
		}),
)

let spaceMembers = Command.make(
	"members",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.members", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			let members = await listSpaceMembers(space)
			await jazz.done()
			return members
		}),
)

let spaceDocs = Command.make(
	"docs",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.docs", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			let docs = space.documents
				.map(doc => summarizeDoc(doc, space.$jazz.id))
				.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
			await jazz.done()
			return docs
		}),
)

let spaceCreate = Command.make(
	"create",
	{
		...globalOptions,
		name: nameOption,
	},
	args =>
		runCommand("space.create", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = createSpace(args.name, account.root)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { spaceId: space.$jazz.id, name: space.name }
		}),
)

let spaceRename = Command.make(
	"rename",
	{
		...globalOptions,
		spaceId: spaceIdArg,
		name: nameOption,
	},
	args =>
		runCommand("space.rename", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			space.$jazz.set("name", args.name)
			space.$jazz.set("updatedAt", new Date())
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { spaceId: space.$jazz.id, name: space.name }
		}),
)

let spaceDelete = Command.make(
	"delete",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.delete", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			await permanentlyDeleteSpace(space, account)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { spaceId: args.spaceId, deleted: true }
		}),
)

let spaceLeave = Command.make(
	"leave",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.leave", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			await leaveSpace(space, account)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { spaceId: args.spaceId, left: true }
		}),
)

let spaceShareCreate = Command.make(
	"create",
	{
		...globalOptions,
		spaceId: spaceIdArg,
		role: roleOption,
	},
	args =>
		runCommand("space.share.create", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			let result = await createSpaceInvite(space, args.role, config.baseUrl)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return {
				spaceId: args.spaceId,
				role: args.role,
				inviteGroupId: result.inviteGroup.$jazz.id,
				link: result.link,
			}
		}),
)

let spaceShareRevoke = Command.make(
	"revoke",
	{
		...globalOptions,
		spaceId: spaceIdArg,
		inviteGroupId: inviteGroupIdOption,
	},
	args =>
		runCommand("space.share.revoke", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			revokeSpaceInvite(space, args.inviteGroupId)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return {
				spaceId: args.spaceId,
				inviteGroupId: args.inviteGroupId,
				revoked: true,
			}
		}),
)

let spaceShareList = Command.make(
	"list",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.share.list", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			let collaborators = await listSpaceCollaborators(space)
			await jazz.done()
			return collaborators
		}),
)

let spaceShareRole = Command.make(
	"role",
	{
		...globalOptions,
		spaceId: spaceIdArg,
		inviteGroupId: inviteGroupIdOption,
		role: spaceRoleOption,
	},
	args =>
		runCommand("space.share.role", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			await changeSpaceCollaboratorRole(space, args.inviteGroupId, args.role)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return {
				spaceId: args.spaceId,
				inviteGroupId: args.inviteGroupId,
				role: args.role,
			}
		}),
)

let spaceShareCommand = Command.make("share").pipe(
	Command.withSubcommands([
		spaceShareCreate,
		spaceShareRevoke,
		spaceShareList,
		spaceShareRole,
	]),
)

let spacePublicEnable = Command.make(
	"enable",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.public.enable", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			makeSpacePublic(space)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { spaceId: args.spaceId, public: true }
		}),
)

let spacePublicDisable = Command.make(
	"disable",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.public.disable", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			makeSpacePrivate(space)
			await syncMutation(jazz.account, config.timeoutMs)
			await jazz.done()
			return { spaceId: args.spaceId, public: false }
		}),
)

let spacePublicLink = Command.make(
	"link",
	{
		...globalOptions,
		spaceId: spaceIdArg,
	},
	args =>
		runCommand("space.public.link", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let space = findSpace(account, args.spaceId)
			await jazz.done()
			return {
				spaceId: args.spaceId,
				link: buildSpacePublicLink(config.baseUrl, space.$jazz.id),
			}
		}),
)

let spacePublicCommand = Command.make("public").pipe(
	Command.withSubcommands([
		spacePublicEnable,
		spacePublicDisable,
		spacePublicLink,
	]),
)

let spaceCommand = Command.make("space").pipe(
	Command.withDescription("Shared spaces and membership."),
	Command.withSubcommands([
		spaceList,
		spaceGet,
		spaceMembers,
		spaceDocs,
		spaceCreate,
		spaceRename,
		spaceDelete,
		spaceLeave,
		spaceShareCommand,
		spacePublicCommand,
	]),
)

let inviteInspect = Command.make(
	"inspect",
	{
		...globalOptions,
		link: linkOption,
	},
	args =>
		runCommand("invite.inspect", args, async () => inspectInvite(args.link)),
)

let inviteAccept = Command.make(
	"accept",
	{
		...globalOptions,
		link: linkOption,
		sync: syncOption,
	},
	args =>
		runCommand("invite.accept", args, async config => {
			let jazz = await createAuthenticatedJazz(config)
			let account = await loadAccount(jazz.account)
			let invite = inspectInvite(args.link)
			if (invite.kind === "doc") {
				await acceptDocumentInvite(account, parseInviteLink(args.link))
			} else {
				await acceptSpaceInvite(account, parseSpaceInviteLink(args.link))
			}
			await maybeSync(jazz.account, args.sync, config.timeoutMs)
			await jazz.done()
			return invite
		}),
)

let inviteCommand = Command.make("invite").pipe(
	Command.withDescription("Inspect and accept invite links."),
	Command.withSubcommands([inviteInspect, inviteAccept]),
)

let root = Command.make("alkalye").pipe(
	Command.withDescription(
		"Local-first CLI for auth, documents, spaces, and sharing.",
	),
	Command.withSubcommands([
		authCommand,
		accountCommand,
		docCommand,
		spaceCommand,
		inviteCommand,
		syncCommand,
	]),
)

let cli = Command.run(root, {
	name: "alkalye",
	version: packageJson.version ?? "0.0.0",
})

function runCommand<A extends GlobalArgs>(
	command: string,
	args: A,
	handler: (
		config: Awaited<ReturnType<typeof resolveCliConfig>>,
	) => Promise<unknown>,
) {
	return Effect.tryPromise({
		try: async () => {
			try {
				let config = await resolveFlags(args)
				let data = await handler(config)
				if (config.quiet || data === undefined) return
				await Effect.runPromise(
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
					}),
				)
			} catch (error) {
				printError({
					json: args.json,
					command,
					error: {
						type: getErrorType(error),
						message: getErrorMessage(error),
					},
				})
				throw error
			}
		},
		catch: error =>
			new UnexpectedCliError({
				message: getErrorMessage(error),
			}),
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

async function loadAccount(account: ActiveAccount, timeoutMs: number = 10_000) {
	await bestEffortRefresh(account, timeoutMs)
	return account.$jazz.ensureLoaded({
		resolve: {
			profile: true,
			root: {
				documents: { $each: { content: true } },
				inactiveDocuments: { $each: { content: true } },
				spaces: { $each: { documents: { $each: { content: true } } } },
			},
		},
	})
}

async function bestEffortRefresh(account: ActiveAccount, timeoutMs: number) {
	try {
		await account.$jazz.waitForAllCoValuesSync({ timeout: timeoutMs })
	} catch {
		return
	}
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

async function findDocument(account: LoadedAccount, docId: string) {
	for (let doc of account.root.documents) {
		if (doc?.$jazz.id === docId)
			return { doc: await ensureDocLoaded(doc), space: null }
	}
	for (let doc of account.root.inactiveDocuments ?? []) {
		if (doc?.$jazz.id === docId)
			return { doc: await ensureDocLoaded(doc), space: null }
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

function findSpace(account: LoadedAccount, spaceId: string) {
	let space = account.root.spaces?.find(item => item?.$jazz.id === spaceId)
	if (!space)
		throw new NotFoundError({ message: `Space not found: ${spaceId}` })
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
	account: ActiveAccount,
	enabled: boolean,
	timeoutMs: number,
) {
	if (!enabled) return
	await account.$jazz.waitForAllCoValuesSync({ timeout: timeoutMs })
}

async function syncMutation(account: ActiveAccount, timeoutMs: number) {
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
		return { kind: "doc", ...invite }
	} catch (error) {
		void error
	}
	try {
		let invite = parseSpaceInviteLink(link)
		return { kind: "space", ...invite }
	} catch (error) {
		void error
	}
	throw new ValidationError({ message: "Invalid invite link" })
}

function getOptionString(value: Option.Option<string> | undefined) {
	return value && Option.isSome(value) ? value.value : undefined
}

function getOptionNumber(value: Option.Option<number> | undefined) {
	return value && Option.isSome(value) ? value.value : undefined
}

function getErrorType(error: unknown): string {
	return typeof error === "object" &&
		error !== null &&
		"_tag" in error &&
		typeof error._tag === "string"
		? error._tag
		: "Error"
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
						resolve: { content: true }
					}): Promise<LoadedCliDocument>
				}
		  },
): Promise<LoadedCliDocument> {
	if ("content" in doc) {
		return doc
	}
	return doc.$jazz.ensureLoaded({ resolve: { content: true } })
}
