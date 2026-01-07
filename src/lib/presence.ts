import { useCallback, useEffect, useRef } from "react"
import { useAccount } from "jazz-tools/react"
import { Group, co } from "jazz-tools"
import {
	Decoration,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view"
import {
	RangeSetBuilder,
	type Extension,
	StateField,
	StateEffect,
} from "@codemirror/state"
import { CursorFeed, Document, UserAccount } from "@/schema"

export { usePresence, createPresenceExtension, dispatchRemoteCursors }
export type { RemoteCursor }

type RemoteCursor = {
	id: string
	sessionId: string
	name: string
	color: string
	position: number
	selectionEnd?: number
}

let CURSOR_COLORS = [
	"#e11d48", // rose-600
	"#7c3aed", // violet-600
	"#2563eb", // blue-600
	"#059669", // emerald-600
	"#d97706", // amber-600
	"#dc2626", // red-600
	"#9333ea", // purple-600
	"#0891b2", // cyan-600
]

function getColorForId(id: string): string {
	let hash = 0
	for (let i = 0; i < id.length; i++) {
		hash = (hash << 5) - hash + id.charCodeAt(i)
		hash = hash & hash
	}
	return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}

let STALE_CURSOR_MS = 10_000

type CursorDoc = {
	$isLoaded: boolean
	cursors?: {
		$isLoaded: boolean
		perSession: Record<
			string,
			| {
					value: { position: number; selectionEnd?: number } | null
					madeAt: Date
					by: {
						$jazz: { id: string }
						profile?: { $isLoaded: boolean; name: string }
					} | null
			  }
			| undefined
		>
	}
} | null

function computeRemoteCursors(
	doc: CursorDoc,
	mySessionId: string | null,
): RemoteCursor[] {
	if (!doc?.$isLoaded || !doc.cursors || !doc.cursors.$isLoaded || !mySessionId)
		return []

	let now = Date.now()

	// Group by user ID, keeping only the most recent cursor per user
	let latestByUser = new Map<
		string,
		{
			sessionId: string
			entry: NonNullable<(typeof doc.cursors.perSession)[string]>
		}
	>()

	let entries = Object.entries(doc.cursors.perSession)
	for (let [sessionId, entry] of entries) {
		if (sessionId === mySessionId) continue
		if (!entry || !entry.value) continue

		let age = now - entry.madeAt.getTime()
		if (age > STALE_CURSOR_MS) continue

		let userId = entry.by?.$jazz.id ?? sessionId

		let existing = latestByUser.get(userId)
		if (!existing || entry.madeAt.getTime() > existing.entry.madeAt.getTime()) {
			latestByUser.set(userId, { sessionId, entry })
		}
	}

	let cursors: RemoteCursor[] = []
	for (let [userId, { sessionId, entry }] of latestByUser) {
		let name = "Anonymous"
		let by = entry.by
		if (by?.profile?.$isLoaded) {
			name = by.profile.name
		}

		cursors.push({
			id: userId,
			sessionId,
			name,
			color: getColorForId(userId),
			position: entry.value!.position,
			selectionEnd: entry.value!.selectionEnd,
		})
	}

	return cursors
}

type UsePresenceOptions = {
	doc: co.loaded<typeof Document, { content: true; cursors: true }> | null
	enabled?: boolean
}

function usePresence({ doc, enabled = true }: UsePresenceOptions) {
	let me = useAccount(UserAccount, { resolve: { profile: true } })
	let updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	let lastPositionRef = useRef<{ pos: number; selEnd?: number } | null>(null)

	let mySessionId = me.$isLoaded ? me.$jazz.sessionID : null

	let ensureCursorFeed = useCallback(() => {
		if (!doc?.$isLoaded) return null

		let docGroup = doc.$jazz.owner
		if (!(docGroup instanceof Group)) return null

		if (!doc.cursors) {
			doc.$jazz.set("cursors", CursorFeed.create([], { owner: docGroup }))
		}

		return doc.cursors
	}, [doc])

	let updateCursor = useCallback(
		(position: number, selectionEnd?: number) => {
			if (!enabled || !mySessionId) return

			let last = lastPositionRef.current
			if (last && last.pos === position && last.selEnd === selectionEnd) {
				return
			}
			lastPositionRef.current = { pos: position, selEnd: selectionEnd }

			if (updateTimeoutRef.current) {
				clearTimeout(updateTimeoutRef.current)
			}

			updateTimeoutRef.current = setTimeout(() => {
				let feed = ensureCursorFeed()
				if (!feed || !feed.$isLoaded) return

				feed.$jazz.push({
					position,
					selectionEnd,
				})
			}, 30)
		},
		[enabled, mySessionId, ensureCursorFeed],
	)

	let remoteCursors = computeRemoteCursors(
		doc as unknown as CursorDoc,
		mySessionId ?? null,
	)

	useEffect(() => {
		return () => {
			if (updateTimeoutRef.current) {
				clearTimeout(updateTimeoutRef.current)
			}
		}
	}, [])

	return {
		updateCursor,
		remoteCursors,
		mySessionId,
	}
}

class CursorWidget extends WidgetType {
	name: string
	color: string

	constructor(name: string, color: string) {
		super()
		this.name = name
		this.color = color
	}

	toDOM() {
		let wrapper = document.createElement("span")
		wrapper.className = "cm-remote-cursor"
		wrapper.style.setProperty("--cursor-color", this.color)

		let cursor = document.createElement("span")
		cursor.className = "cm-remote-cursor-caret"

		let label = document.createElement("span")
		label.className = "cm-remote-cursor-label"
		label.textContent = this.name

		wrapper.appendChild(cursor)
		wrapper.appendChild(label)

		return wrapper
	}

	eq(other: CursorWidget) {
		return this.name === other.name && this.color === other.color
	}
}

let remoteCursorsField = StateField.define<RemoteCursor[]>({
	create() {
		return []
	},
	update(value, tr) {
		for (let effect of tr.effects) {
			if (effect.is(setRemoteCursorsEffect)) {
				return effect.value
			}
		}
		return value
	},
})

let setRemoteCursorsEffect = StateEffect.define<RemoteCursor[]>()

function buildCursorDecorations(
	cursors: RemoteCursor[],
	docLength: number,
): DecorationSet {
	let decorations: { from: number; to: number; deco: Decoration }[] = []

	for (let cursor of cursors) {
		let pos = Math.min(cursor.position, docLength)
		let selEnd = cursor.selectionEnd
			? Math.min(cursor.selectionEnd, docLength)
			: undefined

		if (selEnd !== undefined && selEnd !== pos) {
			let from = Math.min(pos, selEnd)
			let to = Math.max(pos, selEnd)
			decorations.push({
				from,
				to,
				deco: Decoration.mark({
					class: "cm-remote-selection",
					attributes: {
						style: `background-color: ${cursor.color}20;`,
					},
				}),
			})
		}

		decorations.push({
			from: pos,
			to: pos,
			deco: Decoration.widget({
				widget: new CursorWidget(cursor.name, cursor.color),
				side: 1,
			}),
		})
	}

	decorations.sort((a, b) => a.from - b.from || a.to - b.to)

	let builder = new RangeSetBuilder<Decoration>()
	for (let { from, to, deco } of decorations) {
		builder.add(from, to, deco)
	}

	return builder.finish()
}

let cursorDecorationPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet

		constructor(view: EditorView) {
			let cursors = view.state.field(remoteCursorsField)
			this.decorations = buildCursorDecorations(cursors, view.state.doc.length)
		}

		update(update: ViewUpdate) {
			let cursors = update.state.field(remoteCursorsField)
			let oldCursors = update.startState.field(remoteCursorsField)
			if (cursors !== oldCursors || update.docChanged) {
				this.decorations = buildCursorDecorations(
					cursors,
					update.state.doc.length,
				)
			}
		}
	},
	{ decorations: v => v.decorations },
)

