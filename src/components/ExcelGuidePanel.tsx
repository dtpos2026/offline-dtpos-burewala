// ============================================================
// EXCEL FORMAT GUIDE — the exact columns an import accepts, shown in the
// import dialog, with a Copy button so the shop can paste it into ChatGPT
// (or send it to whoever prepares the sheet). Text comes from excelGuides.ts,
// the same source the parsers read their column names from.
// ============================================================
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BookOpen, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { toast } from 'sonner';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export default function ExcelGuidePanel({ title, text, defaultOpen = false }: { title: string; text: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border bg-muted/30" data-testid="excel-guide">
      <div className="flex items-center gap-2 p-2">
        <button type="button" className="flex items-center gap-1.5 text-sm font-semibold flex-1 text-left" onClick={() => setOpen(o => !o)}>
          <BookOpen className="h-4 w-4 text-primary" /> {title}
          {open ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
        </button>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={async () => {
                  if (await copyText(text)) toast.success('Format guide copied — paste it into ChatGPT with your list.');
                  else { setOpen(true); toast.error('Could not copy. Select the text below and copy it by hand.'); }
                }}>
          <Copy className="h-3.5 w-3.5" /> Copy for ChatGPT
        </Button>
      </div>
      {open && (
        <pre className="mx-2 mb-2 max-h-72 overflow-auto whitespace-pre-wrap rounded border bg-background p-2 text-[11px] leading-snug select-text">{text}</pre>
      )}
    </div>
  );
}
