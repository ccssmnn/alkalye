import { test, expect } from "@playwright/test"
import {
	createAccount,
	signIn,
	signOut,
	waitForEditorBoot,
} from "./auth-helpers"

test("auth flow: create account, sign out, sign in", async ({ page }) => {
	let boot = await waitForEditorBoot(page)
	expect(boot.ok).toBe(true)

	let created = await createAccount(page)
	expect(created.ok).toBe(true)
	expect(created.signedIn).toBe(true)
	expect(created.passphrase.trim().length).toBeGreaterThan(10)

	let signedOut = await signOut(page)
	expect(signedOut).toEqual({ ok: true, signedIn: false })

	let signedIn = await signIn(page, { passphrase: created.passphrase })
	expect(signedIn).toEqual({ ok: true, signedIn: true })
})
