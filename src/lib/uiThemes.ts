// ============================================================
// MODERN THEMES — thirteen complete looks for the Modern interface style.
//
// A theme is more than an accent colour: it is a surface tint (page, panels,
// borders), an accent, the colour of the text that sits on the accent, the
// colour the accent takes when it is used AS text on a light surface, and
// whether the sidebar is light or dark. The names are food colours because
// that is what a restaurant recognises: pizza red, burger orange, salad green,
// lemon yellow, milk white, coffee brown …
//
// PRESENTATION ONLY. Choosing a theme sets one attribute and a handful of CSS
// variables on <html> (see applyUiStyle in uiStyle.ts) and stores one
// device-local preference. The surface colours themselves live in
// src/styles/ui-tokens.css, keyed by data-ui-theme, so nothing here can reach
// the database, the licence, users, orders, printers or the print window.
//
// The `surface` triplets below are the SAME values as the CSS blocks — a test
// (src/test/ui-themes.test.ts) reads the stylesheet and fails if they drift,
// and checks that every text/background pair is readable.
// ============================================================
import type { Hsl } from './uiStyle';

export type SidebarStyle = 'light' | 'dark';

/** "h s% l%" — the shape the CSS variables use, so it can be dropped straight into hsl(). */
export type Triplet = string;

export interface ThemeSurface {
  /** The page behind the panels. */
  background: Triplet;
  /** Body text. */
  foreground: Triplet;
  /** Quiet text: captions, hints. */
  mutedForeground: Triplet;
  /** Subtle fills: table header, chips. */
  muted: Triplet;
  border: Triplet;
}

export interface UiTheme {
  id: string;
  name: string;
  /** One line for the gallery. */
  tagline: string;
  /** Buttons, selection, highlights. Exact — themes are hand-tuned, not auto-darkened. */
  accent: Hsl;
  /** Colour of text and icons that sit on the accent. */
  onAccent: 'light' | 'dark';
  /** The accent used as TEXT on a light surface (prices, links, active labels). Defaults to the accent. */
  accentText?: Hsl;
  surface: ThemeSurface;
  sidebar: SidebarStyle;
  /** The sidebar colour when it is dark (also used by the gallery preview). */
  sidebarColor?: Triplet;
}

/** Near-black used for text on a light accent (yellow). */
export const INK_ON_ACCENT: Triplet = '28 45% 9%';
export const WHITE: Triplet = '0 0% 100%';

