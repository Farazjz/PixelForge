# PixelForge AI — Shared Worklog

---
Task ID: 1
Agent: orchestrator (Z.ai Code)
Task: Core engine foundation for PixelForge AI pixel-art studio

Work Log:
- Read spec upload/PixelForge_AI_Windows_Pixel_Art_Studio_Prompt.md (899 lines)
- Created src/lib/pixelforge/types.ts — ToolId, Layer/Frame/PFDocument, FloatingSelection, HistoryEntry, AIProfile, PFAFile
- Created src/lib/pixelforge/engine.ts — Bresenham line, rect/ellipse (fill+outline), flood fill w/ tolerance, replace color, flip/rotate90, extract/clear region, bbox, 1px outline, straight-alpha compositing, NN scaling, median-cut quantize, bg removal, color map, text rasterizer, .pfa serialize/deserialize w/ validation
- Created src/lib/pixelforge/palettes.ts — PICO-8, Sweetie16, GameBoy, Mono, Grayscale, ForgeWarm + 11 AI prompt templates
- Created src/lib/pixelforge/store.ts — Zustand editor store: stroke engine (pencil/eraser/bucket/replace/line/rect/ellipse/eyedropper/text/select/move), symmetry, dither patterns, selection+floating, layers, frames, history (pixels+doc snapshots, memory-capped), transforms, palette ops, view/zoom/pan
- Created src/lib/pixelforge/settings-store.ts — AI provider profiles (builtin Z.ai + custom BYO), localStorage persisted; HUD cursor store
- Typecheck passes (excluding pre-existing examples/skills errors)

Stage Summary:
- STORE CONTRACT (read src/lib/pixelforge/store.ts before touching state):
  useEditorStore: doc, activeFrameId, activeLayerId, tool, toolOptions, primary, secondary, recentColors, selection, floating, clipboard, view{zoom,panX,panY}, viewport, gridVisible, onionSkin, playing, pixelVersion, structureVersion, dirty, projectId
  Pixel changes bump pixelVersion; structural changes bump structureVersion — components react via these counters.
  Key actions: newDoc/loadDoc/setDocName, resizeCanvas/scaleArtwork/cropToContent/cropToSelection, setZoom/zoomBy/panBy/fitToViewport/actualSize/centerCanvas/setViewport, setTool/setToolOptions/setPrimary/setSecondary/swapColors/resetColors, strokeBegin(x,y,button,shift)->bool/strokeMove/strokeEnd, setSelection/selectAll/deselect/cutSelection/copySelection/pasteClipboard/deleteSelection/moveFloating/commitFloating, addLayer/deleteLayer/duplicateLayer/mergeDown/moveLayer/updateLayer/clearLayer/setActiveLayer, setActiveFrame/addFrame/deleteFrame/moveFrame/updateFrame, flip/rotate/addOutline/quantizeActiveLayer/importImageIntoDoc(data,w,h,'new-layer'|'replace-layer'), setDocPalette/addPaletteColor/removePaletteColor, undo/redo
  useSettingsStore (settings-store.ts): profiles, activeProfileId, autosaveEnabled, hydrate(), upsertProfile/deleteProfile/setActiveProfile, getActiveProfile(). BUILTIN_PROFILE_ID='builtin'.
  useHudStore: setCursor({x,y}|null)
- WINDOW EVENT CONTRACT (MenuBar/dialogs ↔ shortcuts): CustomEvents on window: 'pf:menu-new','pf:menu-open','pf:menu-export','pf:menu-settings','pf:menu-resize','pf:menu-about','pf:menu-save','pf:menu-cloud-save','pf:toggle-theme'

---
Task ID: 2-a
Agent: menu-dialogs-subagent
Task: MenuBar + dialogs