let cursorStyles = EditorView.baseTheme({
	".cm-remote-cursor": {
		position: "relative",
		display: "inline",
		marginLeft: "-1px",
		marginRight: "-1px",
	},
	".cm-remote-cursor-caret": {
		position: "absolute",
		top: "0",
		bottom: "0",
		left: "0",
		width: "2px",
		backgroundColor: "var(--cursor-color)",
	},
	".cm-remote-cursor-label": {
		position: "absolute",
		top: "-1.4em",
		left: "0",
		padding: "1px 4px",
		fontSize: "10px",
		fontFamily: "system-ui, sans-serif",
		fontWeight: "500",
		lineHeight: "1.2",
		color: "white",
		backgroundColor: "var(--cursor-color)",
		borderRadius: "3px 3px 3px 0",
		whiteSpace: "nowrap",
		pointerEvents: "none",
		zIndex: "10",
	},
	".cm-remote-selection": {
		mixBlendMode: "multiply",
	},
})

function createPresenceExtension(): Extension {
	return [remoteCursorsField, cursorDecorationPlugin, cursorStyles]
}

function dispatchRemoteCursors(view: EditorView, cursors: RemoteCursor[]) {
	view.dispatch({
		effects: setRemoteCursorsEffect.of(cursors),
	})
}
