# Master Development Prompt: PixelForge AI — Windows Pixel Art Studio

## 1. Project Overview

Act as a senior desktop software engineer, pixel-art editor developer, UI/UX designer, and AI integration specialist.

Build a professional Windows desktop application named **PixelForge AI**, a pixel-art creation studio that combines a powerful manual pixel-art editor with AI-assisted generation and editing.

The application must allow users to:

1. Create pixel art manually from a blank canvas.
2. Generate pixel art using natural-language prompts and an external or locally hosted AI model.
3. Import AI-generated images and convert them into clean, editable pixel art.
4. Refine, recolor, animate, and export pixel art using traditional editing tools.
5. Connect their own AI API endpoint, API key, and model, without depending on a proprietary AI provider.

The result must be a real, working Windows desktop application, not merely a mockup or UI prototype.

### Core product philosophy

- Manual editing must work without an internet connection or an AI API.
- AI must be optional and provider-independent.
- All generated pixel art must be editable on a pixel-by-pixel basis.
- Preserve sharp pixel edges without unwanted blur or antialiasing.
- Prioritize performance, usability, and a polished desktop experience.
- Prefer free and open-source libraries and avoid mandatory subscriptions.

## 2. Target Platform and Technology Stack

Build the application primarily for Windows 10 and Windows 11, x64.

Recommended technology stack:

- **Desktop framework:** Tauri 2.
- **Frontend:** React + TypeScript.
- **Build tool:** Vite.
- **UI styling:** Tailwind CSS with a consistent component system.
- **State management:** Zustand or an equivalent lightweight solution.
- **Pixel canvas rendering:** HTML Canvas 2D or a suitable WebGL renderer.
- **Image processing:** Rust backend where appropriate, plus browser-compatible image-processing libraries.
- **Local persistence:** SQLite for project metadata and settings, with local file storage for project assets.
- **Project format:** A documented native project format containing layers, palettes, frames, metadata, and image data.
- **Testing:** Vitest for frontend logic and Playwright or an appropriate desktop testing solution for end-to-end tests.

Use compatible, maintained dependencies. If Tauri introduces excessive complexity for the development agent, Electron with React and TypeScript is an acceptable fallback. Do not mix the two frameworks.

The final application must be packaged as a Windows installer or a portable Windows executable.

## 3. Main Application Interface

Design a polished pixel-art workstation with a dark theme by default.

### Main layout

**A. Top menu and toolbar**

- File
- Edit
- Canvas
- Image
- Layer
- Animation
- Palette
- AI Studio
- View
- Settings
- Help

Include quick actions for new project, open, save, undo, redo, zoom, grid, animation playback, and AI generation.

**B. Left vertical toolbar**

Include drawing and selection tools with recognizable icons and keyboard shortcuts.

**C. Central canvas workspace**

- Pixel-perfect rendering.
- Zoom from approximately 25% to 3200%, subject to performance.
- Pan using Space + drag or middle mouse button.
- Optional pixel grid at high zoom levels.
- Canvas background options: transparent, solid color, checkerboard.
- Fit canvas, actual-size view, and center canvas.
- Optional tiled preview for repeating textures.

**D. Right sidebar**

Provide switchable panels for:

- Layers.
- Color palette.
- Color picker.
- Tool properties.
- AI generation and editing.
- Animation timeline.
- Canvas properties.

**E. Bottom status bar**

Show canvas dimensions, zoom percentage, cursor coordinates, selected tool, active color, and relevant operation progress.

Allow users to resize panels, collapse sidebars, and customize the workspace.

## 4. Manual Pixel-Art Editor

This is the primary functionality and must work independently of AI.

### 4.1 Canvas creation

Allow custom canvas dimensions, including presets:

- 8 × 8
- 16 × 16
- 32 × 32
- 48 × 48
- 64 × 64
- 96 × 96
- 128 × 128
- 256 × 256
- 512 × 512

Users must also be able to enter custom width and height.

Include presets for:

- Game sprites.
- Characters.
- Tilesets.
- Icons.
- Game objects.
- Backgrounds.
- Textures.
- Isometric assets.

Canvas size and zoom must remain separate properties.

### 4.2 Drawing tools

Implement the following tools:

