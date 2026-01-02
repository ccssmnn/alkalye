# Alkalye

Beautiful, End-to-end encrypted markdown editor with real-time collaboration and presentation mode.

**[alkalye.com](https://alkalye.com)**

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

- [Jazz](https://jazz.tools) for local-first sync and encryption
- Tanstack Router + React 19 + Vite 7
- Tailwind CSS + shadcn/ui
- CodeMirror 6 editor

## Development

Requires [Bun](https://bun.sh). Starting your dev environment is as easy as:

```bash
bun install

cp .env.example .env

bunx jazz-sync run # start sync server

bun run dev
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

[MIT](./LICENSE)

© 2025 Carl Assmann
