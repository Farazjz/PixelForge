# PixelForge AI — Pixel Art Studio

A professional pixel-art creation studio that combines a powerful manual pixel editor with optional, provider-independent AI generation and editing.

> Built as a web application (Next.js 16 + React + TypeScript + Tailwind CSS + shadcn/ui) that runs entirely client-side for editing — no internet connection or AI API is required for manual work.

## Features

### Manual pixel editor
- 12 tools: pencil, eraser, bucket fill, color replace, line, rectangle, ellipse, eyedropper, text, select, move, pan
- Symmetry drawing (horizontal / vertical), dither patterns, tolerance-based fills
- Layers with opacity, lock, visibility, rename, reorder, merge
- Frames for animation with per-frame duration, onion skinning, looping playback
- Unlimited undo/redo, selections with floating-pixel moves, clipboard
- Canvas resize with 9-point anchoring, nearest-neighbor artwork scaling, crop to content
- Median-cut color quantization, background removal, 1px outlining

### AI Studio (optional)
- Text-to-pixel-art generation with prompt templates, style presets, palette limiting, transparent background and outline post-processing
- AI-assisted editing: image-to-image edit (custom providers) and guided recolor suggestions (structured JSON from the chat model)
- Bring-your-own provider: any OpenAI-compatible endpoint with your API key, models, timeout and retry settings — the built-in provider is one option, never a requirement

### Import / Export
- Import PNG / JPEG / WebP / BMP / GIF (multi-frame), sprite-sheet slicing, `.pfa` native projects
- Drag-and-drop or paste images directly onto the canvas
- Export PNG / JPEG / WebP / BMP (nearest-neighbor, integer scales 1×–8×), looping animated GIF, sprite sheets, per-frame ZIP, palette JSON
- Native `.pfa` project format (JSON, fully validated on load)
- Cloud project saving (Prisma + SQLite) or download project files

## Getting started

```bash
bun install
bun run db:push   # initialize the SQLite database
bun run dev       # start the dev server
```

Open the app, and start drawing — or open **Settings → AI Providers** to connect your own AI endpoint.

## Tech stack

| Layer      | Choice                                          |
| ---------- | ----------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling    | Tailwind CSS 4 + shadcn/ui (New York)           |
| State      | Zustand (editor, settings, HUD stores)          |
| Database   | Prisma ORM + SQLite                             |
| AI         | z-ai-web-dev-sdk (built-in) / OpenAI-compatible |
| Codecs     | gifuct-js (GIF decode), gifenc (GIF encode), jszip |

## Project structure

```
src/
  app/
    page.tsx              # studio entry (client-rendered)
    api/
      ai/                 # generate / edit / chat / test-connection
      projects/           # cloud save + list + load + delete
  components/
    pixelforge/           # app shell, canvas, panels, dialogs
    ui/                   # shadcn/ui component library
  lib/
    pixelforge/
      engine.ts           # raster engine: strokes, fills, transforms, quantize, .pfa codec
      store.ts            # Zustand editor store (document, tools, history)
      import-utils.ts     # GIF decoding, sprite-sheet slicing
      export-utils.ts     # BMP encoder, animated GIF, ZIP
      palettes.ts         # preset palettes + AI prompt templates
      settings-store.ts   # AI provider profiles (localStorage)
prisma/schema.prisma      # Project model
docs/SPECIFICATION.md     # original product specification
```

## Keyboard shortcuts

`B` pencil · `E` eraser · `G` bucket · `L` line · `R` rect · `O` ellipse · `I` eyedropper · `T` text · `M` move · `V` select · `H` pan · `X` swap colors · `Ctrl+Z/Shift+Z` undo/redo · `Ctrl+C/X/V` copy/cut/paste · `Ctrl+S` save project · `Ctrl+N/O/E` new/open/export · `0` fit · `1` actual size · `+/-` zoom