1. Pencil — draw individual pixels.
2. Eraser — erase pixels to transparency.
3. Paint Bucket — fill connected areas with a selected color.
4. Fill All — replace a selected color across the image or layer.
5. Line — draw straight pixel lines.
6. Rectangle — outline or filled rectangles.
7. Ellipse — outline or filled ellipses.
8. Eyedropper — sample a pixel color.
9. Color Picker — choose exact RGBA or HEX values.
10. Selection — rectangular selection and move.
11. Lasso Selection — optional advanced selection.
12. Move — move selected content or layers.
13. Pan — move the viewport.
14. Text — render text into a pixel-art layer using a selected font and rasterization settings.
15. Gradient — optional, with dithering and limited-palette options.
16. Dithering Brush — optional advanced shading tool.

All drawing tools must respect the active layer and selection.

Support mouse input and pressure sensitivity where feasible, without making pressure-sensitive hardware mandatory.

### 4.3 Pixel-art quality tools

Implement:

- Bresenham-style pixel line rendering.
- Crisp nearest-neighbor scaling.
- Optional constrained line angles.
- Symmetry drawing: horizontal, vertical, and both axes.
- Pixel-perfect cleanup options.
- Optional 1-pixel outline generation.
- Palette reduction.
- Color replacement.
- Flood-fill tolerance settings for imported raster images.
- Nearest-neighbor resize.
- Nearest-neighbor rotation and flipping.
- Sprite cropping.
- Image trimming.
- Checkerboard transparency preview.

Never silently blur or smooth the canvas during ordinary drawing or pixel-art export.

### 4.4 Editing operations

Support:

- Undo and redo.
- Cut, copy, and paste.
- Duplicate layer.
- Duplicate selection.
- Flip horizontally and vertically.
- Rotate 90 degrees.
- Crop to selection.
- Resize canvas without resizing artwork.
- Resize artwork with selectable nearest-neighbor scaling.
- Clear layer.
- Merge down.
- Flatten image.
- Select all.
- Deselect.
- Lock and hide layers.

Undo/redo must handle drawing strokes as coherent operations rather than creating one history entry per pointer movement.

Use an efficient history system that avoids storing a complete duplicate of the entire document after every pixel change.

### 4.5 Layers

Implement:

- Multiple layers.
- Layer names.
- Visibility.
- Locking.
- Reordering.
- Opacity.
- Duplicate.
- Delete.
- Merge down.
- Grouping if practical.
- Layer thumbnails.
- Layer-specific undo where feasible.

The canvas must correctly composite RGBA layers while preserving transparent pixels.

### 4.6 Color palettes

Implement:

- Built-in pixel-art palettes.
- Custom palette creation.
- Palette import and export.
- Palette locking.
- Color swatches.
- HEX and RGBA input.
- Recent colors.
- Palette size limits.
- Automatic palette extraction from an image.
- Palette reduction for AI-generated or imported artwork.

Provide sample palettes such as PICO-8-inspired colors and other appropriately licensed palettes. Do not bundle copyrighted assets without permission.

## 5. AI Studio: Generate Pixel Art from Prompts

AI integration is a major product feature.

The user must be able to enter a natural-language prompt, configure generation settings, and generate images using their own AI service.

Example prompt:

> Create a 32x32 pixel-art red mushroom with a cream-colored stem, dark outlines, a limited 12-color palette, transparent background, and a retro RPG style.

The AI interface must include:

- Prompt input.
- Optional negative prompt.
- Width and height.
- Art style.
- Palette constraints.
- Transparent background preference.
- Outline preference.
- Level of detail.
- Seed, when supported.
- Number of results, when supported.
- Generate button.
- Cancel button where the provider supports cancellation.
- Progress and error messages.
- Generation history.
- Preview gallery.
- Import into editor.
- Save generated image.
- Regenerate and vary options.

Include suggested prompt templates for:

- RPG characters.
- Enemies and monsters.
- Weapons and equipment.
- Food and collectibles.
- Buildings.
- Trees and plants.
- Terrain tiles.
- Isometric objects.
- UI icons.
- Animated sprite concepts.
- Game backgrounds.

### 5.1 AI-generated image requirements

Do not assume that an image-generation model can generate exact pixel dimensions, transparent backgrounds, or perfectly aligned pixel grids.

