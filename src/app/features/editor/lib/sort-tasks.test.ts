import { describe, expect, it } from "vitest"
import { sortTaskLists } from "./sort-tasks"

describe("sortTaskLists", () => {
	describe("basic sorting", () => {
		it("sorts unchecked tasks before checked tasks", () => {
			let input = "- [x] Done\n- [ ] Todo"
			let output = sortTaskLists(input)
			expect(output).toBe("- [ ] Todo\n- [x] Done")
		})

		it("handles empty document", () => {
			expect(sortTaskLists("")).toBe("")
		})

		it("returns unchanged document with no task lists", () => {
			let input = "# Heading\n\nSome paragraph text."
			expect(sortTaskLists(input)).toBe(input)
		})
	})

	describe("preserving order", () => {
		it("preserves relative order within unchecked group", () => {
			let input = "- [ ] B\n- [ ] A\n- [ ] C"
			expect(sortTaskLists(input)).toBe(input)
		})

		it("preserves relative order within checked group", () => {
			let input = "- [x] First done\n- [x] Second done"
			expect(sortTaskLists(input)).toBe(input)
		})

		it("already sorted list produces no change", () => {
			let input = "- [ ] A\n- [ ] B\n- [x] C"
			expect(sortTaskLists(input)).toBe(input)
		})
	})

	describe("multiple lists", () => {
		it("sorts multiple separate task lists independently", () => {
			let input = "- [x] A\n- [ ] B\n\nParagraph\n\n- [x] C\n- [ ] D"
			let expected = "- [ ] B\n- [x] A\n\nParagraph\n\n- [ ] D\n- [x] C"
			expect(sortTaskLists(input)).toBe(expected)
		})
	})

	describe("non-task items", () => {
		it("sorts non-task bullets around tasks", () => {
			let input = "- [x] Done\n- Regular bullet\n- [ ] Todo"
			let output = sortTaskLists(input)
			expect(output).toBe("- [ ] Todo\n- Regular bullet\n- [x] Done")
		})
	})

	describe("nested lists", () => {
		it("moves nested children with parent task", () => {
			let input = "- [x] Parent done\n  - Child item\n- [ ] Other task"
			let expected = "- [ ] Other task\n- [x] Parent done\n  - Child item"
			expect(sortTaskLists(input)).toBe(expected)
		})

		it("recursively sorts nested task lists", () => {
			let input = "- [ ] Parent\n  - [x] Nested done\n  - [ ] Nested todo"
			let expected = "- [ ] Parent\n  - [ ] Nested todo\n  - [x] Nested done"
			expect(sortTaskLists(input)).toBe(expected)
		})
	})

	describe("code fences", () => {
		it("does not treat content inside code fences as lists", () => {
			let input = "```\n- [ ] Not a task\n- [x] Also not\n```"
			expect(sortTaskLists(input)).toBe(input)
		})
	})

	describe("whitespace preservation", () => {
		it("preserves exact whitespace and formatting", () => {
			let input = "-  [ ] Extra space\n- [x] Done"
			let output = sortTaskLists(input)
			expect(output).toContain("-  [ ] Extra space")
		})
	})

	describe("list syntax variants", () => {
		it("handles ordered lists (preserves original numbering)", () => {
			let input = "1. [x] Ordered done\n2. [ ] Ordered todo"
			let output = sortTaskLists(input)
			// Sorts unchecked before checked, preserves original line content
			expect(output).toBe("2. [ ] Ordered todo\n1. [x] Ordered done")
		})

		it("handles asterisk bullet syntax", () => {
			let input = "* [x] Done\n* [ ] Todo"
			expect(sortTaskLists(input)).toBe("* [ ] Todo\n* [x] Done")
		})

		it("handles plus bullet syntax", () => {
			let input = "+ [x] Done\n+ [ ] Todo"
			expect(sortTaskLists(input)).toBe("+ [ ] Todo\n+ [x] Done")
		})
	})

	describe("deep nesting", () => {
		it("handles deep nesting with multiple levels", () => {
			let input =
				"- [ ] L1\n  - [x] L2 done\n    - [ ] L3 todo\n  - [ ] L2 todo"
			let output = sortTaskLists(input)
			// L2 items should be sorted, L3 stays with parent
			expect(output).toContain("- [ ] L1")
			expect(output).toContain("  - [ ] L2 todo")
			// The checked L2 should come after unchecked L2
			let lines = output.split("\n")
			let l2TodoIdx = lines.findIndex(l => l.includes("L2 todo"))
			let l2DoneIdx = lines.findIndex(l => l.includes("L2 done"))
			expect(l2TodoIdx).toBeLessThan(l2DoneIdx)
		})
	})
})
