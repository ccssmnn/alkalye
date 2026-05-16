import { useState } from "react"
import { FolderOpen, AlertCircle } from "lucide-react"
import { Button } from "@/app/components/ui/button"
import { Switch } from "@/app/components/ui/switch"
import { Label } from "@/app/components/ui/label"
import {
	useBackupStore,
	enableBackup,
	disableBackup,
	changeBackupDirectory,
	useSpaceBackupPath,
	setSpaceBackupHandle,
	clearSpaceBackupHandle,
	supportsFileSystemWatch,
	isBackupSupported,
} from "../lib/storage"
import { T, useIntl } from "@/shared/intl/setup"

export { BackupSettings, SpaceBackupSettings }

function BackupSettings() {
	let t = useIntl()
	let {
		enabled,
		bidirectional,
		directoryName,
		lastBackupAt,
		lastPullAt,
		lastError,
		setBidirectional,
		setLastError,
	} = useBackupStore()
	let [pendingAction, setPendingAction] = useState<
		"enable" | "disable" | "change" | null
	>(null)
	let isLoading = pendingAction !== null
	let canWatchFileSystem = supportsFileSystemWatch()

	if (!isBackupSupported()) {
		return <UnsupportedBrowserCallout />
	}

	async function handleEnable() {
		setPendingAction("enable")
		setLastError(null)
		try {
			let result = await enableBackup()
			if (!result.success && result.error && result.error !== "Cancelled") {
				setLastError(result.error)
			}
		} finally {
			setPendingAction(null)
		}
	}

	async function handleDisable() {
		setPendingAction("disable")
		try {
			await disableBackup()
		} finally {
			setPendingAction(null)
		}
	}

	async function handleChangeDirectory() {
		setPendingAction("change")
		setLastError(null)
		try {
			let result = await changeBackupDirectory()
			if (!result.success && result.error && result.error !== "Cancelled") {
				setLastError(result.error)
			}
		} finally {
			setPendingAction(null)
		}
	}

	let lastBackupDate = lastBackupAt ? new Date(lastBackupAt) : null
	let formattedLastBackup = lastBackupDate
		? lastBackupDate.toLocaleString()
		: null

	let lastPullDate = lastPullAt ? new Date(lastPullAt) : null
	let formattedLastPull = lastPullDate ? lastPullDate.toLocaleString() : null

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				<T k="backup.title" />
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				{enabled ? (
					<>
						<div className="mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
							<FolderOpen className="size-4" />
							<span className="text-sm font-medium">
								{t(
									bidirectional
										? "backup.enabled.statusBidirectional"
										: "backup.enabled.status",
								)}{" "}
								{t("backup.enabled.folder")}
							</span>
						</div>
						<p className="text-muted-foreground mb-1 text-sm">
							<T k="backup.enabled.folder" />{" "}
							<span
								className="inline-block max-w-56 truncate align-bottom font-medium"
								title={directoryName ?? undefined}
							>
								{directoryName}
							</span>
						</p>
						{formattedLastBackup && (
							<p className="text-muted-foreground mb-1 text-xs">
								{t("backup.enabled.lastBackup", { date: formattedLastBackup })}
							</p>
						)}
						{bidirectional && formattedLastPull && (
							<p className="text-muted-foreground mb-3 text-xs">
								{t("backup.enabled.lastSync", { date: formattedLastPull })}
							</p>
						)}
						{lastError && (
							<div className="text-destructive mb-3 flex items-center gap-1.5 text-sm">
								<AlertCircle className="size-4" />
								{lastError}
							</div>
						)}
						<div className="border-border/50 mb-3 border-t pt-3">
							<div
								className={
									!canWatchFileSystem
										? "flex items-start justify-between gap-3 opacity-50"
										: "flex items-start justify-between gap-3"
								}
							>
								<div className="space-y-1">
									<Label
										htmlFor="backup-bidirectional"
										className="text-sm leading-5"
									>
										<T k="backup.enabled.syncChanges" />
									</Label>
									<p className="text-muted-foreground text-xs">
										<T
											k={
												canWatchFileSystem
													? "backup.enabled.syncDescription.supported"
													: "backup.enabled.syncDescription.unsupported"
											}
										/>
									</p>
								</div>
								<Switch
									id="backup-bidirectional"
									checked={bidirectional}
									onCheckedChange={setBidirectional}
									disabled={!canWatchFileSystem || isLoading}
								/>
							</div>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={handleChangeDirectory}
								variant="outline"
								size="sm"
								disabled={isLoading}
							>
								{pendingAction === "change"
									? t("backup.enabled.changing")
									: t("backup.enabled.changeFolder")}
							</Button>
							<Button
								onClick={handleDisable}
								variant="ghost"
								size="sm"
								disabled={isLoading}
							>
								{pendingAction === "disable"
									? t("backup.enabled.disabling")
									: t("backup.enabled.disable")}
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="text-foreground mb-2 text-sm font-medium">
							<T k="backup.disabled.status" />
						</div>
						<p className="text-muted-foreground mb-4 text-sm">
							<T k="backup.disabled.description" />
						</p>
						<Button
							onClick={handleEnable}
							variant="outline"
							size="sm"
							disabled={isLoading}
						>
							<FolderOpen className="mr-1.5 size-3.5" />
							{pendingAction === "enable"
								? t("backup.disabled.choosing")
								: t("backup.disabled.choose")}
						</Button>
					</>
				)}
			</div>
		</section>
	)
}

