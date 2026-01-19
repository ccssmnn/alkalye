# Jazz Patterns

## Type Helpers

Use Jazz-tools' built-in type utilities for loaded data:

```ts
type ReminderData = Parameters<typeof Reminder.create>[0]
type LoadedUser = co.loaded<typeof UserAccount, typeof query>
type NotificationSettings = NonNullable<
	LoadedUser["root"]["notificationSettings"]
>
```

- `co.loaded<Schema, Query>` - type for loaded CoValue with specific depth
- `ResolveQuery<>` - resolve query types
