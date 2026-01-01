import { createContext, useContext, useRef } from "react"
import { useAccount } from "jazz-tools/react"
import { UserAccount } from "@/schema"
import { getDocumentTitle } from "@/lib/document-utils"
import { getPresentationMode } from "@/lib/presentation"

export { WikilinkProvider, useWikilinkResolver }
export type { ResolvedWikilink }

type ResolvedWikilink = {
	title: string
	exists: boolean
	isPresentation: boolean
}

type WikilinkResolver = (id: string) => ResolvedWikilink

let WikilinkContext = createContext<WikilinkResolver>(() => ({
	title: "",
	exists: false,
	isPresentation: false,
}))

function WikilinkProvider({ children }: { children: React.ReactNode }) {
	let me = useAccount(UserAccount, {
		resolve: { root: { documents: { $each: { content: true } } } },
	})

	let cacheRef = useRef<Map<string, ResolvedWikilink>>(new Map())

	if (me.$isLoaded && me.root?.documents?.$isLoaded) {
		let cache = new Map<string, ResolvedWikilink>()
		let docs = me.root.documents
		for (let i = 0; i < docs.length; i++) {
			let d = docs[i]
			if (!d?.$isLoaded || !d.content || d.deletedAt) continue
			let content = d.content.toString()
			cache.set(d.$jazz.id, {
				title: getDocumentTitle(content),
				exists: true,
				isPresentation: getPresentationMode(content),
			})
		}
		cacheRef.current = cache
	}

	let resolver: WikilinkResolver = docId => {
		return (
			cacheRef.current.get(docId) ?? {
				title: docId,
				exists: false,
				isPresentation: false,
			}
		)
	}

	return (
		<WikilinkContext.Provider value={resolver}>
			{children}
		</WikilinkContext.Provider>
	)
}

function useWikilinkResolver() {
	return useContext(WikilinkContext)
}
