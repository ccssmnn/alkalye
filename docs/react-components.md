# React Component Patterns

## Handler Factories

Use `make*` prefix for functions that return handlers. Call inline in JSX.

```tsx
function FileMenu({ doc, editor }) {
	let [dialogOpen, setDialogOpen] = useState(false)

	return (
		<>
			<Button onClick={makeRename(editor)}>Rename</Button>
			<Button onClick={() => setDialogOpen(true)}>Delete</Button>
		</>
	)
}

// After component, at module scope
function makeRename(editor: EditorRef) {
	return function handleRename() {
		let view = editor.current?.getEditor()
		// business logic
	}
}
```

**When to use:**

- Factory: handler has business logic or dependencies
- Inline arrow: simple state updates like `() => setOpen(true)`

## Route Components

1. Early returns for error/loading at top
2. Data derivation after guards
3. Render composed sub-components
4. Sub-components own their logic

**Loading/Empty:**

- Never return `null` - show spinner or `<Empty>` with guidance

**Data passing:**

- Pass `doc` directly, let sub-components derive state
- Sub-components own related logic (toolbar owns keyboard shortcuts)

```tsx
// Good
<BottomToolbar doc={doc} items={items} />

// Bad - parent passes callbacks
<BottomToolbar onPrevSlide={...} onNextSlide={...} />
```

## Forms

Use `@tanstack/react-form`:

```tsx
let form = useForm({ ... })

<form.Field name="email">
  {(field) => (
    <Field>
      <FieldLabel>Email</FieldLabel>
      <Input {...field.getInputProps()} />
      <FieldError>{field.state.meta.errors}</FieldError>
    </Field>
  )}
</form.Field>
```

Components from `@/components/ui/field`.
