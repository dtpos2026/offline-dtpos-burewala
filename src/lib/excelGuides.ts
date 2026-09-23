// ============================================================
// EXCEL IMPORT GUIDES — what the Menu import and the Deals import accept.
//
// One source for three things: the parsers' accepted column names, the
// in-app "Excel format guide" (with a Copy button, so a shop can paste it
// into ChatGPT and ask for a ready file), and docs/EXCEL_IMPORT_GUIDE.md.
// If a column is added to a parser it is added here, and the guide follows.
// ============================================================

export interface ColumnSpec {
  /** Exact header to use in the file. */
  header: string;
  /** Other headers the importer also accepts (case/space-insensitive). */
  aliases: string[];
  required: boolean;
  type: string;
  description: string;
  example: string;
}

// ---------------- DEALS & COMBOS ----------------
export type DealField = 'dealName' | 'dealPrice' | 'itemName' | 'quantity' | 'variant' | 'category' | 'itemCode' | 'active' | 'dealCode';

export const DEAL_COLUMNS: Array<ColumnSpec & { field: DealField }> = [
  { field: 'dealName', header: 'Deal Name', aliases: ['Deal', 'Combo', 'Combo Name', 'Deal Title'], required: true, type: 'Text',
    description: 'Name of the deal. Repeat it on every item row of the same deal (or merge the cells — a blank cell continues the deal above).', example: 'Family Deal 1' },
  { field: 'dealPrice', header: 'Deal Price', aliases: ['Price', 'Combo Price', 'Deal Rate'], required: true, type: 'Number (PKR, > 0)',
    description: 'Selling price of the whole deal. Needed on at least one row of the deal; if repeated it must be the same on every row. "Rs", "PKR" and commas are ignored.', example: '2499' },
  { field: 'itemName', header: 'Item Name', aliases: ['Item', 'Menu Item', 'Product', 'Product Name'], required: true, type: 'Text',
    description: 'A menu item that is ALREADY in DT POS, spelled as in the menu (capital letters and extra spaces do not matter).', example: 'Zinger Burger' },
  { field: 'quantity', header: 'Quantity', aliases: ['Qty'], required: true, type: 'Whole number (1–999)',
    description: 'How many of this item the deal contains.', example: '2' },
  { field: 'variant', header: 'Variant', aliases: ['Size', 'Variant Name', 'Inch', 'Size / Inch'], required: false, type: 'Text',
    description: 'Required ONLY for items that have sizes/inches in the menu (Small, Medium, Large, 12 Inch…). Must be one of that item\'s variants. Leave empty for normal items.', example: 'Large' },
  { field: 'category', header: 'Category', aliases: ['Item Category', 'Category Name'], required: false, type: 'Text',
    description: 'The item\'s menu category. Only needed when two menu items share the same name in different categories.', example: 'Burgers' },
  { field: 'itemCode', header: 'Item Code', aliases: ['Item ID', 'SKU', 'Code'], required: false, type: 'Text',
    description: 'Optional exact item id / SKU. When given it is used instead of the name.', example: '' },
  { field: 'active', header: 'Active', aliases: ['Status', 'Is Active'], required: false, type: 'Yes / No',
    description: 'Yes = shown on the POS (default). No = imported but hidden.', example: 'Yes' },
  { field: 'dealCode', header: 'Deal Code', aliases: ['Deal ID'], required: false, type: 'Text',
    description: 'Optional. Rows with the same Deal Code form one deal (useful when deal names repeat). Without it, rows are grouped by Deal Name.', example: '' },
];

export const DEAL_EXAMPLE_ROWS: string[][] = [
  ['Deal Name', 'Deal Price', 'Item Name', 'Quantity', 'Variant', 'Category', 'Active'],
  ['Family Deal 1', '2499', 'Zinger Burger', '2', '', 'Burgers', 'Yes'],
  ['Family Deal 1', '2499', 'Chicken Pizza', '1', 'Large', 'Pizza', 'Yes'],
  ['Family Deal 1', '2499', '1.5 Liter Drink', '1', '', 'Drinks', 'Yes'],
  ['Student Deal', '699', 'Zinger Burger', '1', '', 'Burgers', 'Yes'],
  ['Student Deal', '699', 'Regular Fries', '1', '', 'Sides', 'Yes'],
];

