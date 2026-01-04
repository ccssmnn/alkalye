import { indentLess, indentMore } from "@codemirror/commands"
import { indentUnit } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it } from "vitest"

let views: EditorView[] = []

function createEditorView(content: string, cursorPos?: number): EditorView {
	let parent = document.createElement("div")
	document.body.appendChild(parent)
	let state = EditorState.create({
		doc: content,
		extensions: [indentUnit.of("  ")],
	})
	let view = new EditorView({
		state,
		parent,
	})
	if (cursorPos !== undefined) {
		view.dispatch({
			selection: { anchor: cursorPos },
		})
	}
	views.push(view)
	return view
}

afterEach(() => {
	views.forEach(view => view.destroy())
	views = []
	document.body.innerHTML = ""
})

describe("indentMore", () => {
	it("indents bullet list items", () => {
		let view = createEditorView("- Item 1\n- Item 2", 2)
		indentMore(view)

		expect(view.state.doc.toString()).toBe("  - Item 1\n- Item 2")
	})

	it("indents multiple selected bullet list items", () => {
		let view = createEditorView("- Item 1\n- Item 2\n- Item 3", 0)
		view.dispatch({ selection: { anchor: 0, head: 20 } })
		indentMore(view)

		expect(view.state.doc.toString()).toBe("  - Item 1\n  - Item 2\n  - Item 3")
	})

	it("indents ordered list items", () => {
		let view = createEditorView("1. Item 1\n2. Item 2", 2)
		indentMore(view)

		expect(view.state.doc.toString()).toBe("  1. Item 1\n2. Item 2")
	})

	it("indents task list items", () => {
		let view = createEditorView("- [ ] Task 1\n- [x] Task 2", 2)
		indentMore(view)

		expect(view.state.doc.toString()).toBe("  - [ ] Task 1\n- [x] Task 2")
	})

	it("indents already indented list items", () => {
		let view = createEditorView("  - Item 1\n  - Item 2", 4)
		indentMore(view)

		expect(view.state.doc.toString()).toBe("    - Item 1\n  - Item 2")
	})

	it("indents mixed list types", () => {
		let view = createEditorView("- Bullet\n1. Ordered\n- [ ] Task", 0)
		view.dispatch({ selection: { anchor: 0, head: 30 } })
		indentMore(view)

		expect(view.state.doc.toString()).toBe(
			"  - Bullet\n  1. Ordered\n  - [ ] Task",
		)
	})

	it("indents non-list items too", () => {
		let view = createEditorView("Just text\nMore text", 5)
		indentMore(view)

		expect(view.state.doc.toString()).toBe("  Just text\nMore text")
	})

	it("handles single space indentation", () => {
		let view = createEditorView(" - Item 1\n - Item 2", 2)
		indentMore(view)

		expect(view.state.doc.toString()).toBe("   - Item 1\n - Item 2")
	})
})

describe("indentLess", () => {
	it("outdents indented bullet list items", () => {
		let view = createEditorView("  - Item 1\n  - Item 2", 4)
		indentLess(view)

		expect(view.state.doc.toString()).toBe("- Item 1\n  - Item 2")
	})

	it("outdents multiple selected indented list items", () => {
		let view = createEditorView("  - Item 1\n  - Item 2\n  - Item 3", 2)
		view.dispatch({ selection: { anchor: 2, head: 30 } })
		indentLess(view)

		expect(view.state.doc.toString()).toBe("- Item 1\n- Item 2\n- Item 3")
	})

	it("outdents ordered list items", () => {
		let view = createEditorView("  1. Item 1\n  2. Item 2", 4)
		indentLess(view)

		expect(view.state.doc.toString()).toBe("1. Item 1\n  2. Item 2")
	})

	it("outdents task list items", () => {
		let view = createEditorView("  - [ ] Task 1\n  - [x] Task 2", 4)
		indentLess(view)

		expect(view.state.doc.toString()).toBe("- [ ] Task 1\n  - [x] Task 2")
	})

	it("outdents deeply nested list items", () => {
		let view = createEditorView("    - Item 1\n    - Item 2", 6)
		indentLess(view)

		expect(view.state.doc.toString()).toBe("  - Item 1\n    - Item 2")
	})

	it("does nothing for non-indented items", () => {
		let view = createEditorView("- Item 1\n- Item 2", 2)
		indentLess(view)

		expect(view.state.doc.toString()).toBe("- Item 1\n- Item 2")
	})

	it("does nothing for non-indented non-list items", () => {
		let view = createEditorView("Just text\nMore text", 5)
		indentLess(view)

		expect(view.state.doc.toString()).toBe("Just text\nMore text")
	})

	it("handles mixed indentation levels", () => {
		let view = createEditorView("  - Item 1\n    - Item 2\n- Item 3", 2)
		view.dispatch({ selection: { anchor: 2, head: 25 } })
		indentLess(view)

		expect(view.state.doc.toString()).toBe("- Item 1\n  - Item 2\n- Item 3")
	})
})
