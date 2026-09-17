# POS Buttons and Professional Print Quality

## What will change

1. **POS print buttons**
   - When Token printing is ON: show **Token** beside **Customer Receipt**.
   - Move **Kitchen Receipt** into the three-dot menu with Credit and Void.
   - When Token printing is OFF: keep the current **Kitchen + Customer Receipt** buttons together.
   - Keep the layout stable so buttons do not jump or require scrolling.

2. **Clean, bold thermal printing**
   - Apply one shared print-quality baseline to customer receipts, KOTs, tokens, and POS reports.
   - Use solid black text, stronger default weight, readable minimum sizes, clean spacing, safe wrapping, and crisp borders.
   - Keep compact mode readable and bold instead of making text too thin.
   - Preserve every existing receipt/KOT/token template and its values.

3. **Urdu font reliability**
   - Detect Urdu/Arabic text before direct printing.
   - Keep fast raw ESC/POS for compatible English/Latin slips.
   - Automatically use the silent layout-print path for Urdu because normal ESC/POS text mode cannot render Nastaleeq fonts.
   - Wait for the selected bundled Urdu font before sending the job, so the printed Urdu matches the selected style while offline.
   - Prevent Urdu words from breaking in the middle when wrapping.

4. **Verification**
   - Test Token ON/OFF button layouts in the POS preview.
   - Verify Kitchen action remains available in the three-dot menu.
   - Test receipt, KOT, token, and report print rendering for boldness, clipping, wrapping, and Urdu font application.
   - Run the focused printing tests and application checks.

## Technical details

- Changes stay limited to the POS action area and shared printing presentation/routing.
- No billing, stock, order, payment, database, licensing, or unrelated screen logic will change.
- Physical darkness still depends partly on the printer head, paper, driver density, and hardware DIP/settings; the software output will be optimized to provide strong black data consistently.
