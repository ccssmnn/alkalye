# Alkalye

End-to-end encrypted markdown editor with real-time collaboration and presentation mode.

**[alkalye.com](https://alkalye.com)**

<!-- TODO: Add screenshots -->

## Features

- **E2E Encrypted** — Your documents are encrypted on your device before syncing
- **Real-time Collaboration** — Share documents and edit together with live cursors
- **Presentation Mode** — Turn markdown into slideshows with `mode: present` frontmatter
- **Teleprompter Mode** — Present with auto-scrolling text
- **Offline-First** — Works without internet, syncs when back online (PWA)
- **Focus Mode** — Distraction-free writing environment
- **Image Assets** — Upload and embed images in your documents
- **Portable** — Settings stored in frontmatter, export as standard `.md` files anytime

## Tech Stack

- React 19 + Vite 7
- [Jazz](https://jazz.tools) for local-first sync and encryption
- CodeMirror 6 editor
- TanStack Router
- Tailwind CSS + shadcn/ui

## Development

Requires [Bun](https://bun.sh).

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build for production
bun run build
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

[O'Saasy License](./LICENSE) — MIT-like, but prohibits offering this software as a competing SaaS.

© 2025 Carl Assmann