interface SpaceBackupSettingsProps {
	spaceId: string
	isAdmin: boolean
}

function SpaceBackupSettings({ spaceId, isAdmin }: SpaceBackupSettingsProps) {
	let t = useIntl()
	let { directoryName, setDirectoryName } = useSpaceBackupPath(spaceId)
	let [pendingAction, setPendingAction] = useState<
		"choose" | "change" | "clear" | null
	>(null)
	let [error, setError] = useState<string | null>(null)
	let isLoading = pendingAction !== null

	if (!isBackupSupported()) {
		return <UnsupportedBrowserCallout />
	}

	async function handleChooseFolder() {
		setPendingAction("choose")
		setError(null)
		try {
			let handle = await window.showDirectoryPicker({ mode: "readwrite" })
			await setSpaceBackupHandle(spaceId, handle)
			setDirectoryName(handle.name)
		} catch (e) {
			if (!(e instanceof Error && e.name === "AbortError")) {
				setError("Failed to choose folder. Try again.")
				console.error("Failed to select folder:", e)
			}
		} finally {
			setPendingAction(null)
		}
	}

	async function handleChangeFolder() {
		setPendingAction("change")
		setError(null)
		try {
			let handle = await window.showDirectoryPicker({ mode: "readwrite" })
			await setSpaceBackupHandle(spaceId, handle)
			setDirectoryName(handle.name)
		} catch (e) {
			if (!(e instanceof Error && e.name === "AbortError")) {
				setError(t("backup.error"))
				console.error("Failed to select folder:", e)
			}
		} finally {
			setPendingAction(null)
		}
	}

	async function handleClear() {
		setPendingAction("clear")
		setError(null)
		try {
			await clearSpaceBackupHandle(spaceId)
			setDirectoryName(null)
		} catch {
			setError(t("backup.clearError"))
		} finally {
			setPendingAction(null)
		}
	}

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				<T k="backup.space.title" />
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				{directoryName ? (
					<>
						<div className="mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
							<FolderOpen className="size-4" />
							<span className="text-sm font-medium">
								<T k="backup.space.set" />
							</span>
						</div>
						<p className="text-muted-foreground mb-3 text-sm">
							<T k="backup.space.folder" />{" "}
							<span
								className="inline-block max-w-56 truncate align-bottom font-medium"
								title={directoryName}
							>
								{directoryName}
							</span>
						</p>
						{error && (
							<div className="text-destructive mb-3 flex items-center gap-1.5 text-sm">
								<AlertCircle className="size-4" />
								{error}
							</div>
						)}
						<div className="flex gap-2">
							<Button
								onClick={handleChangeFolder}
								variant="outline"
								size="sm"
								disabled={isLoading || !isAdmin}
							>
								{pendingAction === "change" || pendingAction === "choose"
									? t("backup.space.changing")
									: t("backup.space.changeFolder")}
							</Button>
							<Button
								onClick={handleClear}
								variant="ghost"
								size="sm"
								disabled={isLoading || !isAdmin}
							>
								{pendingAction === "clear"
									? t("backup.space.clearing")
									: t("backup.space.clear")}
							</Button>
						</div>
						{!isAdmin && (
							<p className="text-muted-foreground mt-2 text-xs">
								<T k="backup.space.adminOnly" />
							</p>
						)}
					</>
				) : (
					<>
						<div className="text-foreground mb-2 text-sm font-medium">
							<T k="backup.space.notSet" />
						</div>
						<p className="text-muted-foreground mb-4 text-sm">
							<T k="backup.space.description" />
						</p>
						{error && (
							<div className="text-destructive mb-3 flex items-center gap-1.5 text-sm">
								<AlertCircle className="size-4" />
								{error}
							</div>
						)}
						<Button
							onClick={handleChooseFolder}
							variant="outline"
							size="sm"
							disabled={isLoading || !isAdmin}
						>
							<FolderOpen className="mr-1.5 size-3.5" />
							{pendingAction === "choose"
								? t("backup.space.choosing")
								: t("backup.space.choose")}
						</Button>
						{!isAdmin && (
							<p className="text-muted-foreground mt-2 text-xs">
								<T k="backup.space.adminOnlySet" />
							</p>
						)}
					</>
				)}
			</div>
		</section>
	)
}

function UnsupportedBrowserCallout() {
	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				<T k="backup.title" />
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				<div className="flex items-start gap-2">
					<AlertCircle className="text-muted-foreground mt-0.5 size-4" />
					<div>
						<p className="text-muted-foreground text-sm">
							<T k="backup.unsupported.description" />
						</p>
						<p className="text-muted-foreground mt-1 text-xs">
							<T k="backup.unsupported.note" />
						</p>
					</div>
				</div>
			</div>
		</section>
	)
}
