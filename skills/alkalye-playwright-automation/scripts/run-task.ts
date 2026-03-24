import { chromium, expect, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { testIds } from "@/lib/test-ids"
import {
	createAccount,
	openSettings,
	signIn,
	signOut,
	waitForEditorBoot,
} from "../helpers/auth-helpers"
import {
	create,
	deleteById,
	list,
	readById,
	updateById,
} from "../helpers/doc-helpers"
import {
	acceptSpaceInvite,
	createSpace,
	createSpaceInvite,
	deleteSpaceById,
	listSpaceInvites,
	listSpaces,
	readSpaceById,
	revokeSpaceInvite,
	updateSpaceById,
} from "../helpers/space-helpers"
import {
	acceptDocumentInvite,
	createDocumentInvite,
	listDocumentInvites,
	revokeDocumentInvite,
} from "../helpers/document-collab-helpers"

type Step = {
	task: string
	args?: Record<string, unknown>
}

type Payload = {
	baseURL?: string
	headless?: boolean
	steps: Step[]
}

async function main() {
	let payload = await loadPayload()
	let baseURL =
		payload.baseURL ??
		process.env.PLAYWRIGHT_BASE_URL ??
		"http://127.0.0.1:4173"
	let browser = await chromium.launch({ headless: payload.headless ?? true })
	let context = await browser.newContext({
		baseURL,
		permissions: ["clipboard-read", "clipboard-write"],
	})
	let page = await context.newPage()

	let results: Array<{ task: string; result: unknown }> = []

	try {
		for (let step of payload.steps) {
			let result = await runStep(page, step)
			results.push({ task: step.task, result })
		}

		writeJson({ ok: true, baseURL, steps: results })
	} finally {
		await context.close()
		await browser.close()
	}
}

async function runStep(page: Page, step: Step) {
	let args = step.args ?? {}

	switch (step.task) {
		case "auth.waitForEditorBoot":
			return waitForEditorBoot(page, {
				path: getOptionalString(args, "path"),
			})
		case "auth.openSettings":
			return openSettings(page, {
				fromPath: getOptionalString(args, "fromPath"),
			})
		case "auth.createAccount":
			return createAccount(page, {
				openSettings: getOptionalBoolean(args, "openSettings"),
			})
		case "auth.signIn":
			return signIn(page, {
				passphrase: getRequiredString(args, "passphrase"),
				openSettings: getOptionalBoolean(args, "openSettings"),
			})
		case "auth.signOut":
			return signOut(page, {
				openSettings: getOptionalBoolean(args, "openSettings"),
			})

		case "doc.create":
			return create(page, {
				title: getOptionalString(args, "title"),
				body: getOptionalString(args, "body"),
				content: getOptionalString(args, "content"),
				tags: getOptionalStringArray(args, "tags"),
				path: getOptionalString(args, "path"),
				spaceId: getOptionalString(args, "spaceId"),
			})
		case "doc.readById":
			return readById(page, {
				id: getRequiredString(args, "id"),
				spaceId: getOptionalString(args, "spaceId"),
			})
		case "doc.updateById":
			return updateById(page, {
				id: getRequiredString(args, "id"),
				title: getOptionalString(args, "title"),
				body: getOptionalString(args, "body"),
				content: getOptionalString(args, "content"),
				tags: getOptionalStringArray(args, "tags"),
				path: getOptionalString(args, "path"),
				spaceId: getOptionalString(args, "spaceId"),
			})
		case "doc.list":
			return list(page, {
				search: getOptionalString(args, "search"),
				spaceId: getOptionalString(args, "spaceId"),
			})
		case "doc.deleteById":
			return deleteById(page, {
				id: getRequiredString(args, "id"),
				spaceId: getOptionalString(args, "spaceId"),
			})

		case "space.create":
			return createSpace(page, {
				name: getRequiredString(args, "name"),
			})
		case "space.readById":
			return readSpaceById(page, {
				spaceId: getRequiredString(args, "spaceId"),
			})
		case "space.updateById":
			return updateSpaceById(page, {
				spaceId: getRequiredString(args, "spaceId"),
				name: getRequiredString(args, "name"),
			})
		case "space.list":
			return listSpaces(page)
		case "space.deleteById":
			return deleteSpaceById(page, {
				spaceId: getRequiredString(args, "spaceId"),
			})
		case "space.createInvite":
			return createSpaceInvite(page, {
				spaceId: getRequiredString(args, "spaceId"),
				role: getRequiredInviteRole(args, "role"),
			})
		case "space.listInvites":
			return listSpaceInvites(page, {
				spaceId: getRequiredString(args, "spaceId"),
			})
		case "space.revokeInvite":
			return revokeSpaceInvite(page, {
				spaceId: getRequiredString(args, "spaceId"),
				inviteGroupId: getOptionalString(args, "inviteGroupId"),
			})
		case "space.acceptInvite":
			return acceptSpaceInvite(page, {
				link: getRequiredString(args, "link"),
			})

		case "collab.doc.createInvite":
			return createDocumentInvite(page, {
				docId: getRequiredString(args, "docId"),
				spaceId: getOptionalString(args, "spaceId"),
				role: getRequiredInviteRole(args, "role"),
			})
		case "collab.doc.listInvites":
			return listDocumentInvites(page, {
				docId: getRequiredString(args, "docId"),
				spaceId: getOptionalString(args, "spaceId"),
			})
		case "collab.doc.revokeInvite":
			return revokeDocumentInvite(page, {
				docId: getRequiredString(args, "docId"),
				spaceId: getOptionalString(args, "spaceId"),
				inviteGroupId: getOptionalString(args, "inviteGroupId"),
			})
		case "collab.doc.acceptInvite":
			return acceptDocumentInvite(page, {
				link: getRequiredString(args, "link"),
			})

		case "invite.accept":
			return acceptInviteAsCurrentUser(page, {
				link: getRequiredString(args, "link"),
			})

		case "doc.public.enable":
			return enablePublicAccess(page, {
				docId: getRequiredString(args, "docId"),
				spaceId: getOptionalString(args, "spaceId"),
			})
		case "doc.public.disable":
			return disablePublicAccess(page, {
				docId: getRequiredString(args, "docId"),
				spaceId: getOptionalString(args, "spaceId"),
			})
		case "doc.public.link":
			return getPublicLink(page, {
				docId: getRequiredString(args, "docId"),
				spaceId: getOptionalString(args, "spaceId"),
			})

		default:
			throw new Error(`Unsupported task: ${step.task}`)
	}
}

async function openShareDialog(
	page: Page,
	args: { docId: string; spaceId?: string },
) {
	let path = args.spaceId
		? `/app/spaces/${args.spaceId}/doc/${args.docId}`
		: `/app/doc/${args.docId}`

	await waitForEditorBoot(page, { path })
	let shareButton = page.getByTestId(testIds.collab.docShareOpenButton)
	let handle = await shareButton.elementHandle()
	if (!handle) throw new Error("Could not find document share button")
	await handle.evaluate(element => {
		element.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		)
	})
	await expect(page.getByTestId(testIds.collab.docShareDialog)).toBeVisible()
}

