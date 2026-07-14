import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { iconTypes } from "tldraw"
import { localTldrawAssetUrls } from "./tldraw-static-assets"

describe("local tldraw assets", () => {
	test("maps every icon and translation to an offline URL", () => {
		expect(Object.keys(localTldrawAssetUrls.icons ?? {})).toHaveLength(
			iconTypes.length,
		)
		for (let icon of iconTypes) {
			expect(localTldrawAssetUrls.icons?.[icon]).toBe(
				`/tldraw/icons/0_merged.svg#${icon}`,
			)
		}
		expect(localTldrawAssetUrls.translations).toEqual({
			en: "/tldraw/translations/en.json",
			de: "/tldraw/translations/de.json",
		})
	})

	test("bundles every mapped icon in the offline sprite", () => {
		let sprite = readFileSync("public/tldraw/icons/0_merged.svg", "utf8")

		for (let icon of iconTypes) {
			expect(sprite).toContain(`id="${icon}"`)
		}
	})
})
