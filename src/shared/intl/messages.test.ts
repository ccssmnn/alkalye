import { describe, test, expect } from "vitest"
import { createIntl } from "@ccssmnn/intl"
import { messagesEn, messagesDe } from "./messages"

describe("messages parsing", () => {
	test("all English messages can be parsed without errors", () => {
		let compilationErrors: string[] = []

		let originalWarn = console.warn
		let originalTable = console.table
		console.warn = (message: string) => {
			if (
				message.includes("MessageFormat compilation completed with") &&
				message.includes("error")
			) {
				compilationErrors.push(message)
			}
		}
		console.table = () => {}

		try {
			createIntl(messagesEn, "en")
			expect(compilationErrors).toEqual([])
		} finally {
			console.warn = originalWarn
			console.table = originalTable
		}
	})

	test("all German messages can be parsed without errors", () => {
		let compilationErrors: string[] = []

		let originalWarn = console.warn
		let originalTable = console.table
		console.warn = (message: string) => {
			if (
				message.includes("MessageFormat compilation completed with") &&
				message.includes("error")
			) {
				compilationErrors.push(message)
			}
		}
		console.table = () => {}

		try {
			createIntl(messagesDe, "de")
			expect(compilationErrors).toEqual([])
		} finally {
			console.warn = originalWarn
			console.table = originalTable
		}
	})
})
