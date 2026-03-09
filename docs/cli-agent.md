# Alkalye Agent CLI Prototype

This prototype CLI provides machine-readable JSON output for agent workflows.

## Run

```bash
bun run cli -- auth status
```

`stdout` always contains one JSON object:

- success

```json
{"ok":true,"command":"auth.status","data":{}}
```

- failure

```json
{"ok":false,"command":"docs.create","error":{"code":"missing_required_option","message":"Missing required option --space-id"}}
```

## Global flags

- `--base-url <url>`: backend base URL (default `https://www.alkalye.com/api/agent/v1`)
- `--timeout <ms>`: request timeout in milliseconds
- `--headless` / `--no-headless`: sets `x-alk-headless` request header

## Auth commands

- `auth sign-in`
- `auth sign-out`
- `auth status`
- `auth create-account`

Passphrase sources:

- `--passphrase "word1 word2 ..."`
- `--passphrase-env ALK_PASS`
- `--passphrase-file /secure/path/passphrase.txt`
- `--passphrase-stdin`

Examples:

```bash
bun run cli -- auth sign-in --passphrase-env ALK_PASS
printf 'word1 word2 word3' | bun run cli -- auth sign-in --passphrase-stdin
bun run cli -- auth create-account --name "Agent Writer" --passphrase-file /tmp/passphrase.txt
```

If backend create-account is unavailable, CLI returns:

```json
{"ok":false,"command":"auth.create-account","error":{"code":"not_supported","message":"Operation not supported by backend"}}
```

## Docs commands

- `docs create --space-id <id> --title <title> --content <content>`
- `docs read --doc-id <id>`
- `docs update --doc-id <id> --content <content> [--append|--replace]`
- `docs list --space-id <id> [--query <text>]`
- `docs search --space-id <id> [--query <text>]`
- `docs delete --doc-id <id> [--soft-delete|--hard-delete]`
- `docs upsert --space-id <id> --title <title> --content <content>`

Upsert behavior:

1. list/search docs in the space by title
2. update exact title match if found
3. create if no exact title match exists

Examples:

```bash
bun run cli -- docs create --space-id sp_123 --title "Spec" --content "v1"
bun run cli -- docs update --doc-id doc_123 --append --content "\nnew note"
bun run cli -- docs list --space-id sp_123 --query roadmap
bun run cli -- docs upsert --space-id sp_123 --title "Roadmap" --content "Q2 plan"
```

## Safety notes

- Prefer env/file/stdin passphrase sources over shell history.
- `--hard-delete` requests permanent delete and may be irreversible.
- Non-2xx HTTP responses are mapped into JSON errors with status/details when available.
