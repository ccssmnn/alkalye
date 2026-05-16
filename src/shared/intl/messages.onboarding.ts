import { messages, translate } from "@ccssmnn/intl"

export { baseOnboardingMessages, deOnboardingMessages }

let baseOnboardingMessages = messages({
	"timeMachine.title": "Time Machine",
	"timeMachine.confirmRestore": "Restore this version?",
	"timeMachine.restoreButton": "Restore",
	"timeMachine.cancelButton": "Cancel",
	"timeMachine.exit": "Exit",
	"timeMachine.createCopy": "Create Copy",
	"timeMachine.restoreThis": "Restore This Version",
	"timeMachine.noHistory": "No previous versions",
	"timeMachine.allHistory": "All history",
	"timeMachine.prevLabel": "Previous",
	"timeMachine.nextLabel": "Next",
	"timeMachine.failedToCopyAsset": "Failed to copy asset: {$name}",
})

let deOnboardingMessages = translate(baseOnboardingMessages, {
	"timeMachine.title": "Zeitmaschine",
	"timeMachine.confirmRestore": "Diese Version wiederherstellen?",
	"timeMachine.restoreButton": "Wiederherstellen",
	"timeMachine.cancelButton": "Abbrechen",
	"timeMachine.exit": "Beenden",
	"timeMachine.createCopy": "Kopie erstellen",
	"timeMachine.restoreThis": "Diese Version wiederherstellen",
	"timeMachine.noHistory": "Keine vorherigen Versionen",
	"timeMachine.allHistory": "Gesamte Historie",
	"timeMachine.prevLabel": "Vorherige",
	"timeMachine.nextLabel": "Nächste",
	"timeMachine.failedToCopyAsset": "Fehler beim Kopieren des Assets: {$name}",
})
