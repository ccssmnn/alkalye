import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
	useAccount,
	useIsAuthenticated,
	usePassphraseAuth,
	useLogOut,
} from "jazz-tools/react"
import { co, type ResolveQuery } from "jazz-tools"
import {
	ArrowLeft,
	Copy,
	Check,
	Cloud,
	CloudOff,
	Pencil,
	Minus,
	Plus,
	RefreshCw,
} from "lucide-react"
import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { UserAccount } from "@/schema"
import { useTheme, ThemeToggle } from "@/lib/theme"
import { AuthForm } from "@/components/auth-form"
import {
	useEditorSettings,
	DEFAULT_EDITOR_SETTINGS,
} from "@/lib/editor-settings"
import { wordlist } from "@/lib/wordlist"
import { Footer } from "@/components/footer"
import { usePWA, useIsPWAInstalled, PWAInstallDialog } from "@/lib/pwa"
import { BackupSettings } from "@/lib/backup"

export { Route }

let settingsQuery = {
	profile: true,
	root: { settings: true },
} as const satisfies ResolveQuery<typeof UserAccount>

type LoadedAccount = co.loaded<typeof UserAccount, typeof settingsQuery>

let Route = createFileRoute("/settings")({
	validateSearch: (search: Record<string, unknown>) => ({
		from: typeof search.from === "string" ? search.from : undefined,
	}),
	loader: async ({ context }) => {
		let { me } = context
		if (!me) return { me: null }
		let loadedMe = await me.$jazz.ensureLoaded({ resolve: settingsQuery })
		return { me: loadedMe }
	},
	component: SettingsPage,
})

function SettingsPage() {
	let { theme, setTheme } = useTheme()
	let data = Route.useLoaderData()
	let { from } = Route.useSearch()
	let subscribedMe = useAccount(UserAccount, { resolve: settingsQuery })
	let me: LoadedAccount | null = subscribedMe.$isLoaded ? subscribedMe : data.me
	let isAuthenticated = useIsAuthenticated()

	return (
		<>
			<title>Settings</title>
			<div
				className="bg-background fixed inset-0 overflow-auto"
				style={{
					paddingTop: "calc(48px + env(safe-area-inset-top))",
					paddingBottom: "env(safe-area-inset-bottom)",
					paddingLeft: "env(safe-area-inset-left)",
					paddingRight: "env(safe-area-inset-right)",
				}}
			>
				<div
					className="bg-background border-border fixed top-0 right-0 left-0 z-10 flex items-center justify-center border-b"
					style={{
						paddingTop: "env(safe-area-inset-top)",
						paddingLeft: "env(safe-area-inset-left)",
						paddingRight: "env(safe-area-inset-right)",
						height: "calc(48px + env(safe-area-inset-top))",
					}}
				>
					<div className="flex w-full max-w-2xl items-center gap-3 px-4">
						<Link to={from ?? "/"}>
							<Button variant="ghost" size="icon" aria-label="Back">
								<ArrowLeft className="size-4" />
							</Button>
						</Link>
						<h1 className="text-foreground text-lg font-semibold">Settings</h1>
					</div>
				</div>
				<div className="mx-auto max-w-2xl px-4 py-8">
					<div className="space-y-8">
						<ProfileSection me={me} />
						<SyncSection isAuthenticated={isAuthenticated} />
						<BackupSettings />
						<section>
							<h2 className="text-muted-foreground mb-3 text-sm font-medium">
								Appearance
							</h2>
							<ThemeToggle theme={theme} setTheme={setTheme} showLabel />
						</section>
						<EditorSection settings={me?.root?.settings ?? null} />
						<InstallationSection />
						<AppSection />
					</div>
					<Footer />
				</div>
			</div>
		</>
	)
}

interface ProfileSectionProps {
	me: LoadedAccount | null
}

let nameSchema = z.object({
	name: z.string().min(1, "Name is required").max(50, "Name too long"),
})