export const DEAL_RULES: string[] = [
  'One row = one item inside a deal. A deal with 3 items has 3 rows.',
  'Rows with the same Deal Name (or the same Deal Code) are grouped into one deal.',
  'The header row can be anywhere in the first 15 rows; a title above it is fine. Empty rows are ignored.',
  'Every Item Name must already exist in the DT POS menu. Import the menu first, then the deals.',
  'Items with sizes/inches need the Variant column (e.g. Small, Medium, Large, 12 Inch).',
  'Quantity must be a whole number from 1 to 999. Deal Price must be a number above 0.',
  'A deal whose name already exists in DT POS is skipped, unless you choose "Update existing deals" before importing.',
  'A deal with ANY error is not imported at all (no half deals). Warnings do not block the import.',
  'Imported deals appear in Deals / Combos and in Menu → Deals, and bill from the POS like manual deals.',
  'Use the first sheet, or name the sheet "Deals".',
];

// ---------------- MENU ----------------
export const MENU_ITEM_COLUMNS: ColumnSpec[] = [
  { header: 'name', aliases: ['item', 'product', 'title'], required: true, type: 'Text', description: 'Item name.', example: 'Chicken Pizza' },
  { header: 'category', aliases: ['cat', 'categoryName'], required: false, type: 'Text', description: 'Menu category; created if it does not exist. Empty = "Uncategorized".', example: 'Pizza' },
  { header: 'price', aliases: ['salePrice', 'rate'], required: true, type: 'Number', description: 'Price for a normal (fixed price) item. Use 0 for size/inch items.', example: '650' },
  { header: 'pricingType', aliases: ['type'], required: false, type: 'fixed / weight / manual / size / inch / both', description: 'Worked out automatically from the variant columns when left empty.', example: 'size' },
  { header: 'sizeName', aliases: ['size'], required: false, type: 'Text', description: 'Size variant name. One row per size; repeat the same name + category on each row.', example: 'Large' },
  { header: 'sizePrice', aliases: [], required: false, type: 'Number', description: 'Price of that size.', example: '1450' },
  { header: 'inchSize', aliases: ['inches', 'inch'], required: false, type: 'Text', description: 'Inch variant name (one row per inch size).', example: '12 Inch' },
  { header: 'inchPrice', aliases: [], required: false, type: 'Number', description: 'Price of that inch size.', example: '1600' },
  { header: 'ratePerKg', aliases: ['kgPrice'], required: false, type: 'Number', description: 'Price per kg for weight items.', example: '' },
  { header: 'subCategory', aliases: ['flavorGroup', 'flavor'], required: false, type: 'Text', description: 'Flavour group label (e.g. "Pizza Flavors").', example: '' },
  { header: 'kitchen', aliases: ['kitchenId'], required: false, type: 'Text', description: 'Kitchen that prepares the item.', example: '' },
  { header: 'image', aliases: ['imageUrl', 'photo'], required: false, type: 'Text (URL)', description: 'Picture link.', example: '' },
];

export const MENU_CATEGORY_COLUMNS: ColumnSpec[] = [
  { header: 'name', aliases: ['category', 'title'], required: true, type: 'Text', description: 'Category name.', example: 'Pizza' },
  { header: 'icon', aliases: [], required: false, type: 'Emoji', description: 'Shown on the POS button.', example: '🍕' },
];

export const MENU_INVENTORY_COLUMNS: ColumnSpec[] = [
  { header: 'name', aliases: ['ingredient', 'item'], required: true, type: 'Text', description: 'Ingredient / stock item.', example: 'Mozzarella Cheese' },
  { header: 'sku', aliases: ['code'], required: false, type: 'Text', description: 'Stock code.', example: 'CHS-01' },
  { header: 'category', aliases: ['cat'], required: false, type: 'Text', description: 'Default "Ingredients".', example: 'Dairy' },
  { header: 'costPrice', aliases: ['cost'], required: false, type: 'Number', description: 'Purchase cost per unit.', example: '1800' },
  { header: 'salePrice', aliases: ['price'], required: false, type: 'Number', description: 'Sale price, if sold.', example: '' },
  { header: 'quantity', aliases: ['stock', 'qty'], required: false, type: 'Number', description: 'Opening stock.', example: '10' },
  { header: 'unit', aliases: [], required: false, type: 'Text', description: 'Purchase unit (kg, pcs, bag…).', example: 'kg' },
  { header: 'baseUnit', aliases: [], required: false, type: 'Text', description: 'Unit stock is counted in.', example: 'g' },
  { header: 'lowStockThreshold', aliases: ['lowStock'], required: false, type: 'Number', description: 'Warn below this stock.', example: '2' },
];