Instead, implement a robust processing pipeline:

1. Send the prompt to the configured provider.
2. Receive an image or image URL, depending on the provider response.
3. Decode the image safely.
4. Resize or resample to the target canvas dimensions using nearest-neighbor scaling when appropriate.
5. Offer color quantization to a specified palette size.
6. Preserve alpha transparency when supported.
7. Provide an optional transparent-background removal workflow.
8. Offer edge cleanup and pixel-art outline processing.
9. Display the processed result for review.
10. Allow the user to import the result as a new layer, replace the current layer, or create a new document.

Never overwrite existing artwork without explicit confirmation.

Provide a before/after preview so users can compare the original generated image with the pixel-art-converted version.

### 5.2 AI-assisted editing

Support an AI-assisted editing workflow in which the user can describe changes to existing artwork.

Example:

> Change the sword from blue to silver, preserve its shape, keep the transparent background, and use no more than 8 colors.

Provide two modes:

**Mode A: Image-to-image editing**

Send the selected image and editing instructions to a compatible image-editing endpoint when the configured provider supports it.

**Mode B: Guided manual editing**

When image editing is unavailable, use the AI response to generate structured instructions, such as:

- Suggested replacement colors.
- Palette mappings.
- Pixel coordinates or bounded edit regions.
- Layer creation instructions.
- Step-by-step manual editing suggestions.

Do not falsely claim that a text-only model has edited an image.

Preserve the original artwork and apply changes to a duplicate layer or a new document unless the user explicitly chooses otherwise.

### 5.3 AI-assisted creation from structured output

Where possible, support models or services that return structured pixel data.

For example, allow a compatible model to return a JSON array of palette indices or a compact representation of a sprite. Validate dimensions, palette indexes, and data length before importing.

Treat structured pixel data as an optional advanced capability, not a requirement for every AI provider.

## 6. Universal AI Provider Configuration

The user must supply their own API configuration.

Do not hardcode an OpenAI API key or make a proprietary provider mandatory.

### 6.1 Provider settings

Create a settings screen with:

- Provider display name.
- API base URL.
- API key.
- Text model identifier.
- Image-generation model identifier.
- Image-editing model identifier.
- Optional organization or project identifier.
- Request timeout.
- Maximum retry count.
- Custom request headers, if enabled safely.
- Test Connection button.
- Save Configuration button.
- Provider capability detection.

Allow multiple saved provider profiles.

Support localhost and private-network endpoints, including services hosted on the same computer.

Examples of configurable endpoints may include:

- OpenAI-compatible hosted APIs.
- Local OpenAI-compatible inference servers.
- Self-hosted image-generation services.
- Other services implementing compatible chat or image endpoints.

Do not assume all OpenAI-compatible APIs support image generation. Detect capabilities independently.

### 6.2 Provider adapter architecture

Build a provider-independent architecture.

Suggested TypeScript interfaces:

```typescript
interface AIProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  textModel?: string;
  imageModel?: string;
  editModel?: string;
  timeoutMs: number;
}

interface AIProviderCapabilities {
  chat: boolean;
  imageGeneration: boolean;
  imageEditing: boolean;
  imageInput: boolean;
  structuredOutput: boolean;
  streaming: boolean;
}

interface PixelArtAIProvider {
  testConnection(): Promise<ConnectionTestResult>;
  getCapabilities(): Promise<AIProviderCapabilities>;

  generateImage(
    request: ImageGenerationRequest
  ): Promise<GeneratedImageResult>;

  editImage?(
    request: ImageEditRequest
  ): Promise<GeneratedImageResult>;

  chat?(
    request: TextGenerationRequest
  ): Promise<TextGenerationResult>;
}
```

Adapt the interfaces and request types to the chosen implementation.

Implement a shared provider interface with separate adapters for chat completion, image generation, and image editing. A provider may implement only some of these features.

### 6.3 API compatibility

Support, where applicable:

- OpenAI-compatible `/v1/chat/completions`.
- Compatible image-generation endpoints.
- Compatible image-editing endpoints.
- Configurable model names.
- JSON responses containing base64 image data or image URLs.
- Data URLs where returned by the provider.
- Streaming text responses when supported.

Do not assume a single response schema across all providers. Use explicit adapters and validate incoming responses.