export const UI_THEMES: UiTheme[] = [
  {
    id: 'ember',
    name: 'Ember Orange',
    tagline: 'Warm and appetising. The default.',
    accent: { h: 16, s: 88, l: 44 },
    onAccent: 'light',
    accentText: { h: 16, s: 88, l: 41 }, // a shade deeper where the accent is text on the cream page
    surface: { background: '40 18% 96%', foreground: '24 15% 11%', mutedForeground: '25 8% 40%', muted: '36 14% 94%', border: '35 14% 89%' },
    sidebar: 'light',
  },
  {
    id: 'tomato',
    name: 'Tomato Red',
    tagline: 'Bold pizza-menu red on clean white.',
    accent: { h: 356, s: 78, l: 45 },
    onAccent: 'light',
    surface: { background: '24 12% 96%', foreground: '12 14% 10%', mutedForeground: '14 7% 40%', muted: '20 9% 93%', border: '20 9% 88%' },
    sidebar: 'light',
  },
  {
    id: 'pizza',
    name: 'Red & Yellow',
    tagline: 'Fast-food brand look: red actions, yellow highlights, cream plates.',
    accent: { h: 357, s: 82, l: 46 },
    onAccent: 'light',
    surface: { background: '220 16% 96%', foreground: '0 0% 9%', mutedForeground: '220 6% 40%', muted: '220 12% 94%', border: '220 12% 90%' },
    sidebar: 'light',
  },
  {
    id: 'fresh',
    name: 'Fresh Green',
    tagline: 'Salad-bar green with a mint-white page.',
    accent: { h: 152, s: 62, l: 30 },
    onAccent: 'light',
    surface: { background: '148 24% 96%', foreground: '160 22% 9%', mutedForeground: '158 8% 38%', muted: '148 15% 93%', border: '148 13% 86%' },
    sidebar: 'light',
  },
  {
    id: 'sunny',
    name: 'Sunny Yellow',
    tagline: 'Lemon and cheese yellow with dark, easy-to-read text.',
    accent: { h: 44, s: 97, l: 52 },
    onAccent: 'dark',
    accentText: { h: 34, s: 90, l: 30 },
    surface: { background: '48 46% 95%', foreground: '30 40% 9%', mutedForeground: '32 12% 36%', muted: '46 32% 91%', border: '44 26% 83%' },
    sidebar: 'light',
  },
  {
    id: 'white',
    name: 'Clean White',
    tagline: 'Milk-white and graphite. Calm and minimal.',
    accent: { h: 222, s: 22, l: 14 },
    onAccent: 'light',
    surface: { background: '220 20% 98%', foreground: '222 24% 9%', mutedForeground: '220 9% 40%', muted: '220 14% 95%', border: '220 13% 90%' },
    sidebar: 'light',
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    tagline: 'Cool blue for a seafood or modern café.',
    accent: { h: 217, s: 80, l: 46 },
    onAccent: 'light',
    surface: { background: '214 34% 96%', foreground: '218 34% 10%', mutedForeground: '216 11% 38%', muted: '214 22% 93%', border: '214 20% 87%' },
    sidebar: 'light',
  },
  {
    id: 'coffee',
    name: 'Coffee Brown',
    tagline: 'Latte cream and espresso brown, made for cafés.',
    accent: { h: 24, s: 52, l: 30 },
    onAccent: 'light',
    surface: { background: '32 30% 95%', foreground: '24 32% 10%', mutedForeground: '26 11% 36%', muted: '30 22% 91%', border: '30 18% 83%' },
    sidebar: 'light',
  },
  {
    id: 'rose',
    name: 'Rose Pink',
    tagline: 'Sweet-shop and bakery pink.',
    accent: { h: 336, s: 76, l: 44 },
    onAccent: 'light',
    surface: { background: '340 32% 97%', foreground: '336 22% 10%', mutedForeground: '336 8% 40%', muted: '340 18% 94%', border: '340 15% 89%' },
    sidebar: 'light',
  },
  {
    id: 'violet',
    name: 'Royal Purple',
    tagline: 'Deep purple, close to the Digital Target brand.',
    accent: { h: 271, s: 70, l: 38 },
    onAccent: 'light',
    surface: { background: '266 32% 97%', foreground: '268 28% 10%', mutedForeground: '266 9% 40%', muted: '266 18% 94%', border: '266 15% 89%' },
    sidebar: 'light',
  },
  {
    id: 'teal',
    name: 'Mint Teal',
    tagline: 'Fresh teal, light and clean.',
    accent: { h: 176, s: 70, l: 29 },
    onAccent: 'light',
    surface: { background: '176 28% 96%', foreground: '180 28% 9%', mutedForeground: '180 8% 38%', muted: '176 15% 93%', border: '176 13% 86%' },
    sidebar: 'light',
  },
  {
    id: 'charcoal',
    name: 'Charcoal Orange',
    tagline: 'Dark charcoal sidebar with the orange accent.',
    accent: { h: 16, s: 88, l: 44 },
    onAccent: 'light',
    accentText: { h: 16, s: 88, l: 41 },
    surface: { background: '40 18% 96%', foreground: '24 15% 11%', mutedForeground: '25 8% 40%', muted: '36 14% 94%', border: '35 14% 89%' },
    sidebar: 'dark',
    sidebarColor: '24 15% 11%',
  },
  {
    id: 'navy',
    name: 'Navy Night',
    tagline: 'Deep navy sidebar with a bright blue accent.',
    accent: { h: 217, s: 80, l: 46 },
    onAccent: 'light',
    surface: { background: '214 34% 96%', foreground: '218 34% 10%', mutedForeground: '216 11% 38%', muted: '214 22% 93%', border: '214 20% 87%' },
    sidebar: 'dark',
    sidebarColor: '222 40% 12%',
  },
];

export const DEFAULT_THEME_ID = 'ember';

export function findTheme(id: string | null | undefined): UiTheme {
  return UI_THEMES.find(t => t.id === id) || UI_THEMES[0];
}

export const isThemeId = (id: unknown): id is string => typeof id === 'string' && UI_THEMES.some(t => t.id === id);
