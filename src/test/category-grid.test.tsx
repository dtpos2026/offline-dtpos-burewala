// ============================================================
// CATEGORIES — full names, and the "All Categories" grid picker.
//
// What is pinned:
//   • the grid shows "All items" and every category as a box with its full name,
//     icon / picture and item count; the current one is marked;
//   • picking a box selects that category and closes the picker;
//   • the POS puts the 4-box button next to "All" in the top ribbon and in the
//     side panel, keeps the ribbon scrolling sideways, and never truncates a
//     side-panel category name.
// The browser check measured 9 looks × top / left / right × 3 screen sizes.
// ============================================================
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CategoryGridDialog from '@/components/pos/CategoryGridDialog';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const CATS = [
  { id: 'burgers', name: 'Burgers', icon: '🍔', sortOrder: 1 },
  { id: 'drinks', name: 'Cold Drinks, Shakes and Juices', icon: '🥤', sortOrder: 2 },
  { id: 'bbq', name: 'BBQ & Grill', icon: '', image: 'data:image/png;base64,AAAA', sortOrder: 3 },
] as any[];
const counts = { all: 9, byCat: new Map([['burgers', 4], ['drinks', 1]]) };

function Harness({ start = 'all' }: { start?: string }) {
  const [open, setOpen] = useState(true);
  const [sel, setSel] = useState(start);
  return (
    <>
      <span data-testid="selected">{sel}</span>
      <span data-testid="open">{String(open)}</span>
      <CategoryGridDialog open={open} onOpenChange={setOpen} categories={CATS} counts={counts} selected={sel} onSelect={setSel} />
    </>
  );
}

describe('the All Categories picker', () => {
  it('shows All items and every category with its full name and count', () => {
    render(<Harness />);
    const list = screen.getByRole('listbox', { name: 'Categories' });
    const boxes = within(list).getAllByRole('option');
    expect(boxes).toHaveLength(4);
    expect(boxes.map(b => b.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '📋All items9 items', '🍔Burgers4 items', '🥤Cold Drinks, Shakes and Juices1 item', 'BBQ & Grill0 items',
    ]);
    expect(boxes[3].querySelector('img')).toBeTruthy();
    expect(boxes[0].getAttribute('aria-selected')).toBe('true');
  });

  it('picking a category selects it and closes the picker', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('option', { name: /Cold Drinks, Shakes and Juices/ }));
    expect(screen.getByTestId('selected').textContent).toBe('drinks');
    expect(screen.getByTestId('open').textContent).toBe('false');
  });

  it('marks the category already in use', () => {
    render(<Harness start="burgers" />);
    expect(screen.getByRole('option', { name: /Burgers/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: /All items/ }).getAttribute('aria-selected')).toBe('false');
  });
});

describe('the POS category controls', () => {
  const pos = read('pages/POSScreen.tsx');
  it('has the 4-box button next to All in the ribbon and in the side panel', () => {
    expect(pos.match(/data-pos-cat-grid/g)).toHaveLength(2);
    expect(pos).toMatch(/aria-label="All categories"/);
    expect(pos).toMatch(/<CategoryGridDialog[\s\S]*onSelect=\{id => setSelectedCat\(id\)\}/);
  });
  it('keeps the top ribbon scrolling sideways', () => {
    expect(pos).toMatch(/cat-ribbon flex gap-2 overflow-x-auto/);
  });
  it('never truncates a side-panel category name', () => {
    // Wraps between words; a word is split only when it cannot fit a whole line.
    expect(pos).toMatch(/<span data-cat-name className="min-w-0 text-left leading-snug break-words">\{cat\.name\}<\/span>/);
    expect(pos).not.toMatch(/data-cat-name[^>]*overflow-wrap:anywhere/);
    expect(pos).not.toMatch(/<span className="truncate text-left">\{cat\.name\}<\/span>/);
    const css = read('index.css');
    expect(css).toMatch(/\.cat-pill\.cat-pill-side \{\s*white-space: normal;/);
    // A narrow panel puts the name on its own line instead of squeezing it next to the icon and count.
    expect(css).toMatch(/\[data-pos-categories\] \{\s*container-type: inline-size;/);
    expect(css).toMatch(/@container \(max-width: 170px\) \{[\s\S]*> \[data-cat-name\] \{\s*order: 3;\s*flex-basis: 100%;/);
  });
});