Provide an extensible adapter system for future providers.

### 6.4 Local and remote AI

The application must function in three configurations:

1. **Manual-only mode:** No AI configuration required.
2. **Local AI mode:** Connect to a model or image-generation server running on localhost or a private network.
3. **Remote AI mode:** Connect to a user-configured API endpoint with an optional API key.

Allow users to disable external network access for AI features.

Do not send artwork, prompts, telemetry, or project data to any external service unless required for an explicitly requested operation.

### 6.5 API security

Implement the following:

- Store API keys in Windows Credential Manager or another suitable OS-backed secure storage mechanism.
- Never embed API keys in frontend source code.
- Never log API keys.
- Mask API keys in the UI.
- Never include API keys in exported project files.
- Allow users to remove saved credentials.
- Validate endpoint URLs.
- Show clear errors for authentication failures, unsupported models, rate limits, network errors, and malformed responses.

Use the desktop backend as the secure boundary for sensitive credentials and network requests where practical.

## 7. Import, Conversion, and Export

### Supported imports

At minimum:

- PNG.
- JPEG.
- WebP.
- BMP.

Also support:

- GIF import, where practical.
- Sprite sheets.
- Existing native project files.

For imported images, offer:

- Original-size import.
- Resize to canvas.
- Crop to canvas.
- Create new document.
- Import as a layer.
- Pixel-art conversion workflow.

### Supported exports

At minimum:

- PNG with transparency.
- JPEG with configurable background.
- BMP.
- WebP, where supported.

Advanced exports:

- Sprite sheet.
- Animated GIF.
- Individual animation frames.
- JSON palette and metadata.
- Aseprite-compatible interchange where feasible.

Do not claim native Aseprite compatibility unless the relevant file specification has been implemented and tested.

Use nearest-neighbor scaling for pixel-art exports. Allow integer-scale enlargement, such as 2x, 3x, 4x, and 8x.

The exported image must not include editor UI, guides, grid lines, or selection borders unless the user explicitly requests them.

## 8. Animation and Sprite Sheets

Treat animation as an important advanced feature.

Implement a timeline with:

- Frames.
- Frame duplication.
- Frame deletion.
- Frame reordering.
- Per-frame duration.
- Playback controls.
- Loop preview.
- Onion skinning.
- Animation preview.
- Sprite sheet export.

Allow a user to draw individual frames manually and duplicate or edit existing frames.

AI-assisted animation generation should be optional and provider-dependent. Do not promise that the model will preserve character consistency between frames.

A practical initial version can provide a working frame timeline and manual animation editing, with more advanced animation features implemented later.

## 9. Native Project Format and File Management

Create a documented project format, such as `.pfa`.

A project should preserve:

- Canvas width and height.
- Layer names and order.
- Layer visibility and opacity.
- RGBA pixel data.
- Palette definitions.
- Frame information.
- Animation timing.
- Canvas background settings.
- Project metadata.
- Optional generation metadata, excluding secrets.

Use a versioned schema to support future migrations.

A compressed archive containing a manifest and PNG-based layer assets is acceptable for an initial implementation. Alternatively, use a custom binary format if it is clearly documented and tested.

Implement:

- New Project.
- Open Project.
- Save.
- Save As.
- Reopen recent projects.
- Recent files list.
- Unsaved-changes warning.
- Autosave or recovery snapshots.
- Crash recovery where practical.

Never overwrite a file without appropriate confirmation.

## 10. Suggested Architecture

Organize the project into modular components.

```text
pixelforge-ai/
├── src/
│   ├── app/
│   ├── components/
│   │   ├── Toolbar/
│   │   ├── Canvas/
│   │   ├── LayerPanel/
│   │   ├── PalettePanel/
│   │   ├── Timeline/
│   │   └── AIStudio/
│   ├── editor/
│   │   ├── tools/
│   │   ├── rendering/
│   │   ├── history/
│   │   ├── selections/
│   │   └── operations/
│   ├── ai/
│   │   ├── providers/
│   │   ├── adapters/
│   │   ├── image-processing/
│   │   └── prompt-templates/
│   ├── projects/
│   ├── palettes/
│   ├── animation/
│   ├── export/
│   ├── state/
│   ├── storage/
│   ├── types/
│   └── utils/
├── src-tauri/
│   ├── src/
│   ├── capabilities/
│   └── tauri.conf.json
├── tests/
├── docs/
├── package.json
└── README.md
```

