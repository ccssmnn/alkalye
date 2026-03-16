import { describe, expect, test } from "vitest"
import { interpretEscapes, parseScope, parseDocScope } from "@/cli/parse"
import { ValidationError } from "@/cli/errors"

describe("interpretEscapes", () => {
	test("converts \\n to newline", () => {
		expect(interpretEscapes("a\\nb")).toBe("a\nb")
	})

	test("converts \\t to tab", () => {
		expect(interpretEscapes("a\\tb")).toBe("a\tb")
	})

	test("converts \\\\ to backslash", () => {
		expect(interpretEscapes("a\\\\b")).toBe("a\\b")
	})

	test("handles multiple escapes", () => {
		expect(interpretEscapes("# Title\\n\\nBody\\n- item")).toBe(
			"# Title\n\nBody\n- item",
		)
	})

	test("passes through strings without escapes", () => {
		expect(interpretEscapes("hello world")).toBe("hello world")
	})

	test("handles empty string", () => {
		expect(interpretEscapes("")).toBe("")
	})
})

describe("parseScope", () => {
	test("defaults to personal", () => {
		expect(parseScope(undefined)).toEqual({ kind: "personal" })
	})

	test("parses 'personal' explicitly", () => {
		expect(parseScope("personal")).toEqual({ kind: "personal" })
	})

	test("parses 'all'", () => {
		expect(parseScope("all")).toEqual({ kind: "all" })
	})

	test("parses space scope", () => {
		expect(parseScope("space:co_xyz")).toEqual({
			kind: "space",
			spaceId: "co_xyz",
		})
	})

	test("rejects empty space id", () => {
		expect(() => parseScope("space:")).toThrow(ValidationError)
	})

	test("rejects invalid scope", () => {
		expect(() => parseScope("invalid")).toThrow(ValidationError)
	})
})

describe("parseDocScope", () => {
	test("defaults to personal", () => {
		expect(parseDocScope(undefined)).toEqual({ kind: "personal" })
	})

	test("parses space scope", () => {
		expect(parseDocScope("space:co_abc")).toEqual({
			kind: "space",
			spaceId: "co_abc",
		})
	})

	test("rejects 'all' (not valid for doc mutations)", () => {
		expect(() => parseDocScope("all")).toThrow(ValidationError)
	})
})