Work Log:
- Created src/components/pixelforge/MenuBar.tsx — h-11 dark zinc app bar; 4-square pixel logo (violet/amber/emerald/rose); full Menubar (File/Edit/Canvas/Image/Layer/Animation/Palette/AI Studio/View/Help) wired to store actions via useEditorStore.getState() in onSelect handlers; reactive disabling for Undo/Redo/Paste/Deselect/Crop-to-Selection/Delete-or-Merge/Move layer/Delete frame (narrow zustand selectors: stack lengths, clipboard/selection presence, layer/frame counts + active index, background, primary, playing, grid, onion, zoom); Background submenu is a MenubarRadioGroup bound to doc.background; Quantize submenu (4/8/16/32/64) calls quantizeActiveLayer directly + "Reduce Colors…" dispatches pf:quantize; right-side quick actions (New/Open/Save/CloudSave/Undo/Redo/ZoomOut/zoom % readout→actualSize/ZoomIn/Fit/Grid toggle/Onion toggle/Play-Pause/Sparkles AI violet accent/theme toggle/Settings) all Tooltipped; theme toggle via next-themes resolvedTheme + CSS-driven Sun/Moon icons (no hydration mismatch) and 'pf:toggle-theme' window listener (ref pattern, updated in effect per react-hooks lint rules)
- Created src/components/pixelforge/dialogs/NewProjectDialog.tsx — opens on 'pf:menu-new'; name/width/height, square preset chips 8..512 (violet when active), asset-type select suggesting sizes (Sprite 32×32, Character 32×48, Tileset 16×16, Icon 16×16, Background 256×256), palette select (PALETTE_PRESETS + "Custom (keep current)"); validation 1..1024 integers w/ inline error; create → newDoc + optional setDocPalette + toast
- Created src/components/pixelforge/dialogs/OpenProjectDialog.tsx — opens on 'pf:menu-open'; Tabs "From file" (hidden input accept .pfa/.json → deserializeDoc → loadDoc(doc), try/catch inline error) and "From cloud" (GET /api/projects, auto-load on open + Refresh, list cards with thumb (background-image, pixelated), name, WxH, updatedAt, spinner while opening; click → GET /api/projects/[id] → deserializeDoc → loadDoc(doc, id); per-row DELETE guarded by AlertDialog); defensive unknown-JSON parsing (array | {projects|items}) so it tolerates the sibling API task's shape; empty state text
- Created src/components/pixelforge/dialogs/ExportDialog.tsx — opens on 'pf:menu-export'; format PNG/JPEG/WebP, scale 1/2/3/4/8, scope current-frame | sprite-sheet, sheet columns 1/2/4/8/auto (shown only for sheet, with computed sheet size preview), JPEG background color picker (default #ffffff); renderCompositeToCanvas → second canvas with imageSmoothingEnabled=false (NN, never blurred) → toDataURL(mime, 0.92) → sanitized filename download; "Export palette JSON" secondary action; NN info line; output-size preview is reactive via narrow selectors
- Created src/components/pixelforge/dialogs/SettingsDialog.tsx — opens on 'pf:menu-settings'; AI Providers list (name, builtin/custom Badge, RadioGroup → setActiveProfile, edit loads form, delete disabled for builtin, masked key "••••"+last4); profile form (name, baseUrl, apiKey password + privacy note, text/image/edit model, timeoutMs, maxRetries, headers JSON textarea; blank key keeps existing); Test Connection → POST /api/ai/test-connection with inline spinner + ok(model count)/error result; Interface section: theme select (dark/light/system), autosave/default-grid/default-onion switches → settings store set(); hydrate() on mount
- Created src/components/pixelforge/dialogs/ResizeDialog.tsx — opens on 'pf:menu-resize' (syncs W/H from doc); (a) Resize canvas W/H + 3×3 anchor grid → resizeCanvas(w,h,anchor); (b) Resize artwork 0.5×/2×/3×/4× → scaleArtwork; (c) Reduce colors slider 2..64 + Apply → quantizeActiveLayer with "applies to active layer/frame" note
- Created src/components/pixelforge/dialogs/AboutDialog.tsx — opens on 'pf:menu-about'; overview paragraph, two-column keyboard shortcut grid (kbd styling), honest Implementation notes (implemented vs known limitations)
- Created src/components/pixelforge/dialogs/CloudSaveDialog.tsx — opens on 'pf:menu-cloud-save'; name input (defaults doc.name); POST /api/projects or PUT /api/projects/[id] when store.projectId exists, body {name,width,height,dataJson:serializeDoc(doc),thumb}; thumb = composite of active frame NN-scaled to 128px wide PNG dataURL; success → markSaved(id from response) + toast; "Download .pfa" quick button (serializeDoc → blob download)
- Validation: `bunx tsc --noEmit` clean (excluding pre-existing examples/skills), `bun run lint` clean. Key decisions: anchor ids in ResizeDialog are nw/n/ne/w/c/e/sw/s/se — note the store's resizeCanvas anchor matching uses includes('n'|'s'|'e'|'w') so the default 'center' string actually matches 'n' and 'e' (pre-existing store quirk; not modified per task rules); NewProjectDialog clamps/validates 1..1024 per the dialog cap (spec sentence mentioned "clamped 1..512" but its own validation rule says 1..1024 — went with 1024); dialogs tolerate alternative cloud API response shapes (array | {projects|items}, {project:{...}} | flat, dataJson|data|json) without `any`.

Stage Summary:
- Exported components (all 'use client'): MenuBar (src/components/pixelforge/MenuBar.tsx); dialogs/{NewProjectDialog, OpenProjectDialog, ExportDialog, SettingsDialog, ResizeDialog, AboutDialog, CloudSaveDialog} (src/components/pixelforge/dialogs/). Mount them once in the studio page/layout — each dialog self-registers its window-event listener.
- Events consumed (window CustomEvent listeners, all added in useEffect with cleanup): OpenProjectDialog←'pf:menu-open', NewProjectDialog←'pf:menu-new', CloudSaveDialog←'pf:menu-cloud-save', ExportDialog←'pf:menu-export', SettingsDialog←'pf:menu-settings', ResizeDialog←'pf:menu-resize', AboutDialog←'pf:menu-about', MenuBar←'pf:toggle-theme'.
- Events dispatched: MenuBar fires 'pf:menu-new','pf:menu-open','pf:menu-save','pf:menu-cloud-save','pf:menu-export','pf:menu-resize','pf:menu-settings','pf:menu-about','pf:open-ai-studio','pf:quantize'; theme toggling is done directly via next-themes (and via 'pf:toggle-theme' listener for external dispatchers).
- Store actions used by these components: newDoc, loadDoc, markSaved, resizeCanvas, scaleArtwork, cropToContent, cropToSelection, setBackground, zoomBy, actualSize, fitToViewport, centerCanvas, setGridVisible, setOnionSkin, setPlaying, selectAll, deselect, cutSelection, copySelection, pasteClipboard, deleteSelection, addLayer, deleteLayer, duplicateLayer, mergeDown, moveLayer, clearLayer, addFrame, deleteFrame, flip, rotate, addOutline, quantizeActiveLayer, setDocPalette, addPaletteColor, undo, redo. Settings store: hydrate, upsertProfile, deleteProfile, setActiveProfile, set. Engine: serializeDoc, deserializeDoc, renderCompositeToCanvas.
- HTTP endpoints consumed: GET/POST /api/projects, GET/DELETE /api/projects/[id], PUT /api/projects/[id], POST /api/ai/test-connection (built by sibling task; parsing is shape-tolerant).

---
Task ID: 2-c
Agent: layers-palette-subagent
Task: Right-sidebar UI components — LayersPanel + PalettePanel

Work Log:
- Read worklog Task 1 store contract + store.ts/types.ts/engine.ts (celToCanvas signature)/palettes.ts (PALETTE_PRESETS) + ui component availability + use-toast API
- Created src/components/pixelforge/LayersPanel.tsx: header w/ 6 tooltip icon actions (add/duplicate/merge-down/move±/delete, delete disabled at 1 layer), reversed layer list (top-first) in max-h-[40vh] scroll area with thin scrollbar ([scrollbar-width:thin]), LayerThumb 40x40 canvas (8px zinc checkerboard + celToCanvas NN-scaled draw, redraws on pixelVersion/structureVersion via deps + dataset.rev), per-row: eye toggle, lock toggle (violet when locked), double-click/Enter inline rename Input (Enter/blur commit, Esc cancel), "locked" + "empty" badges, active row = violet ring + bg-violet-600/10 + opacity Slider (0..100 → updateLayer opacity/100) + percent text; rows keyboard-accessible (role=button, Enter/Space activate)
- Created src/components/pixelforge/PalettePanel.tsx: overlapping primary (40x40 front) / secondary (28x28 behind) swatches wrapped in labels with hidden color inputs (setPrimary(hex,false)/setSecondary), Swap "Swap (X)" / Reset "Reset (D)" buttons; HEX Input with /^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/ validation on Enter (live aria-invalid, blur revert) + rgba() hint from engine hexToRgba; Document palette grid-cols-8 (24px swatches, click=primary / right-click=secondary / Alt+click=removePaletteColor, count n/256, dashed Plus button → addPaletteColor(primary)); Presets Select (PALETTE_PRESETS → setDocPalette + toast, nonce-remount so same preset re-appliable) + Export JSON (Blob download `${doc.name}-palette.json`) + Import (hidden .json file input, per-entry regex validation, dedupe, cap 256, destructive toast on parse/validation fail); Recent colors wrap (max 24, same swatch behavior) with "Draw to collect recent colors." empty state; shared Swatch subcomponent
- Store access strictly via selectors (doc.layers, activeLayerId, activeFrameId, pixelVersion, structureVersion, palette, primary/secondary, recentColors) — no `any`, strict TS
- Verified: bunx tsc --noEmit clean for project files (only pre-existing examples/ + skills/ errors); bun run lint reports 0 problems in the 2 new files (1 pre-existing error in MenuBar.tsx belongs to another agent)

Stage Summary:
- Exports: src/components/pixelforge/LayersPanel.tsx → default LayersPanel (right-sidebar layers panel; internal LayerThumb, HeaderAction); src/components/pixelforge/PalettePanel.tsx → default PalettePanel (colors/hex/document palette/presets+IO/recent; internal Swatch, PanelLabel)
- Both 'use client', read-only against store contract (no store file changes); compose freely into the workspace right rail; panels are unstyled-parent-safe (own p-3, zinc/violet only)

---
Task ID: 2-b
Agent: toolrail-statusbar-subagent
Task: ToolRail, StatusBar, ToolProperties, useShortcuts

Work Log:
- Created src/components/pixelforge/ToolRail.tsx — vertical w-12 rail (bg-zinc-900, border-r), 12 tools with lucide icons + right-side Tooltips (name + shortcut), 36px ghost buttons, active tool violet-600, group Separators after eraser/ellipse/select/pan; bottom: symmetry toggles (FlipHorizontal2/FlipVertical2, violet when on, setToolOptions) + 32px primary color swatch (visual only)
- Created src/components/pixelforge/StatusBar.tsx — h-8 zinc-900 bar with narrow zustand selectors: doc name + amber dirty dot, WxH px, Frame i/N (via activeFrameId lookup), zoom %, cursor coords from useHudStore (X: n Y: n / X: – Y: –), active tool label, overlapping 16px primary/secondary swatches (primary wraps hidden <input type=color> → setPrimary(hex, true)), provider chip (Sparkles, violet=builtin / emerald=custom from useSettingsStore), undo/redo availability dots, right-aligned history depth (History icon + undoStack.length)
- Created src/components/pixelforge/ToolProperties.tsx — default-export panel; conditional sections per tool: pencil→Brush pattern Select (solid/dither50/dither25/dither75), eraser→hint, bucket/replace→Tolerance Slider 0–128 with value badge + hint, line/rect/ellipse→Filled shape Switch + hint, text→text Input + size Input 4–64 (draft-state typing, clamped commit) + font Select + hint, select/move→floating pixels hint; Symmetry H/V Switches always at bottom; all writes via setToolOptions
- Created src/components/pixelforge/useShortcuts.ts — export useShortcuts(): global window keydown (bubble phase); ignores inputs/textarea/select/contentEditable and any open [role=dialog]; mod-combos: Z/Z+Shift undo-redo, Y redo, A selectAll, D deselect, X/C/V cut/copy/paste, Delete/Backspace deleteSelection, N/O/S/S+Shift dispatch pf:menu-new/open/save/export (preventDefault on all); plain keys: b/e/g/G/l/r/o/i/m/v/h/t tool switching, x swapColors, d resetColors, Enter commitFloating, Escape deselect, 0 fitToViewport, 1 actualSize, =/+/– zoomBy(1.25/0.8), Arrows moveFloating (shift=8 else 1) or clamped setSelection nudge; store read via useEditorStore.getState() per event — no store subscription
- bunx tsc --noEmit (excl. examples/skills): clean; bun run lint: clean; no existing files modified

Stage Summary:
- Exported: default ToolRail (nav, expects flex-row parent, h-full w-12), default StatusBar (h-8 strip for shell bottom), default ToolProperties (tab content for right sidebar), useShortcuts() hook (call once in app shell; listens on window keydown)
- Dependencies expected from orchestrator: ToolRail/StatusBar/ToolProperties must be mounted inside the app shell; StatusBar reads doc/frames/view/tool/colors/history/editor state + settings store profiles; 'pf:menu-*' CustomEvents dispatched by Ctrl+N/O/S handled elsewhere (MenuBar contract from Task 1)
- Styling contract: dark zinc palette (zinc-900 chrome, zinc-800 borders), violet-600 accent for active tool/symmetry/undo dots, amber-400 dirty dot, emerald-400 custom provider

---
Task ID: 2-d
Agent: ai-animation-subagent
Task: AI Studio panel (Generate + AI Edit) and Animation panel UI components

Work Log:
- Read worklog.md store contract, store.ts, settings-store.ts, types.ts, engine.ts export signatures, palettes.ts, use-toast.ts
- Created src/components/pixelforge/AIStudioPanel.tsx ('use client', default export):
  - Shadcn Tabs "Generate" | "AI Edit"; provider chip (getActiveProfile) with violet/emerald/amber status dot + "Configure" button dispatching window CustomEvent 'pf:menu-settings'
  - Generate form: prompt Textarea, 11 PROMPT_TEMPLATES chips (fill prompt), negative prompt, width/height inputs (sync-from-doc link button), style Select (none/retro-rpg/game-sprite/ui-icon/isometric/tileable-texture/character-portrait), "Limit palette" Switch + 2..64 Slider, Transparent background (default on) + Dark outline switches, detail Select, seed input (custom providers, Advanced)
  - Generate button: AbortController ref, click-again-to-cancel, Loader2 + honest elapsed-seconds counter (no fake progress), form disabled while loading
  - POST /api/ai/generate; non-200 {error} handled -> destructive toast + inline destructive Alert; response.warning -> neutral Alert banner
  - Client-side pixel pipeline per image: loadImage -> imageToCel(w,h) -> removeBackground(cel,w,h,32) if transparentBg -> quantize(cel,n){data,palette} if limitPalette -> outlineCel(cel,w,h,[10,10,10,255]) if outline
  - Results gallery (ScrollArea max-h-[300px]): canvas previews (image-rendering:pixelated, conic-gradient #3f3f46/#27272a 8px checker), Before/After toggle, size badge, Import as layer ('new-layer') / New document (newDoc + 'replace-layer') / Save PNG (celToCanvas->toDataURL download) / Add palette (dedupe merge -> setDocPalette)
  - History strip: localStorage 'pixelforge.ai.history.v1' (max 20, quota-safe progressive trim), auto-saved per generated image (thumb=beforeUrl), click -> result-like card (Save PNG + Import as layer via imageToCel with stored w/h + current toggles), Trash2 clear
  - AI Edit tab: builtin -> info Alert + Mode A disabled with Tooltip; Mode A renders composite (renderCompositeToCanvas->toDataURL) then POST /api/ai/edit -> preview + "Import as duplicate layer" (imageToCel at doc size, 'new-layer', original untouched); Mode B "Guided suggestions — analyzed locally, nothing is auto-applied" -> POST /api/ai/chat with JSON-only instruction prompt -> fence-stripped JSON.parse -> summary/steps/colorMap chips -> "Apply color map to a copy of this layer" (compositeFrame + applyColorMap + 'new-layer'); parse failure shows raw text in <pre>
- Created src/components/pixelforge/AnimationPanel.tsx ('use client', default export):
  - Header: Film icon + frame count Badge, Play/Pause (setPlaying), Onion skin Switch (setOnionSkin), total duration ms + ≈fps readout
  - Playback useEffect: cumulative setTimeout chain honoring frame.durationMs, re-reads useEditorStore.getState() each tick (no stale frames), loops, cleanup on stop/unmount
  - Frames strip: horizontal ScrollArea, per-frame card w-20 with 64px composite thumb (compositeFrame -> celToCanvas -> NN draw, checker bg, violet ring when active), index, duration input (active only, clamped 10..10000 -> updateFrame), hover/active actions: duplicate (select-if-needed + addFrame(true)), delete (disabled at 1 frame), move left/right (moveFrame ±1); strip end: New blank frame (addFrame(false)), Duplicate current (addFrame(true))
  - Export sprite sheet: columns Select (auto/1/2/4/8), builds cols×rows sheet canvas at 1x scale with imageSmoothingEnabled=false, downloads `${doc.name}-sheet.png`, honest info text
- bunx tsc --noEmit: clean (excl. pre-existing examples/skills); bun run lint: my files 0 problems (remaining error is pre-existing in MenuBar.tsx from another task)

Stage Summary:
- EXPORTS: AIStudioPanel (default) from src/components/pixelforge/AIStudioPanel.tsx; AnimationPanel (default) from src/components/pixelforge/AnimationPanel.tsx. Both 'use client', no props, read state via useEditorStore/useSettingsStore.
- STORE ACTIONS USED: newDoc(w,h,name?), importImageIntoDoc(data,w,h,'new-layer'|'replace-layer'), setDocPalette(colors[]), setActiveFrame(id), addFrame(copyContent), deleteFrame(id), moveFrame(id,-1|1), updateFrame(id,{durationMs}), setPlaying(bool), setOnionSkin(bool); settings: getActiveProfile(), hydrate(). Window event dispatched: 'pf:menu-settings'.
- API: POST /api/ai/generate — body { prompt: string, negativePrompt: string, width: number, height: number, style: 'none'|'retro-rpg'|'game-sprite'|'ui-icon'|'isometric'|'tileable-texture'|'character-portrait', paletteSize: number (0 when off, else 2..64), transparentBg: boolean, outline: boolean, detail: 'low'|'medium'|'high', seed?: number (custom only), provider: 'builtin'|'custom', profile?: { baseUrl?, apiKey?, imageModel?, timeoutMs?, maxRetries? } (custom only) } → 200 { images: string[] (png data URLs), provider: string, warning?: string } | non-200 { error: string }
- API: POST /api/ai/edit — body { prompt: string, imageDataUrl: string (png data URL of active frame composite), provider: 'custom', profile: { baseUrl?, apiKey?, editModel?: string (falls back to imageModel), imageModel?, timeoutMs?, maxRetries? } } → 200 { image: string (png data URL) } | non-200 { error: string }
- API: POST /api/ai/chat — body { messages: { role: 'user', content: string }[], provider: 'builtin'|'custom', profile?: { baseUrl?, apiKey?, textModel?, timeoutMs?, maxRetries? } (custom only) } → 200 { text: string } | non-200 { error: string }; text expected to contain JSON {"summary","steps","colorMap":[{from,to}]} (markdown fences tolerated, raw fallback rendered)
- localStorage contract: 'pixelforge.ai.history.v1' = HistoryItem[] { prompt: string, thumb: string (dataUrl), w: number, h: number, createdAt: number }, max 20
