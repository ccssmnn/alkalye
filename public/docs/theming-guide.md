# Theming Guide

Complete guide to creating custom themes for Alkalye preview and slideshow modes.

## Overview

Alkalye supports two theme types:

- **Preview themes** - Style the document preview (rendered markdown)
- **Slideshow themes** - Style presentations with color presets

Themes are packaged as `.zip` files with a `theme.json` manifest.

---

## Quick Start

### Minimal Preview Theme

```
my-theme/
├── theme.json
└── styles.css
```

**theme.json:**

```json
{
	"version": 1,
	"name": "My Theme",
	"type": "preview",
	"css": "styles.css"
}
```

**styles.css:**

```css
[data-theme] {
	font-family: Georgia, serif;
}

[data-theme] h1 {
	color: #2563eb;
}
```

Zip the folder and upload in Settings > Themes.

---

## Theme Package Structure

### Full Structure

```
theme-name/
├── theme.json          # Required: manifest
├── theme.css           # Required: styles
├── template.html       # Optional: custom HTML structure
├── presets.json        # Optional: color presets (slideshow)
├── thumbnail.png       # Optional: preview image
└── fonts/              # Optional: custom fonts
    ├── MyFont.woff2
    └── MyFont-Bold.woff2
```

### theme.json Schema

```json
{
	"version": 1,
	"name": "Theme Name",
	"author": "Your Name",
	"description": "Theme description",
	"type": "preview | slideshow | both",
	"css": "theme.css",
	"template": "template.html",
	"presets": "presets.json",
	"fonts": [
		{ "name": "MyFont", "path": "fonts/MyFont.woff2" },
		{ "name": "MyFont-Bold", "path": "fonts/MyFont-Bold.woff2" }
	],
	"thumbnail": "thumbnail.png"
}
```

| Field         | Required | Description                         |
| ------------- | -------- | ----------------------------------- |
| `version`     | Yes      | Always `1`                          |
| `name`        | Yes      | Theme display name                  |
| `type`        | Yes      | `preview`, `slideshow`, or `both`   |
| `css`         | Yes      | Path to CSS file                    |
| `author`      | No       | Theme author                        |
| `description` | No       | Short description                   |
| `template`    | No       | Custom HTML template (preview only) |
| `presets`     | No       | Color presets file (slideshow)      |
| `fonts`       | No       | Array of font files                 |
| `thumbnail`   | No       | Preview image                       |

---

## CSS Selectors

### Theme Container

Theme CSS uses `[data-theme]` to scope styles. You can use either:

- `[data-theme]` - Matches any active theme (simpler, recommended)
- `[data-theme="Theme Name"]` - Matches only your specific theme (stricter)

```css
[data-theme] {
	/* Global styles for this theme */
}

[data-theme] h1 {
	/* Heading styles */
}
```

### Mode-Specific Selectors

Alkalye renders content in three modes, each with different DOM structures:

| Mode      | Attribute                              | Container Structure                               |
| --------- | -------------------------------------- | ------------------------------------------------- |
| Preview   | `data-theme` only                      | `<div data-theme><article>...</article></div>`    |
| Slideshow | `data-theme` + `data-mode="slideshow"` | `<div data-mode="slideshow" data-theme>...</div>` |
| Print     | Uses `@media print`                    | Same as preview                                   |

Use these patterns to target specific modes:

```css
/* Preview only (article wrapper exists) */
[data-theme] article h1 { ... }

/* Slideshow only */
[data-mode="slideshow"] h1 { ... }

/* Print only */
@media print {
	[data-theme] article { ... }
}

/* Both preview and slideshow (no article selector) */
[data-theme] h1 { ... }
```

### Preview Mode

Preview mode wraps content in an `article` element:

```html
<div data-theme="Theme Name">
	<article class="prose">
		<h1>...</h1>
		<p>...</p>
	</article>
</div>
```

Use `[data-theme] article` to target preview content:

```css
[data-theme] article {
	font-family: var(--preset-font-body, system-ui);
	line-height: 1.8;
}

[data-theme] article h1,
[data-theme] article h2,
[data-theme] article h3 {
	font-family: var(--preset-font-title, inherit);
	color: var(--preset-heading, var(--preset-foreground));
}

[data-theme] article p {
	margin-bottom: 1.5em;
}

[data-theme] article a {
	color: var(--preset-link, var(--preset-accent));
	text-decoration: underline;
}

[data-theme] article code {
	background: var(--preset-code-background, #f1f5f9);
	padding: 0.2em 0.4em;
	border-radius: 0.25em;
}

[data-theme] article pre {
	background: var(--preset-code-background, #1e293b);
	padding: 1em;
	border-radius: 0.5em;
	overflow-x: auto;
}

[data-theme] article blockquote {
	border-left: 4px solid var(--preset-accent);
	padding-left: 1em;
	font-style: italic;
}

[data-theme] article table {
	width: 100%;
	border-collapse: collapse;
}

[data-theme] article th,
[data-theme] article td {
	border: 1px solid #e2e8f0;
	padding: 0.5em;
}
```