function ProfileSection({ me }: ProfileSectionProps) {
	let [dialogOpen, setDialogOpen] = useState(false)

	if (!me) return null

	let name = me.profile?.name ?? "Anonymous"

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Profile
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-muted-foreground mb-1 text-xs">
							Display name
						</div>
						<div className="text-lg font-medium">{name}</div>
					</div>
					<Button
						onClick={() => setDialogOpen(true)}
						variant="ghost"
						size="icon-sm"
						aria-label="Edit name"
					>
						<Pencil className="size-4" />
					</Button>
				</div>
			</div>
			<EditNameDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				currentName={me.profile?.name ?? ""}
				onSave={newName => {
					if (!me.profile) return
					me.profile.$jazz.set("name", newName)
				}}
			/>
		</section>
	)
}

interface EditNameDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	currentName: string
	onSave: (name: string) => void
}

function EditNameDialog({
	open,
	onOpenChange,
	currentName,
	onSave,
}: EditNameDialogProps) {
	let form = useForm({
		defaultValues: { name: currentName },
		validators: { onSubmit: nameSchema },
		onSubmit: ({ value }) => {
			onSave(value.name.trim())
			onOpenChange(false)
		},
	})

	function handleOpenChangeComplete(isOpen: boolean) {
		if (isOpen) {
			form.reset({ name: currentName })
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={onOpenChange}
			onOpenChangeComplete={handleOpenChangeComplete}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit display name</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={e => {
						e.preventDefault()
						form.handleSubmit()
					}}
					className="space-y-4"
				>
					<form.Field name="name">
						{field => {
							let isInvalid =
								field.state.meta.isTouched && !field.state.meta.isValid
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel htmlFor={field.name}>Display name</FieldLabel>
									<Input
										id={field.name}
										name={field.name}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={e => field.handleChange(e.target.value)}
										aria-invalid={isInvalid}
										placeholder="Your name"
										autoFocus
									/>
									{isInvalid && (
										<FieldError>
											{field.state.meta.errors.join(", ")}
										</FieldError>
									)}
								</Field>
							)
						}}
					</form.Field>
					<DialogFooter>
						<Button type="submit">Save</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}

interface SyncSectionProps {
	isAuthenticated: boolean
}

function SyncSection({ isAuthenticated }: SyncSectionProps) {
	if (isAuthenticated) {
		return <SignedInView />
	}
	return <SignInView />
}

function SignInView() {
	let navigate = useNavigate()

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Cloud Sync & Backup
			</h2>
			<div className="text-muted-foreground mb-4 flex items-center gap-2">
				<CloudOff className="size-4" />
				<span className="text-sm">Local only</span>
			</div>
			<AuthForm onSuccess={() => navigate({ to: "/" })} />
		</section>
	)
}

interface EditorSectionProps {
	settings: LoadedAccount["root"]["settings"] | null
}

