import { expect, type Page } from "@playwright/test"
import { testIds } from "@/lib/test-ids"

export {
	waitForEditorBoot,
	openSettings,
	createAccount,
	signOut,
	signIn,
	getRecoveryPhrase,
}

interface WaitForEditorBootArgs {
	path?: string
}

interface OpenSettingsArgs {
	fromPath?: string
}

interface CreateAccountArgs {
	openSettings?: boolean
}

interface SignInArgs {
	passphrase: string
	openSettings?: boolean
}

interface SignOutArgs {
	openSettings?: boolean
}

async function waitForEditorBoot(page: Page, args: WaitForEditorBootArgs = {}) {
	let path = args.path ?? "/app"
	let bootStart = Date.now()
	await page.goto(path)

	type BootAttemptDiagnostic = {
		attempt: number
		timeoutMs: number
		elapsedMs: number
		attemptDurationMs: number
		status: "ready" | "not-ready"
		url: string
		title: string
		bodyReadyAttr: string | null
		windowReady: boolean | null
		windowReadyRoute: string | null
		bodyTextSnippet: string
		fallback?: boolean
		signals: {
			settingsSignIn: { present: boolean; visible: boolean }
			settingsSignOut: { present: boolean; visible: boolean }
			authDialog: { present: boolean; visible: boolean }
			editorTextbox: { present: boolean; visible: boolean }
			docControls: { present: boolean; visible: boolean }
			settingsSectionCloud: { present: boolean; visible: boolean }
		}
	}

	let diagnostics: BootAttemptDiagnostic[] = []
	let ready = false
	for (let attempt = 0; attempt < 3; attempt++) {
		let timeout = 10_000 + attempt * 10_000
		let attemptStart = Date.now()
		let signal = await expect
			.poll(
				async () => {
					return page.evaluate(() => {
						let byAttr = document.body.getAttribute("data-alkalye-ready")
						let byWindow = (window as { __alkalyeReady?: boolean }).__alkalyeReady
						if (byAttr === "true" || byWindow === true) return "true"

						let hasSettings = Boolean(document.querySelector('[data-testid="settings-section-cloud"]'))
						let hasEditor = Boolean(document.querySelector('[data-testid="doc-editor-textarea"], [role="textbox"], textarea'))
						return hasSettings || hasEditor ? "true" : "false"
					})
				},
				{ timeout },
			)
			.toBe("true")
			.then(() => true)
			.catch(() => false)

		let attemptDiagnostic = await page.evaluate((meta) => {
			let selectInfo = (selector: string) => {
				let el = document.querySelector(selector)
				if (!el) return { present: false, visible: false }
				let rect = (el as HTMLElement).getBoundingClientRect()
				let style = window.getComputedStyle(el as Element)
				let visible =
					rect.width > 0 &&
					rect.height > 0 &&
					style.visibility !== "hidden" &&
					style.display !== "none" &&
					style.opacity !== "0"
				return { present: true, visible }
			}

			let bodyTextSnippet = document.body?.innerText?.replace(/\s+/g, " ").trim().slice(0, 500) ?? ""
			let windowObj = window as {
				__alkalyeReady?: boolean
				__alkalyeReadyRoute?: string
			}

			return {
				attempt: meta.attempt,
				timeoutMs: meta.timeout,
				elapsedMs: Date.now() - meta.bootStart,
				attemptDurationMs: Date.now() - meta.attemptStart,
				status: meta.signal ? "ready" : "not-ready",
				url: window.location.href,
				title: document.title,
				bodyReadyAttr: document.body?.getAttribute("data-alkalye-ready") ?? null,
				windowReady: windowObj.__alkalyeReady ?? null,
				windowReadyRoute: windowObj.__alkalyeReadyRoute ?? null,
				bodyTextSnippet,
				signals: {
					settingsSignIn: selectInfo('[data-testid="settings-sign-in"]'),
					settingsSignOut: selectInfo('[data-testid="settings-sign-out"]'),
					authDialog: selectInfo('[data-testid="auth-dialog"], [role="dialog"]'),
					editorTextbox: selectInfo('[data-testid="doc-editor-textarea"], [role="textbox"], textarea'),
					docControls: selectInfo('[data-testid="doc-new-button"], [data-testid="doc-list"], [data-testid="doc-editor"], [data-testid="editor-toolbar"]'),
					settingsSectionCloud: selectInfo('[data-testid="settings-section-cloud"]'),
				},
			}
		}, { attempt: attempt + 1, timeout, bootStart, attemptStart, signal })

		diagnostics.push(attemptDiagnostic)
		console.log(`[ALK_BOOT_DIAG] ${JSON.stringify(attemptDiagnostic)}`)

		if (signal) {
			ready = true
			break
		}

		// Pi + prod can take longer / stall once; force hard reload and retry.
		await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {})
	}

	if (!ready) {
		let shouldTrySlowFallback = diagnostics.length >= 3 && diagnostics.every((d) => {
			return (
				d.windowReadyRoute === "boot" &&
				d.bodyReadyAttr === "false" &&
				!d.signals.editorTextbox.present &&
				!d.signals.settingsSectionCloud.present
			)
		})

		if (shouldTrySlowFallback) {
			let fallbackTimeoutMs = 45_000
			let fallbackStart = Date.now()
			let fallbackSignal = await expect
				.poll(
					async () => {
						return page.evaluate(() => {
							let byAttr = document.body.getAttribute("data-alkalye-ready")
							let byWindow = (window as { __alkalyeReady?: boolean }).__alkalyeReady
							let hasSettings = Boolean(document.querySelector('[data-testid="settings-section-cloud"]'))
							let hasEditor = Boolean(document.querySelector('[data-testid="doc-editor-textarea"], [role="textbox"], textarea'))
							return byAttr === "true" || byWindow === true || hasSettings || hasEditor ? "true" : "false"
						})
					},
					{ timeout: fallbackTimeoutMs, intervals: [1_000] },
				)
				.toBe("true")
				.then(() => true)
				.catch(() => false)

			let fallbackDiagnostic = await page.evaluate((meta) => {
				let selectInfo = (selector: string) => {
					let el = document.querySelector(selector)
					if (!el) return { present: false, visible: false }
					let rect = (el as HTMLElement).getBoundingClientRect()
					let style = window.getComputedStyle(el as Element)
					let visible =
						rect.width > 0 &&
						rect.height > 0 &&
						style.visibility !== "hidden" &&
						style.display !== "none" &&
						style.opacity !== "0"
					return { present: true, visible }
				}
				let bodyTextSnippet = document.body?.innerText?.replace(/\s+/g, " ").trim().slice(0, 500) ?? ""
				let windowObj = window as {
					__alkalyeReady?: boolean
					__alkalyeReadyRoute?: string
				}
				return {
					attempt: meta.attempt,
					timeoutMs: meta.timeout,
					elapsedMs: Date.now() - meta.bootStart,
					attemptDurationMs: Date.now() - meta.attemptStart,
					status: meta.signal ? "ready" : "not-ready",
					url: window.location.href,
					title: document.title,
					bodyReadyAttr: document.body?.getAttribute("data-alkalye-ready") ?? null,
					windowReady: windowObj.__alkalyeReady ?? null,
					windowReadyRoute: windowObj.__alkalyeReadyRoute ?? null,
					bodyTextSnippet,
					fallback: true,
					signals: {
						settingsSignIn: selectInfo('[data-testid="settings-sign-in"]'),
						settingsSignOut: selectInfo('[data-testid="settings-sign-out"]'),
						authDialog: selectInfo('[data-testid="auth-dialog"], [role="dialog"]'),
						editorTextbox: selectInfo('[data-testid="doc-editor-textarea"], [role="textbox"], textarea'),
						docControls: selectInfo('[data-testid="doc-new-button"], [data-testid="doc-list"], [data-testid="doc-editor"], [data-testid="editor-toolbar"]'),
						settingsSectionCloud: selectInfo('[data-testid="settings-section-cloud"]'),
					},
				}
			}, {
				attempt: diagnostics.length + 1,
				timeout: fallbackTimeoutMs,
				bootStart,
				attemptStart: fallbackStart,
				signal: fallbackSignal,
			})
			diagnostics.push(fallbackDiagnostic as BootAttemptDiagnostic)
			console.log(`[ALK_BOOT_DIAG_FALLBACK] ${JSON.stringify(fallbackDiagnostic)}`)
			ready = fallbackSignal
		}
	}

	if (!ready) {
		let payload = {
			type: "EditorBootTimeout",
			attempts: diagnostics.length,
			totalElapsedMs: Date.now() - bootStart,
			diagnostics,
		}
		let error = new Error(`Editor boot timeout diagnostics: ${JSON.stringify(payload)}`)
		;(error as Error & { diagnostics?: typeof payload }).diagnostics = payload
		throw error
	}

	let route = await page.evaluate(() => {
		return (
			(window as { __alkalyeReadyRoute?: string }).__alkalyeReadyRoute ?? null
		)
	})

	return {
		ok: true,
		url: page.url(),
		route,
	}
}