### Slideshow Mode

Slideshow mode uses `data-mode="slideshow"` and has a grid-based structure:

```html
<div data-mode="slideshow" data-theme="Theme Name" data-appearance="light">
	<div class="slideshow-grid">
		<div class="slideshow-cell">
			<h1>Slide Title</h1>
			<p>Content</p>
		</div>
	</div>
</div>
```

Use `[data-mode="slideshow"]` for slideshow-specific styles:

```css
/* Slideshow container */
[data-mode="slideshow"] {
	background: var(--preset-background);
	color: var(--preset-foreground);
}

/* Slideshow headings */
[data-mode="slideshow"] h1 {
	font-family: var(--preset-font-title, inherit);
	color: var(--preset-heading, var(--preset-foreground));
}

[data-mode="slideshow"] h2,
[data-mode="slideshow"] h3 {
	color: var(--preset-heading, var(--preset-foreground));
}

/* Slideshow text */
[data-mode="slideshow"] p {
	line-height: 1.6;
}

/* Slideshow links */
[data-mode="slideshow"] a {
	color: var(--preset-link, var(--preset-accent));
}

/* Slideshow lists */
[data-mode="slideshow"] ul,
[data-mode="slideshow"] ol {
	padding-left: 1.5em;
}

/* Slideshow blockquotes */
[data-mode="slideshow"] blockquote {
	border-left: 4px solid var(--preset-accent);
	padding-left: 1em;
}

/* Slideshow code */
[data-mode="slideshow"] code {
	background: var(--preset-code-background, rgba(127, 127, 127, 0.15));
}
```

#### Slideshow CSS Variables

Slideshow mode provides additional variables for scaling:

```css
--slide-h1-size    /* Computed h1 font size */
--slide-body-size  /* Computed body font size */
--slide-scale      /* Scale factor (0.05 to 1.0) */
```

These are calculated automatically based on content and viewport.

### Print Mode

Print styles apply when exporting to PDF or printing:

```css
@media print {
	[data-theme] article {
		max-width: none;
		font-size: 11pt;
	}

	/* Prevent page breaks inside elements */
	[data-theme] article h1,
	[data-theme] article h2,
	[data-theme] article h3 {
		page-break-after: avoid;
		break-after: avoid;
	}

	[data-theme] article pre,
	[data-theme] article blockquote,
	[data-theme] article table {
		page-break-inside: avoid;
		break-inside: avoid;
	}

	/* Hide elements not needed in print */
	.no-print {
		display: none;
	}
}
```

### Supporting Both Preview and Slideshow

For themes with `type: "both"`, use mode-specific selectors:

```css
/* Shared styles (both modes) */
[data-theme] {
	font-family: var(--preset-font-body, system-ui);
}

/* Preview-specific */
[data-theme] article h1 {
	font-size: 2.5em;
	text-align: left;
}

/* Slideshow-specific */
[data-mode="slideshow"] h1 {
	font-size: var(--slide-h1-size);
	text-align: center;
}
```

Preview selectors (`[data-theme] article`) won't match slideshow content. Slideshow selectors (`[data-mode="slideshow"]`) won't match preview content.

---

## CSS Variables

### Preset Variables

When a preset is selected, these CSS variables are available:

```css
/* Core colors */
--preset-background      /* Main background */
--preset-foreground      /* Text color */
--preset-accent          /* Primary accent */

/* Accent palette */
--preset-accent-1        /* Same as --preset-accent */
--preset-accent-2        /* Additional accent color */
--preset-accent-3        /* Additional accent color */
--preset-accent-4        /* Additional accent color */
--preset-accent-5        /* Additional accent color */
--preset-accent-6        /* Additional accent color */

/* Optional colors */
--preset-heading         /* Heading color (if specified) */
--preset-link            /* Link color (if specified) */
--preset-code-background /* Code block background */

/* Fonts */
--preset-font-title      /* Heading font family */
--preset-font-body       /* Body font family */

/* Metadata */
--preset-appearance      /* "light" or "dark" */
```

### Theme Aliases

For convenience, these aliases are also set:

```css
--theme-background       /* Same as --preset-background */
--theme-foreground       /* Same as --preset-foreground */
--theme-accent          /* Same as --preset-accent */
```

### Using Variables with Fallbacks

Always provide fallbacks for optional variables:

```css
[data-theme] h1 {
	color: var(--preset-heading, var(--preset-foreground));
	font-family: var(--preset-font-title, inherit);
}

[data-theme] a {
	color: var(--preset-link, var(--preset-accent));
}

[data-theme] pre {
	background: var(--preset-code-background, #1e293b);
}
```