Adjust this structure when needed, but maintain separation between the editor engine, UI, persistence, AI providers, and image-processing pipeline.

## 11. Performance Requirements

The application should remain responsive during ordinary drawing and image editing.

Requirements:

- Avoid rerendering the entire React interface for every pixel.
- Keep drawing operations inside a dedicated rendering layer.
- Use efficient pointer event handling.
- Use request coalescing or appropriate stroke batching.
- Implement dirty-region redraws where beneficial.
- Use image buffers and efficient layer compositing.
- Move expensive image-processing operations off the UI thread or into the backend.
- Use background workers for quantization and large image conversions when appropriate.
- Provide progress feedback for lengthy operations.
- Handle high-DPI displays correctly.
- Avoid unbounded undo-history memory consumption.
- Gracefully handle unsupported image dimensions and insufficient memory.

Start with reliable performance on common sprite sizes, including 16×16, 32×32, 64×64, 128×128, and 256×256.

## 12. User Experience Requirements

Create a coherent, polished, professional interface rather than a generic AI dashboard.

Design principles:

- Dark theme by default.
- Optional light theme.
- Crisp icons.
- Tooltips.
- Keyboard shortcuts.
- Context menus.
- Clear active-tool indicators.
- Helpful empty states.
- Non-blocking progress indicators.
- Accessible text contrast.
- Resizable panels.
- Consistent spacing and typography.

Important shortcuts:

- Ctrl+N: New.
- Ctrl+O: Open.
- Ctrl+S: Save.
- Ctrl+Shift+S: Save As.
- Ctrl+Z: Undo.
- Ctrl+Y: Redo.
- B: Pencil.
- E: Eraser.
- G: Fill.
- I: Eyedropper.
- M: Selection.
- Space + drag: Pan.
- Plus/minus: Zoom.
- X: Swap foreground/background colors.
- D: Reset colors.

Shortcuts must not interfere with ordinary text input in prompts or settings.

## 13. Privacy, Safety, and Reliability

- Manual editing must remain available when AI services fail.
- Handle timeouts, cancellations, and connection failures gracefully.
- Validate file contents before importing.
- Limit unreasonable image dimensions and memory allocations.
- Sanitize imported filenames.
- Avoid executing imported project content.
- Prevent accidental project data loss.
- Clearly distinguish local processing from remote AI processing.
- Make telemetry disabled by default unless explicitly configured.
- Never expose API keys in logs, crash reports, or project files.
- Document which AI operations transmit data to a remote provider.

## 14. Implementation Roadmap

Develop in milestones. Do not attempt to implement every feature simultaneously.

### Milestone 1 — Desktop foundation

- Set up the Windows desktop framework.
- Create the main application shell.
- Implement the menu, toolbar, sidebars, and theme.
- Configure project builds and basic automated tests.
- Produce a working development build.

**Acceptance:** The application launches and the workspace renders correctly.

### Milestone 2 — Core pixel editor

- Canvas creation.
- Zoom and pan.
- Pencil and eraser.
- Color selection.
- Grid.
- Undo and redo.
- PNG import and export.

**Acceptance:** A user can create artwork, draw, erase, undo, save, reopen, and export it.

### Milestone 3 — Layers and advanced drawing

- Layers.
- Selection and move.
- Line, rectangle, ellipse, fill, and eyedropper tools.
- Palette management.
- Image transformations.
- Improved history management.

**Acceptance:** The application supports a practical manual pixel-art workflow.

### Milestone 4 — Native projects

- Versioned project format.
- Open and save.
- Recent files.
- Recovery mechanisms.
- Import and export improvements.

**Acceptance:** Projects can be reopened without losing layers, colors, or dimensions.

### Milestone 5 — AI provider infrastructure

- Provider settings.
- Secure API-key storage.
- Localhost support.
- Connection testing.
- Chat and image capability detection.
- Error handling.
- Provider adapters.

**Acceptance:** Users can configure and test their own compatible API without modifying source code.

### Milestone 6 — AI image generation

- Prompt editor.
- Generation parameters.
- Image request pipeline.
- Preview gallery.
- Image conversion and palette reduction.
- Import as a layer or new document.

