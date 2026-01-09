import { describe, expect, test } from "vitest"
import { calculateZoomWindow } from "./time-machine-bottom-bar"

describe("calculateZoomWindow", () => {
	describe("with zoom level 'all'", () => {
		test("returns full range", () => {
			let result = calculateZoomWindow(300, 500, "all")
			expect(result).toEqual({ windowStart: 0, windowEnd: 499 })
		})

		test("handles single edit", () => {
			let result = calculateZoomWindow(0, 1, "all")
			expect(result).toEqual({ windowStart: 0, windowEnd: 0 })
		})
	})

	describe("with numeric zoom level", () => {
		test("centers window on current edit when possible", () => {
			// PRD example: document with 500+ edits, at edit #300, zoom 100
			// Should show approximately #250-350
			let result = calculateZoomWindow(300, 500, 100)
			expect(result.windowStart).toBe(250)
			expect(result.windowEnd).toBe(349)
			// Verify current edit (300) is within window
			expect(result.windowStart).toBeLessThanOrEqual(300)
			expect(result.windowEnd).toBeGreaterThanOrEqual(300)
		})

		test("clamps to start when near beginning", () => {
			// At edit #5 with zoom 25, can't center - clamp to start
			let result = calculateZoomWindow(5, 50, 25)
			expect(result.windowStart).toBe(0)
			expect(result.windowEnd).toBe(24)
			// Current edit should still be in window
			expect(result.windowStart).toBeLessThanOrEqual(5)
			expect(result.windowEnd).toBeGreaterThanOrEqual(5)
		})

		test("clamps to end when near end", () => {
			// At edit #45 (of 50 total) with zoom 25, can't center - clamp to end
			let result = calculateZoomWindow(45, 50, 25)
			expect(result.windowStart).toBe(25)
			expect(result.windowEnd).toBe(49)
			// Current edit should still be in window
			expect(result.windowStart).toBeLessThanOrEqual(45)
			expect(result.windowEnd).toBeGreaterThanOrEqual(45)
		})

		test("handles zoom larger than total edits", () => {
			// Zoom 100 but only 50 edits
			let result = calculateZoomWindow(25, 50, 100)
			expect(result.windowStart).toBe(0)
			expect(result.windowEnd).toBe(49)
		})

		test("handles first edit", () => {
			let result = calculateZoomWindow(0, 500, 100)
			expect(result.windowStart).toBe(0)
			expect(result.windowEnd).toBe(99)
		})

		test("handles last edit", () => {
			let result = calculateZoomWindow(499, 500, 100)
			expect(result.windowStart).toBe(400)
			expect(result.windowEnd).toBe(499)
		})
	})

	describe("current edit always within window", () => {
		test("various positions and zoom levels", () => {
			let testCases = [
				{ currentEdit: 0, totalEdits: 500, zoom: 25 as const },
				{ currentEdit: 499, totalEdits: 500, zoom: 25 as const },
				{ currentEdit: 250, totalEdits: 500, zoom: 100 as const },
				{ currentEdit: 10, totalEdits: 500, zoom: 500 as const },
				{ currentEdit: 490, totalEdits: 500, zoom: 500 as const },
			]

			for (let { currentEdit, totalEdits, zoom } of testCases) {
				let result = calculateZoomWindow(currentEdit, totalEdits, zoom)
				expect(result.windowStart).toBeLessThanOrEqual(currentEdit)
				expect(result.windowEnd).toBeGreaterThanOrEqual(currentEdit)
			}
		})
	})
})
