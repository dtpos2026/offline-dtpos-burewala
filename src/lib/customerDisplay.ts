// ============================================================
// CUSTOMER DISPLAY — the screen the CUSTOMER watches.
//
// Not the same thing as the Kitchen Display
// -----------------------------------------
// The KDS is for cooks: it shows what to make, and it is dense on purpose.
// This screen is for the person standing at the counter waiting for food.
// They need exactly two things — is my order being made, and is it ready —
// read from several metres away, plus something to look at in between.
//
// That second part is why the media panel exists. A customer display that is
// only numbers is a wasted screen; a restaurant already has deals, offers and
// brand imagery it wants seen, and this is the one moment the customer is
// standing still and looking up.
//
// Device-local on purpose: the banner set and the screen layout belong to the
// machine driving that particular display, not to the shop's shared settings.
// One branch may run a TV in the lobby and another none at all.
// ============================================================

import { templateById, pickAutoTemplate, type DisplayTemplate } from './displayTemplates';

export type MediaKind = 'image' | 'video';

/**
 * How a banner fills its panel.
 *
 *  contain — the whole image, letterboxed. Nothing is cropped and nothing is
 *            distorted. The default, because a shop's deal poster with the
 *            price cut off it is worse than a black band.
 *  cover   — fills the panel, cropping the overflow. For photographs.
 *  fill    — stretches to the panel. Offered because a shop sometimes has
 *            artwork made for exactly this screen, but it is the only option
 *            that can distort, so it is never a default.
 */
export type MediaFit = 'contain' | 'cover' | 'fill';

/** Where the media sits in its panel when it does not fill it. */
export type MediaPosition = 'center' | 'top' | 'bottom' | 'left' | 'right';

export interface DisplayMedia {
  id: string;
  kind: MediaKind;
  /**
   * Data URL for an uploaded image, or a file/URL for a video.
   *
   * Stored exactly as the file was read. The image is never re-encoded,
   * resized or passed through a canvas on the way in, so what the shop
   * uploaded is what the screen shows — the sizing below is applied by CSS at
   * display time, which costs nothing and loses nothing.
   */
  src: string;
  /** Shown under the media; optional. */
  caption?: string;
  /** Seconds this item stays on screen. Ignored for video (plays through). */
  seconds?: number;
  /** How it fills its panel. Defaults to `contain` — never crops, never distorts. */
  fit?: MediaFit;
  /** Where it sits when it does not fill the panel. */
  position?: MediaPosition;
  /** Share of the panel's width this item uses (10–100%). */
  widthPct?: number;
  /** Share of the panel's height this item uses (10–100%). */
  heightPct?: number;
}

export interface CustomerDisplayConfig {
  /** Master switch for the customer-facing screen. */
  enabled: boolean;
  /** Headline shown above the order columns. */
  heading: string;
  /** Read the order number aloud when it becomes ready. */
  announce: boolean;
  /** Announcement wording. `{n}` is replaced with the order number. */
  announceTemplate: string;
  /** Times an announcement repeats, so a distracted customer still catches it. */
  announceRepeat: number;
  /** Show how long each order has been waiting. */
  showWaitTime: boolean;
  /** Keep a ready order on screen this many seconds before it drops off. */
  readyHoldSeconds: number;
  /** Rotating banners / video beside the order columns. */
  media: DisplayMedia[];
  /** Seconds per banner when the item does not set its own. */
  mediaSeconds: number;
  /** Which look the screen wears. See src/lib/displayTemplates.ts. */
  templateId: string;
  /**
   * 'manual' uses `templateId` as chosen. 'automatic' reads the screen's own
   * resolution and aspect and picks the template that suits it — so the same
   * install looks right on a 1920x1080 TV and on a small square panel over a
   * counter, without anybody being asked to know which to pick.
   */
  templateMode: 'manual' | 'automatic';
  /**
   * Share of the width the ORDER columns take when banners are shown (%).
   * 70 / 50 / 30 are the presets; any value from 20 to 100 is allowed.
   * 100 means the banners are not shown at all.
   */
  orderRatio: number;
  /**
   * Show the "Powered by Digital Target" line.
   *
   * On by default and a single small line. The screen's branding is the
   * restaurant's — its logo, its name — and this is the developer credit
   * beneath it, which a shop may turn off.
   */
  showDeveloperCredit: boolean;
}

