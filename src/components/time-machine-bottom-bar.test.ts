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

	describe("zoom level changes preserve current edit", () => {
		test("changing from 'all' to numeric zoom keeps edit in window", () => {
			let currentEdit = 300
			let totalEdits = 500

			// Start with 'all' zoom
			let allResult = calculateZoomWindow(currentEdit, totalEdits, "all")
			expect(allResult.windowStart).toBe(0)
			expect(allResult.windowEnd).toBe(499)

			// Change to zoom 100
			let zoom100Result = calculateZoomWindow(currentEdit, totalEdits, 100)
			// Current edit (300) should be within the new window
			expect(zoom100Result.windowStart).toBeLessThanOrEqual(currentEdit)
			expect(zoom100Result.windowEnd).toBeGreaterThanOrEqual(currentEdit)
			// Window should be approximately centered on 300
			expect(zoom100Result.windowStart).toBe(250)
			expect(zoom100Result.windowEnd).toBe(349)
		})

		test("changing between numeric zoom levels keeps edit in window", () => {
			let currentEdit = 300
			let totalEdits = 500

			// Start with zoom 500
			let zoom500Result = calculateZoomWindow(currentEdit, totalEdits, 500)
			expect(zoom500Result.windowStart).toBeLessThanOrEqual(currentEdit)
			expect(zoom500Result.windowEnd).toBeGreaterThanOrEqual(currentEdit)

			// Change to zoom 25
			let zoom25Result = calculateZoomWindow(currentEdit, totalEdits, 25)
			expect(zoom25Result.windowStart).toBeLessThanOrEqual(currentEdit)
			expect(zoom25Result.windowEnd).toBeGreaterThanOrEqual(currentEdit)
			// Should be centered on 300: 288-312
			expect(zoom25Result.windowStart).toBe(288)
			expect(zoom25Result.windowEnd).toBe(312)
		})
	})
})