async function openSettings(page: Page, args: OpenSettingsArgs = {}) {
	let fromPath = args.fromPath ?? "/app/settings"
	await page.goto(fromPath)
	await expect(page.getByText("Cloud Sync & Backup")).toBeVisible()

	return {
		ok: true,
		url: page.url(),
	}
}

async function createAccount(page: Page, args: CreateAccountArgs = {}) {
	if (args.openSettings ?? true) {
		await openSettings(page)
	}

	await page.getByTestId(testIds.auth.settingsSignIn).click()
	await page.getByTestId(testIds.auth.initialCreateAccount).click()

	let recovery = await getRecoveryPhrase(page)

	await page.getByTestId(testIds.auth.createCopy).click()
	await page.getByTestId(testIds.auth.createSubmit).click()

	let dialog = page.getByTestId(testIds.auth.dialog)
	let didClose = await expect(dialog)
		.toBeHidden({ timeout: 20_000 })
		.then(() => true)
		.catch(() => false)

	if (!didClose) {
		let dialogText = await dialog.innerText()
		throw new Error(`Create account dialog did not close: ${dialogText}`)
	}

	let createError = page.getByTestId(testIds.auth.createError)
	if (await createError.isVisible({ timeout: 2_000 }).catch(() => false)) {
		throw new Error(await createError.innerText())
	}

	await openSettings(page)
	await expect(page.getByTestId(testIds.auth.settingsSignOut)).toBeVisible({
		timeout: 60_000,
	})

	return {
		ok: true,
		signedIn: true,
		passphrase: recovery.passphrase,
	}
}

