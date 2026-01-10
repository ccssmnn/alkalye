# Kitchen Sink Preview

A comprehensive test document for all preview/document theme elements.

## Typography Showcase

This document tests every element that themes can customize. Use it to verify your theme looks correct across all content types.

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

---

## Text Formatting

Regular paragraph text forms the foundation of any document. Good themes ensure comfortable reading with appropriate line height, letter spacing, and font size.

**Bold text** stands out for emphasis. Use it sparingly for maximum impact.

_Italic text_ provides subtle emphasis or marks foreign terms and titles.

**_Bold and italic_** combined when you really need to make a point.

~~Strikethrough text~~ marks deleted or outdated content.

`Inline code` appears in monospace for technical terms, file names, and short code snippets.

---

## Links

External links: [Visit Alkalye](https://alkalye.com)

Links with titles: [Alkalye Documentation](https://docs.alkalye.com "Official Docs")

Email links: [Contact us](mailto:hello@alkalye.com)

---

## Blockquotes

> A single-line blockquote for short quotes or callouts.

> This is a longer blockquote that spans multiple lines. It tests how the theme handles text wrapping within quote blocks. Good themes maintain readability and visual distinction from regular text.
>
> Blockquotes can contain multiple paragraphs. Each paragraph should have appropriate spacing while maintaining the quote styling throughout.

> Nested quotes are useful for conversations:
>
> > This is a nested quote within the outer quote.

---

## Lists

### Unordered Lists

- First item in the unordered list
- Second item with some additional text
- Third item to round things out
- Fourth item because three is too few
- Fifth item for good measure

Nested unordered lists:

- Top level item
  - Nested item one
  - Nested item two
    - Deeply nested item
    - Another deeply nested
  - Back to second level
- Another top level item

### Ordered Lists

1. First step in the process
2. Second step follows naturally
3. Third step brings us closer
4. Fourth step is almost there
5. Fifth and final step

Nested ordered lists:

1. Main point one
   1. Sub-point A
   2. Sub-point B
      1. Detail i
      2. Detail ii
   3. Sub-point C
2. Main point two

### Task Lists

- [x] Completed task with checkmark
- [x] Another finished item
- [ ] Pending task awaiting completion
- [ ] Yet another task to do

---

## Code Blocks

### JavaScript

```javascript
// A comprehensive JavaScript example
function createTheme(options) {
	const { name, colors, fonts } = options

	return {
		name,
		css: generateCSS(colors),
		variables: {
			"--background": colors.background,
			"--foreground": colors.foreground,
			"--accent": colors.accent,
		},
		fontFamily: fonts.body || "system-ui",
	}
}

const myTheme = createTheme({
	name: "Custom Theme",
	colors: {
		background: "#ffffff",
		foreground: "#1a1a1a",
		accent: "#3b82f6",
	},
	fonts: {
		body: "Inter, sans-serif",
	},
})

export default myTheme
```

### TypeScript

```typescript
interface ThemeColors {
	background: string
	foreground: string
	accent: string
	heading?: string
	link?: string
	codeBackground?: string
}

interface ThemePreset {
	name: string
	appearance: "light" | "dark"
	colors: ThemeColors
	fonts?: {
		title?: string
		body?: string
	}
}

function validatePreset(preset: ThemePreset): boolean {
	const { colors } = preset
	return Boolean(colors.background && colors.foreground && colors.accent)
}
```

### CSS

```css
/* Theme CSS Example */
[data-theme="my-theme"] {
	--background: var(--preset-background, #ffffff);
	--foreground: var(--preset-foreground, #1a1a1a);
	--accent: var(--preset-accent, #3b82f6);

	background-color: var(--background);
	color: var(--foreground);
}

[data-theme="my-theme"] a {
	color: var(--accent);
	text-decoration: underline;
	text-underline-offset: 2px;
}

[data-theme="my-theme"] a:hover {
	text-decoration-thickness: 2px;
}

[data-theme="my-theme"] h1,
[data-theme="my-theme"] h2,
[data-theme="my-theme"] h3 {
	color: var(--preset-heading, var(--foreground));
	font-family: var(--preset-font-title, inherit);
}
```

### HTML

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Theme Template</title>
	</head>
	<body>
		<article data-document>
			<!-- Document content renders here -->
		</article>
	</body>
</html>
```

### JSON

```json
{
	"version": 1,
	"name": "My Custom Theme",
	"author": "Theme Author",
	"description": "A beautiful theme for Alkalye",
	"type": "preview",
	"css": "theme.css",
	"template": "template.html",
	"presets": "presets.json",
	"fonts": [{ "name": "Inter", "path": "fonts/Inter.woff2" }]
}
```

### Python

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class ThemeColors:
    background: str
    foreground: str
    accent: str
    heading: Optional[str] = None
    link: Optional[str] = None

@dataclass
class Theme:
    name: str
    colors: ThemeColors

    def to_css_variables(self) -> dict[str, str]:
        return {
            '--background': self.colors.background,
            '--foreground': self.colors.foreground,
            '--accent': self.colors.accent,
        }
```

### Bash

```bash
#!/bin/bash

# Theme packaging script
THEME_NAME="my-theme"
OUTPUT_DIR="dist"

echo "Packaging theme: $THEME_NAME"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Copy theme files
cp theme.json "$OUTPUT_DIR/"
cp -r css/ "$OUTPUT_DIR/"
cp -r fonts/ "$OUTPUT_DIR/"

# Create zip archive
zip -r "$OUTPUT_DIR/$THEME_NAME.zip" "$OUTPUT_DIR/"

echo "Theme packaged: $OUTPUT_DIR/$THEME_NAME.zip"
```

---

## Tables

### Simple Table

| Feature      | Status    |
| ------------ | --------- |
| CSS Styling  | Supported |
| Presets      | Supported |
| Custom Fonts | Supported |
| Templates    | Supported |

### Table with Alignment

| Left Aligned | Center Aligned | Right Aligned |
| :----------- | :------------: | ------------: |
| Text         |      Text      |          Text |
| More text    |   More text    |     More text |
| Even more    |   Even more    |     Even more |

### Complex Table

| Property         | Type  | Required | Default    | Description           |
| ---------------- | ----- | -------- | ---------- | --------------------- |
| `background`     | color | Yes      | -          | Main background color |
| `foreground`     | color | Yes      | -          | Primary text color    |
| `accent`         | color | Yes      | -          | Links and highlights  |
| `heading`        | color | No       | foreground | Heading text color    |
| `codeBackground` | color | No       | muted      | Code block background |

---

## Images

Images from external URLs are displayed inline:

![Mountain landscape at sunset](https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800)

Images can have captions using the alt text.

---

## Horizontal Rules

Content above the rule.

---

Content below the rule.

---

Another rule style.

---

And another variation.

---

## Special Characters

### Typography

- Curly quotes: "Hello" and 'World'
- Straight quotes: "Hello" and 'World'
- Em dash: text—more text
- En dash: 2020–2024
- Ellipsis: and so on...
- Apostrophe: it's, don't, won't

### Symbols

- Copyright: ©
- Registered: ®
- Trademark: ™
- Degree: 25°C
- Multiplication: 3 × 4
- Division: 12 ÷ 3

### Arrows

- Right arrow: →
- Left arrow: ←
- Up arrow: ↑
- Down arrow: ↓
- Double arrow: ↔
- Fat arrow: ⇒

---

## Mathematical Content

Inline math-like content: The formula is x² + y² = r².

Fractions: ½, ¼, ¾, ⅓, ⅔

Superscripts and subscripts: H₂O, E=mc², x^n

---

## Emoji Support

Common emojis should render correctly:

- Faces: 😀 😊 🤔 😎 🥳
- Hands: 👍 👎 👋 🤝 👏
- Objects: 💻 📱 📚 🎨 🎵
- Symbols: ✅ ❌ ⚠️ ℹ️ ❤️
- Nature: 🌟 🌈 🔥 💧 🌸

---

## Long Content Test

This paragraph contains a substantial amount of text designed to test how themes handle longer content blocks. Proper line height and letter spacing are crucial for comfortable reading. The theme should maintain consistent spacing and prevent text from feeling cramped or too sparse. A good reading experience comes from careful attention to these typographic details.

When multiple paragraphs follow each other, the spacing between them should provide clear visual separation without excessive gaps. This helps readers track their position in the document and understand the structure of the content.

The final paragraph in a section should have the same treatment as others. Themes should not add extra spacing at the end of containers that might cause inconsistent layouts.

---

## Edge Cases

### Very Long Words

Supercalifragilisticexpialidocious and pneumonoultramicroscopicsilicovolcanoconiosis test word wrapping.

### Empty Elements

Paragraph before empty content.

Paragraph after empty content.

### Adjacent Code Blocks

```javascript
const first = "block"
```

```javascript
const second = "block"
```

### Mixed Inline Formatting

This paragraph contains **bold**, _italic_, `code`, and [links](https://example.com) all **mixed _together_ with `varying`** [combinations](https://example.com).

---

## Conclusion

This kitchen sink document covers all standard markdown elements that preview themes should style. Test your theme against this document to ensure complete coverage.

Happy theming!
