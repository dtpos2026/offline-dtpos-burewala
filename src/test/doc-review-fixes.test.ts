// Small display fixes found while writing the User Guide.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('display fixes', () => {
  it('the Sales Report is headed with the shop name and phone from Settings → General', () => {
    const page = read('pages/SalesReportPage.tsx');
    expect(page).toMatch(/\{settings\.name \|\| 'DT POS'\}/);
    expect(page).toMatch(/settings\.phone1 \|\| settings\.phone/);
    expect(page).not.toMatch(/settings\.restaurantName/);
  });
  it('the Settings menu labels use the page text colour, readable with a dark sidebar', () => {
    expect(read('pages/SettingsPage.tsx')).toMatch(/text-\[13\.5px\] font-semibold text-foreground\/80 transition-colors/);
  });
  it('the Backup screen speaks English', () => {
    const page = read('pages/BackupRestorePage.tsx');
    expect(page).not.toMatch(/[؀-ۿ]/);
    expect(page).toMatch(/Device management is part of cloud mode, which is off in this edition\./);
  });
});
