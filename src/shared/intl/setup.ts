import { createIntlForReact } from "@ccssmnn/intl/react"
import { messagesEn } from "./messages"

export { IntlProvider, useIntl, T, useLocale }

let { IntlProvider, useIntl, T, useLocale } = createIntlForReact(
	messagesEn,
	"en",
)
