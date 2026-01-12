#!/bin/bash

set -e
if [ -z "$1" ]; then
  echo "Usage: $0 ‹iterations›"
  exit 1
fi

MAX_ITERATIONS=$1
COMPLETE_TOKEN="<promise>COMPLETE</promise>"
MODEL="claude-opus-4-5-20251101"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo "=== Ralph iteration $i/$MAX_ITERATIONS ==="
  
  # Check if PRD is already complete before running AI
  FAILING_COUNT=$(grep -c '"passes": false' prd.json 2>/dev/null) || FAILING_COUNT=0
  if [ "$FAILING_COUNT" -eq 0 ]; then
    echo "=== Ralph complete! All user stories pass. ==="
    exit 0
  fi
  
  PROMPT="You are working on a codebase with a PRD (Product Requirements Document) of user stories.

## PRD
@prd.json

## Progress so far
@progress.txt

## Instructions
1. Find the highest-priority feature to work on and work only on that feature. This should be the one YOU decide has the highest priority - not necessarily the first in the list. 
2. Check that the types check via bun run typecheck and that the tests pass via bun run test.
3. Update the PRD with the work that was done.
4. Annend vour progress to the progress.txt file. Use this to leave notes for the next person working in the codebase. 
5. Make a git commit of that feature. ONLY WORK ON A SINGLE FEATURE.

If, while implementing the feature, you notice the PRD is complete, output $COMPLETE_TOKEN.

CRITICAL: 
- Only work on ONE user story per run
- All commits MUST pass typecheck and tests
- Always append to progress.txt, never overwrite"

  # Run claude code with the prompt in print mode, allowing all permissions
  OUTPUT=$(claude -p "$PROMPT" --model "$MODEL" --dangerously-skip-permissions 2>&1) || true

  echo "$OUTPUT"
  
  # Check for completion - verify PRD has only passing tasks
  if echo "$OUTPUT" | grep -q "$COMPLETE_TOKEN"; then
    echo "=== Checking PRD for completion... ==="
    
    # Count tasks with passes: false
    FAILING_COUNT=$(grep -c '"passes": false' prd.json 2>/dev/null) || FAILING_COUNT=0
    
    if [ "$FAILING_COUNT" -eq 0 ]; then
      echo "=== Ralph complete! All user stories pass. ==="
      exit 0
    else
      echo "=== PRD still has $FAILING_COUNT failing tasks, continuing... ==="
    fi
  fi
  
  echo "=== Iteration $i complete, continuing... ==="
  sleep 2
done

echo "=== Ralph reached max iterations ($MAX_ITERATIONS) ==="
exit 1

