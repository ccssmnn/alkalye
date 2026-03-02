# Agent Instructions

Offline-capable PWA built with Jazz (local-first sync), Astro, and React.

## Essentials

- **Bun** - use `bun install`, `bun add`, `bun run` (no npm/yarn)
- **Verify:** `bun run check` (lint, types, format, tests)
- **React Compiler** - never use `useMemo`, `useCallback`, `React.memo`

## Architecture

- **Framework:** Astro 5 with React 19 integration
- **Routing:** Tanstack Router (auto-generated route tree)
- **Data:** Jazz (CoValues for documents, spaces, themes, presence)
- **Storage:** IndexedDB via idb-keyval + Jazz sync
- **PWA:** vite-plugin-pwa with offline caching and file handlers
- **Testing:** Vitest + happy-dom/jsdom

## Style

- High information density
- Top-down readability
- `let` over `const`, `function` over arrow for named functions
- No default exports
- No `any`, no type casts - fix types properly
- Comments explain WHY, not WHAT (prefer no comments)

## Detailed Guides

- [TypeScript](docs/typescript.md) - general coding style, types, tryCatch
- [React Components](docs/react-components.md) - handler factories, routes, forms
- [Jazz Patterns](docs/jazz.md) - CoValue types, queries
- [File Organization](docs/file-organization.md) - module structure, exports
