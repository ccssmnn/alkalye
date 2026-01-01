import { useState, useEffect, useSyncExternalStore } from "react"
import { Sun, Moon, SunMoon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"

export { useTheme, useResolvedTheme, ThemeToggle, ThemeSubmenu, ThemeMenuItems }
export type { Theme }

type Theme = "light" | "dark" | "system"

function getStoredTheme(): Theme {
	let stored = localStorage.getItem("theme")
	if (stored === "light" || stored === "dark" || stored === "system") {
		return stored
	}
	return "system"
}

function applyTheme(theme: Theme) {
	let root = document.documentElement
	if (theme === "system") {
		let prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
		root.classList.toggle("dark", prefersDark)
	} else {
		root.classList.toggle("dark", theme === "dark")
	}
}

// Apply theme immediately on load to prevent flash
applyTheme(getStoredTheme())

function useTheme() {
	let [theme, setThemeState] = useState<Theme>(getStoredTheme)

	function setTheme(newTheme: Theme) {
		localStorage.setItem("theme", newTheme)
		setThemeState(newTheme)
	}

	useEffect(() => {
		applyTheme(theme)

		if (theme === "system") {
			let mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
			let handler = () => applyTheme("system")
			mediaQuery.addEventListener("change", handler)
			return () => mediaQuery.removeEventListener("change", handler)
		}
	}, [theme])

	return { theme, setTheme }
}

function subscribeToSystemTheme(callback: () => void) {
	let mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
	mediaQuery.addEventListener("change", callback)
	return () => mediaQuery.removeEventListener("change", callback)
}

function getSystemThemeSnapshot() {
	return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function useResolvedTheme(): "light" | "dark" {
	let { theme } = useTheme()
	let systemPrefersDark = useSyncExternalStore(
		subscribeToSystemTheme,
		getSystemThemeSnapshot,
		() => false, // Server default
	)

	if (theme === "system") {
		return systemPrefersDark ? "dark" : "light"
	}
	return theme
}

interface ThemeToggleProps {
	theme: Theme
	setTheme: (theme: Theme) => void
	showLabel?: boolean
}

function ThemeToggle({ theme, setTheme, showLabel }: ThemeToggleProps) {
	let icon =
		theme === "light" ? <Sun /> : theme === "dark" ? <Moon /> : <SunMoon />

	let trigger = showLabel ? (
		<Button variant="ghost" size="sm" aria-label="Theme" nativeButton={false}>
			{icon}
			Theme
		</Button>
	) : (
		<Button variant="ghost" size="icon" aria-label="Theme" nativeButton={false}>
			{icon}
		</Button>
	)

	return (
		<DropdownMenu>
			<Tooltip>
				<DropdownMenuTrigger render={<TooltipTrigger render={trigger} />} />
				<TooltipContent>Theme</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="center">
				<DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
					<DropdownMenuRadioItem value="light">
						<Sun /> Light
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="dark">
						<Moon /> Dark
					</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="system">
						<SunMoon /> System
					</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

function ThemeSubmenu({ theme, setTheme }: ThemeToggleProps) {
	let icon =
		theme === "light" ? <Sun /> : theme === "dark" ? <Moon /> : <SunMoon />

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				{icon}
				Theme
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				<ThemeMenuItems theme={theme} setTheme={setTheme} />
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	)
}

function ThemeMenuItems({ theme, setTheme }: ThemeToggleProps) {
	return (
		<DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
			<DropdownMenuRadioItem value="light">
				<Sun /> Light
			</DropdownMenuRadioItem>
			<DropdownMenuRadioItem value="dark">
				<Moon /> Dark
			</DropdownMenuRadioItem>
			<DropdownMenuRadioItem value="system">
				<SunMoon /> System
			</DropdownMenuRadioItem>
		</DropdownMenuRadioGroup>
	)
}
