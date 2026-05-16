import { messages, translate } from "@ccssmnn/intl"

export { baseImportExportMessages, deImportExportMessages }

let baseImportExportMessages = messages({
	"importExport.import": "Import",
	"importExport.importAndExport": "Import & Export",
	"importExport.openLocalFile": "Open Local File",
	"importExport.exportAll": "Export all",

	"importExport.dropZone.hint": "Drop .md, .txt files or folders",

	"importExport.progress.readingFiles": "Reading files",
	"importExport.progress.compressingVideo": "Compressing video",
	"importExport.progress.creatingDocuments": "Creating documents",
	"importExport.progress.importing": "Importing documents",
	"importExport.progress.processingAsset":
		"Processing asset {index} of {total}",
	"importExport.progress.readingFilesInitial": "Reading files...",

	"importExport.upload.compressing": "Compressing",
	"importExport.upload.uploading": "Uploading",
	"importExport.upload.title": "{$phase} video",
	"importExport.upload.compressionNote":
		"Videos are compressed to reduce storage and sync faster.",
	"importExport.upload.cancel": "Cancel",
})

let deImportExportMessages = translate(baseImportExportMessages, {
	"importExport.import": "Importieren",
	"importExport.importAndExport": "Importieren & Exportieren",
	"importExport.openLocalFile": "Lokale Datei öffnen",
	"importExport.exportAll": "Alles exportieren",

	"importExport.dropZone.hint": "Ziehe .md, .txt Dateien oder Ordner hierher",

	"importExport.progress.readingFiles": "Lese Dateien",
	"importExport.progress.compressingVideo": "Komprimiere Video",
	"importExport.progress.creatingDocuments": "Erstelle Dokumente",
	"importExport.progress.importing": "Importiere Dokumente",
	"importExport.progress.processingAsset":
		"Verarbeite Asset {index} von {total}",
	"importExport.progress.readingFilesInitial": "Lese Dateien...",

	"importExport.upload.compressing": "Komprimierung",
	"importExport.upload.uploading": "Upload läuft",
	"importExport.upload.title": "{$phase} Video",
	"importExport.upload.compressionNote":
		"Videos werden komprimiert, um Speicher zu sparen und schneller zu synchronisieren.",
	"importExport.upload.cancel": "Abbrechen",
})
