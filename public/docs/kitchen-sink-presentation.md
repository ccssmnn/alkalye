---
mode: presentation
size: M
---

# Kitchen Sink Presentation

A comprehensive test of all slideshow elements for theme development

---

Typography Test

# Heading Level 1

## Heading Level 2

### Heading Level 3

#### Heading Level 4

This slide tests all heading sizes.

---

# Text Formatting

    **Bold text** for emphasis
    *Italic text* for subtle emphasis
    ~~Strikethrough~~ for deleted content
    `inline code` for technical terms

Mix **bold and _italic_** together

---

# Links and References

    Visit [Alkalye](https://alkalye.com) for more
    Check the [documentation](https://docs.example.com)
    Email us at [hello@example.com](mailto:hello@example.com)

Links should be styled distinctly from body text.

---

# Unordered Lists

    - First item in the list
    - Second item with more detail
    - Third item to complete the trio
    - Fourth item for good measure
    - Fifth item because why not

Lists should have consistent spacing and bullet styling.

---

# Ordered Lists

    1. First step in the process
    2. Second step follows naturally
    3. Third step brings us closer
    4. Fourth step is almost there
    5. Fifth and final step

Numbered lists for sequential content.

---

Mixed Lists

    - Category one
    - Category two
    - Category three

.

    1. Step one
    2. Step two
    3. Step three

Two columns with different list types.

---

# Blockquotes

    > The best way to predict the future is to create it.
    > - Peter Drucker

Quotes for emphasis and attribution.

---

# Long Blockquote

    > This is a longer quote that spans multiple lines to test how the theme handles text wrapping within blockquotes. It should maintain readability and proper line height throughout.

Testing quote wrapping behavior.

---

# Code Block - JavaScript

```javascript
function greet(name) {
	const message = `Hello, ${name}!`
	console.log(message)
	return message
}

greet("World")
```

Syntax highlighting for JavaScript code.

---

# Code Block - TypeScript

```typescript
interface User {
	id: string
	name: string
	email: string
	createdAt: Date
}

function createUser(data: Partial<User>): User {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date(),
		...data,
	} as User
}
```

TypeScript with type annotations.

---

# Code Block - CSS

```css
.theme-container {
	--background: #ffffff;
	--foreground: #1a1a1a;
	--accent: #3b82f6;

	background-color: var(--background);
	color: var(--foreground);
	font-family: system-ui, sans-serif;
}

.theme-container a {
	color: var(--accent);
	text-decoration: underline;
}
```

CSS custom properties and selectors.

---

# Code Block - Python

```python
def fibonacci(n: int) -> list[int]:
    """Generate Fibonacci sequence up to n terms."""
    if n <= 0:
        return []

    sequence = [0, 1]
    while len(sequence) < n:
        sequence.append(sequence[-1] + sequence[-2])

    return sequence[:n]

print(fibonacci(10))
```

Python with type hints and docstrings.

---

# Code Block - Bash

```bash
#!/bin/bash

# Deploy script
echo "Starting deployment..."

git pull origin main
bun install
bun run build

echo "Deployment complete!"
```

Shell scripts for automation.

---

# Simple Table

| Feature   | Status |
| --------- | ------ |
| Themes    | Done   |
| Presets   | Done   |
| Fonts     | Done   |
| Templates | Done   |

Basic two-column table.

---

# Complex Table

| Property   | Type  | Default | Description        |
| ---------- | ----- | ------- | ------------------ |
| background | color | #fff    | Main background    |
| foreground | color | #000    | Text color         |
| accent     | color | #00f    | Links & highlights |
| heading    | color | inherit | Heading color      |

Tables with multiple columns.

---

Image - External URL

    ![Mountain landscape](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600)

Images from external sources.

---

Two Column Layout

# Left Side

    Content for the left column
    Can include multiple items

# Right Side

    Content for the right column
    Balanced layout test

Testing two-column layouts.

---

Three Column Layout

# One

    First column

# Two

    Second column

# Three

    Third column

Testing three-column grid.

---

Mixed Content Block

# Code + Text

```javascript
const x = 42
```

    The answer to everything

Combining code with explanatory text.

---

Large Heading Test

# Short

Testing how themes handle very short headings.

---

# Very Long Heading That Spans Multiple Lines

    Testing how the theme handles extremely long headings that need to wrap to multiple lines while maintaining readability

Long heading stress test.

---

Dense Text Block

    This block contains a substantial amount of text to test how the theme handles larger paragraphs. Line height, letter spacing, and font size all contribute to readability. A good theme maintains comfortable reading even with dense content.

.

    A second paragraph tests spacing between blocks. The gap should be consistent and provide visual separation without being excessive.

Paragraph density test.

---

# Special Characters

    Curly quotes: "Hello" and 'World'
    Dashes: em dash --- and en dash --
    Ellipsis: ...
    Arrows: -> <- <-> => <= <=>
    Math: + - * / = != < > <= >=

Testing character rendering.

---

# Emoji Support

    Reactions: 	Presentation complete!

Emoji rendering test.

---

Thank You

## Questions?

    Contact: assmann@hey.com
    Website: alkalye.com

End of kitchen sink presentation.
