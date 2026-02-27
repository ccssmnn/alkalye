# `/agents` prototype route

This route provides a browser-native automation surface for humans and agents.

## Message protocol

`window.postMessage` requests:

```ts
{ type: "alkalye:agents:request", requestId, action, params }
```

Response mirrors request id for correlation:

```ts
{ type: "alkalye:agents:response", requestId, action, ok, result?: unknown, error?: string }
```

## Available actions

- `listSpaces`
- `listDocs`
- `getDoc`
- `createDoc`
- `updateDoc`
- `appendDoc`
- `setFrontmatter`
- `findDocByTitle`
- `clearLog`

## UI contract

The page contains stable IDs / `data-testid` attributes for automation:

- `agents-action-select`
- `agents-dynamic-fields`
- `agents-submit`
- `agents-log-list`
- `agents-log-entry`
