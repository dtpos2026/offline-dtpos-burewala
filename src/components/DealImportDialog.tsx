// ============================================================
// BULK IMPORT DEALS FROM EXCEL
// Upload → Validate → Preview → Confirm → Import → Result summary.
// Parsing and every validation rule live in lib/dealImport.ts.
// Manual deal creation is untouched; this only adds deals (or updates the
// ones the shop explicitly chose to update).
// ============================================================
import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { getCategories, getDeals, getMenuItems, genId, saveDeal } from '@/lib/store';
import { syncDealToMenu } from '@/lib/deals';
import {
  buildDealTemplate, commitDeals, issuesCsv, parseDealWorkbook,
  type DealImportSummary, type DealParseResult, type DuplicateMode, type ParsedDeal,
} from '@/lib/dealImport';
import { dealImportGuide } from '@/lib/excelGuides';
import ExcelGuidePanel from '@/components/ExcelGuidePanel';

const STATUS: Record<ParsedDeal['status'], { label: string; cls: string }> = {
  new: { label: 'Ready', cls: 'bg-status-success/15 text-status-success border-status-success/40' },
  update: { label: 'Will update', cls: 'bg-status-info/15 text-status-info border-status-info/40' },
  duplicate: { label: 'Already exists', cls: 'bg-status-warning/15 text-status-warning border-status-warning/40' },
  invalid: { label: 'Has errors', cls: 'bg-destructive/10 text-destructive border-destructive/40' },
};