---

## Color Presets

### presets.json Format

Presets define color schemes for slideshows. The file must contain an object with a `presets` array:

```json
{
	"presets": [
		{
			"name": "Light",
			"appearance": "light",
			"colors": {
				"background": "#ffffff",
				"foreground": "#1a1a1a",
				"accent": "#3b82f6",
				"accents": ["#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
				"heading": "#0f172a",
				"link": "#2563eb",
				"codeBackground": "#f1f5f9"
			},
			"fonts": {
				"title": "MyFont-Bold",
				"body": "MyFont"
			}
		},
		{
			"name": "Dark",
			"appearance": "dark",
			"colors": {
				"background": "#0f172a",
				"foreground": "#f1f5f9",
				"accent": "#60a5fa",
				"heading": "#ffffff",
				"link": "#93c5fd",
				"codeBackground": "#1e293b"
			},
			"fonts": {
				"title": "MyFont-Bold",
				"body": "MyFont"
			}
		}
	]
}
```

### Preset Schema

| Field                   | Required | Description                         |
| ----------------------- | -------- | ----------------------------------- |
| `name`                  | Yes      | Preset display name                 |
| `appearance`            | Yes      | `"light"` or `"dark"`               |
| `colors.background`     | Yes      | Background color                    |
| `colors.foreground`     | Yes      | Text color                          |
| `colors.accent`         | Yes      | Primary accent                      |
| `colors.accents`        | No       | Additional accent colors            |
| `colors.heading`        | No       | Heading color                       |
| `colors.link`           | No       | Link color                          |
| `colors.codeBackground` | No       | Code block background               |
| `fonts.title`           | No       | Heading font (must match font name) |
| `fonts.body`            | No       | Body font (must match font name)    |

### Auto-selecting Presets

Slideshows automatically select a preset based on:

1. Explicit `preset: PresetName` in frontmatter
2. Matching `appearance` to the current theme (light/dark)
3. First preset as fallback

---

## HTML Templates

### Preview Templates

Templates customize the HTML structure around document content:

**template.html:**

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
	</head>
	<body>
		<div class="my-theme-wrapper">
			<article data-document>
				<!-- Document content renders here -->
			</article>
		</div>
	</body>
</html>
```

The `[data-document]` attribute marks where content is injected.

### Template Restrictions

Templates are sanitized for security:

- No `<script>` tags
- No event handlers (`onclick`, etc.)
- No external resources (except fonts)
- No iframes or embeds

---

## Custom Fonts

### Font Files

Include font files in your theme package:

```
my-theme/
├── theme.json
├── styles.css
└── fonts/
    ├── MyFont-Regular.woff2
    ├── MyFont-Bold.woff2
    └── MyFont-Italic.woff2
```

### Font Configuration

**theme.json:**

```json
{
	"fonts": [
		{ "name": "MyFont", "path": "fonts/MyFont-Regular.woff2" },
		{ "name": "MyFont-Bold", "path": "fonts/MyFont-Bold.woff2" },
		{ "name": "MyFont-Italic", "path": "fonts/MyFont-Italic.woff2" }
	]
}
```

### Using Fonts in CSS

Fonts are loaded with `@font-face` automatically. Use them by name:

```css
[data-theme] {
	font-family: "MyFont", system-ui, sans-serif;
}

[data-theme] h1 {
	font-family: "MyFont-Bold", "MyFont", system-ui, sans-serif;
}

[data-theme] em {
	font-family: "MyFont-Italic", "MyFont", system-ui, sans-serif;
}
```

### Fonts in Presets

Reference fonts in presets for dynamic switching:

```json
{
	"fonts": {
		"title": "MyFont-Bold",
		"body": "MyFont"
	}
}
```

Then use the CSS variables:

```css
[data-theme] {
	font-family: var(--preset-font-body, "MyFont");
}