async function enablePublicAccess(
	page: Page,
	args: { docId: string; spaceId?: string },
) {
	await openShareDialog(page, args)
	await page.getByTestId(testIds.collab.docPublicEnableButton).click()
	await expect(page.getByTestId(testIds.collab.docPublicLinkInput)).toBeVisible(
		{ timeout: 10_000 },
	)
	let link = await page
		.getByTestId(testIds.collab.docPublicLinkInput)
		.inputValue()
	return { ok: true, docId: args.docId, public: true, link }
}

async function disablePublicAccess(
	page: Page,
	args: { docId: string; spaceId?: string },
) {
	await openShareDialog(page, args)
	await page.getByTestId(testIds.collab.docPublicDisableButton).click()
	await expect(
		page.getByTestId(testIds.collab.docPublicEnableButton),
	).toBeVisible({ timeout: 10_000 })
	return { ok: true, docId: args.docId, public: false }
}

async function getPublicLink(
	page: Page,
	args: { docId: string; spaceId?: string },
) {
	await openShareDialog(page, args)
	let input = page.getByTestId(testIds.collab.docPublicLinkInput)
	let isPublic = await input.isVisible({ timeout: 2_000 }).catch(() => false)
	if (!isPublic) {
		return { ok: true, docId: args.docId, public: false, link: null }
	}
	let link = await input.inputValue()
	return { ok: true, docId: args.docId, public: true, link }
}