export const MENU_EXAMPLE_ROWS: string[][] = [
  ['name', 'category', 'price', 'sizeName', 'sizePrice', 'inchSize', 'inchPrice'],
  ['Zinger Burger', 'Burgers', '550', '', '', '', ''],
  ['Chicken Pizza', 'Pizza', '0', 'Small', '650', '', ''],
  ['Chicken Pizza', 'Pizza', '0', 'Medium', '1100', '', ''],
  ['Chicken Pizza', 'Pizza', '0', 'Large', '1450', '', ''],
  ['1.5 Liter Drink', 'Drinks', '250', '', '', '', ''],
];

export const MENU_RULES: string[] = [
  'Use up to three sheets named "Categories", "Menu Items" and "Ingredients". A sheet without such a name is recognised from its columns.',
  'Header names are not case-sensitive; spaces, "-" and "_" are ignored (sizeName = Size Name = size_name).',
  'An item that already exists (same name) is UPDATED, not duplicated.',
  'Size/inch items: one row per size, repeating the same name and category. The rows merge into one item with variants.',
  'Categories that do not exist are created automatically.',
  'Deals do NOT go in the menu file — import them from Deals / Combos → Bulk Import Deals. A "Deals" sheet in a menu file is ignored.',
  'You see a preview (new / updated) before anything is saved.',
];

// ---------------- rendering ----------------
function table(cols: ColumnSpec[]): string {
  const lines = ['| Column | Required | Type | Also accepted | What to put |', '|---|---|---|---|---|'];
  for (const c of cols) {
    lines.push(`| ${c.header} | ${c.required ? 'Yes' : 'No'} | ${c.type} | ${c.aliases.join(', ') || '—'} | ${c.description}${c.example ? ` Example: ${c.example}` : ''} |`);
  }
  return lines.join('\n');
}
const grid = (rows: string[][]) => [`| ${rows[0].join(' | ')} |`, `|${rows[0].map(() => '---').join('|')}|`, ...rows.slice(1).map(r => `| ${r.join(' | ')} |`)].join('\n');

export function dealImportGuide(): string {
  return [
    '# DT POS — Deals & Combos Excel format',
    '',
    'File: .xlsx, .xls or .csv. Sheet: the first sheet, or one named "Deals".',
    '',
    '## Columns',
    table(DEAL_COLUMNS),
    '',
    '## Rules',
    ...DEAL_RULES.map(r => `- ${r}`),
    '',
    '## Example (2 deals, 5 rows)',
    grid(DEAL_EXAMPLE_ROWS),
    '',
    '"Family Deal 1" = 2 × Zinger Burger + 1 × Chicken Pizza (Large) + 1 × 1.5 Liter Drink for Rs 2,499.',
  ].join('\n');
}

export function menuImportGuide(): string {
  return [
    '# DT POS — Menu Excel format',
    '',
    'File: .xlsx, .xls or .csv.',
    '',
    '## Sheet "Menu Items"',
    table(MENU_ITEM_COLUMNS),
    '',
    '## Sheet "Categories" (optional)',
    table(MENU_CATEGORY_COLUMNS),
    '',
    '## Sheet "Ingredients" (optional)',
    table(MENU_INVENTORY_COLUMNS),
    '',
    '## Rules',
    ...MENU_RULES.map(r => `- ${r}`),
    '',
    '## Example — "Menu Items" sheet',
    grid(MENU_EXAMPLE_ROWS),
  ].join('\n');
}

/** Everything, for docs/EXCEL_IMPORT_GUIDE.md. */
export function excelGuidesMarkdown(): string {
  return [
    menuImportGuide(),
    '',
    '---',
    '',
    dealImportGuide(),
    '',
    '---',
    '',
    '## Asking ChatGPT to prepare the file',
    'Copy the guide above (Menu or Deals) into ChatGPT together with your menu or deal list, and ask:',
    '"Make an Excel sheet in exactly this DT POS format. Use exactly these column headers. Use the item names exactly as in my menu."',
    'Then import it in DT POS: Menu Manager → Import Excel (menu), Deals / Combos → Bulk Import Deals (deals).',
    '',
  ].join('\n');
}
