# Alkalye Agents Automation

Automate `/agents` workflows through stable `data-testid` selectors and the schema-driven form.

## When to use

- Browser automation of `/agents` actions (docs + auth)
- Reproducible scripted checks for `createAccount`, `signIn`, and document actions

## Stable selectors

- `agents-page`
- `agents-form`
- `agents-action-select`
- `agents-submit`
- `agents-log-list`
- `agents-log-entry`
- `agents-field-<fieldKey>`

## Workflow

1. Open `/agents`.
2. Set action via `agents-action-select`.
3. Fill schema-derived fields via `agents-field-<fieldKey>`.
4. Click `agents-submit`.
5. Assert results in `agents-log-list` / `agents-log-entry`.

## Script usage

Use `scripts/agents-browser-automation.js` in browser console or via automation driver injection.

Example:

```js
window.alkalyeAgentsAutomation.createAccount(
  "word1 word2 word3",
  "Automation User",
)
window.alkalyeAgentsAutomation.signIn("word1 word2 word3")
window.alkalyeAgentsAutomation.runAgentsAction("listSpaces", {})
```

## Notes

- Actions and required fields are validated by Zod schemas in `src/app/routes/agents-contract.ts`.
- Keep selectors unchanged unless you update both route markup and automation consumers.
