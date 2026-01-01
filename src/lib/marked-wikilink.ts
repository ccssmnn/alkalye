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
					let match = /^\[\[([^\]]+)\]\]/.exec(src)
					if (match) {
						return {
							type: "wikilink",
							raw: match[0],
							docId: match[1],
						}
					}
					return undefined
				},
				renderer(token) {
					let docId = (token as unknown as { docId: string }).docId
					let resolved = resolver(docId)
					let title = resolved.title
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
