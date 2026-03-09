# Alkalye Jazz CLI

CLI now talks to the Jazz sync endpoint directly (no `/api/agent/v1`).

## Run

```bash
bun run cli -- auth sign-in --passphrase-env ALK_PASS
```

Outputs one JSON object on stdout.

## Global flags

- `--sync-url <wss://...>` Jazz sync endpoint (default `wss://sync.alkalye.com`)
- `--timeout <ms>` reserved for future sync waits

## Auth material

For any docs command, provide one of:

- `--session-account-id <co_...> --session-secret <sealerSecret_...>`
- `--session-file <json-file>` containing `{ "accountID": "...", "accountSecret": "..." }`
- passphrase flags (`--passphrase`, `--passphrase-env`, `--passphrase-file`, `--passphrase-stdin`)

## Auth commands

- `auth sign-in` (derives session credentials from passphrase and optionally persists via `--session-file`)
- `auth create-account` (creates account on sync server for passphrase-derived credentials; supports `--session-file` persistence)
- `auth status`
- `auth sign-out`

Example:

```bash
bun run cli -- auth sign-in --passphrase-env ALK_PASS --session-file /tmp/alk-session.json
```

Local smoke test (idempotent, creates a temporary space when `ALK_TEST_SPACE_ID` is unset):

```bash
ALK_SYNC_URL=ws://127.0.0.1:4200 bun run test:cli:smoke
```

## Docs commands

- `docs create --space-id <id> --title <title> --content <content>`
- `docs read --doc-id <id>`
- `docs update --doc-id <id> --content <content> [--append|--replace]`
- `docs list --space-id <id> [--query <text>]`
- `docs search --space-id <id> [--query <text>]`
- `docs delete --doc-id <id> [--soft-delete|--hard-delete]`
- `docs upsert --space-id <id> --title <title> --content <content>`

Upsert uses title matching from document heading (`# Title`).
