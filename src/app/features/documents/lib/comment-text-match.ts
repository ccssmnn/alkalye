export { countOccurrences, findBestTextOccurrence }

type TextContext = {
	contextBefore: string
	contextAfter: string
	occurrence: number
}

function countOccurrences(content: string, text: string) {
	if (!text) return 0
	let count = 0
	let index = content.indexOf(text)
	while (index >= 0) {
		count++
		index = content.indexOf(text, index + text.length)
	}
	return count
}

function findBestTextOccurrence(
	content: string,
	text: string,
	context: TextContext,
) {
	let starts = findOccurrences(content, text)
	if (starts.length === 0) return -1

	let contextualStart = findBestContextMatch(
		content,
		text,
		starts,
		context.contextBefore,
		context.contextAfter,
	)
	if (contextualStart >= 0) return contextualStart
	return starts[context.occurrence] ?? starts[0]
}

function findOccurrences(content: string, text: string) {
	let starts: number[] = []
	if (!text) return starts
	let from = 0
	while (true) {
		let index = content.indexOf(text, from)
		if (index < 0) return starts
		starts.push(index)
		from = index + text.length
	}
}

function findBestContextMatch(
	content: string,
	quote: string,
	starts: number[],
	contextBefore: string,
	contextAfter: string,
) {
	let bestStart = -1
	let bestScore = 0
	for (let start of starts) {
		let score =
			contextMatchScore(content.slice(0, start), contextBefore, "before") +
			contextMatchScore(
				content.slice(start + quote.length),
				contextAfter,
				"after",
			)
		if (score > bestScore) {
			bestScore = score
			bestStart = start
		}
	}
	return bestStart
}

function contextMatchScore(
	content: string,
	context: string,
	direction: "before" | "after",
) {
	if (!context.trim()) return 0
	let max = Math.min(content.length, context.length)
	for (let length = max; length > 0; length--) {
		let contentPart =
			direction === "before" ? content.slice(-length) : content.slice(0, length)
		let contextPart =
			direction === "before" ? context.slice(-length) : context.slice(0, length)
		if (contentPart === contextPart) return length
	}
	return 0
}
