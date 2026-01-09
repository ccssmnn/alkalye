import { useAccount } from "jazz-tools/react"
import { co } from "jazz-tools"
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
	DropdownMenuSeparator,
	DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Palette, Check } from "lucide-react"
import { Theme, UserAccount } from "@/schema"
import { parseFrontmatter, setTheme } from "@/editor/frontmatter"

export { ThemePicker }

type LoadedTheme = co.loaded<typeof Theme>

interface ThemePickerProps {
	content: string
	onThemeChange: (newContent: string) => void
	disabled?: boolean
}

function ThemePicker({ content, onThemeChange, disabled }: ThemePickerProps) {
	let me = useAccount(UserAccount, { resolve: themesResolve })

	let themes: LoadedTheme[] = []
	if (me.$isLoaded && me.root?.themes?.$isLoaded) {
		themes = [...me.root.themes].filter(
			(t): t is LoadedTheme => t?.$isLoaded === true,
		)
	}

	let { frontmatter } = parseFrontmatter(content)
	let currentThemeName = frontmatter?.theme as string | undefined

	// Filter themes by type - show preview and both types
	let previewThemes = themes.filter(
		t => t.type === "preview" || t.type === "both",
	)
	let slideshowThemes = themes.filter(
		t => t.type === "slideshow" || t.type === "both",
	)

	let hasThemes = themes.length > 0

	return (
		<DropdownMenu>
			<Tooltip>
				<DropdownMenuTrigger
					disabled={disabled || !hasThemes}
					render={
						<TooltipTrigger
							render={
								<Button
									variant="ghost"
									size="icon"
									aria-label="Theme"
									className="shrink-0"
									nativeButton={false}
									disabled={disabled || !hasThemes}
								>
									<Palette />
								</Button>
							}
						/>
					}
				/>
				<TooltipContent>
					{!hasThemes
						? "No themes available (upload in Settings)"
						: "Select theme"}
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="center">
				{previewThemes.length > 0 && (
					<>
						<DropdownMenuLabel>Preview Themes</DropdownMenuLabel>
						{previewThemes.map(theme => (
							<ThemeMenuItem
								key={theme.$jazz.id}
								theme={theme}
								isSelected={
									currentThemeName?.toLowerCase() === theme.name.toLowerCase()
								}
								onSelect={() => {
									let newContent = setTheme(content, theme.name)
									onThemeChange(newContent)
								}}
							/>
						))}
					</>
				)}
				{previewThemes.length > 0 && slideshowThemes.length > 0 && (
					<DropdownMenuSeparator />
				)}
				{slideshowThemes.length > 0 && (
					<>
						<DropdownMenuLabel>Slideshow Themes</DropdownMenuLabel>
						{slideshowThemes.map(theme => (
							<ThemeMenuItem
								key={theme.$jazz.id}
								theme={theme}
								isSelected={
									currentThemeName?.toLowerCase() === theme.name.toLowerCase()
								}
								onSelect={() => {
									let newContent = setTheme(content, theme.name)
									onThemeChange(newContent)
								}}
							/>
						))}
					</>
				)}
				{currentThemeName && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => {
								let newContent = setTheme(content, null)
								onThemeChange(newContent)
							}}
						>
							Remove theme
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function ThemeMenuItem({
	theme,
	isSelected,
	onSelect,
}: {
	theme: LoadedTheme
	isSelected: boolean
	onSelect: () => void
}) {
	return (
		<DropdownMenuItem onClick={onSelect}>
			{theme.name}
			{isSelected && <Check className="ml-auto size-4" />}
		</DropdownMenuItem>
	)
}

let themesResolve = {
	root: { themes: true },
} as const
