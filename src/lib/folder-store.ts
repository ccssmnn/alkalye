import { create } from "zustand"
import { persist } from "zustand/middleware"

export { useFolderStore }

type ViewMode = "folders" | "flat"

interface FolderState {
	viewMode: ViewMode
	collapsedFolders: Set<string>
	setViewMode: (mode: ViewMode) => void
	toggleFolder: (path: string) => void
	isCollapsed: (path: string) => boolean
}

interface PersistedFolderState {
	viewMode?: ViewMode
	collapsedFolders?: string[]
}

function parsePersistedFolderState(persisted: unknown): PersistedFolderState {
	if (!persisted || typeof persisted !== "object") return {}
	let p = persisted as Record<string, unknown>
	return {
		viewMode:
			p.viewMode === "folders" || p.viewMode === "flat"
				? p.viewMode
				: undefined,
		collapsedFolders: Array.isArray(p.collapsedFolders)
			? p.collapsedFolders
			: undefined,
	}
}

let useFolderStore = create<FolderState>()(
	persist(
		(set, get) => ({
			viewMode: "folders",
			collapsedFolders: new Set<string>(),
			setViewMode: mode => set({ viewMode: mode }),
			toggleFolder: path =>
				set(state => {
					let next = new Set(state.collapsedFolders)
					if (next.has(path)) {
						next.delete(path)
					} else {
						next.add(path)
					}
					return { collapsedFolders: next }
				}),
			isCollapsed: path => get().collapsedFolders.has(path),
		}),
		{
			name: "folder-state",
			partialize: state => ({
				viewMode: state.viewMode,
				collapsedFolders: Array.from(state.collapsedFolders),
			}),
			merge: (persisted, current) => {
				let p = parsePersistedFolderState(persisted)
				return {
					...current,
					viewMode: p.viewMode ?? current.viewMode,
					collapsedFolders: new Set(p.collapsedFolders ?? []),
				}
			},
		},
	),
)
