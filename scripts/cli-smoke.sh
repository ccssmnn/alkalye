#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
CLI=(bun run "$ROOT_DIR/src/cli/main.ts")

SYNC_URL="${ALK_SYNC_URL:-ws://127.0.0.1:4200}"
SESSION_FILE="${ALK_SESSION_FILE:-$ROOT_DIR/.tmp/cli-session.json}"
PASSPHRASE_FILE="${ALK_PASSPHRASE_FILE:-$ROOT_DIR/.tmp/cli-passphrase.txt}"
SPACE_ID="${ALK_TEST_SPACE_ID:-}"
SYNC_START_CMD="${ALK_SYNC_START_CMD:-}"

mkdir -p "$(dirname "$SESSION_FILE")" "$(dirname "$PASSPHRASE_FILE")"
if [[ ! -s "$PASSPHRASE_FILE" ]]; then
  printf 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about\n' > "$PASSPHRASE_FILE"
fi

SYNC_PID=""
cleanup() {
  if [[ -n "${DOC_ID:-}" ]]; then
    "${CLI[@]}" docs delete --sync-url "$SYNC_URL" --doc-id "$DOC_ID" --hard-delete --session-file "$SESSION_FILE" >/dev/null 2>&1 || true
  fi
  if [[ -n "$SYNC_PID" ]]; then
    kill "$SYNC_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -n "$SYNC_START_CMD" ]]; then
  bash -lc "$SYNC_START_CMD" >/tmp/alk-sync.log 2>&1 &
  SYNC_PID=$!
  sleep 2
fi

run() {
  local out
  out=$("${CLI[@]}" "$@")
  node -e 'const x=JSON.parse(process.argv[1]); if(!x.ok){console.error(JSON.stringify(x)); process.exit(1)}' "$out"
  echo "$out"
}

run auth create-account --sync-url "$SYNC_URL" --name "CLI Smoke" --passphrase-file "$PASSPHRASE_FILE" --session-file "$SESSION_FILE" >/dev/null || true
run auth sign-in --sync-url "$SYNC_URL" --passphrase-file "$PASSPHRASE_FILE" --session-file "$SESSION_FILE" >/dev/null
run auth status --session-file "$SESSION_FILE" >/dev/null

if [[ -z "$SPACE_ID" ]]; then
  SPACE_ID=$(bun -e 'import { startWorker } from "jazz-tools/worker"; import { createSpace, UserAccount } from "./src/schema/index.ts"; import { readFileSync } from "node:fs"; const session = JSON.parse(readFileSync(process.argv[1], "utf8")); const syncServer = process.argv[2]; const wrk = await startWorker({syncServer, accountID: session.accountID, accountSecret: session.accountSecret, AccountSchema: UserAccount}); const me = await UserAccount.getMe().$jazz.ensureLoaded({resolve:{root:{spaces:true}}}); const space = createSpace(`cli-smoke-${Date.now()}`, me.root); await wrk.worker.$jazz.waitForAllCoValuesSync(); process.stdout.write(space.$jazz.id); await wrk.shutdownWorker();' "$SESSION_FILE" "$SYNC_URL")
fi

CREATE=$(run docs create --sync-url "$SYNC_URL" --space-id "$SPACE_ID" --title "cli-smoke-$(date +%s)" --content "hello" --session-file "$SESSION_FILE")
DOC_ID=$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.data.docId)' "$CREATE")

run docs read --sync-url "$SYNC_URL" --doc-id "$DOC_ID" --session-file "$SESSION_FILE" >/dev/null
run docs update --sync-url "$SYNC_URL" --doc-id "$DOC_ID" --content "updated" --replace --session-file "$SESSION_FILE" >/dev/null
run docs upsert --sync-url "$SYNC_URL" --space-id "$SPACE_ID" --title "cli-smoke-upsert" --content "upsert body" --session-file "$SESSION_FILE" >/dev/null
run docs list --sync-url "$SYNC_URL" --space-id "$SPACE_ID" --session-file "$SESSION_FILE" >/dev/null
run docs search --sync-url "$SYNC_URL" --space-id "$SPACE_ID" --query "cli-smoke" --session-file "$SESSION_FILE" >/dev/null
run docs delete --sync-url "$SYNC_URL" --doc-id "$DOC_ID" --hard-delete --session-file "$SESSION_FILE" >/dev/null

echo "CLI smoke passed"
