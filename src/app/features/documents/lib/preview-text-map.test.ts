import { describe, expect, it } from "vitest"
import {
	buildPreviewTextMap,
	rawRangeToRenderedRange,
	renderedRangeToRawRange,
} from "./preview-text-map"

describe("preview text map", () => {
	it("maps rendered text across markdown syntax to raw markdown", () => {
		let map = buildPreviewTextMap("Hello **world**")
		let range = renderedRangeToRawRange(map, 0, "Hello world".length)

		expect(map.text).toBe("Hello world")
		expect(range).toEqual({ from: 0, to: "Hello **world**".length })
	})

	it("maps raw markdown syntax back to rendered text", () => {
		let map = buildPreviewTextMap("Hello **world**")
		let range = rawRangeToRenderedRange(map, 0, "Hello **world**".length)

		expect(range).toEqual({
			from: 0,
			to: "Hello world".length,
			text: "Hello world",
		})
	})

	it("maps links to their rendered label", () => {
		let markdown = "Read [the docs](https://example.com)"
		let map = buildPreviewTextMap(markdown)
		let renderedFrom = "Read ".length
		let renderedTo = renderedFrom + "the docs".length
		let range = renderedRangeToRawRange(map, renderedFrom, renderedTo)

		expect(map.text).toBe("Read the docs")
		expect(range).toEqual({ from: "Read ".length, to: markdown.length })
	})

	it("keeps partial selections inside formatted text partial", () => {
		let map = buildPreviewTextMap("Hello **world**")
		let range = renderedRangeToRawRange(
			map,
			"Hello ".length,
			"Hello wor".length,
		)
		let rendered = rawRangeToRenderedRange(
			map,
			"Hello **".length,
			"Hello **wor".length,
		)

		expect(range).toEqual({ from: "Hello **".length, to: "Hello **wor".length })
		expect(rendered).toEqual({
			from: "Hello ".length,
			to: "Hello wor".length,
			text: "wor",
		})
	})

	it("recurses through nested inline markdown", () => {
		let markdown = "Read [**docs**](https://example.com) now"
		let map = buildPreviewTextMap(markdown)

		expect(map.text).toBe("Read docs now")
		expect(
			renderedRangeToRawRange(map, "Read ".length, "Read docs".length),
		).toEqual({
			from: "Read ".length,
			to: "Read [**docs**](https://example.com)".length,
		})
	})

	it("uses resolved wikilink titles", () => {
		let map = buildPreviewTextMap("See [[doc-id]] now", id => ({
			title: id === "doc-id" ? "The Doc" : id,
			exists: true,
		}))

		expect(map.text).toBe("See The Doc now")
		expect(
			renderedRangeToRawRange(map, "See ".length, "See The Doc".length),
		).toEqual({
			from: "See ".length,
			to: "See [[doc-id]]".length,
		})
	})

	it("keeps partial wikilink title selections atomic", () => {
		let map = buildPreviewTextMap("[[doc-id]]", () => ({
			title: "The Doc",
			exists: true,
		}))

		expect(
			renderedRangeToRawRange(map, "The ".length, "The Doc".length),
		).toEqual({
			from: 0,
			to: "[[doc-id]]".length,
		})
		expect(rawRangeToRenderedRange(map, 2, 5)).toEqual({
			from: 0,
			to: "The Doc".length,
			text: "The Doc",
		})
	})

	it("matches preview soft line break text", () => {
		let map = buildPreviewTextMap("a\nb")

		expect(map.text).toBe("ab")
		expect(renderedRangeToRawRange(map, 1, 2)).toEqual({ from: 2, to: 3 })
	})

	it("does not leak heading selections into the previous block", () => {
		let markdown =
			"Your dada documents dada sync automatically across all your devices.\n\n## Your words, dasdas\n\nEverything"
		let headingFrom = markdown.indexOf("## Your words")
		let headingTo = headingFrom + "## Your words, dasdas".length
		let map = buildPreviewTextMap(markdown)
		let range = rawRangeToRenderedRange(map, headingFrom, headingTo)

		expect(range).toEqual({
			from: "Your dada documents dada sync automatically across all your devices."
				.length,
			to:
				"Your dada documents dada sync automatically across all your devices."
					.length + "Your words, dasdas".length,
			text: "Your words, dasdas",
		})
	})
})
