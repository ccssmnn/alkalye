# TypeScript Conventions

## Types

- Never use `any` - infer or define proper types
- Never use type casts (`as any`, `as SomeType`) - fix types instead
- Extract types: `Parameters<typeof fn>[0]`, `NonNullable<T>`

## tryCatch Pattern

Wrap async operations for typed error handling:

```ts
let result = await tryCatch(someAsyncOperation())
if (!result.ok) return { error: result.error }
```
