# `/agents` prototype route

This route provides a browser-native automation surface for humans and agents through forms only.

## Form-driven contract

- No `window.postMessage` protocol.
- Actions are submitted through `agents-form`.
- Every action has a dedicated Zod schema in `src/app/routes/agents-contract.ts`.
- Dynamic fields are derived from those schemas.

## Available actions

- `listSpaces`
- `listDocs`
- `getDoc`
- `createDoc`
- `updateDoc`
- `appendDoc`
- `setFrontmatter`
- `findDocByTitle`
- `createAccount`
- `signIn`
- `clearLog`

## UI contract

Stable IDs / `data-testid` attributes for automation:

- `agents-page`
- `agents-form`
- `agents-action-select`
- `agents-dynamic-fields`
- `agents-submit`
- `agents-log`
- `agents-log-list`
- `agents-log-entry`
- `agents-field-<fieldKey>`