export default function DealImportDialog({ onClose, onImported }: { onClose: () => void; onImported?: () => void }) {
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<DuplicateMode>('skip');
  const [result, setResult] = useState<DealImportSummary | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-validated whenever the file or the duplicate choice changes.
  const parsed: DealParseResult | null = useMemo(() => {
    if (!wb) return null;
    return parseDealWorkbook(wb, { menuItems: getMenuItems(), categories: getCategories(), existingDeals: getDeals() }, mode);
  }, [wb, mode]);

  const readFile = async (f: File) => {
    try {
      const book = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      setWb(book);
      setFileName(f.name);
      setResult(null);
    } catch (e: any) {
      toast.error(`Could not read the file: ${e?.message || e}`);
    }
  };

  const downloadTemplate = () => {
    try {
      XLSX.writeFile(buildDealTemplate(getMenuItems(), getCategories()), 'DT-POS-Deals-Import-Template.xlsx');
    } catch (e: any) {
      toast.error(`Could not create the template: ${e?.message || e}`);
    }
  };

  const importNow = () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const sum = commitDeals(parsed, { saveDeal, syncDealToMenu, genId, existingDeals: getDeals() });
      setResult(sum);
      onImported?.();
      if (sum.successful) toast.success(`${sum.successful} deal${sum.successful === 1 ? '' : 's'} imported.`);
    } finally { setBusy(false); }
  };

  const downloadReport = (issues: DealImportSummary['issues']) => {
    const blob = new Blob([issuesCsv(issues)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'DT-POS-Deal-Import-Report.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const importable = parsed ? parsed.counts.ready + parsed.counts.update : 0;

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Bulk Import Deals from Excel
          </DialogTitle>
        </DialogHeader>

        {/* ===== RESULT ===== */}
        {result ? (
          <div className="space-y-3" data-testid="deal-import-result">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-3"><div className="text-2xl font-bold text-status-success">{result.successful}</div><div className="text-xs text-muted-foreground">Successful deals{result.updated ? ` (${result.updated} updated)` : ''}</div></div>
              <div className="rounded-lg border p-3"><div className="text-2xl font-bold text-destructive">{result.failed}</div><div className="text-xs text-muted-foreground">Failed deals</div></div>
              <div className="rounded-lg border p-3"><div className="text-2xl font-bold text-status-warning">{result.warnings}</div><div className="text-xs text-muted-foreground">Warnings</div></div>
            </div>
            <p className="text-sm font-semibold">Successful: {result.successful} Deals, Failed: {result.failed}, Warnings: {result.warnings}</p>
            {result.issues.length > 0 && (
              <>
                <ul className="max-h-64 overflow-auto rounded border divide-y text-xs">
                  {result.issues.map((i, k) => (
                    <li key={k} className="flex gap-2 p-1.5">
                      {i.level === 'error' ? <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 text-status-warning shrink-0 mt-0.5" />}
                      <span className="text-muted-foreground shrink-0 w-14">{i.row ? `Row ${i.row}` : ''}</span>
                      <span>{i.deal ? <b>{i.deal}: </b> : null}{i.message}</span>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="outline" onClick={() => downloadReport(result.issues)}><Download className="h-4 w-4 mr-1" /> Download report (.csv)</Button>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setWb(null); setResult(null); setFileName(''); }}>Import another file</Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            {/* ===== UPLOAD ===== */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex-1 min-w-[220px] border-2 border-dashed border-primary/40 rounded-lg p-3 text-center cursor-pointer hover:bg-primary/5">
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" data-testid="deal-file"
                       onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.currentTarget.value = ''; }} />
                <span className="inline-flex items-center gap-2 font-semibold text-primary"><Upload className="h-4 w-4" /> {fileName ? `File: ${fileName} — choose another` : 'Choose Excel / CSV file'}</span>
              </label>
              <Button type="button" variant="outline" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" /> Download template</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The template contains an example, your own menu (exact item names, categories and sizes) and the rules.
            </p>
            <ExcelGuidePanel key={parsed ? 'loaded' : 'empty'} title="Excel format guide — Deals & Combos" text={dealImportGuide()} defaultOpen={!parsed} />

            {/* ===== VALIDATION + PREVIEW ===== */}
            {parsed && (
              parsed.fileErrors.length ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-1" data-testid="deal-file-errors">
                  {parsed.fileErrors.map((e, i) => <p key={i} className="flex gap-2"><XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />{e}</p>)}
                </div>
              ) : (
                <div className="space-y-2" data-testid="deal-preview">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline" className={STATUS.new.cls}>{parsed.counts.ready} ready</Badge>
                    {parsed.counts.update > 0 && <Badge variant="outline" className={STATUS.update.cls}>{parsed.counts.update} will update</Badge>}
                    <Badge variant="outline" className={STATUS.invalid.cls}>{parsed.counts.failed} failed</Badge>
                    <Badge variant="outline" className={STATUS.duplicate.cls}>{parsed.counts.warnings} warnings</Badge>
                    <span className="text-muted-foreground">Sheet “{parsed.sheetName}”, header on row {parsed.headerRow}, {parsed.counts.rows} item rows</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 rounded border p-2 text-xs">
                    <span className="font-semibold">Deals that already exist:</span>
                    <label className="flex items-center gap-1"><input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} /> Skip existing deals (safe)</label>
                    <label className="flex items-center gap-1"><input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} /> Update existing deals (replace items and price)</label>
                  </div>
                  {parsed.rowIssues.length > 0 && (
                    <ul className="rounded border border-destructive/30 text-xs divide-y">
                      {parsed.rowIssues.map((i, k) => <li key={k} className="p-1.5 flex gap-2"><XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" /><span className="w-14 text-muted-foreground">Row {i.row}</span>{i.message}</li>)}
                    </ul>
                  )}
                  <div className="max-h-[42vh] overflow-auto rounded border divide-y">
                    {parsed.deals.map(d => (
                      <div key={d.key} className="p-2 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                          {d.status === 'new' || d.status === 'update'
                            ? <CheckCircle2 className="h-4 w-4 text-status-success" />
                            : <XCircle className="h-4 w-4 text-destructive" />}
                          <b>{d.name || '(no name)'}</b>
                          <span className="font-semibold text-primary">{d.price ? `Rs. ${d.price.toLocaleString()}` : 'No valid price'}</span>
                          {!d.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                          <Badge variant="outline" className={`ml-auto text-[10px] ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</Badge>
                        </div>
                        {d.lines.length > 0 && (
                          <ul className="mt-1 ml-6 text-xs text-muted-foreground">
                            {d.lines.map(l => <li key={l.row}>• {l.quantity}× {l.menuItemName}{l.variantName ? ` — ${l.variantName}` : ''}</li>)}
                          </ul>
                        )}
                        {[...d.errors, ...d.warnings].map((i, k) => (
                          <p key={k} className={`ml-6 mt-0.5 text-xs ${i.level === 'error' ? 'text-destructive' : 'text-status-warning'}`}>
                            {i.row ? `Row ${i.row}: ` : ''}{i.message}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={importNow} disabled={!parsed || !importable || busy} data-testid="deal-confirm">
                {busy ? 'Importing…' : `Confirm import (${importable} deal${importable === 1 ? '' : 's'})`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