function EditorSection({ settings: jazzSettings }: EditorSectionProps) {
	let { settings, setSettings, resetSettings } = useEditorSettings(jazzSettings)

	return (
		<section>
			<div className="mb-3 flex items-center justify-between">
				<h2 className="text-muted-foreground text-sm font-medium">Editor</h2>
				<Button
					variant="ghost"
					size="sm"
					onClick={resetSettings}
					className="text-muted-foreground h-auto px-2 py-1 text-xs"
				>
					Reset to defaults
				</Button>
			</div>
			<div className="bg-muted/30 space-y-3 rounded-lg p-4">
				<NumericSetting
					label="Line width"
					value={settings.lineWidth}
					defaultValue={DEFAULT_EDITOR_SETTINGS.lineWidth}
					onChange={v => setSettings({ lineWidth: v })}
					step={5}
					min={60}
					max={120}
					unit="ch"
				/>

				<NumericSetting
					label="Font size"
					value={settings.fontSize}
					defaultValue={DEFAULT_EDITOR_SETTINGS.fontSize}
					onChange={v => setSettings({ fontSize: v })}
					step={1}
					min={10}
					max={30}
					unit="px"
				/>

				<NumericSetting
					label="Line height"
					value={settings.lineHeight}
					defaultValue={DEFAULT_EDITOR_SETTINGS.lineHeight}
					onChange={v => setSettings({ lineHeight: v })}
					step={0.1}
					min={1.2}
					max={2.0}
					decimals={1}
				/>

				<NumericSetting
					label="Letter spacing"
					value={settings.letterSpacing}
					defaultValue={DEFAULT_EDITOR_SETTINGS.letterSpacing}
					onChange={v => setSettings({ letterSpacing: v })}
					step={0.01}
					min={-0.1}
					max={0.1}
					unit="em"
					decimals={2}
				/>

				<div className="border-border/50 space-y-3 border-t pt-3">
					<ToggleSetting
						id="strikethrough-toggle"
						label={
							<>
								<span
									className={
										settings.strikethroughDoneTasks ? "line-through" : ""
									}
								>
									Strikethrough
								</span>{" "}
								done tasks
							</>
						}
						checked={settings.strikethroughDoneTasks}
						onChange={v => setSettings({ strikethroughDoneTasks: v })}
					/>

					<ToggleSetting
						id="fade-toggle"
						label={
							<>
								<span className={settings.fadeDoneTasks ? "opacity-50" : ""}>
									Fade
								</span>{" "}
								done tasks
							</>
						}
						checked={settings.fadeDoneTasks}
						onChange={v => setSettings({ fadeDoneTasks: v })}
					/>

					<ToggleSetting
						id="highlight-line-toggle"
						label="Highlight current line"
						checked={settings.highlightCurrentLine}
						onChange={v => setSettings({ highlightCurrentLine: v })}
						className={
							settings.highlightCurrentLine
								? "bg-foreground/5 -mx-4 rounded px-4"
								: ""
						}
					/>
				</div>
			</div>
		</section>
	)
}

interface NumericSettingProps {
	label: string
	value: number
	defaultValue: number
	onChange: (value: number) => void
	step: number
	min: number
	max: number
	unit?: string
	decimals?: number
}

function NumericSetting({
	label,
	value,
	defaultValue,
	onChange,
	step,
	min,
	max,
	unit = "",
	decimals = 0,
}: NumericSettingProps) {
	let isDefault = Math.abs(value - defaultValue) < 0.001

	function clamp(v: number) {
		return Math.max(min, Math.min(max, Math.round(v * 1000) / 1000))
	}

	function decrement() {
		onChange(clamp(value - step))
	}

	function increment() {
		onChange(clamp(value + step))
	}

	function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
		let parsed = parseFloat(e.target.value)
		if (!isNaN(parsed)) {
			onChange(clamp(parsed))
		}
	}

	return (
		<div className="flex min-h-8 items-center justify-between gap-4">
			<span className="text-sm">{label}</span>
			<div className="flex items-center gap-2">
				{!isDefault && (
					<span className="text-muted-foreground text-xs">
						default: {defaultValue.toFixed(decimals)}
					</span>
				)}
				{unit && <span className="text-muted-foreground text-xs">{unit}</span>}
				<div className="flex items-center">
					<Button
						variant="outline"
						size="icon-sm"
						onClick={decrement}
						disabled={value <= min}
						className="size-7 rounded-r-none border-r-0"
					>
						<Minus className="size-3" />
					</Button>
					<Input
						type="number"
						value={value.toFixed(decimals)}
						onChange={handleInputChange}
						step={step}
						className="h-7 w-16 [appearance:textfield] rounded-none border-x-0 text-center text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
					/>
					<Button
						variant="outline"
						size="icon-sm"
						onClick={increment}
						disabled={value >= max}
						className="size-7 rounded-l-none border-l-0"
					>
						<Plus className="size-3" />
					</Button>
				</div>
			</div>
		</div>
	)
}

interface ToggleSettingProps {
	id: string
	label: React.ReactNode
	checked: boolean
	onChange: (checked: boolean) => void
	className?: string
}

function ToggleSetting({
	id,
	label,
	checked,
	onChange,
	className,
}: ToggleSettingProps) {
	return (
		<div
			className={`flex min-h-8 items-center justify-between gap-4 ${className ?? ""}`}
		>
			<label htmlFor={id} className="text-sm">
				{label}
			</label>
			<Switch id={id} checked={checked} onCheckedChange={onChange} />
		</div>
	)
}

