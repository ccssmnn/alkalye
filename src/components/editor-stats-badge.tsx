import type { co } from "jazz-tools"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { DEFAULT_EDITOR_SETTINGS, Settings } from "@/schema"

export { EditorStatsBadge }

type StatsUnit = "words" | "sentences" | "tasks"
type SettingsCoMap = co.loaded<typeof Settings>
type EditorSettings = NonNullable<SettingsCoMap["editor"]>

interface EditorStatsBadgeProps {
	content: string
	settings: SettingsCoMap | null | undefined
}

let FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/
let TASK_RE = /^\s*[-*+]\s\[([ xX])\]/gm

let UNIT_LABELS: { value: StatsUnit; label: string }[] = [
	{ value: "words", label: "Words" },
	{ value: "sentences", label: "Sentences" },
	{ value: "tasks", label: "Tasks" },
]

function EditorStatsBadge({ content, settings }: EditorStatsBadgeProps) {
	let { leftOpen, isMobile } = useSidebar()
	let editorSettings = { ...DEFAULT_EDITOR_SETTINGS, ...settings?.editor }
	let stats = getStats(content)

	if (!editorSettings.showStatsBadge) return null

	return (
		<div
			className="absolute bottom-3 z-10 transition-[left] duration-200 ease-in"
			style={{
				left:
					leftOpen && !isMobile
						? "calc(var(--sidebar-width) + 0.75rem)"
						: "0.75rem",
			}}
		>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Badge
							variant="outline"
							className="bg-background rounded-none select-none"
						>
							{formatStat(editorSettings.statsBadgeUnit, stats)}
						</Badge>
					}
				/>
				<DropdownMenuContent align="start" side="top">
					<DropdownMenuRadioGroup
						value={editorSettings.statsBadgeUnit}
						onValueChange={value => {
							if (!isStatsUnit(value)) return
							updateEditorSettings(settings, { statsBadgeUnit: value })
						}}
					>
						{UNIT_LABELS.map(({ value, label }) => (
							<DropdownMenuRadioItem
								key={value}
								value={value}
								className="justify-between gap-4"
							>
								<span>{label}</span>
								<span className="text-muted-foreground tabular-nums">
									{formatMenuStat(value, stats)}
								</span>
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() =>
							updateEditorSettings(settings, { showStatsBadge: false })
						}
						className="flex-col items-start gap-1"
					>
						<span>Hide badge</span>
						<span className="text-muted-foreground text-[11px]">
							Re-enable in Settings → Editor.
						</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	)
}

function updateEditorSettings(
	settings: SettingsCoMap | null | undefined,
	updates: Partial<EditorSettings>,
) {
	if (!settings) return
	settings.$jazz.set("editor", {
		...DEFAULT_EDITOR_SETTINGS,
		...settings.editor,
		...updates,
	})
}

function isStatsUnit(value: string): value is StatsUnit {
	return UNIT_LABELS.some(unit => unit.value === value)
}

function stripFrontmatter(content: string): string {
	return content.replace(FRONTMATTER_RE, "")
}

function countWords(text: string): number {
	let stripped = stripFrontmatter(text)
	let words = stripped.split(/\s+/).filter(Boolean)
	return words.length
}

function countSentences(text: string): number {
	let stripped = stripFrontmatter(text)
	let cleaned = stripped
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`]+`/g, "")
		.replace(/!\[.*?\]\(.*?\)/g, "")
		.replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
		.replace(/^#+\s*/gm, "")
	let sentences = cleaned.split(/[.!?]+(?:\s|$)/).filter(s => s.trim())
	return sentences.length
}

function countTasks(text: string): { done: number; total: number } {
	let done = 0
	let total = 0
	let match: RegExpExecArray | null
	TASK_RE.lastIndex = 0
	while ((match = TASK_RE.exec(text)) !== null) {
		total++
		if (match[1] !== " ") done++
	}
	return { done, total }
}

function getStats(content: string): Record<StatsUnit, string> {
	let words = countWords(content)
	let sentences = countSentences(content)
	let { done, total } = countTasks(content)
	return {
		words: `${words}`,
		sentences: `${sentences}`,
		tasks: `${done} / ${total}`,
	}
}

function formatMenuStat(
	unit: StatsUnit,
	stats: Record<StatsUnit, string>,
): string {
	return stats[unit]
}

function formatStat(unit: StatsUnit, stats: Record<StatsUnit, string>): string {
	switch (unit) {
		case "words":
			return `${stats.words} words`
		case "sentences":
			return `${stats.sentences} sentences`
		case "tasks":
			return `${stats.tasks} tasks`
	}
}
