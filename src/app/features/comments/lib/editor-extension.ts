import { StateEffect, StateField } from "@codemirror/state"
import {
	Decoration,
	WidgetType,
	type DecorationSet,
	EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view"

export {
	commentsExtension,
	setCommentDecorationsEffect,
	scrollEditorCommentIntoView,
	type CommentDecoration,
}

type CommentDecoration = {
	id: string
	from: number
	to: number
	resolved: boolean
	selected: boolean
	orphaned: boolean
}

let setCommentDecorationsEffect = StateEffect.define<CommentDecoration[]>()

let commentDecorationsField = StateField.define<CommentDecoration[]>({
	create() {
		return []
	},
	update(value, tr) {
		for (let effect of tr.effects) {
			if (effect.is(setCommentDecorationsEffect)) return effect.value
		}
		if (!tr.docChanged) return value
		return value.map(comment => ({
			...comment,
			from: tr.changes.mapPos(comment.from, 1),
			to: tr.changes.mapPos(comment.to, -1),
		}))
	},
})

let commentMarks = StateField.define<DecorationSet>({
	create() {
		return Decoration.none
	},
	update(decorations, tr) {
		let comments = tr.state.field(commentDecorationsField, false)
		if (!comments) return decorations.map(tr.changes)

		let ranges = []
		for (let comment of comments) {
			if (comment.orphaned) continue
			if (comment.from === comment.to) {
				ranges.push(
					Decoration.widget({
						widget: new CommentPositionWidget(comment),
						side: 1,
					}).range(comment.from),
				)
				continue
			}
			if (comment.from > comment.to) continue
			ranges.push(
				Decoration.mark({
					class: [
						"cm-comment-range",
						comment.resolved ? "cm-comment-range-resolved" : "",
						comment.selected ? "cm-comment-range-selected" : "",
					]
						.filter(Boolean)
						.join(" "),
					attributes: { "data-comment-id": comment.id },
				}).range(comment.from, comment.to),
			)
		}
		return Decoration.set(ranges, true)
	},
	provide: field => EditorView.decorations.from(field),
})

function commentsExtension(onSelect: (threadId: string) => void) {
	return [
		commentDecorationsField,
		commentMarks,
		ViewPlugin.fromClass(
			class {
				view: EditorView

				constructor(view: EditorView) {
					this.view = view
				}

				update(_update: ViewUpdate) {}
			},
			{
				eventHandlers: {
					click(event) {
						let target = event.target
						if (!(target instanceof HTMLElement)) return
						let el = target.closest("[data-comment-id]")
						if (!(el instanceof HTMLElement)) return
						let threadId = el.dataset.commentId
						if (!threadId) return
						onSelect(threadId)
					},
				},
			},
		),
	]
}

function scrollEditorCommentIntoView(
	view: EditorView,
	range: Pick<CommentDecoration, "from" | "to" | "orphaned">,
) {
	if (range.orphaned) return
	view.dispatch({
		effects: EditorView.scrollIntoView(Math.min(range.from, range.to), {
			y: "center",
		}),
	})
}

class CommentPositionWidget extends WidgetType {
	private comment: CommentDecoration

	constructor(comment: CommentDecoration) {
		super()
		this.comment = comment
	}

	toDOM() {
		let marker = document.createElement("span")
		marker.className = [
			"cm-comment-position",
			this.comment.resolved ? "cm-comment-range-resolved" : "",
			this.comment.selected ? "cm-comment-range-selected" : "",
		]
			.filter(Boolean)
			.join(" ")
		marker.dataset.commentId = this.comment.id
		return marker
	}

	ignoreEvent() {
		return false
	}
}
