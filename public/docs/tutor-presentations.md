---
path: Tutor
size: M
mode: presentation
---

# Presentations in Alkalye
  > Learn to present with Markdown

This text has no indentation - it's a speaker note.
Only you see it in the teleprompter. Try editing this doc!

---

# Slide content vs speaker notes

  indented text appears on the slide
  Use a tab or 2+ spaces at the start

Regular text becomes speaker notes.
The audience never sees this.

This also appears in the teleprompter

---

# Enable presentation mode

```yaml
---
mode: present
---
```

Add this frontmatter at the top:

Now your document is a presentation!

---

# Creating multiple slides
  Use `---` to create slide breaks

Each horizontal rule starts a new slide.
This text is a speaker note for this slide.

---

Visual blocks and layout

# Left column

# Right column

Blank lines between slide content create columns.
1 block = centered, 2 = side by side, 3+ = grid.

---

# Single centered block
## Carl Assmann
# Amazing TypeScript Talk

No blank line between these headings.
They form one centered block.

---

# Try it: edit this slide
  - Add a blank line between the items below
  - See how the layout changes

Currently these are one block.
Add a blank line between them to make two columns!

---

# Lists on slides
  - Indent lists to show them
  - Each item needs a tab or 2 spaces
  - Like this example

- Non-indented lists are speaker notes
- Use them for talking points
- The audience won't see these

---

# Code blocks
```javascript
// Code blocks always appear on slides
function greet() {
	return "Hello!"
}
```

Explain your code in speaker notes.
The audience sees the code, you see these notes.

---

# Images
![Demo](https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=600)

Images always appear on slides.
Add context in your speaker notes.

---

# Blockquotes
  > Indented quotes appear on slides
  > Add a tab before the `>`

> Non-indented quotes are speaker notes
> Useful for reminding yourself of key phrases

---

# Tables
| Feature       | On Slide |
| ------------- | -------- |
| Headings      | Yes      |
| Indented text | Yes      |
| Code blocks   | Yes      |
| Images        | Yes      |
| Tables        | Yes      |
| Regular text  | No       |

Tables always appear on slides.

---

# Presentation settings
```yaml
---
mode: present
size: M (S, M or L)
theme: dark (or light)
---
```

Size controls text scaling.
Theme overrides system preference.

---

# Presenting
  Open the slideshow from the toolbar
  Arrow keys to navigate
  `F` for fullscreen
  `Escape` to exit

The teleprompter shows your notes alongside slides.
Open it in a separate window while presenting.

---

# Quick reference
  **On slide:** Headings, indented text, code, images, tables
  **Speaker notes:** Everything else
  **Layout:** Blank lines create columns
  **Slides:** Separated by `---`

---

# You're ready!
  Create a new document
  Add `mode: present`
  Start presenting!

Try editing this tutor to see changes live.
Happy presenting!

