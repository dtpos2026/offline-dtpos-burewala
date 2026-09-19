// ============================================================
// KITCHEN DISPLAY CONFIGURATION — device-local, like the customer screen.
//
// Separate from the customer display's config on purpose. The two screens are
// usually different physical monitors in different rooms, often different
// sizes, and a shop that wants a dark board in the kitchen may well want the
// purple one out front. Sharing one setting would force them to match.
//
// Device-local for the same reason the printer settings are: the machine
// driving the kitchen TV is the machine that knows what that TV is.
// ============================================================
import { templateById, pickAutoTemplate, type DisplayTemplate } from './displayTemplates';

export interface KitchenDisplayConfig {
  /** Which look the board wears. See src/lib/displayTemplates.ts. */
  templateId: string;
  /**
   * 'manual' uses `templateId`. 'automatic' reads the screen's resolution and
   * aspect and picks to suit — a 4:3 panel gets the compact board, a large
   * wide screen gets the big-type one.
   */
  templateMode: 'manual' | 'automatic';
  /**
   * Ticket columns, or 0 for automatic.
   *
   * Automatic derives the count from the screen width, which is what a shop
   * wants nine times in ten. The override exists because a kitchen that mounts
   * its screen unusually far away has a better idea than any formula.
   */
  columns: number;
  /** Show the "Powered by Digital Target" line under the restaurant name. */
  showDeveloperCredit: boolean;
  /** Beep when a new ticket arrives. */
  sound: boolean;
}

export const DEFAULT_KITCHEN_DISPLAY: KitchenDisplayConfig = {
  // The dark board the kitchens have been reading for months. Changing what
  // an existing install looks like without being asked is not an upgrade.
  templateId: 'modern',
  templateMode: 'manual',
  columns: 0,
  showDeveloperCredit: true,
  sound: true,
};

const KEY = 'dtpos-kitchen-display-v1';

export function loadKitchenDisplay(): KitchenDisplayConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_KITCHEN_DISPLAY };
    const p = JSON.parse(raw) || {};
    const cols = Number(p.columns);
    return {
      templateId: typeof p.templateId === 'string' && p.templateId ? p.templateId : DEFAULT_KITCHEN_DISPLAY.templateId,
      templateMode: p.templateMode === 'automatic' ? 'automatic' : 'manual',
      columns: Number.isFinite(cols) ? Math.max(0, Math.min(8, Math.round(cols))) : 0,
      showDeveloperCredit: p.showDeveloperCredit !== false,
      sound: p.sound !== false,
    };
  } catch {
    return { ...DEFAULT_KITCHEN_DISPLAY };
  }
}

export function saveKitchenDisplay(cfg: KitchenDisplayConfig): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
    try { window.dispatchEvent(new CustomEvent('dtpos-kitchen-display-changed', { detail: cfg })); } catch { /* no window */ }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Could not save the kitchen display settings.' };
  }
}

/** The template this board should render with, for a screen of the given size. */
export function resolveKitchenTemplate(
  cfg: Pick<KitchenDisplayConfig, 'templateId' | 'templateMode'>,
  width?: number,
  height?: number,
): DisplayTemplate {
  if (cfg.templateMode === 'automatic') {
    const w = Number.isFinite(Number(width)) ? Number(width) : 0;
    const h = Number.isFinite(Number(height)) ? Number(height) : 0;
    return pickAutoTemplate('kitchen', w, h);
  }
  return templateById('kitchen', cfg.templateId);
}

/**
 * How many ticket columns to show.
 *
 * A kitchen ticket needs roughly 300px to stay readable at arm's length, and
 * a compact template squeezes that to about 250. Deriving the count from the
 * real width rather than from breakpoints means a 1366-wide monitor gets four
 * columns and a 3840-wide TV gets eight, instead of both getting "xl".
 */
export function kitchenColumns(
  cfg: Pick<KitchenDisplayConfig, 'columns'>,
  width: number,
  density: 'comfortable' | 'compact',
): number {
  if (cfg.columns > 0) return cfg.columns;
  const per = density === 'compact' ? 250 : 320;
  const w = Number.isFinite(width) && width > 0 ? width : 1920;
  return Math.max(1, Math.min(8, Math.floor(w / per)));
}
