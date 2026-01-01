import { describe, it, expect } from "vitest"
import { parseWikiLinks } from "./wikilink-parser"

describe("parseWikiLinks", () => {
	it("returns empty array for no links", () => {
		expect(parseWikiLinks("Just text")).toEqual([])
	})

	it("parses single wikilink", () => {
		let result = parseWikiLinks("See [[abc123]] for more")
		// "See " = 4 chars, "[[abc123]]" = 10 chars → from: 4, to: 14
		expect(result).toEqual([{ id: "abc123", from: 4, to: 14 }])
	})

	it("parses multiple wikilinks", () => {
		let result = parseWikiLinks("Link [[abc]] and [[def]] here")

		expect(result).toEqual([
			{ id: "abc", from: 5, to: 12 },
			{ id: "def", from: 17, to: 24 },
		])
	})

	it("parses wikilinks at start and end", () => {
		let result = parseWikiLinks("[[start]] middle [[end]]")

		expect(result).toEqual([
			{ id: "start", from: 0, to: 9 },
			{ id: "end", from: 17, to: 24 },
		])
	})

	it("handles wikilinks with hyphens and underscores", () => {
		let result = parseWikiLinks("[[doc-id_123]]")

		expect(result).toEqual([{ id: "doc-id_123", from: 0, to: 14 }])
	})

	it("handles wikilinks with spaces (for titles)", () => {
		let result = parseWikiLinks("[[My Document Title]]")

		expect(result).toEqual([{ id: "My Document Title", from: 0, to: 21 }])
	})

	it("does not match incomplete brackets", () => {
		expect(parseWikiLinks("[[unclosed")).toEqual([])
		expect(parseWikiLinks("[single]")).toEqual([])
		expect(parseWikiLinks("]]backwards[[")).toEqual([])
	})

	it("does not match empty brackets", () => {
		expect(parseWikiLinks("[[]]")).toEqual([])
	})

	it("handles adjacent wikilinks", () => {
		let result = parseWikiLinks("[[abc]][[def]]")

		expect(result).toEqual([
			{ id: "abc", from: 0, to: 7 },
			{ id: "def", from: 7, to: 14 },
		])
	})

	it("handles wikilinks in markdown context", () => {
		let content = `---
title: Test
---

# Heading

Check out [[doc1]] and [[doc2]].

- Item with [[doc3]]
`
		let result = parseWikiLinks(content)

		expect(result).toHaveLength(3)
		expect(result.map(l => l.id)).toEqual(["doc1", "doc2", "doc3"])
	})

	it("handles multiline content", () => {
		let content = `Line 1 [[abc]]
Line 2 [[def]]
Line 3`
		let result = parseWikiLinks(content)

		expect(result).toHaveLength(2)
		expect(result[0].id).toBe("abc")
		expect(result[1].id).toBe("def")
	})

	it("can be called multiple times (regex state reset)", () => {
		let content = "[[abc]] [[def]]"

		let result1 = parseWikiLinks(content)
		let result2 = parseWikiLinks(content)

		expect(result1).toEqual(result2)
	})
})
