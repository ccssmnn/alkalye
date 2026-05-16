import { merge, check } from "@ccssmnn/intl"

import { baseCommonMessages, deCommonMessages } from "./messages.common"
import { baseAuthMessages, deAuthMessages } from "./messages.auth"
import {
	baseDocumentsMessages,
	deDocumentsMessages,
} from "./messages.documents"
import { baseEditorMessages, deEditorMessages } from "./messages.editor"
import { baseSharingMessages, deSharingMessages } from "./messages.sharing"
import { baseSpacesMessages, deSpacesMessages } from "./messages.spaces"
import { baseBackupMessages, deBackupMessages } from "./messages.backup"
import {
	baseImportExportMessages,
	deImportExportMessages,
} from "./messages.import-export"
import { baseSettingsMessages, deSettingsMessages } from "./messages.settings"
import { baseThemesMessages, deThemesMessages } from "./messages.themes"
import {
	basePresentationMessages,
	dePresentationMessages,
} from "./messages.presentation"
import {
	baseOnboardingMessages,
	deOnboardingMessages,
} from "./messages.onboarding"

export { messagesEn, messagesDe }

let messagesEn = merge(
	baseCommonMessages,
	baseAuthMessages,
	baseDocumentsMessages,
	baseEditorMessages,
	baseSharingMessages,
	baseSpacesMessages,
	baseBackupMessages,
	baseImportExportMessages,
	baseSettingsMessages,
	baseThemesMessages,
	basePresentationMessages,
	baseOnboardingMessages,
)

let messagesDe = check(
	messagesEn,
	deCommonMessages,
	deAuthMessages,
	deDocumentsMessages,
	deEditorMessages,
	deSharingMessages,
	deSpacesMessages,
	deBackupMessages,
	deImportExportMessages,
	deSettingsMessages,
	deThemesMessages,
	dePresentationMessages,
	deOnboardingMessages,
)
