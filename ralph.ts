#!/usr/bin/env bun

import { $ } from "bun"

let MAX_ITERATIONS = 50
let PRD_FILE = "prd.json"
let PROGRESS_FILE = "progress.txt"
let COMPLETE_TOKEN = "<promise>COMPLETE</promise>"
let MODEL = "anthropic/claude-opus-4-5-20251101"

// Initialize progress file if it doesn't exist
let progressFile = Bun.file(PROGRESS_FILE)
if (!(await progressFile.exists())) {
	await Bun.write(PROGRESS_FILE, "")
}

for (let i = 1; i <= MAX_ITERATIONS; i++) {
	console.log(`=== Ralph iteration ${i}/${MAX_ITERATIONS} ===`)

	let prdContent = await Bun.file(PRD_FILE).text()
	let progressContent = await Bun.file(PROGRESS_FILE).text()

	let prompt = `You are working on a codebase with a PRD (Product Requirements Document) of user stories.

## PRD (prd.json)
${prdContent}

## Progress so far (progress.txt)
${progressContent}

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
7. If ALL user stories now have passes=true, reply with: ${COMPLETE_TOKEN}
   Otherwise, reply with a brief summary of what you completed.

CRITICAL: 
- Only work on ONE user story per run
- All commits MUST pass typecheck and tests
- Always append to progress.txt, never overwrite`

	let output: string
	try {
		let result = await $`opencode run --model ${MODEL} ${prompt}`.quiet()
		output = result.text()
	} catch (e: unknown) {
		let error = e as { stdout?: Buffer }
		output = error.stdout?.toString() ?? ""
	}

	console.log(output)

	if (output.includes(COMPLETE_TOKEN)) {
		console.log("=== Ralph complete! All user stories implemented. ===")
		process.exit(0)
	}

	console.log(`=== Iteration ${i} complete, continuing... ===`)
	await Bun.sleep(2000)
}

console.log(`=== Ralph reached max iterations (${MAX_ITERATIONS}) ===`)
process.exit(1)