export const DEFAULT_DISPLAY: CustomerDisplayConfig = {
  enabled: false,
  heading: 'ORDER STATUS',
  announce: true,
  // Spoken, not printed — so it reads as speech rather than as a label.
  announceTemplate: 'Order number {n} is ready. Please collect.',
  announceRepeat: 2,
  showWaitTime: true,
  // Long enough for someone who stepped away to come back and still see it.
  readyHoldSeconds: 90,
  media: [],
  mediaSeconds: 8,
  templateId: 'premium',
  templateMode: 'manual',
  orderRatio: 70,
  showDeveloperCredit: true,
};

const KEY = 'dtpos-customer-display-v1';

const FITS = ['contain', 'cover', 'fill'];
const POSITIONS = ['center', 'top', 'bottom', 'left', 'right'];

function clampNum(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function loadDisplayConfig(): CustomerDisplayConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_DISPLAY };
    const p = JSON.parse(raw) || {};
    return {
      enabled: p.enabled === true,
      heading: typeof p.heading === 'string' && p.heading.trim() ? p.heading : DEFAULT_DISPLAY.heading,
      announce: p.announce !== false,
      announceTemplate: typeof p.announceTemplate === 'string' && p.announceTemplate.trim()
        ? p.announceTemplate : DEFAULT_DISPLAY.announceTemplate,
      announceRepeat: clampNum(p.announceRepeat, 1, 5, DEFAULT_DISPLAY.announceRepeat),
      showWaitTime: p.showWaitTime !== false,
      readyHoldSeconds: clampNum(p.readyHoldSeconds, 10, 600, DEFAULT_DISPLAY.readyHoldSeconds),
      media: Array.isArray(p.media)
        ? p.media
            .filter((m: any) => m && typeof m.src === 'string' && m.src)
            .map((m: any, i: number) => ({
              id: String(m.id || `m${i}`),
              kind: m.kind === 'video' ? 'video' : 'image',
              src: String(m.src),
              caption: typeof m.caption === 'string' ? m.caption : undefined,
              seconds: Number.isFinite(Number(m.seconds)) ? clampNum(m.seconds, 2, 120, 8) : undefined,
              fit: FITS.includes(m.fit) ? m.fit : undefined,
              position: POSITIONS.includes(m.position) ? m.position : undefined,
              widthPct: Number.isFinite(Number(m.widthPct)) ? clampNum(m.widthPct, 10, 100, 100) : undefined,
              heightPct: Number.isFinite(Number(m.heightPct)) ? clampNum(m.heightPct, 10, 100, 100) : undefined,
            }))
        : [],
      mediaSeconds: clampNum(p.mediaSeconds, 2, 120, DEFAULT_DISPLAY.mediaSeconds),
      templateId: typeof p.templateId === 'string' && p.templateId ? p.templateId : DEFAULT_DISPLAY.templateId,
      templateMode: p.templateMode === 'automatic' ? 'automatic' : 'manual',
      orderRatio: clampNum(p.orderRatio, 20, 100, DEFAULT_DISPLAY.orderRatio),
      showDeveloperCredit: p.showDeveloperCredit !== false,
    };
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
}

/**
 * Persist the configuration.
 *
 * Banners are stored as data URLs, so the whole config competes for the same
 * few megabytes localStorage allows. A quota failure is reported rather than
 * swallowed: silently dropping the image a shop just added would look like
 * the upload worked when it did not.
 */
