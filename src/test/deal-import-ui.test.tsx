// ============================================================
// Bulk Import Deals — the real dialog: Upload → Validate → Preview →
// Confirm → Import → Result. And the menu importer no longer turns a
// "Deals" sheet into menu items.
// ============================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import * as XLSX from 'xlsx';

const STORE_KEY = 'desi-pos-data';
function seed() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    orders: [], inventory: [], stockLogs: [], customers: [], recipes: [], tables: [], users: [],
    categories: [{ id: 'c-b', name: 'Burgers', icon: '', sortOrder: 0 }, { id: 'c-p', name: 'Pizza', icon: '', sortOrder: 1 }],
    menuItems: [
      { id: 'zinger', name: 'Zinger Burger', categoryId: 'c-b', pricingType: 'fixed', price: 550, ratePerKg: 0, isActive: true },
      { id: 'pizza', name: 'Chicken Pizza', categoryId: 'c-p', pricingType: 'size', price: 0, ratePerKg: 0, isActive: true,
        sizeVariants: [{ name: 'Small', price: 650 }, { name: 'Large', price: 1450 }] },
    ],
    deals: [{ id: 'd-old', name: 'Student Deal', items: [{ menuItemId: 'zinger', quantity: 1 }], price: 699, isActive: true, createdAt: '2026-01-01' }],
    settings: { name: 'Test' }, orderCounter: 0,
  }));
}
function xlsxFile(rows: unknown[][], sheet = 'Deals', name = 'deals.xlsx') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  // jsdom 20's File has no arrayBuffer(); the dialog only needs name + arrayBuffer.
  return { name, arrayBuffer: async () => buf };
}
const H = ['Deal Name', 'Deal Price', 'Item Name', 'Quantity', 'Variant'];

describe('Bulk Import Deals dialog', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); seed(); });

  it('upload → preview with statuses and reasons → confirm → result summary; deals land in the menu', async () => {
    const { default: DealImportDialog } = await import('@/components/DealImportDialog');
    const onImported = vi.fn();
    render(<DealImportDialog onClose={() => {}} onImported={onImported} />);
    // The format guide and template are there before any upload.
    expect(screen.getByText(/Excel format guide — Deals & Combos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download template/ })).toBeInTheDocument();
    expect(screen.getByTestId('deal-confirm')).toBeDisabled();

    fireEvent.change(screen.getByTestId('deal-file'), { target: { files: [xlsxFile([
      H,
      ['Family Deal', 2499, 'Zinger Burger', 2, ''],
      ['Family Deal', 2499, 'Chicken Pizza', 1, 'Large'],
      ['Broken Deal', 900, 'Mystery Item', 1, ''],
      ['Student Deal', 749, 'Zinger Burger', 1, ''],
    ])] } });

    const preview = await screen.findByTestId('deal-preview');
    expect(within(preview).getByText('1 ready')).toBeInTheDocument();
    expect(within(preview).getByText('2 failed')).toBeInTheDocument();
    expect(within(preview).getByText(/"Mystery Item" is not on the menu/)).toBeInTheDocument();
    expect(within(preview).getByText(/already exists — skipped/)).toBeInTheDocument();
    expect(within(preview).getByText(/1× Chicken Pizza — Large/)).toBeInTheDocument();

    // Choosing "Update" re-validates: the existing deal becomes importable.
    fireEvent.click(within(preview).getByLabelText(/Update existing deals/));
    expect(await within(screen.getByTestId('deal-preview')).findByText('1 will update')).toBeInTheDocument();
    const confirm = screen.getByTestId('deal-confirm');
    expect(confirm).toHaveTextContent('Confirm import (2 deals)');
    fireEvent.click(confirm);

    const result = await screen.findByTestId('deal-import-result');
    // 749 for one 550 burger is flagged (a warning, never a block).
    expect(within(result).getByText('Successful: 2 Deals, Failed: 1, Warnings: 1')).toBeInTheDocument();
    expect(within(result).getByText(/higher than the items bought separately \(550\)/)).toBeInTheDocument();
    expect(within(result).getByText(/Mystery Item/)).toBeInTheDocument();
    expect(onImported).toHaveBeenCalled();

    const store = await import('@/lib/store');
    const deals = store.getDeals();
    expect(deals.map(d => d.name).sort()).toEqual(['Family Deal', 'Student Deal']);
    expect(deals.find(d => d.name === 'Student Deal')).toMatchObject({ id: 'd-old', price: 749 });
    const fam = deals.find(d => d.name === 'Family Deal')!;
    expect(fam.items).toEqual([{ menuItemId: 'zinger', quantity: 2 }, { menuItemId: 'pizza', quantity: 1, variantName: 'Large', variantType: 'size' }]);
    // Billable from the POS: a menu item in the Deals category with the deal's id.
    expect(store.getMenuItems().find(m => m.id === fam.id)).toMatchObject({ categoryId: 'cat-deals', price: 2499, name: 'Family Deal' });
  });

  it('a file with the wrong structure explains itself and imports nothing', async () => {
    const { default: DealImportDialog } = await import('@/components/DealImportDialog');
    render(<DealImportDialog onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('deal-file'), { target: { files: [xlsxFile([['Name', 'Price'], ['A', 1]])] } });
    expect(await screen.findByTestId('deal-file-errors')).toHaveTextContent(/Wrong file structure/);
    expect(screen.getByTestId('deal-confirm')).toBeDisabled();
  });
});

describe('Menu import and deal sheets', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); seed(); });

  it('a "Deals" sheet in a menu workbook is not turned into menu items', async () => {
    const { default: ExcelImportDialog } = await import('@/components/ExcelImportDialog');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['name', 'category', 'price'], ['Garlic Bread', 'Sides', 300]]), 'Menu Items');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([H, ['Family Deal', 2499, 'Zinger Burger', 2, '']]), 'Deals');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    render(<ExcelImportDialog existingCategories={[]} existingItems={[]} existingInventory={[]} onClose={() => {}} onImport={() => {}} />);
    expect(screen.getByText(/Excel format guide — Menu/)).toBeInTheDocument();
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [{ name: 'menu.xlsx', arrayBuffer: async () => buf }] } });
    await waitFor(() => expect(screen.getByText(/Import Preview/)).toBeInTheDocument());
    expect(screen.getAllByText(/Garlic Bread/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Family Deal/)).toBeNull();
  });
});