[data-theme] h1 {
	font-family: var(--preset-font-title, "MyFont-Bold");
}
```

### Supported Font Formats

| Format   | Extension | MIME Type    |
| -------- | --------- | ------------ |
| WOFF2    | `.woff2`  | `font/woff2` |
| WOFF     | `.woff`   | `font/woff`  |
| TrueType | `.ttf`    | `font/ttf`   |
| OpenType | `.otf`    | `font/otf`   |

WOFF2 is recommended for best compression.

---

## Using Themes

### Applying Themes

Set the theme in document frontmatter:

```yaml
---
theme: My Theme
---
# Document content
```

For slideshows with presets:

```yaml
---
mode: presentation
theme: My Theme
preset: Dark
---
# Slide content
```

### Default Themes

Set default themes in Settings > Themes:

- **Default Preview Theme** - Applied to all preview mode documents
- **Default Slideshow Theme** - Applied to all presentations

Document frontmatter overrides defaults.

### Theme Precedence

1. Frontmatter `theme` field
2. Default theme setting
3. No theme (system defaults)

---

## Compatibility

### iA Writer Templates

Alkalye imports iA Writer templates (`.iatemplate` bundles):

- Converts to preview theme type
- Extracts CSS from all stylesheets
- Imports embedded fonts
- Preserves template HTML structure

### iA Presenter Themes

Alkalye imports iA Presenter themes (`.iapresentertheme` bundles):

- Converts to slideshow theme type
- Imports presets from `presets.json`
- Imports fonts from `fonts/` directory

---

## Best Practices

### CSS Guidelines

1. **Always scope to theme name** - Prevent style leakage
2. **Use CSS variables** - Enable preset customization
3. **Provide fallbacks** - Handle missing preset values
4. **Test both appearances** - Verify light and dark modes
5. **Mind specificity** - Theme styles should override defaults

### Preset Guidelines

1. **Include light and dark** - Match system preferences
2. **Ensure contrast** - WCAG AA minimum (4.5:1 for text)
3. **Test code blocks** - Syntax highlighting visibility
4. **Consider links** - Distinct from body text

### Performance

1. **Use WOFF2 fonts** - Smallest file size
2. **Limit font variants** - Only include what you use
3. **Optimize images** - Compress thumbnails
4. **Minimize CSS** - Remove unused rules

---

## Testing

### Kitchen Sink Documents

Test your theme against the kitchen sink documents:

- `kitchen-sink-preview.md` - All preview elements
- `kitchen-sink-presentation.md` - All slideshow elements

### Checklist

**Typography:**

- [ ] All heading levels (h1-h6)
- [ ] Body text readability
- [ ] Bold, italic, strikethrough
- [ ] Inline code

**Content:**

- [ ] Links (hover state)
- [ ] Blockquotes
- [ ] Ordered and unordered lists
- [ ] Nested lists
- [ ] Tables
- [ ] Horizontal rules

**Code:**

- [ ] Inline code
- [ ] Code blocks (multiple languages)
- [ ] Syntax highlighting visibility

**Media:**

- [ ] Images
- [ ] Image captions

**Colors:**

- [ ] Light mode contrast
- [ ] Dark mode contrast
- [ ] Accent color usage
- [ ] Link visibility

**Fonts:**

- [ ] Font loading
- [ ] Fallback fonts
- [ ] Different weights

---

## Troubleshooting

### Theme Not Applied

- Verify theme name matches exactly (case-sensitive)
- Check frontmatter syntax
- Ensure theme is uploaded

### Fonts Not Loading

- Check font path in theme.json
- Verify file extension matches
- Ensure font file is in zip

### Presets Not Working

- Validate presets.json syntax
- Check required fields (name, appearance, colors)
- Verify color values are valid CSS

### CSS Not Affecting Elements

- Check selector specificity
- Verify `[data-theme="..."]` matches
- Inspect in browser dev tools

### Template Errors

- Ensure `[data-document]` element exists
- Check for forbidden elements (scripts)
- Validate HTML syntax

---

## Examples

### Minimal Preview Theme

```css
[data-theme] {
	font-family: "Helvetica Neue", Arial, sans-serif;
	line-height: 1.7;
}

[data-theme] article h1 {
	font-size: 2.5em;
	font-weight: 300;
	margin-bottom: 0.5em;
}

[data-theme] article a {
	color: #0066cc;
	text-decoration: none;
	border-bottom: 1px solid currentColor;
}
```

### Slideshow Theme with Presets

```css
/* Base styles for both modes */
[data-theme] {
	font-family: var(--preset-font-body, "Arial", sans-serif);
}

/* Slideshow-specific */
[data-mode="slideshow"] {
	background: var(--preset-background);
	color: var(--preset-foreground);
}

[data-mode="slideshow"] h1 {
	font-family: var(--preset-font-title, inherit);
	color: var(--preset-heading, var(--preset-foreground));
}
```

```json
{
	"presets": [
		{
			"name": "Professional Light",
			"appearance": "light",
			"colors": {
				"background": "#f8fafc",
				"foreground": "#1e293b",
				"accent": "#0284c7"
			}
		},
		{
			"name": "Professional Dark",
			"appearance": "dark",
			"colors": {
				"background": "#0f172a",
				"foreground": "#e2e8f0",
				"accent": "#38bdf8"
			}
		}
	]
}
```

---

## Resources

- Kitchen Sink Preview: `/docs/kitchen-sink-preview.md`
- Kitchen Sink Presentation: `/docs/kitchen-sink-presentation.md`
- Example themes in the community gallery

Happy theming!
