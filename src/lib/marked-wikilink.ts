import { type MarkedExtension } from "marked"

export { createWikilinkExtension }
export type { WikilinkTitleResolver }

type WikilinkTitleResolver = (id: string) => { title: string; exists: boolean }

function createWikilinkExtension(
	resolver: WikilinkTitleResolver,
): MarkedExtension {
	return {
		extensions: [
			{
				name: "wikilink",
				level: "inline",
				start(src) {
					return src.indexOf("[[")
				},
				tokenizer(src) {
					// Match [[id]], [[id|alias]], or [[id]]suffix
					let match = /^\[\[([^\]]+)\]\](\w*)/.exec(src)
					if (match) {
						let inner = match[1]
						let suffix = match[2]
						let pipeIndex = inner.indexOf("|")
						let docId: string
						let alias: string | undefined

						if (pipeIndex !== -1) {
							docId = inner.slice(0, pipeIndex).trim()
							alias = inner.slice(pipeIndex + 1).trim()
						} else {
							docId = inner.trim()
						}

						// Append suffix to alias
						if (suffix) {
							alias = (alias ?? "") + suffix
						}

						return {
							type: "wikilink",
							raw: match[0],
							docId,
							alias: alias || undefined,
						}
					}
					return undefined
				},
				renderer(token) {
					let { docId, alias } = token as unknown as {
						docId: string
						alias?: string
					}
					let resolved = resolver(docId)
					let title = alias ?? resolved.title
					let exists = resolved.exists

					if (exists) {
						return `<a href="/doc/${docId}/preview" class="wikilink">${title}</a>`
					}
					return `<span class="wikilink wikilink-broken" title="Document not found">${title}</span>`
				},
			},
		],
	}
}
