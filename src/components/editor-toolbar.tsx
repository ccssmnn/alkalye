import { useEffect } from "react"
import type { MarkdownEditorRef } from "@/editor/editor"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
	Bold,
	Italic,
	Code,
	Heading,
	List,
	ListTodo,
	Link,
	Command,
	EyeOff,
	Copy,
	Check,
	ListIcon,
	Wrench,
} from "lucide-react"
import { Kbd } from "@/components/ui/kbd"
import { isMac, altModKey } from "@/lib/platform"
import { ThemePicker } from "@/components/theme-picker"
import { PresetPicker } from "@/components/preset-picker"

export { EditorToolbar }

interface EditorToolbarProps {
	editor: React.RefObject<MarkdownEditorRef | null>
	readOnly?: boolean
	containerRef?: React.RefObject<HTMLDivElement | null>
	onToggleLeftSidebar: () => void
	onToggleRightSidebar: () => void

	onSaveCopy?: () => Promise<void>
	saveCopyState?: "idle" | "saving" | "saved"
	content?: string
	onThemeChange?: (newContent: string) => void
}

function EditorToolbar({
	editor,
	readOnly,
	containerRef,
	onToggleLeftSidebar,
	onToggleRightSidebar,

	onSaveCopy,
	saveCopyState = "idle",
	content,
	onThemeChange,
}: EditorToolbarProps) {
	useEffect(() => {
		let viewport = window.visualViewport
		if (!viewport) return

		function onResize() {
			if (!viewport) return
			containerRef?.current?.style.setProperty(
				"--viewport-height",
				`${viewport.height}px`,
			)
		}

		onResize()
		viewport.addEventListener("resize", onResize)
		viewport.addEventListener("scroll", onResize)
		return () => {
			viewport.removeEventListener("resize", onResize)
			viewport.removeEventListener("scroll", onResize)
		}
	}, [containerRef])

	return (
		<div
			className="editor-toolbar bg-background border-border fixed top-0 right-0 left-0 z-10 flex items-center border-b transition-[right] duration-200 ease-linear"
			style={{
				paddingTop: "env(safe-area-inset-top)",
				paddingLeft: "env(safe-area-inset-left)",
				paddingRight: "env(safe-area-inset-right)",
			}}
		>
			<div className="border-border flex shrink-0 items-center gap-1 border-r p-2 md:border-r-0">
				<ToolbarButton
					icon={<ListIcon />}
					label="Documents"
					shortcutShift="E"
					onClick={onToggleLeftSidebar}
				/>
			</div>

			<div className="flex flex-1 items-center justify-center gap-1 overflow-x-auto p-2">
				{readOnly ? (
					<>
						<div className="text-muted-foreground flex shrink-0 items-center gap-1.5 px-2 text-sm">
							<EyeOff className="size-4" />
							Read only
						</div>
						{onSaveCopy && (
							<>
								<Separator
									orientation="vertical"
									className="mx-1 h-6 shrink-0"
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={onSaveCopy}
									disabled={saveCopyState !== "idle"}
									className="shrink-0"
									nativeButton
								>
									{saveCopyState === "saved" ? (
										<>
											<Check className="mr-1 size-4" />
											Cloned
										</>
									) : (
										<>
											<Copy className="mr-1 size-4" />
											{saveCopyState === "saving" ? "Cloning..." : "Clone"}
										</>
									)}
								</Button>
							</>
						)}
					</>
				) : (
					<>
						<ToolbarButton
							icon={<Bold />}
							label="Bold"
							shortcut="B"
							onClick={() => editor.current?.toggleBold()}
						/>
						<ToolbarButton
							icon={<Italic />}
							label="Italic"
							shortcut="I"
							onClick={() => editor.current?.toggleItalic()}
						/>
						<span className="hidden md:contents">
							<ToolbarButton
								icon={<Code />}
								label="Code"
								shortcut="E"
								onClick={() => editor.current?.toggleInlineCode()}
							/>
							<DropdownMenu>
								<Tooltip>
									<DropdownMenuTrigger
										render={
											<TooltipTrigger
												render={
													<Button
														variant="ghost"
														size="icon"
														aria-label="Heading"
														className="shrink-0"
														nativeButton
													>
														<Heading />
													</Button>
												}
											/>
										}
									/>
									<TooltipContent className="flex items-center gap-2">
										Heading
										<Kbd>
											{isMac ? (
												<>
													⌥
													<Command className="size-3" />
												</>
											) : (
												"Ctrl+Alt+"
											)}
											1/2/3
										</Kbd>
									</TooltipContent>
								</Tooltip>
								<DropdownMenuContent align="center">
									{([1, 2, 3] as const).map(level => (
										<DropdownMenuItem
											key={level}
											onClick={() => editor.current?.setHeading(level)}
										>
											H{level}
											<span className="text-muted-foreground ml-auto text-xs">
												{altModKey}
												{level}
											</span>
										</DropdownMenuItem>
									))}
								</DropdownMenuContent>
							</DropdownMenu>
						</span>

						<ToolbarButton
							icon={<List />}
							label="Bullet List"
							shortcutAlt="L"
							onClick={() => editor.current?.toggleBulletList()}
						/>
						<ToolbarButton
							icon={<ListTodo />}
							label="Task List"
							shortcutAlt="⇧L"
							onClick={() => editor.current?.toggleTaskList()}
						/>
						<ToolbarButton
							icon={<Link />}
							label="Link"
							shortcut="K"
							onClick={() => editor.current?.insertLink()}
						/>
						<span className="hidden md:contents">
							{content !== undefined && onThemeChange && (
								<>
									<ThemePicker
										content={content}
										onThemeChange={onThemeChange}
										disabled={readOnly}
									/>
									<PresetPicker
										content={content}
										onPresetChange={onThemeChange}
										disabled={readOnly}
									/>
								</>
							)}
						</span>
					</>
				)}
			</div>

			<div className="border-border flex shrink-0 items-center gap-1 border-l p-2 md:border-l-0">
				<ToolbarButton
					icon={<Wrench />}
					label="Document tools"
					shortcutKey="."
					onClick={onToggleRightSidebar}
				/>
			</div>
		</div>
	)
}

interface ToolbarButtonProps {
	icon: React.ReactNode
	label: string
	shortcut?: string
	shortcutAlt?: string
	shortcutShift?: string
	shortcutKey?: string
	onClick: () => void
}

function ToolbarButton({
	icon,
	label,
	shortcut,
	shortcutAlt,
	shortcutShift,
	shortcutKey,
	onClick,
}: ToolbarButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						onClick={onClick}
						aria-label={label}
						className="shrink-0"
					>
						{icon}
					</Button>
				}
			/>
			<TooltipContent className="flex items-center gap-2">
				{label}
				{shortcut && (
					<Kbd>
						{isMac ? <Command className="size-3" /> : "Ctrl+"}
						{shortcut}
					</Kbd>
				)}
				{shortcutAlt && (
					<Kbd>
						{isMac ? (
							<>
								⌥
								<Command className="size-3" />
							</>
						) : (
							"Ctrl+Alt+"
						)}
						{shortcutAlt}
					</Kbd>
				)}
				{shortcutShift && (
					<Kbd>
						{isMac ? (
							<>
								⇧
								<Command className="size-3" />
							</>
						) : (
							"Ctrl+Shift+"
						)}
						{shortcutShift}
					</Kbd>
				)}
				{shortcutKey && (
					<Kbd>
						{isMac ? <Command className="size-3" /> : "Ctrl+"}
						{shortcutKey}
					</Kbd>
				)}
			</TooltipContent>
		</Tooltip>
	)
}
