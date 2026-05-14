# Context

Domain glossary. Architecture vocabulary lives elsewhere; this file is for the things the product is _about_.

## Document

The primary CoValue users edit. Markdown content + title + sharing state. Lives in the user's personal list or inside a Space. Owns its sharing model, backlinks, and wikilink resolution.

## Space

A group-shared container of Documents. Membership and roles are scoped per Space.

## Editor

The markdown editing surface. Domain-agnostic: knows markdown syntax (including wikilink syntax) but not what a Document is. Receives all domain behavior — wikilink resolution, wikilink navigation, document-screen actions (preview, download, print) — as callbacks from the caller.

## Wikilink

`[[id]]` syntax in markdown, used to create links between Documents. The **Editor** defines the syntax and renders decorations. The **Document** layer provides resolution (id → title, exists) and navigation as callbacks passed into the Editor.

## Extension Slot

The `extensions` prop on `MarkdownEditor`, accepting CodeMirror `Extension[]`. A seam where features that aren't part of the Editor's core identity (e.g. Presentation overlays) can attach behavior without the Editor depending on them.
