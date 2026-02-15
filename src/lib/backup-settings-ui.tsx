import { useState } from "react"
import { FolderOpen, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
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
} from "@/lib/backup-storage"

export { BackupSettings, SpaceBackupSettings }

function BackupSettings() {
	let {
		enabled,
		bidirectional,
		directoryName,
		lastBackupAt,
		lastPullAt,
		lastError,
		setBidirectional,
	} = useBackupStore()
	let [isLoading, setIsLoading] = useState(false)

	if (!isBackupSupported()) {
		return (
			<section>
				<h2 className="text-muted-foreground mb-3 text-sm font-medium">
					Local Backup
				</h2>
				<div className="bg-muted/30 rounded-lg p-4">
					<div className="flex items-start gap-2">
						<AlertCircle className="text-muted-foreground mt-0.5 size-4" />
						<div>
							<p className="text-muted-foreground text-sm">
								Local backup requires a Chromium-based browser (Chrome, Edge,
								Brave, or Opera).
							</p>
							<p className="text-muted-foreground mt-1 text-xs">
								Safari and Firefox do not support the File System Access API
								needed for this feature.
							</p>
						</div>
					</div>
				</div>
			</section>
		)
	}

	async function handleEnable() {
		setIsLoading(true)
		await enableBackup()
		setIsLoading(false)
	}

	async function handleDisable() {
		setIsLoading(true)
		await disableBackup()
		setIsLoading(false)
	}

	async function handleChangeDirectory() {
		setIsLoading(true)
		await changeBackupDirectory()
		setIsLoading(false)
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
				Local Backup
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				{enabled ? (
					<>
						<div className="mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
							<FolderOpen className="size-4" />
							<span className="text-sm font-medium">
								{bidirectional ? "Syncing" : "Backing up"} to folder
							</span>
						</div>
						<p className="text-muted-foreground mb-1 text-sm">
							Folder: <span className="font-medium">{directoryName}</span>
						</p>
						{formattedLastBackup && (
							<p className="text-muted-foreground mb-1 text-xs">
								Last backup: {formattedLastBackup}
							</p>
						)}
						{bidirectional && formattedLastPull && (
							<p className="text-muted-foreground mb-3 text-xs">
								Last sync: {formattedLastPull}
							</p>
						)}
						{lastError && (
							<div className="text-destructive mb-3 flex items-center gap-1.5 text-sm">
								<AlertCircle className="size-4" />
								{lastError}
							</div>
						)}
						<div className="border-border/50 mb-3 border-t pt-3">
							<label
								className={
									!supportsFileSystemWatch()
										? "flex cursor-not-allowed items-center gap-2 opacity-50"
										: "flex cursor-pointer items-center gap-2"
								}
							>
								<input
									type="checkbox"
									checked={bidirectional}
									onChange={e => setBidirectional(e.target.checked)}
									disabled={!supportsFileSystemWatch()}
									className="size-4 rounded border-gray-300"
								/>
								<span className="text-sm">Sync changes from folder</span>
							</label>
							<p className="text-muted-foreground mt-1 text-xs">
								{supportsFileSystemWatch()
									? "When enabled, changes made in the backup folder will be imported into Alkalye."
									: "Requires a Chromium-based browser with File System Observer support."}
							</p>
						</div>
						<div className="flex gap-2">
							<Button
								onClick={handleChangeDirectory}
								variant="outline"
								size="sm"
								disabled={isLoading}
							>
								Change folder
							</Button>
							<Button
								onClick={handleDisable}
								variant="ghost"
								size="sm"
								disabled={isLoading}
							>
								Disable
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="text-foreground mb-2 text-sm font-medium">
							Automatic backup disabled
						</div>
						<p className="text-muted-foreground mb-4 text-sm">
							Automatically back up your documents to a folder on this device.
						</p>
						<Button
							onClick={handleEnable}
							variant="outline"
							size="sm"
							disabled={isLoading}
						>
							<FolderOpen className="mr-1.5 size-3.5" />
							Choose backup folder
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
	let { directoryName, setDirectoryName } = useSpaceBackupPath(spaceId)
	let [isLoading, setIsLoading] = useState(false)

	if (!isBackupSupported()) {
		return (
			<section>
				<h2 className="text-muted-foreground mb-3 text-sm font-medium">
					Local Backup
				</h2>
				<div className="bg-muted/30 rounded-lg p-4">
					<div className="flex items-start gap-2">
						<AlertCircle className="text-muted-foreground mt-0.5 size-4" />
						<div>
							<p className="text-muted-foreground text-sm">
								Local backup requires a Chromium-based browser (Chrome, Edge,
								Brave, or Opera).
							</p>
							<p className="text-muted-foreground mt-1 text-xs">
								Safari and Firefox do not support the File System Access API
								needed for this feature.
							</p>
						</div>
					</div>
				</div>
			</section>
		)
	}

	async function handleChooseFolder() {
		setIsLoading(true)
		try {
			let handle = await window.showDirectoryPicker({ mode: "readwrite" })
			await setSpaceBackupHandle(spaceId, handle)
			setDirectoryName(handle.name)
		} catch (e) {
			if (!(e instanceof Error && e.name === "AbortError")) {
				console.error("Failed to select folder:", e)
			}
		} finally {
			setIsLoading(false)
		}
	}

	async function handleChangeFolder() {
		await handleChooseFolder()
	}

	async function handleClear() {
		setIsLoading(true)
		try {
			await clearSpaceBackupHandle(spaceId)
			setDirectoryName(null)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<section>
			<h2 className="text-muted-foreground mb-3 text-sm font-medium">
				Local Backup
			</h2>
			<div className="bg-muted/30 rounded-lg p-4">
				{directoryName ? (
					<>
						<div className="mb-2 flex items-center gap-2 text-green-600 dark:text-green-400">
							<FolderOpen className="size-4" />
							<span className="text-sm font-medium">Backup folder set</span>
						</div>
						<p className="text-muted-foreground mb-3 text-sm">
							Folder: <span className="font-medium">{directoryName}</span>
						</p>
						<div className="flex gap-2">
							<Button
								onClick={handleChangeFolder}
								variant="outline"
								size="sm"
								disabled={isLoading || !isAdmin}
							>
								Change folder
							</Button>
							<Button
								onClick={handleClear}
								variant="ghost"
								size="sm"
								disabled={isLoading || !isAdmin}
							>
								Clear
							</Button>
						</div>
					</>
				) : (
					<>
						<div className="text-foreground mb-2 text-sm font-medium">
							No backup folder set
						</div>
						<p className="text-muted-foreground mb-4 text-sm">
							Set a backup folder for this space&apos;s documents.
						</p>
						<Button
							onClick={handleChooseFolder}
							variant="outline"
							size="sm"
							disabled={isLoading || !isAdmin}
						>
							<FolderOpen className="mr-1.5 size-3.5" />
							Choose backup folder
						</Button>
					</>
				)}
			</div>
		</section>
	)
}
