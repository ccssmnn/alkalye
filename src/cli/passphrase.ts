import type { ParsedArgs, RuntimeDeps } from "./types"

export { resolvePassphrase }

type PassphraseResult =
	| { ok: true; value?: string }
	| { ok: false; code: string; message: string }

async function resolvePassphrase(
	args: ParsedArgs,
	deps: RuntimeDeps,
	required: boolean,
): Promise<PassphraseResult> {
	if (args.passphrase !== undefined) {
		let value = normalize(args.passphrase)
		if (!value && required) {
			return invalid("Provided passphrase is empty")
		}
		return { ok: true, value }
	}

	if (args.passphraseEnv) {
		let value = normalize(deps.env[args.passphraseEnv])
		if (!value) {
			return invalid(`Passphrase env var ${args.passphraseEnv} is empty or unset`)
		}
		return { ok: true, value }
	}

	if (args.passphraseFile) {
		try {
			let fileValue = await deps.readFile(args.passphraseFile)
			let normalized = normalize(fileValue)
			if (!normalized) {
				return invalid(`Passphrase file ${args.passphraseFile} is empty`)
			}
			return { ok: true, value: normalized }
		} catch {
			return {
				ok: false,
				code: "passphrase_file_error",
				message: `Unable to read passphrase file ${args.passphraseFile}`,
			}
		}
	}

	if (args.passphraseStdin) {
		let stdinValue = normalize(await deps.readStdin())
		if (!stdinValue) {
			return invalid("Passphrase stdin input is empty")
		}
		return { ok: true, value: stdinValue }
	}

	if (required) {
		return {
			ok: false,
			code: "missing_passphrase",
			message:
				"Passphrase is required. Use --passphrase, --passphrase-env, --passphrase-file, or --passphrase-stdin",
		}
	}

	return { ok: true }
}

function normalize(value: string | undefined): string | undefined {
	if (value === undefined) return undefined
	let trimmed = value.trim()
	if (!trimmed) return undefined
	return trimmed
}

function invalid(message: string): PassphraseResult {
	return {
		ok: false,
		code: "invalid_passphrase",
		message,
	}
}
