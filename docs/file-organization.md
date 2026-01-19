# File Organization

## Module Structure

1. **Imports**
2. **Export declarations** - `export { }` immediately after imports
3. **Main functions/components**
4. **Helper functions, types, constants** at bottom

## Component Modules (.tsx)

```tsx
import { useState } from "react"
import { Button } from "@/components/ui/button"

export { FileMenu }

function FileMenu({ doc }) {
  // UI state and rendering
}

// Custom hooks (after component)

// Handler factories (after hooks)
function makeDownload(doc: LoadedDocument) { ... }
```

## Tool/API Modules (.ts)

1. Main operation functions (like `updateReminder`)
2. Helper functions
3. Constants, errors, type definitions
4. AI tool definitions last