async function signOut(page: Page, args: SignOutArgs = {}) {
	if (args.openSettings ?? true) {
		await openSettings(page)
	}

	await page.getByTestId(testIds.auth.settingsSignOut).click()
	await expect(page.getByTestId(testIds.auth.settingsSignIn)).toBeVisible()

	return {
		ok: true,
		signedIn: false,
	}
}

async function signIn(page: Page, args: SignInArgs) {
	if (args.openSettings ?? true) {
		await openSettings(page)
	}

	await page.getByTestId(testIds.auth.settingsSignIn).click()
	await page.getByTestId(testIds.auth.initialSignIn).click()
	await page.getByTestId(testIds.auth.loginPassphrase).fill(args.passphrase)
	await page.getByTestId(testIds.auth.loginSubmit).click()

	let dialog = page.getByTestId(testIds.auth.dialog)
	let didClose = await expect(dialog)
		.toBeHidden({ timeout: 25_000 })
		.then(() => true)
		.catch(() => false)
	if (!didClose) {
		let dialogText = await dialog.innerText()
		throw new Error(`Sign in dialog did not close: ${dialogText}`)
	}

	let loginError = page.getByTestId(testIds.auth.loginError)
	if (await loginError.isVisible({ timeout: 2_000 }).catch(() => false)) {
		throw new Error(await loginError.innerText())
	}

	await openSettings(page)
	await expect(page.getByTestId(testIds.auth.settingsSignOut)).toBeVisible({
		timeout: 60_000,
	})

	return {
		ok: true,
		signedIn: true,
	}
}

async function getRecoveryPhrase(page: Page) {
	let passphrase = await page
		.getByTestId(testIds.auth.createPassphrase)
		.inputValue()

	expect(passphrase.trim().length).toBeGreaterThan(10)

	return {
		ok: true,
		passphrase,
	}
}