async function acceptInviteAsCurrentUser(page: Page, args: { link: string }) {
	await page.goto(args.link)
	await expect(page).toHaveURL(/\/app\/invite/)

	let docIdMatch = args.link.match(/#\/doc\/(co_[^/]+)\//)
	let spaceIdMatch = args.link.match(/#\/space\/(co_[^/]+)\//)

	if (docIdMatch) {
		let docId = docIdMatch[1]
		await expect
			.poll(() => page.url(), { timeout: 30_000 })
			.toContain(`/app/doc/${docId}`)
		return { ok: true, type: "doc", docId, url: page.url() }
	}

	if (spaceIdMatch) {
		let spaceId = spaceIdMatch[1]
		await expect
			.poll(() => page.url(), { timeout: 30_000 })
			.toContain(`/app/spaces/${spaceId}`)
		return { ok: true, type: "space", spaceId, url: page.url() }
	}

	throw new Error("Could not parse doc or space ID from invite link")
}

async function loadPayload(): Promise<Payload> {
	let raw = await loadRawInput()
	let parsed = parseJson(raw)
	if (!isRecord(parsed)) {
		throw new Error("Payload must be an object")
	}

	let stepsValue = parsed.steps
	if (!Array.isArray(stepsValue) || stepsValue.length === 0) {
		throw new Error("Payload.steps must be a non-empty array")
	}

	let steps: Step[] = []
	for (let value of stepsValue) {
		if (!isRecord(value)) {
			throw new Error("Each step must be an object")
		}
		let task = value.task
		if (typeof task !== "string" || task.length === 0) {
			throw new Error("Each step.task must be a non-empty string")
		}
		let args = value.args
		if (args !== undefined && !isRecord(args)) {
			throw new Error("Step args must be an object when provided")
		}
		steps.push({ task, args })
	}

	return {
		baseURL: getOptionalString(parsed, "baseURL"),
		headless: getOptionalBoolean(parsed, "headless"),
		steps,
	}
}

async function loadRawInput() {
	let args = process.argv.slice(2)
	if (args.length > 0) {
		if (args[0] === "--file") {
			let filePath = args[1]
			if (!filePath) throw new Error("Missing file path after --file")
			return readFile(filePath, "utf-8")
		}
		if (args[0].startsWith("@")) {
			return readFile(args[0].slice(1), "utf-8")
		}
		return args.join(" ")
	}

	let stdin = await readStdin()
	if (!stdin.trim()) {
		throw new Error("Provide JSON via stdin, --file <path>, @<path>, or inline")
	}
	return stdin
}

async function readStdin() {
	if (process.stdin.isTTY) return ""
	let chunks: Buffer[] = []
	for await (let chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
	}
	return Buffer.concat(chunks).toString("utf-8")
}

function parseJson(value: string) {
	try {
		return JSON.parse(value)
	} catch {
		throw new Error("Invalid JSON payload")
	}
}

function getRequiredString(source: Record<string, unknown>, key: string) {
	let value = source[key]
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Expected non-empty string at ${key}`)
	}
	return value
}

function getOptionalString(source: Record<string, unknown>, key: string) {
	let value = source[key]
	if (value === undefined) return undefined
	if (typeof value !== "string") {
		throw new Error(`Expected string at ${key}`)
	}
	return value
}

function getOptionalBoolean(source: Record<string, unknown>, key: string) {
	let value = source[key]
	if (value === undefined) return undefined
	if (typeof value !== "boolean") {
		throw new Error(`Expected boolean at ${key}`)
	}
	return value
}

function getOptionalStringArray(source: Record<string, unknown>, key: string) {
	let value = source[key]
	if (value === undefined) return undefined
	if (!Array.isArray(value)) {
		throw new Error(`Expected string[] at ${key}`)
	}
	for (let item of value) {
		if (typeof item !== "string") {
			throw new Error(`Expected string[] at ${key}`)
		}
	}
	return value
}

function getRequiredInviteRole(source: Record<string, unknown>, key: string) {
	let value = source[key]
	if (value !== "writer" && value !== "reader") {
		throw new Error(`Expected role writer|reader at ${key}`)
	}
	return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function writeJson(value: unknown) {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

void main().catch(error => {
	let message = error instanceof Error ? error.message : "Unknown error"
	writeJson({ ok: false, error: message })
	process.exitCode = 1
})
