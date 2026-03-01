# Alkalye Agents Automation (Public)

Automate `/agents` workflows using the route-registered API (`window.alkalyeAgents`) and stable test ids.

## Files

- Script: `/scripts/agents-browser-automation.js`
- Route: `/agents`

## Quick flow

1. Open `/agents` in the browser.
2. Inject or load `/scripts/agents-browser-automation.js`.
3. Call helpers from `window.alkalyeAgentsPublicAutomation`.

## Examples

```js
await window.alkalyeAgentsPublicAutomation.createAccount(
  "word1 word2 word3",
  "Automation User",
)

await window.alkalyeAgentsPublicAutomation.signIn("word1 word2 word3")

await window.alkalyeAgentsPublicAutomation.upsertDocByTitle({
  title: "Project Notes",
  content: "- first automation write",
  mode: "append",
})
```

## Stable ids for browser automation

- `agents-page`
- `agents-form`
- `agents-action-select`
- `agents-dynamic-fields`
- `agents-submit`
- `agents-log`
- `agents-log-list`
- `agents-log-entry`
- `agents-field-<fieldKey>`

## Notes

- Action schemas + execution come from a single central module: `src/app/agents/actions.ts`.
- UI forms and JS utilities both use that same action module (no duplicated action logic).
