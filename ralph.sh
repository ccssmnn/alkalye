#!/bin/bash

set -e

MAX_ITERATIONS=50
PRD_FILE="prd.json"
PROGRESS_FILE="progress.txt"
COMPLETE_TOKEN="<promise>COMPLETE</promise>"
MODEL="anthropic/claude-opus-4-5-20251101"

# Initialize progress file if it doesn't exist
touch "$PROGRESS_FILE"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo "=== Ralph iteration $i/$MAX_ITERATIONS ==="
  
  # Read current PRD and progress
  PRD_CONTENT=$(cat "$PRD_FILE")
  PROGRESS_CONTENT=$(cat "$PROGRESS_FILE")
  
  # Build the prompt
  PROMPT="You are working on a codebase with a PRD (Product Requirements Document) of user stories.

## PRD (prd.json)
$PRD_CONTENT

## Progress so far (progress.txt)
$PROGRESS_CONTENT

## Instructions

1. Pick the HIGHEST PRIORITY user story where passes=false
2. Implement ONLY that single user story - do not scope creep
3. After implementation, run type checks and tests to ensure CI stays green:
   - bun run typecheck
   - bun run test
4. If checks pass, commit your work with a descriptive message
5. Append your progress to progress.txt (do NOT overwrite previous entries):
   - What you implemented
   - What files you changed
   - Any issues encountered
6. Update prd.json: set passes=true for the completed user story
7. If ALL user stories now have passes=true, reply with: $COMPLETE_TOKEN
   Otherwise, reply with a brief summary of what you completed.

CRITICAL: 
- Only work on ONE user story per run
- All commits MUST pass typecheck and tests
- Always append to progress.txt, never overwrite"

  # Run opencode with the prompt using 'run' subcommand
  OUTPUT=$(opencode run --model "$MODEL" "$PROMPT" 2>&1) || true

  echo "$OUTPUT"
  
  # Check for completion
  if echo "$OUTPUT" | grep -q "$COMPLETE_TOKEN"; then
    echo "=== Ralph complete! All user stories implemented. ==="
    exit 0
  fi
  
  echo "=== Iteration $i complete, continuing... ==="
  sleep 2
done

echo "=== Ralph reached max iterations ($MAX_ITERATIONS) ==="
exit 1