**Acceptance:** A working compatible image-generation endpoint can generate an image that the user can import and edit.

### Milestone 7 — AI-assisted editing

- Image-to-image workflow.
- Duplicate-layer editing.
- Before/after comparison.
- Guided editing fallback.
- Generation history.

**Acceptance:** Supported image-editing providers can modify artwork, and unsupported providers receive clear capability messages.

### Milestone 8 — Animation and advanced features

- Timeline.
- Frame editing.
- Playback.
- Onion skinning.
- Sprite sheets.
- Animated export.

**Acceptance:** A user can create and export a basic animated sprite.

### Milestone 9 — Testing and Windows packaging

- Automated unit tests.
- End-to-end tests.
- API mock tests.
- Windows installer or portable package.
- Application icon and metadata.
- README and user documentation.
- Final clean-build verification.

**Acceptance:** A clean installation on a supported Windows system launches and supports the core workflow without requiring development tools.

## 15. Testing Requirements

Test at least the following:

1. Draw a pixel and verify its exact RGBA value.
2. Undo and redo a complete drawing stroke.
3. Save and reopen a multilayer project.
4. Verify transparent pixels survive export and import.
5. Verify nearest-neighbor scaling preserves sharp edges.
6. Import and process an image larger than the target canvas.
7. Verify fill operations do not leak outside the intended connected region.
8. Test malformed API responses.
9. Test invalid API keys and HTTP 401/403 errors.
10. Test rate limits and timeouts.
11. Test a local endpoint that is unavailable.
12. Test a provider that supports text but not image generation.
13. Verify API keys never appear in logs or project files.
14. Verify canceling AI generation does not corrupt the document.
15. Verify existing artwork remains unchanged when generation fails.
16. Test keyboard shortcuts while editing prompts and settings.
17. Test export dimensions, palette conversion, and transparency.
18. Test frame duplication, playback, and sprite sheet export.
19. Verify the application launches on a clean Windows installation.
20. Verify manual editing works without network access or configured AI credentials.

## 16. Budget and Dependency Constraints

Prefer free and open-source dependencies.

Do not require:

- A paid cloud backend.
- A mandatory subscription.
- A proprietary AI service.
- A remote database.
- An account or registration system.
- An internet connection for ordinary manual editing.

Users are responsible for any charges imposed by the AI provider they configure.

Do not include a bundled paid model or require paid model downloads.

## 17. Required Deliverables

Produce the following:

1. Complete source code.
2. Windows desktop application.
3. Windows installer or portable executable.
4. README with installation and development instructions.
5. AI provider configuration documentation.
6. Example configuration with placeholder values only.
7. Documentation for adding new AI providers.
8. Automated tests for critical functionality.
9. Sample pixel-art palettes and legally usable starter assets.
10. A known limitations document.
11. A roadmap identifying features that are fully implemented versus deferred.

Do not claim that a feature is implemented merely because its UI exists.

## 18. Instructions to the Vibe Coding Agent

Work incrementally and verify each milestone before moving to the next.

At the beginning:

1. Inspect the available development environment.
2. Confirm the selected desktop framework and dependency compatibility.
3. Create the project structure.
4. Establish the core data model and rendering strategy.
5. Implement the minimum viable pixel editor first.
6. Run the application and tests.
7. Fix errors before proceeding.

For each milestone:

- Explain the intended changes briefly.
- Implement the feature in the actual project.
- Run relevant tests and builds.
- Fix regressions.
- Update the README and implementation checklist.
- Identify incomplete functionality honestly.

Do not replace working functionality with mock data or decorative controls.

Do not leave important buttons nonfunctional.

Do not implement AI generation by simply displaying a placeholder image.

Do not hardcode API endpoints, API keys, or model names.

If an API does not support image generation, explain the limitation and allow manual editing and any supported AI features to continue working.

When a design decision is unclear, choose the simplest robust implementation consistent with the requirements, and document the decision rather than stopping unnecessarily.

**Final objective:** Deliver a polished, reliable Windows pixel-art studio that combines a capable manual editor with an extensible bring-your-own-AI architecture, allowing users to create pixel art from scratch, generate it with their preferred AI service, and refine every pixel afterward.