function SignedInView() {
	let auth = usePassphraseAuth({ wordlist })
	let logOut = useLogOut()
	let [showPassphrase, setShowPassphrase] = useState(false)
	let [isCopied, setIsCopied] = useState(false)

	async function handleCopy() {
		await navigator.clipboard.writeText(auth.passphrase)
		setIsCopied(true)
		setTimeout(() => setIsCopied(false), 2000)
	}

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Cloud Sync & Backup
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				<div className="mb-4 flex items-center gap-2 text-green-600 dark:text-green-400">
					<Cloud className="size-4" />
					<span className="text-sm font-medium">Syncing</span>
				</div>
				<p className="text-muted-foreground mb-4 text-sm">
					Your notes are synced across devices.
				</p>
				{showPassphrase ? (
					<>
						<div className="text-muted-foreground mb-2 text-xs">
							Recovery phrase
						</div>
						<textarea
							readOnly
							value={auth.passphrase}
							className="bg-background border-border mb-3 w-full resize-none rounded-md border p-3 font-mono text-sm"
							rows={3}
						/>
						<div className="flex gap-2">
							<Button onClick={handleCopy} variant="outline" size="sm">
								{isCopied ? (
									<>
										<Check className="mr-1 size-3.5" />
										Copied
									</>
								) : (
									<>
										<Copy className="mr-1 size-3.5" />
										Copy
									</>
								)}
							</Button>
							<Button
								onClick={() => setShowPassphrase(false)}
								variant="ghost"
								size="sm"
							>
								Hide
							</Button>
						</div>
					</>
				) : (
					<div className="flex gap-2">
						<Button
							onClick={() => setShowPassphrase(true)}
							variant="outline"
							size="sm"
						>
							Show recovery phrase
						</Button>
						<Button onClick={() => logOut()} variant="ghost" size="sm">
							Sign out
						</Button>
					</div>
				)}
			</div>
		</section>
	)
}

function InstallationSection() {
	let isPWAInstalled = useIsPWAInstalled()
	let [dialogOpen, setDialogOpen] = useState(false)

	if (isPWAInstalled) return null

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Installation
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				<div className="text-foreground mb-2 text-sm font-medium">
					Not installed
				</div>
				<p className="text-muted-foreground mb-4 text-sm">
					Install Alkalyte to your device for the best experience.
				</p>
				<Button onClick={() => setDialogOpen(true)} variant="outline" size="sm">
					Show install instructions
				</Button>
			</div>
			<PWAInstallDialog open={dialogOpen} onOpenChange={setDialogOpen} />
		</section>
	)
}

function AppSection() {
	let { needRefresh, updateServiceWorker, checkForUpdates } = usePWA()
	let [isChecking, setIsChecking] = useState(false)

	async function handleCheckForUpdates() {
		setIsChecking(true)
		await checkForUpdates()
		// Give some time for the SW to check
		setTimeout(() => setIsChecking(false), 1500)
	}

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">App</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				{needRefresh ? (
					<>
						<div className="text-foreground mb-2 text-sm font-medium">
							Update available
						</div>
						<p className="text-muted-foreground mb-4 text-sm">
							A new version is ready to install.
						</p>
						<Button onClick={updateServiceWorker} size="sm">
							<RefreshCw className="mr-1.5 size-3.5" />
							Reload to apply update
						</Button>
					</>
				) : (
					<>
						<div className="text-foreground mb-2 text-sm font-medium">
							You&apos;re on the latest version
						</div>
						<p className="text-muted-foreground mb-4 text-sm">
							No updates available.
						</p>
						<Button
							onClick={handleCheckForUpdates}
							variant="outline"
							size="sm"
							disabled={isChecking}
						>
							<RefreshCw
								className={`mr-1.5 size-3.5 ${isChecking ? "animate-spin" : ""}`}
							/>
							{isChecking ? "Checking..." : "Check for updates"}
						</Button>
					</>
				)}
			</div>
		</section>
	)
}
