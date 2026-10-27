// PixelForge AI — Built-in palettes (freely usable / widely redistributed community palettes)
// PICO-8 palette (Lexaloffle — commonly reproduced for retro tooling)
// Sweetie 16 (GrafxKid — free to use)
// Game Boy DMG (public domain approximations)

export interface PalettePreset {
  id: string
  name: string
  colors: string[]
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'pico8',
    name: 'PICO-8 (16)',
    colors: [
      '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
      '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
    ],
  },
  {
    id: 'sweetie16',
    name: 'Sweetie 16',
    colors: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
    ],
  },
  {
    id: 'gameboy',
    name: 'Game Boy DMG (4)',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'mono',
    name: '1-bit Mono',
    colors: ['#000000', '#ffffff'],
  },
  {
    id: 'grayscale',
    name: 'Grayscale 8',
    colors: ['#000000', '#242424', '#484848', '#6d6d6d', '#919191', '#b6b6b6', '#dadada', '#ffffff'],
  },
  {
    id: 'warm16',
    name: 'Forge Warm 16',
    colors: [
      '#0d0b0e', '#2b1e2f', '#5c3a4d', '#96524f', '#c97b4a', '#eda04b', '#f8ce6b', '#fdf3b8',
      '#8fb96a', '#4e8757', '#2f5d50', '#31576e', '#4a7fa5', '#8fc3d9', '#e3d6c3', '#a0867a',
    ],
  },
]

export const DEFAULT_PALETTE = PALETTE_PRESETS[0].colors

// ---------- AI prompt templates (AI Studio) ----------

export interface PromptTemplate {
  id: string
  label: string
  template: string
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  { id: 'rpg-char', label: 'RPG character', template: 'A brave RPG hero character sprite, {description}, full body facing forward, retro 16-bit JRPG style, dark outline, limited palette, transparent background' },
  { id: 'enemy', label: 'Enemy / monster', template: 'A menacing {creature} enemy sprite, aggressive pose, retro RPG monster design, dark outline, limited palette, transparent background' },
  { id: 'weapon', label: 'Weapon', template: 'A {weapon} game item sprite, side view, fantasy RPG equipment, clean edges, dark outline, transparent background' },
  { id: 'food', label: 'Food / collectible', template: 'A {food} collectible item sprite, cute style, bright colors, game pickup icon, transparent background' },
  { id: 'building', label: 'Building', template: 'A small {building} pixel-art building, front view, cozy game village style, limited palette' },
  { id: 'tree', label: 'Tree / plant', template: 'A {plant} pixel-art sprite, stylized game foliage, limited palette, transparent background' },
  { id: 'terrain', label: 'Terrain tile', template: 'A seamless {terrain} terrain tile for a 2D game, top-down view, tileable edges, subtle texture' },
  { id: 'iso', label: 'Isometric object', template: 'An isometric {object} game asset, 3/4 top-down isometric view, clean edges, limited palette' },
  { id: 'ui-icon', label: 'UI icon', template: 'A {icon} UI icon for a fantasy game, centered, simple readable silhouette, dark outline, transparent background' },
  { id: 'anim', label: 'Animated sprite concept', template: 'A {character} sprite in a walk cycle key pose, centered, game animation reference frame, transparent background' },
  { id: 'bg', label: 'Game background', template: 'A {scene} pixel-art game background, parallax style, atmospheric, rich but limited palette' },
]
