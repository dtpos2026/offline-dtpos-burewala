// ============================================================
// POPUPS STAY CENTRED AND ON SCREEN — in every look.
//
// v1.17–1.18 bug: in the seven DT Retail themes every popup (variant / size picker,
// Payment Receive, …) opened half its own size to the bottom-right, and the payment
// popup ran off the bottom of the screen. Cause: the retail entry animation ended on
// `transform: none` with fill-mode `both`, which replaced the dialog's centring
// transform translate(-50%, -50%) for as long as the dialog stayed open.
//
// What is pinned:
//   • no stylesheet rule that targets a dialog sets or animates `transform`, and no
//     dialog animation holds its end state (fill-mode both / forwards);
//   • dialogs and alert dialogs are never taller than the screen and scroll inside;
//   • the payment popup keeps its Confirm button pinned at the bottom.
// The browser check (scripts in the release notes) measured 9 looks × 4 sizes.
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesDir = resolve(__dirname, '..', 'styles');
const sheets = readdirSync(stylesDir).filter(f => f.endsWith('.css')).map(f => [f, readFileSync(resolve(stylesDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')] as const);
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/** All `selector { body }` rules of a sheet, flattened out of @media blocks. */
function rules(css: string): Array<{ sel: string; body: string }> {
  const out: Array<{ sel: string; body: string }> = [];
  const walk = (chunk: string) => {
    let depth = 0, start = 0, header = '';
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === '{') { if (depth === 0) { header = chunk.slice(start, i).trim(); start = i + 1; } depth++; }
      else if (chunk[i] === '}') {
        depth--;
        if (depth === 0) {
          const body = chunk.slice(start, i);
          if (/^@(media|supports)/.test(header)) walk(body);
          else if (!/^@/.test(header)) out.push({ sel: header, body });
          start = i + 1;
        }
      }
    }
  };
  walk(css);
  return out;
}

function keyframes(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    let depth = 1, i = re.lastIndex;
    for (; i < css.length && depth; i++) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; }
    out[m[1]] = css.slice(re.lastIndex, i);
  }
  return out;
}

const DIALOG = /dialog-content|alert-dialog|role="dialog"|role=dialog|\[role="alertdialog"\]/;

describe('popups are never pushed off centre by a theme', () => {
  const allFrames = Object.assign({}, ...sheets.map(([, css]) => keyframes(css)));

  it.each(sheets.map(([f, css]) => [f, css] as const))('%s: rules on dialogs leave transform alone', (_f, css) => {
    for (const r of rules(css).filter(r => DIALOG.test(r.sel))) {
      expect(r.body, r.sel).not.toMatch(/(^|[;\s])transform\s*:/);
      const anim = /animation\s*:\s*([^;]+)/.exec(r.body);
      if (!anim) continue;
      expect(anim[1], `${r.sel} must not hold its end state`).not.toMatch(/\b(both|forwards)\b/);
      for (const name of anim[1].split(',').map(a => a.trim().split(/\s+/)[0])) {
        if (name === 'none') continue;
        expect(allFrames[name], `keyframes ${name}`).toBeTruthy();
        expect(allFrames[name], `keyframes ${name} must not animate transform`).not.toMatch(/transform\s*:/);
      }
    }
  });

  it('the DT Retail dialog entry uses opacity and scale only', () => {
    const retail = read('styles/ui-retail.css');
    expect(retail).toMatch(/\[data-slot="dialog-content"\] \{ animation: dtrDialogIn 0\.18s var\(--dtr-ease\) backwards; \}/);
    expect(keyframes(retail).dtrDialogIn).toMatch(/opacity: 0; scale: 0\.97;/);
  });
});

describe('popups never run off the screen', () => {
  it.each(['components/ui/dialog.tsx', 'components/ui/alert-dialog.tsx'])('%s is capped at the screen height and scrolls inside', f => {
    const src = read(f);
    expect(src).toMatch(/max-h-\[calc\(100dvh-1\.5rem\)\] overflow-y-auto/);
    expect(src).toMatch(/left-\[50%\] top-\[50%\]/);
    expect(src).toMatch(/translate-x-\[-50%\] translate-y-\[-50%\]/);
  });

  it('Payment Receive keeps its Confirm button pinned at the bottom', () => {
    expect(read('components/PaymentDialog.tsx')).toMatch(/data-pay-confirm className="sticky -bottom-6/);
  });
});
