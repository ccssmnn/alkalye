export { sortTaskLists }

/**
 * Sorts task lists in markdown so unchecked tasks appear before checked tasks.
 * Preserves relative order within each group (stable sort).
 */
function sortTaskLists(markdown: string): string {
	if (!markdown) return markdown

	let lines = markdown.split("\n")
	let result: string[] = []
	let i = 0

	while (i < lines.length) {
		let line = lines[i]

		// Check if we're entering a code fence
		if (isCodeFenceStart(line)) {
			// Pass through code fence content unchanged
			result.push(line)
			i++
			while (i < lines.length && !isCodeFenceEnd(lines[i])) {
				result.push(lines[i])
				i++
			}
			if (i < lines.length) {
				result.push(lines[i])
				i++
			}
			continue
		}

		// Check if this line starts a list
		if (isListItem(line)) {
			let listItems = collectListBlock(lines, i)
			let sortedItems = sortListItems(listItems)
			result.push(...sortedItems.map(item => item.lines.join("\n")))
			i += listItems.reduce((sum, item) => sum + item.lines.length, 0)
			continue
		}

		result.push(line)
		i++
	}

	return result.join("\n")
}

type ListItem = {
	lines: string[]
	isChecked: boolean | null // null = not a task
	indent: number
}

function isCodeFenceStart(line: string): boolean {
	return /^```/.test(line.trim())
}

function isCodeFenceEnd(line: string): boolean {
	return /^```$/.test(line.trim())
}

function isListItem(line: string): boolean {
	// Matches: "- ", "* ", "+ ", "1. ", "2. " etc (with optional leading whitespace)
	return /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)
}

function getIndent(line: string): number {
	let match = line.match(/^(\s*)/)
	return match ? match[1].length : 0
}

function isTaskItem(line: string): { isTask: boolean; isChecked: boolean } {
	let unchecked = /^\s*[-*+]\s\[ \]/.test(line) || /^\s*\d+\.\s\[ \]/.test(line)
	let checked = /^\s*[-*+]\s\[x\]/i.test(line) || /^\s*\d+\.\s\[x\]/i.test(line)
	return {
		isTask: unchecked || checked,
		isChecked: checked,
	}
}

function collectListBlock(lines: string[], startIndex: number): ListItem[] {
	let items: ListItem[] = []
	let i = startIndex
	let baseIndent = getIndent(lines[i])

	while (i < lines.length) {
		let line = lines[i]
		let indent = getIndent(line)

		// Empty line or non-list content ends the list block
		if (line.trim() === "" || (!isListItem(line) && indent <= baseIndent)) {
			break
		}

		// Only process top-level items at this indent
		if (isListItem(line) && indent === baseIndent) {
			let itemLines = [line]
			let task = isTaskItem(line)
			i++

			// Collect children (indented content)
			while (i < lines.length) {
				let nextLine = lines[i]
				let nextIndent = getIndent(nextLine)

				// Child content has greater indent
				if (nextIndent > baseIndent && nextLine.trim() !== "") {
					itemLines.push(nextLine)
					i++
				} else {
					break
				}
			}

			items.push({
				lines: itemLines,
				isChecked: task.isTask ? task.isChecked : null,
				indent: baseIndent,
			})
		} else {
			// Non-task list item at this level
			let itemLines = [line]
			i++

			while (i < lines.length) {
				let nextLine = lines[i]
				let nextIndent = getIndent(nextLine)

				if (nextIndent > baseIndent && nextLine.trim() !== "") {
					itemLines.push(nextLine)
					i++
				} else {
					break
				}
			}

			items.push({
				lines: itemLines,
				isChecked: null,
				indent: baseIndent,
			})
		}
	}

	return items
}

function sortListItems(items: ListItem[]): ListItem[] {
	// Stable sort: unchecked tasks first, then non-tasks, then checked tasks
	// Within each group, preserve original order
	let unchecked: ListItem[] = []
	let nonTasks: ListItem[] = []
	let checked: ListItem[] = []

	for (let item of items) {
		if (item.isChecked === false) {
			unchecked.push(item)
		} else if (item.isChecked === true) {
			checked.push(item)
		} else {
			nonTasks.push(item)
		}
	}

	// Recursively sort nested lists within each item
	let allItems = [...unchecked, ...nonTasks, ...checked]
	return allItems.map(item => sortNestedLists(item))
}

function sortNestedLists(item: ListItem): ListItem {
	if (item.lines.length <= 1) return item

	// Find nested list items and sort them
	let result: string[] = [item.lines[0]]
	let nestedLines = item.lines.slice(1)

	if (nestedLines.length === 0) return item

	// Check if any nested lines are list items
	let hasNestedList = nestedLines.some(line => isListItem(line))
	if (!hasNestedList) {
		return item
	}

	// Parse and sort nested list
	let nestedItems = collectListBlock(nestedLines, 0)
	if (nestedItems.length > 0) {
		let sorted = sortListItems(nestedItems)
		result.push(...sorted.flatMap(nested => nested.lines))
	}

	return { ...item, lines: result }
}
