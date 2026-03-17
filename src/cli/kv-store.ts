import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { KvStore } from "jazz-tools"
import { KvStoreContext } from "jazz-tools"
import { FilesystemError } from "@/cli/errors"

export { ensureCliKvStore }

class FileKvStore implements KvStore {
	private filePath: string

	constructor(filePath: string) {
		this.filePath = filePath
	}

	async get(key: string): Promise<string | null> {
		let state = await this.readState()
		return state[key] ?? null
	}

	async set(key: string, value: string): Promise<void> {
		let state = await this.readState()
		state[key] = value
		await this.writeState(state)
	}

	async delete(key: string): Promise<void> {
		let state = await this.readState()
		delete state[key]
		await this.writeState(state)
	}

	async clearAll(): Promise<void> {
		await this.writeState({})
	}

	private async readState(): Promise<Record<string, string>> {
		try {
			let text = await readFile(this.filePath, "utf8").catch(error => {
				if (isMissingFile(error)) return ""
				throw error
			})
			if (!text.trim()) return {}
			let json = JSON.parse(text)
			if (!isRecord(json)) return {}
			return Object.fromEntries(
				Object.entries(json).filter((entry): entry is [string, string] => {
					return typeof entry[0] === "string" && typeof entry[1] === "string"
				}),
			)
		} catch (error) {
			throw new FilesystemError({ message: toMessage(error) })
		}
	}

	private async writeState(state: Record<string, string>): Promise<void> {
		try {
			await mkdir(dirname(this.filePath), { recursive: true })
			await writeFile(this.filePath, JSON.stringify(state, null, 2))
		} catch (error) {
			throw new FilesystemError({ message: toMessage(error) })
		}
	}
}

function ensureCliKvStore(filePath: string): void {
	if (KvStoreContext.getInstance().isInitialized()) return
	KvStoreContext.getInstance().initialize(new FileKvStore(filePath))
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function toMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT"
}
