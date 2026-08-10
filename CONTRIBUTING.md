# Contributing to DocMint

## Table of Contents

1. [Development Setup](#development-setup)
2. [Code Style & Conventions](#code-style--conventions)
3. [Pull Request Process](#pull-request-process)
4. [Document Preview & SVG Data URIs](#document-preview--svg-data-uris)
5. [Testing](#testing)

---

## Development Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/your-org/docmint.git
   cd docmint
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy `.env.example` to `.env.local` and fill in the required values:

   ```bash
   cp .env.example .env.local
   ```

   See `docs/google-oauth-setup.md` for OAuth configuration.

4. **Start the database**

   ```bash
   docker compose -f docker/docker-compose.yml up -d
   ```

5. **Run migrations & seed**

   ```bash
   npx prisma migrate dev
   npx prisma db seed
   ```

6. **Start the dev server**

   ```bash
   npm run dev
   ```

---

## Code Style & Conventions

### General

- **TypeScript strict mode** is enabled. Avoid `any` unless absolutely necessary.
- Use **named exports** over default exports.
- Use **functional components** with hooks (no class components).
- Use `'use client'` directive only when hooks, event handlers, or browser APIs are needed.
- Server Components are preferred when possible (no state, no effects).

### Naming

| Category | Convention | Example |
|----------|-----------|---------|
| Components | PascalCase | `DocumentEditor` |
| Utilities | camelCase | `formatDate()` |
| Types/Interfaces | PascalCase | `TemplateData` |
| Files (components) | kebab-case | `document-editor.tsx` |
| Files (utilities) | kebab-case | `image-placeholders.ts` |
| API routes | kebab-case | `create-order/route.ts` |

### Imports

Order imports by:

1. React / Next.js
2. Third-party libraries
3. `@/components/*`
4. `@/lib/*`
5. `@/types`
6. Relative imports (used sparingly)

### CSS

- Use **Tailwind CSS** utility classes.
- Avoid inline styles (`style={{}}`) unless dynamic values are needed.
- Use Shadcn UI components where possible (`Button`, `Card`, `Input`, etc.).

---

## Pull Request Process

1. Create a feature branch from `main`.
2. Keep changes focused — one feature/fix per PR.
3. Ensure TypeScript compiles cleanly: `npx tsc --noEmit`
4. Ensure the app builds: `npm run build`
5. Update or add tests if applicable.
6. Add JSDoc comments for any non-obvious logic, especially Chrome-specific workarounds.
7. Request review from at least one maintainer.

---

## Document Preview & SVG Data URIs

### The Problem

DocMint renders document previews inside **sandboxed iframes** for CSS/style isolation:

```tsx
<iframe
  srcDoc={previewHtml}
  sandbox="allow-same-origin"
  // ...
/>
```

**Chrome/Chromium has a known limitation:** SVG data URIs used in `<img>` tags will not load when the page is rendered inside a sandboxed iframe (`sandbox="allow-same-origin"`). This produces persistent console errors like:

```
Error loading svg data:data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/...
```

This occurs because the sandbox restricts how data URIs are treated, and SVG data URIs in particular are affected — the browser fails to fetch and render them.

### The Solution: `replaceSvgDataUris()`

The utility function `replaceSvgDataUris()` in `src/lib/utils/image-placeholders.ts` solves this by converting `<img>` tags with SVG data URI sources into their equivalent **inline `<svg>` elements** before the HTML is injected into the iframe.

**Before (broken in sandboxed iframe):**

```html
<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0c..." alt="Logo" />
```

**After (works in sandboxed iframe):**

```html
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80">
  <!-- SVG content renders directly in DOM -->
</svg>
```

Inline SVGs render directly in the DOM with no fetch step, so they are **not affected by the sandbox restriction**.

### Where It Must Be Used

Any code path that injects HTML into a sandboxed iframe via `srcDoc`/`srcdoc` **must** call `replaceSvgDataUris()` on the HTML string first.

Current locations (keep these up to date):

| File | Context |
|------|---------|
| `src/app/templates/[id]/page.tsx` | Template detail preview |
| `src/app/instant/[slug]/page.tsx` | Instant download preview |
| `src/lib/engine/document-engine.ts` | Server-side document generation (`wrapStyledHtml`) |
| `src/app/api/documents/share/[token]/download/route.ts` | Shared document download |

### Adding to a New Page

If you create a new page that renders a document preview inside a sandboxed iframe:

1. Import the function:
   ```ts
   import { replaceSvgDataUris } from '@/lib/utils/image-placeholders';
   ```

2. Call it on the HTML **before** setting `srcDoc`:
   ```ts
   html = replaceSvgDataUris(html);
   ```

3. The function handles both base64-encoded (`data:image/svg+xml;base64,...`) and URL-encoded (`data:image/svg+xml,%3Csvg...`) SVG data URIs.

### Defense in Depth

Alongside `replaceSvgDataUris()`, the preview pipeline also adds `onerror` handlers to all `<img>` tags:

```ts
html = html.replace(
  /(<img\s[^>]*?)(?:(?:\s+onerror\s*=\s*['"][^'"]*['"]))?([^>]*>)/gi,
  (match, before, existingOnerror, after) => {
    if (existingOnerror) return match;
    return `${before} onerror="this.style.display='none'"${after}`;
  }
);
```

This ensures any remaining img tags that fail to load (for any reason) are silently hidden rather than showing a broken image icon.

### The PDF Path Is the Inverse (`rasterizeSvgPlaceholders`)

The client-side PDF path (`jsPDF`'s `doc.html()`, used in `templates/[id]/page.tsx` and `instant/[slug]/page.tsx`) renders through `html2canvas`, which **cannot load SVG in any form** — inline `<svg>` elements log `"Error loading svg data:..."` and base64 SVG data-URI `<img>` tags log `"Error loading image data:image/svg+xml;base64,..."`. Both spam the console and drop the placeholder images from the PDF.

So the PDF path must do the **reverse** of `replaceSvgDataUris`: call `rasterizeSvgPlaceholders(html)` (in `src/lib/utils/image-placeholders.ts`) right before `doc.html()`. It converts every inline `<svg>` (and leftover SVG data-URI `<img>`) into a PNG data-URI `<img>` via a browser `<canvas>` — PNGs load fine in html2canvas. It is a no-op in non-DOM (server) environments, so it is safe to call unconditionally. If you add a new client-side `doc.html()` call site, apply it there too.

### Why Not Use `dangerouslySetInnerHTML` Instead?

Pages like the document editor (`documents/[id]/edit/page.tsx`) and the shared document view (`share/[token]/page.tsx`) render HTML directly with `dangerouslySetInnerHTML` — these are **not affected** by the SVG data URI issue because they render in the main page DOM, not inside a sandboxed iframe. The only pages that need `replaceSvgDataUris` are those using sandboxed iframes for preview isolation.

---

## Testing

### Type checking

```bash
npx tsc --noEmit
```

### Linting

```bash
npm run lint
```

### Building

```bash
npm run build
```

### Manual testing

For preview-related changes, always check the browser console for `"Error loading svg data:..."` errors. If present, confirm that `replaceSvgDataUris()` is being called on the HTML before it's rendered in the sandboxed iframe.