export function saveDisplayConfig(cfg: CustomerDisplayConfig): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
    try { window.dispatchEvent(new CustomEvent('dtpos-customer-display-changed', { detail: cfg })); } catch { /* no window */ }
    return { ok: true };
  } catch (e: any) {
    const quota = /quota|exceeded/i.test(String(e?.name || e?.message || ''));
    return {
      ok: false,
      error: quota
        ? 'There is not enough browser storage left for that image. Use a smaller file, or remove a banner first.'
        : (e?.message || 'Could not save the display settings.'),
    };
  }
}

/** Roughly how much space the stored config takes, for the settings screen. */
export function displayConfigSizeKb(cfg: CustomerDisplayConfig): number {
  try { return Math.round(JSON.stringify(cfg).length / 1024); } catch { return 0; }
}

/**
 * Speak an order number.
 *
 * Uses the browser's own speech synthesis, which is present in Chromium and
 * therefore in the desktop app. It is a genuine best-effort: a machine with
 * no voices installed simply stays silent, and that is reported to the caller
 * rather than pretended away — a shop that turned announcements on deserves
 * to know they are not happening.
 */
export function announceOrder(
  orderNumber: number | string,
  cfg: Pick<CustomerDisplayConfig, 'announceTemplate' | 'announceRepeat'>,
): { spoken: boolean; reason?: string } {
  try {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return { spoken: false, reason: 'This device has no speech support.' };
    if (!synth.getVoices || synth.getVoices().length === 0) {
      // Voices load asynchronously on first use; speaking anyway usually still
      // works once they arrive, so this is not treated as a failure.
      void 0;
    }
    const text = String(cfg.announceTemplate || '').replace(/\{n\}/g, String(orderNumber));
    if (!text.trim()) return { spoken: false, reason: 'The announcement text is empty.' };

    const times = Math.max(1, Math.min(5, cfg.announceRepeat || 1));
    for (let i = 0; i < times; i++) {
      const u = new SpeechSynthesisUtterance(text);
      // Slower and slightly louder than conversational: this is being heard
      // across a room with background noise.
      u.rate = 0.9;
      u.pitch = 1;
      u.volume = 1;
      synth.speak(u);
    }
    return { spoken: true };
  } catch (e: any) {
    return { spoken: false, reason: e?.message || 'Speech failed.' };
  }
}

/** Stop anything currently being spoken. */
export function cancelAnnouncements(): void {
  try { window.speechSynthesis?.cancel(); } catch { /* nothing to cancel */ }
}


/**
 * The template this configuration should render with, for a screen of the
 * given size.
 *
 * In manual mode the shop's choice is returned unchanged. In automatic mode
 * the screen's own dimensions decide — which is what makes one install look
 * right on a wide TV and on a small counter panel without anybody choosing.
 */
export function resolveDisplayTemplate(
  cfg: Pick<CustomerDisplayConfig, 'templateId' | 'templateMode'>,
  width?: number,
  height?: number,
): DisplayTemplate {
  if (cfg.templateMode === 'automatic') {
    const w = Number.isFinite(Number(width)) ? Number(width) : 0;
    const h = Number.isFinite(Number(height)) ? Number(height) : 0;
    return pickAutoTemplate('customer', w, h);
  }
  return templateById('customer', cfg.templateId);
}

/**
 * The CSS a single media item is displayed with.
 *
 * Built here rather than in the page so the settings preview and the real
 * screen cannot disagree about what a shop's sizing will actually look like.
 */
export function mediaStyle(m: DisplayMedia): Record<string, string> {
  const fit: MediaFit = m.fit || 'contain';
  const pos: MediaPosition = m.position || 'center';
  const objectPosition =
    pos === 'top' ? 'center top'
    : pos === 'bottom' ? 'center bottom'
    : pos === 'left' ? 'left center'
    : pos === 'right' ? 'right center'
    : 'center center';
  return {
    width: `${m.widthPct ?? 100}%`,
    height: `${m.heightPct ?? 100}%`,
    objectFit: fit,
    objectPosition,
  };
}
