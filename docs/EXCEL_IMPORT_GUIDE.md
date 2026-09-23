# DT POS — Menu Excel format

File: .xlsx, .xls or .csv.

## Sheet "Menu Items"
| Column | Required | Type | Also accepted | What to put |
|---|---|---|---|---|
| name | Yes | Text | item, product, title | Item name. Example: Chicken Pizza |
| category | No | Text | cat, categoryName | Menu category; created if it does not exist. Empty = "Uncategorized". Example: Pizza |
| price | Yes | Number | salePrice, rate | Price for a normal (fixed price) item. Use 0 for size/inch items. Example: 650 |
| pricingType | No | fixed / weight / manual / size / inch / both | type | Worked out automatically from the variant columns when left empty. Example: size |
| sizeName | No | Text | size | Size variant name. One row per size; repeat the same name + category on each row. Example: Large |
| sizePrice | No | Number | — | Price of that size. Example: 1450 |
| inchSize | No | Text | inches, inch | Inch variant name (one row per inch size). Example: 12 Inch |
| inchPrice | No | Number | — | Price of that inch size. Example: 1600 |
| ratePerKg | No | Number | kgPrice | Price per kg for weight items. |
| subCategory | No | Text | flavorGroup, flavor | Flavour group label (e.g. "Pizza Flavors"). |
| kitchen | No | Text | kitchenId | Kitchen that prepares the item. |
| image | No | Text (URL) | imageUrl, photo | Picture link. |

## Sheet "Categories" (optional)
| Column | Required | Type | Also accepted | What to put |
|---|---|---|---|---|
| name | Yes | Text | category, title | Category name. Example: Pizza |
| icon | No | Emoji | — | Shown on the POS button. Example: 🍕 |

## Sheet "Ingredients" (optional)
| Column | Required | Type | Also accepted | What to put |
|---|---|---|---|---|
| name | Yes | Text | ingredient, item | Ingredient / stock item. Example: Mozzarella Cheese |
| sku | No | Text | code | Stock code. Example: CHS-01 |
| category | No | Text | cat | Default "Ingredients". Example: Dairy |
| costPrice | No | Number | cost | Purchase cost per unit. Example: 1800 |
| salePrice | No | Number | price | Sale price, if sold. |
| quantity | No | Number | stock, qty | Opening stock. Example: 10 |
| unit | No | Text | — | Purchase unit (kg, pcs, bag…). Example: kg |
| baseUnit | No | Text | — | Unit stock is counted in. Example: g |
| lowStockThreshold | No | Number | lowStock | Warn below this stock. Example: 2 |

## Rules
- Use up to three sheets named "Categories", "Menu Items" and "Ingredients". A sheet without such a name is recognised from its columns.
- Header names are not case-sensitive; spaces, "-" and "_" are ignored (sizeName = Size Name = size_name).
- An item that already exists (same name) is UPDATED, not duplicated.
- Size/inch items: one row per size, repeating the same name and category. The rows merge into one item with variants.
- Categories that do not exist are created automatically.
- Deals do NOT go in the menu file — import them from Deals / Combos → Bulk Import Deals. A "Deals" sheet in a menu file is ignored.
- You see a preview (new / updated) before anything is saved.

## Example — "Menu Items" sheet
| name | category | price | sizeName | sizePrice | inchSize | inchPrice |
|---|---|---|---|---|---|---|
| Zinger Burger | Burgers | 550 |  |  |  |  |
| Chicken Pizza | Pizza | 0 | Small | 650 |  |  |
| Chicken Pizza | Pizza | 0 | Medium | 1100 |  |  |
| Chicken Pizza | Pizza | 0 | Large | 1450 |  |  |
| 1.5 Liter Drink | Drinks | 250 |  |  |  |  |

---

# DT POS — Deals & Combos Excel format

File: .xlsx, .xls or .csv. Sheet: the first sheet, or one named "Deals".

## Columns
| Column | Required | Type | Also accepted | What to put |
|---|---|---|---|---|
| Deal Name | Yes | Text | Deal, Combo, Combo Name, Deal Title | Name of the deal. Repeat it on every item row of the same deal (or merge the cells — a blank cell continues the deal above). Example: Family Deal 1 |
| Deal Price | Yes | Number (PKR, > 0) | Price, Combo Price, Deal Rate | Selling price of the whole deal. Needed on at least one row of the deal; if repeated it must be the same on every row. "Rs", "PKR" and commas are ignored. Example: 2499 |
| Item Name | Yes | Text | Item, Menu Item, Product, Product Name | A menu item that is ALREADY in DT POS, spelled as in the menu (capital letters and extra spaces do not matter). Example: Zinger Burger |
| Quantity | Yes | Whole number (1–999) | Qty | How many of this item the deal contains. Example: 2 |
| Variant | No | Text | Size, Variant Name, Inch, Size / Inch | Required ONLY for items that have sizes/inches in the menu (Small, Medium, Large, 12 Inch…). Must be one of that item's variants. Leave empty for normal items. Example: Large |
| Category | No | Text | Item Category, Category Name | The item's menu category. Only needed when two menu items share the same name in different categories. Example: Burgers |
| Item Code | No | Text | Item ID, SKU, Code | Optional exact item id / SKU. When given it is used instead of the name. |
| Active | No | Yes / No | Status, Is Active | Yes = shown on the POS (default). No = imported but hidden. Example: Yes |
| Deal Code | No | Text | Deal ID | Optional. Rows with the same Deal Code form one deal (useful when deal names repeat). Without it, rows are grouped by Deal Name. |

## Rules
- One row = one item inside a deal. A deal with 3 items has 3 rows.
- Rows with the same Deal Name (or the same Deal Code) are grouped into one deal.
- The header row can be anywhere in the first 15 rows; a title above it is fine. Empty rows are ignored.
- Every Item Name must already exist in the DT POS menu. Import the menu first, then the deals.
- Items with sizes/inches need the Variant column (e.g. Small, Medium, Large, 12 Inch).
- Quantity must be a whole number from 1 to 999. Deal Price must be a number above 0.
- A deal whose name already exists in DT POS is skipped, unless you choose "Update existing deals" before importing.
- A deal with ANY error is not imported at all (no half deals). Warnings do not block the import.
- Imported deals appear in Deals / Combos and in Menu → Deals, and bill from the POS like manual deals.
- Use the first sheet, or name the sheet "Deals".

## Example (2 deals, 5 rows)
| Deal Name | Deal Price | Item Name | Quantity | Variant | Category | Active |
|---|---|---|---|---|---|---|
| Family Deal 1 | 2499 | Zinger Burger | 2 |  | Burgers | Yes |
| Family Deal 1 | 2499 | Chicken Pizza | 1 | Large | Pizza | Yes |
| Family Deal 1 | 2499 | 1.5 Liter Drink | 1 |  | Drinks | Yes |
| Student Deal | 699 | Zinger Burger | 1 |  | Burgers | Yes |
| Student Deal | 699 | Regular Fries | 1 |  | Sides | Yes |

"Family Deal 1" = 2 × Zinger Burger + 1 × Chicken Pizza (Large) + 1 × 1.5 Liter Drink for Rs 2,499.

---

## Asking ChatGPT to prepare the file
Copy the guide above (Menu or Deals) into ChatGPT together with your menu or deal list, and ask:
"Make an Excel sheet in exactly this DT POS format. Use exactly these column headers. Use the item names exactly as in my menu."
Then import it in DT POS: Menu Manager → Import Excel (menu), Deals / Combos → Bulk Import Deals (deals).
