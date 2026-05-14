export { tryCatch, type TryCatchResult }

type TryCatchResult<T> = { ok: true; value: T } | { ok: false; error: Error }

async function tryCatch<T>(promise: Promise<T>): Promise<TryCatchResult<T>> {
	try {
		let value = await promise
		return { ok: true, value }
	} catch (e) {
		let error = e instanceof Error ? e : new Error(String(e))
		return { ok: false, error }
	}
}
