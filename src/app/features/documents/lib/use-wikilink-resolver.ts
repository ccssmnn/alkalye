import { parseWikiLinks } from "@/app/features/editor/lib/wikilink-parser"
import type {
	WikilinkDoc,
	WikilinkResolution,
} from "@/app/features/editor/widgets/editor"
import { useDocTitles } from "./wikilink-titles"

export { useWikilinkResolver }

function useWikilinkResolver(
	content: string,
	localDocs: WikilinkDoc[],
): (id: string) => WikilinkResolution | undefined {
	let local = new Map<string, WikilinkResolution>()
	for (let doc of localDocs) {
		local.set(doc.id, { title: doc.title, exists: true })
	}

	let externalIds = [
		...new Set(
			parseWikiLinks(content)
				.map(l => l.id)
				.filter(id => !local.has(id)),
		),
	]
	let external = useDocTitles(externalIds)

	return id => {
		let l = local.get(id)
		if (l) return l
		let e = external.get(id)
		if (e) return { title: e.title, exists: e.exists }
		return undefined
	}
}
