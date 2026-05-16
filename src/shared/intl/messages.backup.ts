import { messages, translate } from "@ccssmnn/intl"

export { baseBackupMessages, deBackupMessages }

let baseBackupMessages = messages({
	"backup.title": "Local Backup",
	"backup.enabled.status": "Backing up",
	"backup.enabled.statusBidirectional": "Syncing",
	"backup.enabled.folder": "Folder:",
	"backup.enabled.lastBackup": "Last backup: {$date}",
	"backup.enabled.lastSync": "Last sync: {$date}",
	"backup.enabled.syncChanges": "Sync changes from folder",
	"backup.enabled.syncDescription.supported":
		"Import folder edits back into Alkalye automatically.",
	"backup.enabled.syncDescription.unsupported":
		"Requires Chromium with File System Observer support.",
	"backup.enabled.changeFolder": "Change folder",
	"backup.enabled.changing": "Changing...",
	"backup.enabled.disable": "Disable",
	"backup.enabled.disabling": "Disabling...",
	"backup.disabled.status": "Automatic backup disabled",
	"backup.disabled.description":
		"Automatically back up your documents to a folder on this device.",
	"backup.disabled.choose": "Choose backup folder",
	"backup.disabled.choosing": "Choosing...",
	"backup.unsupported.description":
		"Local backup requires a Chromium-based browser (Chrome, Edge, Brave, or Opera).",
	"backup.unsupported.note":
		"Safari and Firefox do not support the File System Access API needed for this feature.",
	"backup.space.title": "Local Backup",
	"backup.space.set": "Backup folder set",
	"backup.space.folder": "Folder:",
	"backup.space.changeFolder": "Change folder",
	"backup.space.changing": "Changing...",
	"backup.space.clear": "Clear",
	"backup.space.clearing": "Clearing...",
	"backup.space.adminOnly": "Only space admins can change this folder.",
	"backup.space.notSet": "No backup folder set",
	"backup.space.description": "Set a backup folder for this space's documents.",
	"backup.space.choose": "Choose backup folder",
	"backup.space.choosing": "Choosing...",
	"backup.space.adminOnlySet": "Only space admins can set a backup folder.",
	"backup.error": "Failed to choose folder. Try again.",
	"backup.clearError": "Failed to clear folder. Try again.",
	"backup.failed": "Backup failed",
})

let deBackupMessages = translate(baseBackupMessages, {
	"backup.title": "Lokales Backup",
	"backup.enabled.status": "Wird gesichert",
	"backup.enabled.statusBidirectional": "Wird synchronisiert",
	"backup.enabled.folder": "Ordner:",
	"backup.enabled.lastBackup": "Letztes Backup: {$date}",
	"backup.enabled.lastSync": "Letzte Synchronisation: {$date}",
	"backup.enabled.syncChanges": "Änderungen aus dem Ordner synchronisieren",
	"backup.enabled.syncDescription.supported":
		"Importiere Ordneränderungen automatisch zurück in Alkalye.",
	"backup.enabled.syncDescription.unsupported":
		"Erfordert Chromium mit File System Observer-Unterstützung.",
	"backup.enabled.changeFolder": "Ordner ändern",
	"backup.enabled.changing": "Wird geändert...",
	"backup.enabled.disable": "Deaktivieren",
	"backup.enabled.disabling": "Wird deaktiviert...",
	"backup.disabled.status": "Automatisches Backup deaktiviert",
	"backup.disabled.description":
		"Sichere deine Dokumente automatisch in einem Ordner auf diesem Gerät.",
	"backup.disabled.choose": "Backup-Ordner auswählen",
	"backup.disabled.choosing": "Wird ausgewählt...",
	"backup.unsupported.description":
		"Lokales Backup erfordert einen Chromium-basierten Browser (Chrome, Edge, Brave oder Opera).",
	"backup.unsupported.note":
		"Safari und Firefox unterstützen die für diese Funktion erforderliche File System Access API nicht.",
	"backup.space.title": "Lokales Backup",
	"backup.space.set": "Backup-Ordner festgelegt",
	"backup.space.folder": "Ordner:",
	"backup.space.changeFolder": "Ordner ändern",
	"backup.space.changing": "Wird geändert...",
	"backup.space.clear": "Löschen",
	"backup.space.clearing": "Wird gelöscht...",
	"backup.space.adminOnly": "Nur Space-Admins können diesen Ordner ändern.",
	"backup.space.notSet": "Kein Backup-Ordner festgelegt",
	"backup.space.description":
		"Lege einen Backup-Ordner für die Dokumente dieses Spaces fest.",
	"backup.space.choose": "Backup-Ordner auswählen",
	"backup.space.choosing": "Wird ausgewählt...",
	"backup.space.adminOnlySet":
		"Nur Space-Admins können einen Backup-Ordner festlegen.",
	"backup.error": "Ordnerauswahl fehlgeschlagen. Versuche es erneut.",
	"backup.clearError": "Fehler beim Löschen des Ordners. Versuche es erneut.",
	"backup.failed": "Backup fehlgeschlagen",
})
