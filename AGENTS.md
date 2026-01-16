# Agent Instructions

## Verification

Run `bun run check` to verify changes (runs lint, types, format, tests in parallel).

## Project Setup

- **Package manager:** Bun (use `bun install`, `bun add`, `bun run`)
- **Do NOT use npm/yarn** - no package-lock.json
- **React Compiler enabled** - Do NOT use `useMemo`, `useCallback`, or `React.memo` - the compiler handles memoization automatically

## Code Style Preferences

### General Principles

- High information density in both code and text
- Optimize for top-down readability - reader should understand flow without jumping around
- No comments unless absolutely necessary for complex logic. Comments should explain WHY it is there not WHAT it is.
- **NEVER use type casts (`as any`, `as SomeType`, etc.) - Fix types properly instead**

### TypeScript Best Practices

- **NEVER use `any` type** - Always infer or define proper types
- **Use framework type systems** - Leverage Jazz-tools' `co.loaded<>` and `ResolveQuery<>`
- **Extract types from existing objects** - Use `Parameters<typeof fn>[0]` and `NonNullable<T>`
- **Define helper types** - Create meaningful type aliases for complex nested types
- **Type function parameters and returns** - Be explicit about what functions expect and return
- **Use `tryCatch` wrapper** - Wrap async operations for proper error handling with types

**Type Definition Examples:**

```ts
// ✅ Good: Extract types from Jazz schemas
type ReminderData = Parameters<typeof Reminder.create>[0]
type LoadedUser = co.loaded<typeof UserAccount, typeof query>
type NotificationSettings = NonNullable<LoadedUser["root"]["notificationSettings"]>

// ✅ Good: Define clear function signatures
function updateReminder(
  updates: Partial<ReminderData>,
  options: { userId: string }
): Promise<ReminderUpdated>

// ✅ Good: Use tryCatch for error handling
let result = await tryCatch(someAsyncOperation())
if (!result.ok) return { error: result.error }

// ❌ Bad: Using any
function handleUser(user: any) { ... }

// ❌ Bad: Type casting
let data = response as SomeType
```

### Variable Declarations

- Use `let` over `const`
- Only export what needs to be exported
- No default exports

### Functions

- Use `function() {}` over `() => {}` for named functions
- Arrow functions acceptable for inline/anonymous usage

### File Organization

**Universal Module Structure:**

1. **Imports** - External and internal imports at the top
2. **Export declarations** - `export { ... }` and `export type { ... }` immediately after imports
3. **Main functions/components** - Primary exports, kept lean and focused
4. **Helper functions** - Utilities, handlers, types, and constants at the bottom

**Component Modules (.tsx):**

- Extract business logic to module-scope handler factory functions
- Keep components focused on UI state and rendering
- Call factories inline in JSX: `onClick={makeHandler(doc, editor)}`
- Custom hooks go after components but before handler factories

**Handler Factory Pattern:**

Use `make*` prefix for functions that return handlers. Call them inline in JSX to keep components lean.

```tsx
// Component - focused on UI and state
function FileMenu({ doc, editor }) {
	let [dialogOpen, setDialogOpen] = useState(false)

	return (
		<>
			<Button onClick={makeRename(editor)}>Rename</Button>
			<Button onClick={makeDownload(doc)}>Download</Button>
			<Button onClick={() => setDialogOpen(true)}>Delete</Button>
			<ConfirmDialog onConfirm={makeDelete(doc, navigate)} />
		</>
	)
}

// Handler factories - at module scope, after component
function makeRename(editor: EditorRef) {
	return function handleRename() {
		let view = editor.current?.getEditor()
		// ... business logic
	}
}

function makeDownload(doc: LoadedDocument) {
	return async function handleDownload() {
		// ... export logic
	}
}

function makeDelete(doc: LoadedDocument, navigate: NavigateFn) {
	return function handleDelete() {
		doc.$jazz.set("deletedAt", new Date())
		navigate({ to: "/" })
	}
}
```

**When to use inline vs factory:**

- Use factory: Handler has business logic or needs dependencies
- Use inline arrow: Simple state updates like `() => setOpen(true)`

**Tool/API Modules (.ts):**

- Main operation functions first (like `updateReminder`)
- Helper functions and calculations in middle
- Constants, errors, and type definitions at bottom
- AI tool definitions and execute functions last

**Benefits:**

- Instant navigation: see exports → jump to implementation
- Clear separation: UI vs business logic vs types
- Consistent patterns across component and utility modules
- Better maintainability and testability

### Route Component Patterns

**Structure for route components:**

1. Early returns for error/loading states at the top
2. Data derivation (parsing, grouping) after guards
3. Render composed sub-components
4. Sub-components own their logic (keyboard handlers, navigation, etc.)

**Loading/Empty States:**

- Never return `null` for loading - show a spinner with helpful text
- Never return `null` for empty - show an empty state with guidance
- Use `<Empty>` component with title and description

**Passing Data to Sub-components:**

- Pass the loaded `doc` object directly, not derived callbacks
- Let sub-components derive their own state from `doc`
- Sub-components should own related logic (e.g., toolbar owns keyboard shortcuts)

```tsx
// ✅ Good: Sub-component owns its logic
<BottomToolbar doc={doc} items={items} />

// ❌ Bad: Parent passes callbacks
<BottomToolbar
  onPrevSlide={() => { ... }}
  onNextSlide={() => { ... }}
  onPrevItem={() => { ... }}
/>
```

**Top Bar Pattern:**

- Left: navigation/branding
- Center: title (absolutely positioned for true centering)
- Right: actions dropdown

### Forms

- Use `@tanstack/react-form` with `useForm` for all forms
- Use field components from `@/components/ui/field` (`Field`, `FieldLabel`, `FieldError`, etc.)
- Use `form.Field` render props pattern for each input
- Handle validation via tanstack form's `validators` option
