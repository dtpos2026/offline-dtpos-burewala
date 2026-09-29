// ============================================================
// MODERN HEADER — page title, quick module search, then the live status the
// old header carried (connection, printer, version, notifications, branch,
// clock, zoom), grouped and quieter. Nothing was removed.
// ============================================================
import type { ReactNode } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Search, Type, ZoomIn, ZoomOut } from 'lucide-react';
import HeaderNotificationBar from '@/components/HeaderNotificationBar';
import BillingStatusBar from '@/components/BillingStatusBar';
import HeaderClock from '@/components/shell/HeaderClock';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileMenu: () => void;
  onOpenLauncher: () => void;
  zoom: number;
  onZoom: (delta: number) => void;
  onResetZoom: () => void;
  /** Extra controls placed before the clock (the branch selector). */
  children?: ReactNode;
}

const iconButton = 'grid h-9 w-9 place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

export default function ModernHeader({
  title, collapsed, onToggleCollapse, onOpenMobileMenu, onOpenLauncher, zoom, onZoom, onResetZoom, children,
}: Props) {
  return (
    <header data-ui-shell="header" className="flex h-[var(--ui-header-h)] shrink-0 items-center gap-2 border-b bg-card px-4">
      <button type="button" className={`${iconButton} lg:hidden`} onClick={onOpenMobileMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className={`${iconButton} hidden lg:grid`} onClick={onToggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
      </Tooltip>

      <h1 className="min-w-0 truncate text-[17px] font-extrabold tracking-tight text-foreground">{title}</h1>

      <button
        type="button"
        onClick={onOpenLauncher}
        className="ml-2 hidden h-9 w-[220px] items-center gap-2 rounded-[10px] border bg-background px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:flex xl:w-[280px]"
        aria-label="Search modules"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Go to module…</span>
      </button>
      <button type="button" className={`${iconButton} md:hidden`} onClick={onOpenLauncher} aria-label="Search modules">
        <Search className="h-[18px] w-[18px]" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 xl:flex">
          <BillingStatusBar />
        </div>
        <HeaderNotificationBar />
        {children}
        <HeaderClock variant="modern" />
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={iconButton} aria-label="Text size" title="Text size">
              <Type className="h-[18px] w-[18px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Screen text size</div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => onZoom(-5)} className={`${iconButton} border`} aria-label="Smaller"><ZoomOut className="h-4 w-4" /></button>
              <button type="button" onClick={onResetZoom} className="rounded-lg px-2 py-1 font-mono text-[13px] font-bold tabular-nums hover:bg-accent" title="Reset to 100%">{zoom}%</button>
              <button type="button" onClick={() => onZoom(5)} className={`${iconButton} border`} aria-label="Larger"><ZoomIn className="h-4 w-4" /></button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
