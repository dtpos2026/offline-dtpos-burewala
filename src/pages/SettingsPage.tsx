import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { printShiftReport } from '@/components/ShiftReport';
import DayCloseModulesPanel from '@/components/DayCloseModulesPanel';
import { getSettings, saveSettings, getTables, saveTable, deleteTable, getFloors, saveFloor, deleteFloor, getKitchens, saveKitchen, deleteKitchen, getWaiters, saveWaiter, deleteWaiter, getRiders, saveRider, deleteRider, genId, getOrders, deleteOrder, exportData, getCategories, getCurrentUser } from '@/lib/store';
import { RestaurantSettings, DiningTable, Floor, Kitchen, Waiter, Rider, ReceiptTextStyle } from '@/lib/types';
import { getDayCloseConfig, saveDayCloseConfig, DayCloseConfig, getPendingDayCloseRequests, addPendingDayCloseRequest, clearPendingDayCloseRequests, PendingDayCloseRequest } from '@/lib/dayCloseConfig';
import { userHasAccess } from '@/lib/permissions';
import { Checkbox } from '@/components/ui/checkbox';


import ReceiptStyleEditor from '@/components/ReceiptStyleEditor';
import ReceiptPreview from '@/components/ReceiptPreview';
import DataSecurityCard from '@/components/DataSecurityCard';
import KitchenReceipt from '@/components/KitchenReceipt';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, AlertTriangle, Download, Printer, Palette, MapPin, Navigation, ShoppingBag, Globe2, Settings as SettingsIcon, MessageCircle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { PAKISTAN_AREAS } from '@/lib/pakistan-areas';
import { toast } from 'sonner';
import { askText } from '@/lib/askText';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isElectron, getPrinters, getAutoStart, setAutoStart } from '@/lib/electron';
import { Slider } from '@/components/ui/slider';
import { themes, getActiveTheme, setActiveTheme, ThemeId } from '@/lib/themes';
import { isPremiumPolishOn, setPremiumPolish } from '@/lib/premiumPolish';
import { getWhatsAppTemplates } from '@/lib/whatsapp';
import { getTenantId, getTenantName } from '@/lib/tenant';
import { archiveOrders } from '@/lib/orderArchive';
import { saveBackupToCloud, logDayCloseEvent } from '@/lib/dayCloseBackup';
import { isCloudConfigured } from '@/lib/offlineNoCloud';
import { COUNTRIES, findCountry } from '@/lib/countries';

// ============================================================
// Country / Currency / Tax picker — one-shot international setup.
// Pick a country → currency symbol, code and default VAT/GST auto-fill.
// Values persist in RestaurantSettings so every deployment (Pakistan,
// UAE, KSA, UK, India, etc.) shows the right money format.
// ============================================================
function CountryCurrencyCard({
  settings,
  setSettings,
}: {
  settings: RestaurantSettings;
  setSettings: (s: RestaurantSettings) => void;
}) {
  const current = findCountry(settings.countryCode) || findCountry('PK');
  return (
    <div className="border-2 rounded-lg p-4 space-y-3 border-blue-500/40 bg-blue-500/5">
      <div>
        <h3 className="text-sm font-bold flex items-center gap-2">🌍 Country, Currency & Tax</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Choose your country — currency symbol, code and default VAT/GST will be set automatically.
          Software international ready hai (195 countries supported).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Country</label>
          <Select
            value={settings.countryCode || 'PK'}
            onValueChange={(code) => {
              const c = findCountry(code);
              if (!c) return;
              setSettings({
                ...settings,
                countryCode: c.code,
                countryName: c.name,
                currencyCode: c.currency,
                currencySymbol: c.symbol,
                countryTaxRate: c.taxRate,
                countryTaxLabel: c.taxLabel,
              });
              toast.success(`${c.name} set — ${c.currency} (${c.symbol}), ${c.taxLabel} ${c.taxRate}%`);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent className="max-h-80">
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.name} — {c.currency} ({c.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Currency Symbol</label>
          <Input
            value={settings.currencySymbol ?? current?.symbol ?? 'Rs.'}
            onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
            placeholder="Rs. / $ / € / AED"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Currency Code (ISO)</label>
          <Input
            value={settings.currencyCode ?? current?.currency ?? 'PKR'}
            onChange={(e) => setSettings({ ...settings, currencyCode: e.target.value.toUpperCase() })}
            placeholder="PKR / USD / AED / GBP"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tax Label</label>
            <Input
              value={settings.countryTaxLabel ?? current?.taxLabel ?? 'GST'}
              onChange={(e) => setSettings({ ...settings, countryTaxLabel: e.target.value })}
              placeholder="VAT / GST / Sales Tax"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tax %</label>
            <Input
              type="number"
              step="0.5"
              value={settings.countryTaxRate ?? current?.taxRate ?? 0}
              onChange={(e) => setSettings({ ...settings, countryTaxRate: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Note: These are default values. If a specific bill needs different tax, you can override it from General → Tax Amount / Service Charge fields.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  // Quick-discount draft text (comma typing ke liye — parse blur pe hota hai)
  const [discountPctDraft, setDiscountPctDraft] = useState<string>('');
  const [discountAmtDraft, setDiscountAmtDraft] = useState<string>('');
  const [dcFrom, setDcFrom] = useState('');
  const [dcTo, setDcTo] = useState('');
  const [payQuickDraft, setPayQuickDraft] = useState<string>('');
  const [quickCashDraft, setQuickCashDraft] = useState<string>('');
  const discountDraftInit = useRef(false);
  const [settings, setSettings] = useState<RestaurantSettings>(() => getSettings());
  useEffect(() => {
    if (discountDraftInit.current || !settings) return;
    discountDraftInit.current = true;
    setDiscountPctDraft((((settings as any).discountPresets as number[]) || []).join(','));
    setDiscountAmtDraft((((settings as any).discountAmountPresets as number[]) || []).join(','));
    setPayQuickDraft((((settings as any).paymentQuickAmounts as number[]) || []).join(','));
    setQuickCashDraft((((settings as any).quickCashAmounts as number[]) || []).join(','));
  }, [settings]);
  const [tables, setTables] = useState(() => getTables());
  const [floors, setFloors] = useState(() => getFloors());
  const [kitchens, setKitchens] = useState(() => getKitchens());


  const [waiters, setWaiters] = useState(() => getWaiters());
  const [riders, setRiders] = useState(() => getRiders());
  const [showDayClose, setShowDayClose] = useState(false);
  const [printers, setPrinters] = useState<{ name: string; isDefault?: boolean }[]>([]);
  const [currentTheme, setCurrentTheme] = useState<ThemeId>(getActiveTheme());
  const [premiumPolish, setPremiumPolishState] = useState<boolean>(() => isPremiumPolishOn());
  const [dayCloseCfg, setDayCloseCfg] = useState<DayCloseConfig>(() => getDayCloseConfig());
  const [pendingRequests, setPendingRequests] = useState<PendingDayCloseRequest[]>(() => getPendingDayCloseRequests());
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const canDayClose = isAdmin || userHasAccess(currentUser, 'day-close');
  const [testPrintKind, setTestPrintKind] = useState<null | 'kot' | 'receipt'>(null);
  useEffect(() => {
    if (testPrintKind !== 'receipt') return;
    const t = setTimeout(() => setTestPrintKind(null), 2500);
    return () => clearTimeout(t);
  }, [testPrintKind]);

  const receiptSizePresets = [
    { key: 'compact-80', label: 'Compact', emoji: '🧾', sub: '80mm small text', paperSize: '80mm' as const, receiptScale: 88, receiptMarginTop: 0, receiptMarginBottom: 2, receiptMarginLeft: 3, receiptMarginRight: 3, receiptTrimMm: 2, receiptDesign: 'compact' as const },
    { key: 'standard-80', label: 'Standard', emoji: '📄', sub: '80mm balanced', paperSize: '80mm' as const, receiptScale: 100, receiptMarginTop: 0, receiptMarginBottom: 2, receiptMarginLeft: 3, receiptMarginRight: 3, receiptTrimMm: 3, receiptDesign: 'classic' as const },
    { key: 'bold-80', label: 'Bold', emoji: '🧷', sub: '80mm large text', paperSize: '80mm' as const, receiptScale: 114, receiptMarginTop: 0, receiptMarginBottom: 3, receiptMarginLeft: 3, receiptMarginRight: 3, receiptTrimMm: 3, receiptDesign: 'modern' as const },
  ] as const;

  // Sample order used for live Receipt / KOT design previews in Settings.
  const sampleOrder = {
    id: 'preview',
    orderNumber: 1042,
    orderType: 'dining' as const,
    status: 'paid' as const,
    tableId: 't1', tableName: '5',
    waiterId: 'w1', waiterName: 'Ali Raza',
    cashierName: 'Cashier',
    customer: { id: 'c1', name: 'Ahmed Khan', phone: '0300-1234567', address: 'Burewala' } as any,
    items: [
      { id: 'i1', menuItemId: 'm1', name: 'Chicken Biryani', pricingType: 'unit' as any, price: 450, quantity: 2, lineTotal: 900, note: 'Less spicy' },
      { id: 'i2', menuItemId: 'm2', name: 'Zinger Burger', pricingType: 'unit' as any, price: 550, quantity: 1, lineTotal: 550, note: '' },
      { id: 'i3', menuItemId: 'm3', name: 'Cold Drink 500ml', pricingType: 'unit' as any, price: 120, quantity: 2, lineTotal: 240, note: '' },
    ],
    subtotal: 1690,
    discount: 100,
    discountTitle: 'Eid Discount',
    tax: 0,
    serviceCharge: 0,
    serviceChargePercent: 0,
    grandTotal: 1590,
    paymentMethod: 'cash' as any,
    cashReceived: 2000,
    changeReturned: 410,
    createdAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    notes: 'No onion',
  };


  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  useEffect(() => {
    if (isElectron()) {
      getPrinters().then(setPrinters);
      getAutoStart().then(setAutoStartEnabled);
    }
  }, []);

  const handleToggleAutoStart = async (next: boolean) => {
    const ok = await setAutoStart(next);
    if (ok) {
      setAutoStartEnabled(next);
      toast.success(next ? 'Auto-start enabled — DT POS will open on Windows boot' : 'Auto-start disabled');
    } else {
      toast.error('Auto-start update failed');
    }
  };

  const handleSaveSettings = () => {
    saveSettings(settings);
    toast.success('Settings saved');
  };

  const addTable = () => {
    const t: DiningTable = { id: genId(), name: `Table ${tables.length + 1}`, seats: 4, status: 'free', shape: 'square' };
    saveTable(t);
    setTables(getTables().slice());
  };

  const addFloor = async () => {
    // window.prompt Electron desktop app me kaam nahi karta — apna dialog.
    const name = await askText('Floor name', 'e.g. Ground, First Floor, Outdoor, Car Dining');
    if (!name || !name.trim()) return;
    const f: Floor = { id: genId(), name: name.trim(), sortOrder: floors.length };
    saveFloor(f);
    setFloors(getFloors().slice());
  };
  const removeFloor = (id: string) => {
    if (!window.confirm('Delete this floor? Tables assigned to it will become Unassigned.')) return;
    // unassign tables on this floor
    getTables().filter(t => t.floorId === id).forEach(t => saveTable({ ...t, floorId: undefined }));
    deleteFloor(id);
    setFloors(getFloors().slice());
    setTables(getTables().slice());
  };

  const addKitchen = async () => {
    const name = await askText('Kitchen / Station name', 'e.g. Main, BBQ, Beverage, Basement, Outdoor');
    if (!name || !name.trim()) return;
    const k: Kitchen = { id: genId(), name: name.trim(), sortOrder: kitchens.length };
    saveKitchen(k);
    setKitchens(getKitchens().slice());
  };
  const removeKitchen = (id: string) => {
    if (!window.confirm('Delete this kitchen? Menu items will fall back to default (no routing).')) return;
    deleteKitchen(id);
    setKitchens(getKitchens().slice());
  };



  const addWaiter = () => {
    const w: Waiter = { id: genId(), name: 'New Waiter', phone: '', isActive: true };
    saveWaiter(w);
    setWaiters(getWaiters().slice());
  };

  const addRider = () => {
    const r: Rider = { id: genId(), name: 'New Rider', phone: '', isActive: true };
    saveRider(r);
    setRiders(getRiders().slice());
  };

  const handleDayClose = async () => {
    if (!isAdmin) {
      toast.error('Only Admin can finalize Day Close');
      return;
    }
    const cfg = dayCloseCfg;
    const closeId = `dc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dateStr = new Date().toISOString().slice(0, 10);
    let backupBytes = 0;
    let cloudOk = false;

    // 1. Backup snapshot — local download (admin safety) + cloud copy (survives device loss)
    if (cfg.autoBackup) {
      const backupJson = exportData();
      backupBytes = new TextEncoder().encode(backupJson).length;

      // Local download
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `day-close-backup-${dateStr}-${closeId.slice(-6)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Cloud backup (best-effort, non-blocking failure)
      try {
        cloudOk = await saveBackupToCloud(backupJson, `${dateStr}__${closeId.slice(-6)}`);
      } catch { cloudOk = false; }
    }

    // 2. Always archive the full snapshot so admin can view weekly/monthly history.
    const orders = getOrders();
    archiveOrders(orders);

    // 3. Conditionally delete by status group, per admin's checkboxes.
    let cPaid = 0, cRun = 0, cVoid = 0, cCredit = 0;
    orders.forEach(o => {
      const s = o.status;
      const isPaid = s === 'paid';
      const isRunHold = s === 'running' || s === 'hold';
      const isVoidComp = s === 'void' || s === 'complimentary' || s === 'cancelled';
      const isCredit = s === 'credit_pending' || s === 'credit_received';
      if (
        (isPaid && cfg.clearPaidOrders) ||
        (isRunHold && cfg.clearRunningHoldBills) ||
        (isVoidComp && cfg.clearVoidComp) ||
        (isCredit && cfg.clearCreditOrders)
      ) {
        if (isPaid) cPaid++;
        else if (isRunHold) cRun++;
        else if (isVoidComp) cVoid++;
        else if (isCredit) cCredit++;
        deleteOrder(o.id);
      }
    });

    // 4. Reset tables (optional)
    if (cfg.resetTables) {
      const allTables = getTables();
      allTables.forEach(t => {
        if (t.status !== 'free') saveTable({ ...t, status: 'free', currentOrderId: undefined });
      });
    }

    // 5. Reset daily order counter (optional)
    if (cfg.resetOrderNumber) {
      try {
        Object.keys(localStorage).forEach(k => {
          if (k.startsWith('dt-pos-order-number') || k.includes('order-counter')) localStorage.removeItem(k);
        });
      } catch {}
    }

    // 6. Audit log to cloud — who closed, what cleared, backup status.
    try {
      await logDayCloseEvent({
        id: closeId,
        closedAt: new Date().toISOString(),
        closedByUid: currentUser?.id || 'unknown',
        closedByName: currentUser?.name || 'Unknown',
        orderCount: orders.length,
        cleared: { paid: cPaid, runningHold: cRun, voidComp: cVoid, credit: cCredit },
        config: { ...cfg } as any,
        backupBytes,
      });
    } catch {}

    // 7. Clear pending cashier requests — admin has now actioned them.
    clearPendingDayCloseRequests();
    setPendingRequests([]);

    setTables(getTables());
    setShowDayClose(false);
    const cloudMsg = cfg.autoBackup ? (cloudOk ? ' · Cloud backup saved ☁️' : ' · Cloud backup FAILED (local OK)') : '';
    toast.success(`Day closed. ${cPaid + cRun + cVoid + cCredit} orders cleared.${cloudMsg}`);
  };


  const handleRequestDayClose = () => {
    if (!currentUser) { toast.error('Login required'); return; }
    addPendingDayCloseRequest({ by: currentUser.id, byName: currentUser.name });
    setPendingRequests(getPendingDayCloseRequests());
    toast.success('Day Close request bhej diya — Admin confirm karega');
  };

  const handleSaveDayCloseConfig = () => {
    saveDayCloseConfig(dayCloseCfg);
    toast.success('Day Close settings saved');
  };

  const handleDismissRequest = (id: string) => {
    const remaining = getPendingDayCloseRequests().filter(r => r.id !== id);
    clearPendingDayCloseRequests();
    remaining.forEach(r => addPendingDayCloseRequest({ by: r.by, byName: r.byName, note: r.note, at: r.at }));
    setPendingRequests(getPendingDayCloseRequests());
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl pos-settings-pro">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md text-primary-foreground">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Settings & Masters</h2>
          <p className="text-[11px] text-muted-foreground">Restaurant configuration — har module ek separate card mein</p>
        </div>
      </div>

      <DataSecurityCard />



      <Tabs defaultValue="general">
        {/* ===== FOLDER-STYLE GROUPED GRID (replaces cramped tabs row) ===== */}
        {(() => {
          const OFFLINE_HIDDEN_TABS = new Set(['riders', 'online', 'branches', 'devices']);
          const OFFLINE_HIDDEN_GROUPS = new Set(['Integrations']);
          const rawGroups: { title: string; emoji: string; items: { v: string; label: string; emoji: string; desc: string }[] }[] = [
            { title: 'General', emoji: '⚙️', items: [
              { v: 'general',  label: 'General',          emoji: '🏪', desc: 'Restaurant info, currency' },
              { v: 'theme',    label: 'Theme',            emoji: '🎨', desc: 'Color scheme & look' },
              { v: 'location', label: 'Location & Privacy', emoji: '🔒', desc: 'GPS tracking controls' },
            ]},
            { title: 'Operations', emoji: '🛠️', items: [
              { v: 'tables',  label: 'Tables',  emoji: '🪑', desc: 'Floors & dining tables' },
              { v: 'waiters', label: 'Waiters', emoji: '👤', desc: 'Service staff list' },
              { v: 'riders',  label: 'Riders',  emoji: '🏍️', desc: 'Delivery riders' },
              { v: 'pickup',  label: 'Self-Pickup', emoji: '🏃', desc: 'Takeaway settings' },
            ]},
            { title: 'Printing', emoji: '🖨️', items: [
              { v: 'printer',      label: 'Printer',      emoji: '🖨️', desc: 'Thermal printer setup' },
              { v: 'receipt',      label: 'Receipt & QR', emoji: '🧾', desc: 'Receipt layout & QR' },
              { v: 'receiptstyle', label: 'Receipt Fonts', emoji: '📝', desc: 'Receipt typography' },
              { v: 'kot',          label: 'KOT Settings', emoji: '🍳', desc: 'Kitchen order ticket' },
            ]},
            { title: 'Integrations', emoji: '🔌', items: [
              { v: 'whatsapp',    label: 'WhatsApp',       emoji: '💬', desc: 'Customer messaging' },
              { v: 'online',      label: 'Online Order',   emoji: '🌐', desc: 'Website ordering links' },
              { v: 'cities',      label: 'Cities',         emoji: '📍', desc: 'Active service areas' },
              { v: 'serviceareas',label: 'Service Areas',  emoji: '🚚', desc: 'Manual delivery cities/areas' },
              { v: 'display',     label: 'Display',        emoji: '📺', desc: 'Customer display screen' },
            ]},
            { title: 'Advanced', emoji: '🧩', items: [
              { v: 'branches', label: 'Branches', emoji: '🏢', desc: 'Multi-branch setup' },
              { v: 'devices',  label: 'Devices',  emoji: '📱', desc: 'Approved devices' },
              { v: 'dayclose', label: 'Day Close', emoji: '🔚', desc: 'End-of-day reset' },
            ]},
          ];
          // OFFLINE BUILD: drop internet/cloud tabs. Keep WhatsApp+Cities+ServiceAreas+Display by
          // collapsing the Integrations group into Operations once 'online' is hidden.
          const groups = rawGroups
            .filter(g => !OFFLINE_HIDDEN_GROUPS.has(g.title) || g.items.some(i => !OFFLINE_HIDDEN_TABS.has(i.v)))
            .map(g => ({ ...g, items: g.items.filter(i => !OFFLINE_HIDDEN_TABS.has(i.v)) }))
            .filter(g => g.items.length > 0);
          return (
            <div className="space-y-5 mb-5">
              {groups.map(g => (
                <div key={g.title}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-base">{g.emoji}</span>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-primary/80">{g.title}</h3>
                    <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent" />
                  </div>
                  <TabsList className="!h-auto !p-0 !bg-transparent grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 w-full">
                    {g.items.map(it => (
                      <TabsTrigger
                        key={it.v}
                        value={it.v}
                        title={it.desc}
                        className="group !h-auto !w-full !p-3 flex flex-col items-start gap-1 rounded-2xl border-2 border-primary/25 !bg-card/70 backdrop-blur-sm text-left transition-all hover:border-primary hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45)] data-[state=active]:!bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-accent data-[state=active]:!text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-lg"
                      >
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-2xl leading-none">{it.emoji}</span>
                          <span className="text-sm font-extrabold leading-tight truncate">{it.label}</span>
                        </div>
                        <span className="text-[11px] font-medium leading-snug opacity-70 group-data-[state=active]:opacity-90 line-clamp-2">{it.desc}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ============ LOCATION & PRIVACY ============ */}
        <TabsContent value="location" className="space-y-4">
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold">Location & Privacy</h3>
                <p className="text-[11px] text-muted-foreground">
                  The system will only ask for location when this is ON. Keeping it OFF lets the app run without location — Super Admin will not see branch/device locations.
                </p>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
              <div>
                <div className="text-sm font-bold">📡 Master: Location Tracking</div>
                <div className="text-[11px] text-muted-foreground">Sab location features ka master switch</div>
              </div>
              <Switch
                checked={settings.locationTrackingEnabled !== false}
                onCheckedChange={v => setSettings({ ...settings, locationTrackingEnabled: v })}
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { key: 'trackRestaurantLocation', label: '🏪 Restaurant Location', desc: 'Branch ki physical location track' },
                { key: 'trackDeviceLocation',     label: '💻 Device Location',     desc: 'Har device kahan se chal raha hai' },
                { key: 'trackRiderLocation',      label: '🏍️ Rider Live Tracking', desc: 'Rider Go-Live pe path track ho' },
                { key: 'trackCustomerLocation',   label: '📍 Customer Location',    desc: 'Customer ka delivery location pin' },
              ].map(opt => (
                <label key={opt.key} className="flex items-center justify-between gap-2 p-3 rounded-lg border">
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{opt.desc}</div>
                  </div>
                  <Switch
                    disabled={settings.locationTrackingEnabled === false}
                    checked={(settings as any)[opt.key] !== false}
                    onCheckedChange={v => setSettings({ ...settings, [opt.key]: v } as any)}
                  />
                </label>
              ))}
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 rounded-lg p-3 text-[11px] text-amber-900 dark:text-amber-200">
              <b>How it works:</b> Master ON → the app will ask for a one-time browser location permission at startup. If the user clicks Allow, tracking starts. If blocked, the system keeps running but location features stay off.
            </div>

            <Button onClick={handleSaveSettings} className="w-full">💾 Save Location Settings</Button>
          </div>
        </TabsContent>

        {/* ============ SELF-PICKUP ============ */}
        <TabsContent value="pickup" className="space-y-4">
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold">Self-Pickup Settings</h3>
                <p className="text-[11px] text-muted-foreground">
                  Customer cart mein "Self-Pickup" option dikhe — delivery ki jagah customer khud aa kar order le jaye.
                </p>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
              <div>
                <div className="text-sm font-bold">🏃 Enable Self-Pickup</div>
                <div className="text-[11px] text-muted-foreground">Customer cart mein Self-Pickup option show kare</div>
              </div>
              <Switch
                checked={settings.selfPickupEnabled === true}
                onCheckedChange={v => setSettings({ ...settings, selfPickupEnabled: v })}
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-blue-400/40 bg-blue-50 dark:bg-blue-950/20">
              <div>
                <div className="text-sm font-bold">🍽️ "Select Order Type" Prompt</div>
                <div className="text-[11px] text-muted-foreground">POS kholte hi Dine-In/Takeaway/Delivery gate dialog aayega. Off karne par direct items add ho sakenge.</div>
              </div>
              <Switch
                checked={settings.orderTypeGatePromptEnabled !== false}
                onCheckedChange={v => setSettings({ ...settings, orderTypeGatePromptEnabled: v })}
              />
            </label>

            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-pink-400/40 bg-pink-50 dark:bg-pink-950/20">
              <div>
                <div className="text-sm font-bold">🛵 Enable Foodpanda Mode</div>
                <div className="text-[11px] text-muted-foreground">A 4th order type "Foodpanda" becomes available in the POS, with its own list, status pipeline and reports.</div>
              </div>
              <Switch
                checked={settings.foodpandaEnabled === true}
                onCheckedChange={v => setSettings({ ...settings, foodpandaEnabled: v })}
              />
            </label>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground">Pickup Time Slots (minutes)</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {[15, 30, 45, 60, 90, 120].map(min => {
                  const slots = settings.pickupTimeSlots || [15, 30, 45, 60];
                  const on = slots.includes(min);
                  return (
                    <button
                      key={min}
                      onClick={() => {
                        const next = on ? slots.filter(s => s !== min) : [...slots, min].sort((a, b) => a - b);
                        setSettings({ ...settings, pickupTimeSlots: next });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                        on ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/50'
                      }`}
                    >
                      {min} min
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground">"Order Ready" WhatsApp Message</label>
              <Textarea
                value={settings.pickupReadyMessage || ''}
                onChange={e => setSettings({ ...settings, pickupReadyMessage: e.target.value })}
                placeholder="Your order #{orderNo} is ready! Please collect it from the counter. Thank you!"
                className="text-xs"
              />
            </div>

            <Button onClick={handleSaveSettings} className="w-full">💾 Save Pickup Settings</Button>
          </div>
        </TabsContent>

        {/* ============ CITIES ============ */}
        <TabsContent value="cities" className="space-y-4">
          <div className="bg-card border rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Globe2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold">Cities & Areas</h3>
                <p className="text-[11px] text-muted-foreground">
                  Select only the cities where you have branches. You can also add any custom city name of your choice — type it below and click Add.
                </p>
              </div>
            </div>

            {/* Custom city adder */}
            <div className="border rounded-lg p-3 bg-primary/5 space-y-2">
              <div className="text-xs font-extrabold text-primary">➕ Add a custom city</div>
              <div className="flex gap-2">
                <input
                  list="custom-city-suggest"
                  type="text"
                  id="custom-city-input"
                  placeholder="e.g. Chiniot, Shorkot, Ahmedpur Sial, Kot Shakir..."
                  className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const input = document.getElementById('custom-city-input') as HTMLInputElement;
                      const val = input.value.trim();
                      if (!val) return;
                      const list = settings.enabledCities || [];
                      if (list.some(x => x.toLowerCase() === val.toLowerCase())) {
                        toast.error('This city already exists'); return;
                      }
                      setSettings({ ...settings, enabledCities: [...list, val] });
                      input.value = '';
                      toast.success(`${val} added`);
                    }
                  }}
                />
                <datalist id="custom-city-suggest">
                  {PAKISTAN_AREAS.flatMap(p => p.cities.map(c => c.city)).map(c => <option key={c} value={c} />)}
                </datalist>
                <Button
                  size="sm"
                  onClick={() => {
                    const input = document.getElementById('custom-city-input') as HTMLInputElement;
                    const val = input.value.trim();
                    if (!val) return;
                    const list = settings.enabledCities || [];
                    if (list.some(x => x.toLowerCase() === val.toLowerCase())) {
                      toast.error('This city already exists'); return;
                    }
                    setSettings({ ...settings, enabledCities: [...list, val] });
                    input.value = '';
                    toast.success(`${val} added`);
                  }}
                >
                  ➕ Add
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                You can type any city in Punjab or any other province that isn't in the list. Suggestions are just for help.
              </p>
            </div>

            {/* Selected cities chips */}
            {(settings.enabledCities || []).length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <div className="text-xs font-extrabold text-primary">✅ Selected / Added Cities ({(settings.enabledCities || []).length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {(settings.enabledCities || []).map(city => (
                    <span
                      key={city}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-primary text-primary-foreground border border-primary"
                    >
                      {city}
                      <button
                        onClick={() => {
                          const list = (settings.enabledCities || []).filter(x => x !== city);
                          setSettings({ ...settings, enabledCities: list });
                        }}
                        className="hover:bg-white/20 rounded-full px-1 ml-0.5"
                        title="Remove"
                      >×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {PAKISTAN_AREAS.map(prov => (
                <div key={prov.province} className="border rounded-lg p-3 bg-muted/30">
                  <div className="text-xs font-extrabold text-primary mb-2">{prov.province}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {prov.cities.map(c => {
                      const enabled = (settings.enabledCities || []).includes(c.city);
                      return (
                        <button
                          key={c.city}
                          onClick={() => {
                            const list = settings.enabledCities || [];
                            const next = enabled ? list.filter(x => x !== c.city) : [...list, c.city];
                            setSettings({ ...settings, enabledCities: next });
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold border-2 transition-all ${
                            enabled ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border hover:border-primary/50'
                          }`}
                        >
                          {enabled ? '✓ ' : '+ '}{c.city}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded">
              Selected: <b className="text-primary">{(settings.enabledCities || []).length} cities</b> — yeh BranchesPage ke City dropdown mein dikheinge.
            </div>

            <Button onClick={handleSaveSettings} className="w-full">💾 Save Cities</Button>
          </div>
        </TabsContent>

        {/* ============ SERVICE AREAS (manual entry, with suggestions + GPS) ============ */}
        <TabsContent value="serviceareas" className="space-y-4">
          <ServiceAreasEditor settings={settings} setSettings={setSettings} onSave={handleSaveSettings} />
        </TabsContent>



        {isCloudConfigured() && (<TabsContent value="online" className="space-y-4">
          <div className="bg-card border rounded-xl p-4 space-y-4">
            <div>
              <h3 className="text-sm font-bold mb-1">Online Ordering Website</h3>
              <p className="text-[11px] text-muted-foreground mb-2">
                These links show only <b>{getTenantName() || 'your restaurant'}</b>'s data. Every restaurant has its own unique link — customers can't view another restaurant's menu.
              </p>
              {(() => {
                const tid = getTenantId() || '';
                const origin = window.location.origin;
                const links: { key: string; label: string; url: string; emoji: string }[] = [
                  { key: 'order', label: 'CUSTOMER ORDER', emoji: '🛒', url: tid ? `${origin}/#/order/${tid}` : `${origin}/#/order` },
                  { key: 'track', label: 'ORDER TRACKING', emoji: '📍', url: tid ? `${origin}/#/track/${tid}` : `${origin}/#/track` },
                  { key: 'rider', label: 'RIDER PORTAL',   emoji: '🏍️', url: tid ? `${origin}/#/rider-portal/${tid}` : `${origin}/#/rider-portal` },
                ];
                return (
                  <div className="space-y-2">
                    {links.map(l => (
                      <div key={l.key} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                        <span className="text-[11px] font-bold text-muted-foreground shrink-0 w-28">{l.emoji} {l.label}</span>
                        <code className="text-[11px] flex-1 truncate font-mono">{l.url}</code>
                        <Button size="sm" variant="outline" className="h-7 text-[11px]"
                          onClick={() => { navigator.clipboard.writeText(l.url); toast.success(`${l.label} link copied!`); }}>
                          📋 Copy
                        </Button>
                        <a href={l.url.replace(origin, '')} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="h-7 text-[11px]">↗ Open</Button>
                        </a>
                      </div>
                    ))}
                    {!tid && <div className="text-[10px] text-destructive">⚠️ Tenant ID not found — please log in as owner to generate the unique link.</div>}
                  </div>
                );
              })()}
            </div>

            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border">
              <div>
                <div className="text-sm font-semibold">Enable Online Ordering</div>
                <div className="text-xs text-muted-foreground">Master switch — website ON/OFF</div>
              </div>
              <input type="checkbox" className="w-5 h-5" checked={settings.onlineOrderEnabled !== false}
                onChange={e => setSettings({ ...settings, onlineOrderEnabled: e.target.checked })} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between gap-2 p-3 rounded-lg border">
                <span className="text-xs font-semibold">Delivery Orders</span>
                <input type="checkbox" className="w-5 h-5" checked={settings.onlineDeliveryEnabled !== false}
                  onChange={e => setSettings({ ...settings, onlineDeliveryEnabled: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-2 p-3 rounded-lg border">
                <span className="text-xs font-semibold">Pickup Orders</span>
                <input type="checkbox" className="w-5 h-5" checked={settings.onlinePickupEnabled !== false}
                  onChange={e => setSettings({ ...settings, onlinePickupEnabled: e.target.checked })} />
              </label>
              <label className="flex items-center justify-between gap-2 p-3 rounded-lg border col-span-2">
                <span className="text-xs font-semibold">Allow Guest Checkout (no signup)</span>
                <input type="checkbox" className="w-5 h-5" checked={settings.allowGuestCheckout !== false}
                  onChange={e => setSettings({ ...settings, allowGuestCheckout: e.target.checked })} />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Delivery Charge (Rs.)</label>
                <Input type="number" value={settings.deliveryCharge ?? 0}
                  onChange={e => setSettings({ ...settings, deliveryCharge: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Free Delivery Above (Rs.)</label>
                <Input type="number" value={settings.freeDeliveryThreshold ?? 0}
                  onChange={e => setSettings({ ...settings, freeDeliveryThreshold: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Minimum Order (Rs.)</label>
                <Input type="number" value={settings.minOnlineOrder ?? 0}
                  onChange={e => setSettings({ ...settings, minOnlineOrder: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Delivery Radius (KM)</label>
                <Input type="number" value={settings.deliveryRadiusKm ?? 0}
                  onChange={e => setSettings({ ...settings, deliveryRadiusKm: Number(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground bg-muted/30 p-2 rounded">
              💡 Tip: Share the website link on your Facebook / Instagram / WhatsApp bio. Orders will automatically appear in your <b>Delivery Board</b> and <b>Kitchen Queue</b>.
            </div>
          </div>
        </TabsContent>)}

        {isCloudConfigured() && (<TabsContent value="branches" className="space-y-3">
          <div className="bg-card border rounded-xl p-4">
            <h3 className="text-sm font-bold mb-1">Branch Management</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Add/edit your restaurant branches (Jhang, Faisalabad, etc.) here.
              Har bill active branch ke sath save hota hai aur Reports me uss branch ka data alag dikhta hai.
            </p>
            <a href="#/branches" className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline">
              → Branches page kholein
            </a>
          </div>
        </TabsContent>)}

        {isCloudConfigured() && (<TabsContent value="devices" className="space-y-3">
          <div className="bg-card border rounded-xl p-4">
            <h3 className="text-sm font-bold mb-1">Multi-Device Login (Online Mode)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Cloud mode active hone par har naye device ka approval / block control kar saktay hain.
              In offline mode only a single device works.
            </p>
            <a href="#/devices" className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline">
              → Devices page kholein
            </a>
          </div>
        </TabsContent>)}

        <TabsContent value="general" className="space-y-4">
          {/* ===== INTERNATIONAL: Country / Currency / Tax ===== */}
          <CountryCurrencyCard settings={settings} setSettings={setSettings} />

          <div>
            <label className="text-xs font-medium text-muted-foreground">Restaurant Name</label>
            <Input value={settings.name} onChange={e => setSettings({ ...settings, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Address</label>
            <Input value={settings.address} onChange={e => setSettings({ ...settings, address: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Website URL (optional)</label>
            <Input
              placeholder="https://yourrestaurant.com"
              value={settings.externalWebsiteUrl || ''}
              onChange={e => setSettings({ ...settings, externalWebsiteUrl: e.target.value })}
            />
            <p className="text-[10px] text-muted-foreground mt-1">If you have your own website, paste the link here. It will show on receipts / portal.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone 1</label>
              <Input value={settings.phone1} onChange={e => setSettings({ ...settings, phone1: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone 2</label>
              <Input value={settings.phone2} onChange={e => setSettings({ ...settings, phone2: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tax Amount (PKR)</label>
              <Input type="number" value={settings.taxAmount} onChange={e => setSettings({ ...settings, taxAmount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Service Charge (%)</label>
              <Input type="number" value={settings.serviceChargePercent} onChange={e => setSettings({ ...settings, serviceChargePercent: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">GST / VAT %</label>
              <Input type="number" value={(settings as any).taxPercent ?? 0}
                onChange={e => setSettings({ ...settings, taxPercent: Number(e.target.value) } as any)} />
              <p className="text-[11px] text-muted-foreground">0 = off. Service charge is applied first, then GST (client formula).</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">GST Mode</label>
              <select className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                value={(settings as any).taxMode || 'exclusive'}
                onChange={e => setSettings({ ...settings, taxMode: e.target.value } as any)}>
                <option value="exclusive">Exclusive — added on top of the total</option>
                <option value="inclusive">Inclusive — qeemat me shamil hai</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Quick Discount — Percent presets (%)</label>
              {/* FIX: pehle value seedha parsed-array se banti thi, is liye comma
                  type karte hi ghayab ho jata tha (10 → 102). Ab RAW text draft
                  rehta hai, parse sirf blur/commit pe hota hai. Khali = optional. */}
              <Input
                value={discountPctDraft}
                placeholder="e.g. 5,10,15,20 (leave empty = no buttons)"
                onChange={e => setDiscountPctDraft(e.target.value)}
                onBlur={() => {
                  const nums = discountPctDraft.split(',').map(x => Number(x.trim())).filter(n => Number.isFinite(n) && n > 0 && n < 100);
                  setSettings({ ...settings, discountPresets: nums } as any);
                  setDiscountPctDraft(nums.join(','));
                }}
              />
              <p className="text-[11px] text-muted-foreground">Separate with commas. Between 0–99. Leave empty and no percent buttons will show.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Quick Discount — Amount presets</label>
              <Input
                value={discountAmtDraft}
                placeholder="e.g. 50,100,200 (leave empty = no buttons)"
                onChange={e => setDiscountAmtDraft(e.target.value)}
                onBlur={() => {
                  const nums = discountAmtDraft.split(',').map(x => Number(x.trim())).filter(n => Number.isFinite(n) && n > 0);
                  setSettings({ ...settings, discountAmountPresets: nums } as any);
                  setDiscountAmtDraft(nums.join(','));
                }}
              />
              <p className="text-[11px] text-muted-foreground">Amount-based buttons (no limit). If both are empty, discount buttons are off.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Payment Screen — Cash Quick Amounts</label>
              <Input
                value={payQuickDraft}
                placeholder="e.g. 10,20,50,100 (empty = default)"
                onChange={e => setPayQuickDraft(e.target.value)}
                onBlur={() => {
                  const nums = payQuickDraft.split(',').map(x => Number(x.trim())).filter(n => Number.isFinite(n) && n > 0);
                  setSettings({ ...settings, paymentQuickAmounts: nums } as any);
                  setPayQuickDraft(nums.join(','));
                }}
              />
              <p className="text-[11px] text-muted-foreground">One-tap cash buttons on the payment screen. (Discount buttons appear below the cart on the POS screen.)</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Payment Screen — Quick Cash Amounts</label>
              <Input
                value={quickCashDraft}
                placeholder="e.g. 5,10,20,50,100 (empty = default)"
                onChange={e => setQuickCashDraft(e.target.value)}
                onBlur={() => {
                  const nums = quickCashDraft.split(',').map(x => Number(x.trim())).filter(n => Number.isFinite(n) && n > 0);
                  setSettings({ ...settings, quickCashAmounts: nums } as any);
                  setQuickCashDraft(nums.join(','));
                }}
              />
              <p className="text-[11px] text-muted-foreground">Cash lene ke tez buttons — payment screen pe nazar aayenge.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Delivery Charge (flat)</label>
              <Input type="number" value={settings.deliveryCharge ?? 0}
                onChange={e => setSettings({ ...settings, deliveryCharge: Number(e.target.value) })} />
              <p className="text-[11px] text-muted-foreground">Added automatically on every delivery order.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cash Rounding</label>
              <select className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                value={(settings as any).roundingMode || 'none'}
                onChange={e => setSettings({ ...settings, roundingMode: e.target.value } as any)}>
                <option value="none">No rounding</option>
                <option value="0.05">Nearest 0.05 (5 cents)</option>
                <option value="0.10">Nearest 0.10 (10 cents)</option>
                <option value="1">Nearest 1</option>
              </select>
              <p className="text-[11px] text-muted-foreground">1,2,3,4,6,7,8,9 cents na len — total nearest 0.05 pe.</p>
            </div>
          </div>

          {/* COST TRACKING TOGGLE — master switch for food cost / profitability features */}
          <div className="border-2 rounded-lg p-4 space-y-2 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">💰 Food Cost & Profit Tracking</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  ON karne par: Recipes, Food Cost %, Margin, Profitability reports & Inventory Valuation enable hote hain.
                  <br/>OFF par: simple POS + stock management (no cost columns, no profit reports).
                </p>
              </div>
              <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={!!settings.costTrackingEnabled}
                  onChange={e => setSettings({ ...settings, costTrackingEnabled: e.target.checked })}
                />
                <span className="text-xs font-bold">{settings.costTrackingEnabled ? 'ON' : 'OFF'}</span>
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Reload the page after saving settings so the sidebar updates.
            </p>
          </div>

          {/* DISCOUNT MANAGEMENT */}
          <div className="border-2 rounded-lg p-4 space-y-3 border-status-warning/40 bg-status-warning/5">
            <h3 className="text-sm font-bold flex items-center gap-2">🏷️ Discount Management</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex items-center gap-2 bg-card border rounded-md px-3 py-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-primary"
                  checked={settings.pkrDiscountEnabled !== false}
                  onChange={e => setSettings({ ...settings, pkrDiscountEnabled: e.target.checked })} />
                <span className="text-xs font-bold">PKR Discount</span>
              </label>
              <label className="flex items-center gap-2 bg-card border rounded-md px-3 py-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-primary"
                  checked={settings.percentDiscountEnabled !== false}
                  onChange={e => setSettings({ ...settings, percentDiscountEnabled: e.target.checked })} />
                <span className="text-xs font-bold">% Discount</span>
              </label>
              <label className="flex items-center gap-2 bg-card border rounded-md px-3 py-2 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 accent-primary"
                  checked={!!settings.eventDiscountEnabled}
                  onChange={e => setSettings({ ...settings, eventDiscountEnabled: e.target.checked })} />
                <span className="text-xs font-bold">Event Discount</span>
              </label>
            </div>
            {settings.eventDiscountEnabled && (
              <div className="grid grid-cols-3 gap-2 bg-card rounded-md p-3 border">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">Event Title</label>
                  <Input value={settings.eventDiscountTitle || ''}
                    onChange={e => setSettings({ ...settings, eventDiscountTitle: e.target.value })}
                    placeholder="e.g. Eid Discount" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">Type</label>
                  <select
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    value={settings.eventDiscountType || 'percent'}
                    onChange={e => setSettings({ ...settings, eventDiscountType: e.target.value as 'percent' | 'pkr' })}
                  >
                    <option value="percent">Percentage %</option>
                    <option value="pkr">Flat PKR</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">
                    {(settings.eventDiscountType || 'percent') === 'percent' ? 'Percent (%)' : 'Amount (Rs.)'}
                  </label>
                  {(settings.eventDiscountType || 'percent') === 'percent' ? (
                    <Input type="number" value={settings.eventDiscountPercent || ''}
                      onChange={e => setSettings({ ...settings, eventDiscountPercent: Number(e.target.value) || 0 })}
                      placeholder="10" />
                  ) : (
                    <Input type="number" value={settings.eventDiscountAmount || ''}
                      onChange={e => setSettings({ ...settings, eventDiscountAmount: Number(e.target.value) || 0 })}
                      placeholder="100" />
                  )}
                </div>
                <p className="col-span-3 text-[10px] text-muted-foreground">
                  Yeh discount har bill par automatic apply hoga (excluded categories chhor kar).
                </p>
              </div>
            )}
            <div className="bg-card rounded-md p-3 border space-y-1">
              <label className="text-[11px] font-bold text-muted-foreground">Excluded Categories (no discount)</label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {getCategories().map(c => {
                  const checked = (settings.discountExcludedCategoryIds || []).includes(c.id);
                  return (
                    <button key={c.id}
                      onClick={() => {
                        const cur = settings.discountExcludedCategoryIds || [];
                        const next = checked ? cur.filter(x => x !== c.id) : [...cur, c.id];
                        setSettings({ ...settings, discountExcludedCategoryIds: next });
                      }}
                      className={`text-[11px] px-2 py-1 rounded-md border font-bold transition-colors ${
                        checked ? 'bg-destructive/15 text-destructive border-destructive/40' : 'bg-muted hover:bg-accent'
                      }`}
                    >
                      {checked ? '✕ ' : ''}{c.icon} {c.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground italic">Example: Beverages / Cold Drinks per discount na lage.</p>
            </div>
          </div>

          {/* SOFTWARE FEATURE CONTROL — CASHIER RESTRICTIONS */}
          <div className="border-2 rounded-lg p-4 space-y-3 border-violet-500/40 bg-violet-500/5">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">🔒 Software Feature Control — Cashier Restrictions</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Control here which feature the cashier can do on their own and which needs admin approval. These restrictions do not apply to Admin / Manager.
              </p>
            </div>
            <label className="flex items-start gap-3 bg-card border rounded-md px-3 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary mt-0.5"
                checked={!!settings.cashierDiscountRequiresApproval}
                onChange={e => setSettings({ ...settings, cashierDiscountRequiresApproval: e.target.checked })}
              />
              <div className="flex-1">
                <div className="text-xs font-bold flex items-center gap-2">
                  Discount require Admin Approval
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${settings.cashierDiscountRequiresApproval ? 'bg-amber-500/20 text-amber-700' : 'bg-green-500/20 text-green-700'}`}>
                    {settings.cashierDiscountRequiresApproval ? 'ON — Approval Required' : 'OFF — Cashier Can Discount'}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ON: Cashier POS me discount field disabled hoga. Discount lagane ke liye bill Bill Editor (Admin) me jana hoga jahan admin approve / edit karega.
                  <br />OFF: Cashier can also apply a discount in POS on their own (current behavior).
                </p>
              </div>
            </label>
          </div>

          {/* LOYALTY PROGRAM */}
          <div className="border-2 rounded-lg p-4 space-y-3 border-gold/40 bg-gold/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">🏆 Loyalty Program</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Customers ko har paid order par automatic points milein. Points balance Customers page par dikhe.
                </p>
              </div>
              <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                <input type="checkbox" className="h-5 w-5 accent-primary"
                  checked={!!settings.loyaltyEnabled}
                  onChange={e => setSettings({ ...settings, loyaltyEnabled: e.target.checked })} />
                <span className="text-xs font-bold">{settings.loyaltyEnabled ? 'ON' : 'OFF'}</span>
              </label>
            </div>
            {settings.loyaltyEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-card rounded-md p-3 border">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">Earn (points per Rs. 100)</label>
                  <Input type="number" min={0} step={0.5}
                    value={settings.loyaltyEarnPerRs100 ?? 1}
                    onChange={e => setSettings({ ...settings, loyaltyEarnPerRs100: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">Redeem value (Rs. per 1 point)</label>
                  <Input type="number" min={0} step={0.5}
                    value={settings.loyaltyRedeemRate ?? 1}
                    onChange={e => setSettings({ ...settings, loyaltyRedeemRate: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground">Min points to redeem</label>
                  <Input type="number" min={0}
                    value={settings.loyaltyMinRedeemPoints ?? 100}
                    onChange={e => setSettings({ ...settings, loyaltyMinRedeemPoints: Number(e.target.value) || 0 })} />
                </div>
                <p className="col-span-full text-[10px] text-muted-foreground italic">
                  Example: 1 pt / Rs.100 spent. Rs.1000 bill = 10 points. 100 points = Rs.100 redeem value.
                </p>
              </div>
            )}
          </div>

          {/* QR Master Toggle (granular QR settings already in Receipt & QR tab) */}
          <div className="border rounded-lg p-3 flex items-center justify-between bg-card">
            <div>
              <h3 className="text-sm font-bold">📱 Receipt QR Code</h3>
              <p className="text-[11px] text-muted-foreground">Master toggle — when OFF no QR will print on the receipt.</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 accent-primary"
                checked={settings.qrEnabled !== false}
                onChange={e => setSettings({ ...settings, qrEnabled: e.target.checked })} />
              <span className="text-xs font-bold">{settings.qrEnabled !== false ? 'ON' : 'OFF'}</span>
            </label>
          </div>

          {/* Urdu Font Selection */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-bold">🔤 Urdu Font Selection</h3>
            <p className="text-xs text-muted-foreground">ریسٹورنٹ نام، ایڈریس، آئٹم نام وغیرہ کے لیے اردو فونٹ منتخب کریں</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'none', label: 'Default (English)', preview: 'Restaurant Name' },
                { value: 'Aseer Unicode', label: 'Aseer Unicode', preview: 'ریسٹورنٹ نام' },
                { value: 'AA Sameer Armaa', label: 'AA Sameer Armaa', preview: 'ریسٹورنٹ نام' },
                { value: 'Jameel Noori Nastaleeq', label: 'Jameel Noori Nastaleeq', preview: 'ریسٹورنٹ نام' },
                { value: 'Jameel Noori Nastaleeq Regular', label: 'Jameel Noori Nastaleeq Regular', preview: 'ریسٹورنٹ نام' },
              ] as const).map(font => (
                <button
                  key={font.value}
                  onClick={() => setSettings({ ...settings, urduFont: font.value })}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    settings.urduFont === font.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-accent'
                  }`}
                >
                  <span className="text-xs font-bold block">{font.label}</span>
                  <span
                    className="text-sm block mt-1"
                    style={{ fontFamily: font.value === 'none' ? 'inherit' : `'${font.value}', serif`, direction: font.value !== 'none' ? 'rtl' : 'ltr' }}
                  >
                    {font.value === 'none' ? settings.name || 'Restaurant Name' : font.preview}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Receipt / KOT Logo</label>
            <p className="text-[10px] text-muted-foreground mb-1">Yeh logo sirf printed receipts aur kitchen tickets pe lagega.</p>
            <div className="flex items-center gap-4 mt-1">
              {settings.logo && (
                <img
                  src={settings.logo}
                  alt="Logo"
                  className="object-contain rounded border bg-background"
                  style={{ width: `${settings.logoWidth || 60}px`, height: `${settings.logoHeight || 60}px` }}
                />
              )}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      Upload Receipt Logo
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 500 * 1024) { toast.error('Logo must be under 500KB'); return; }
                        const reader = new FileReader();
                        reader.onload = () => setSettings({ ...settings, logo: reader.result as string });
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                  </Button>
                  {settings.logo && (
                    <Button variant="ghost" size="sm" onClick={() => setSettings({ ...settings, logo: '' })}>Remove</Button>
                  )}
                </div>
                {settings.logo && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-muted-foreground">W</label>
                      <Input
                        type="number"
                        className="w-16 h-7 text-xs"
                        value={settings.logoWidth || 60}
                        onChange={e => setSettings({ ...settings, logoWidth: Math.max(20, Math.min(200, Number(e.target.value))) })}
                        min={20} max={200}
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] text-muted-foreground">H</label>
                      <Input
                        type="number"
                        className="w-16 h-7 text-xs"
                        value={settings.logoHeight || 60}
                        onChange={e => setSettings({ ...settings, logoHeight: Math.max(20, Math.min(200, Number(e.target.value))) })}
                        min={20} max={200}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">px</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== PER-SURFACE LOGOS ===== */}
          <div className="border-2 rounded-lg p-4 space-y-4 border-primary/30 bg-primary/5">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">🖼️ Per-Surface Logos</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Each surface has its own separate logo. Leave empty and it falls back to the Receipt Logo (above).
                Uploading here will not affect anywhere else.
              </p>
            </div>

            {/* App/Login logo */}
            <SurfaceLogoRow
              label="Admin App + Login Screen"
              hint="POS sidebar aur owner/cashier login screen ka logo."
              value={settings.appLogo}
              onChange={(v) => setSettings({ ...settings, appLogo: v })}
            />

            {/* Web Portal logo */}
            <SurfaceLogoRow
              label="Web Ordering Portal"
              hint="Online order page (#/order) aur Track Order page ka logo."
              value={settings.webPortalLogo}
              onChange={(v) => setSettings({ ...settings, webPortalLogo: v })}
            />

            {/* Order Taker logo */}
            <SurfaceLogoRow
              label="Order Taker / Waiter App"
              hint="Order Taker mobile portal (#/order-taker/...) ka logo."
              value={settings.orderTakerLogo}
              onChange={(v) => setSettings({ ...settings, orderTakerLogo: v })}
            />
          </div>

          {/* ===== RESTAURANT PHYSICAL LOCATION ===== */}
          <div className="border-2 rounded-lg p-4 space-y-3 border-status-info/30 bg-status-info/5">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">📍 Restaurant Physical Location</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Aapke restaurant ki actual location. Yeh Super Admin map par dikhaayi degi (devices ke alawa).
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">Latitude</label>
                <Input type="number" step="0.000001" value={settings.restaurantLat ?? ''}
                  onChange={e => setSettings({ ...settings, restaurantLat: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder="30.1575" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">Longitude</label>
                <Input type="number" step="0.000001" value={settings.restaurantLng ?? ''}
                  onChange={e => setSettings({ ...settings, restaurantLng: e.target.value === '' ? undefined : Number(e.target.value) })}
                  placeholder="72.6504" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">Label</label>
                <Input value={settings.restaurantLocationLabel || ''}
                  onChange={e => setSettings({ ...settings, restaurantLocationLabel: e.target.value })}
                  placeholder="Jhang Main Branch" />
              </div>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => {
              if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  setSettings({
                    ...settings,
                    restaurantLat: Number(pos.coords.latitude.toFixed(6)),
                    restaurantLng: Number(pos.coords.longitude.toFixed(6)),
                  });
                  toast.success('Location captured');
                },
                (err) => toast.error(err.message || 'Failed to get location'),
                { enableHighAccuracy: true, timeout: 10000 }
              );
            }}>
              📡 Use Current GPS Location
            </Button>
          </div>

          <Button onClick={handleSaveSettings}>Save Settings</Button>
        </TabsContent>

        {/* Theme Switcher */}
        <TabsContent value="theme" className="space-y-4">
          {/* Premium Polish toggle — soft shadows, subtle bg wash, focus ring, button lift.
              Works on top of ANY colour theme. Device-local (per machine). */}
          <div className="border-2 rounded-lg p-4 bg-gradient-to-r from-fuchsia-50 to-purple-50 border-fuchsia-200">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <h3 className="text-sm font-bold">Premium Polish</h3>
                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-fuchsia-600 text-white">NEW</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Soft card shadows, subtle background wash, refined focus ring aur button press-lift.
                  Har theme ke upar kaam karta hai — structure aur colors same rehte hain.
                </p>
              </div>
              <Switch
                checked={premiumPolish}
                onCheckedChange={(v) => {
                  setPremiumPolish(v);
                  setPremiumPolishState(v);
                  toast.success(v ? 'Premium Polish ON ✨' : 'Premium Polish OFF');
                }}
              />
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              <h3 className="text-sm font-bold">🎨 UI Theme / تھیم تبدیل کریں</h3>
            </div>
            <p className="text-xs text-muted-foreground">اپنی پسند کا تھیم منتخب کریں — تمام سکرینز آٹو اپڈیٹ ہو جائیں گی</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {themes.map(theme => {
                const isPremium = theme.id === 'vince-premium';
                const premiumAllowed = !!(settings as any).premiumThemeAllowed;
                const locked = isPremium && !premiumAllowed;
                return (
                  <button
                    key={theme.id}
                    disabled={locked}
                    onClick={() => {
                      if (locked) {
                        toast.error('🔒 Premium Theme locked — Super Admin se allotment maangein (digitaltarget.digital@gmail.com)');
                        return;
                      }
                      setActiveTheme(theme.id);
                      setCurrentTheme(theme.id);
                      // Auto-mark premium as enabled when user picks it
                      if (isPremium) {
                        saveSettings({ ...(settings as any), premiumThemeEnabled: true });
                      } else if ((settings as any).premiumThemeEnabled) {
                        saveSettings({ ...(settings as any), premiumThemeEnabled: false });
                      }
                      toast.success(`Theme changed to ${theme.name}`);
                    }}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                      currentTheme === theme.id
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                        : locked
                          ? 'border-dashed border-fuchsia-400/40 bg-fuchsia-50/30 opacity-70 cursor-not-allowed'
                          : 'border-border hover:border-primary/40'
                    }`}
                  >
                    {isPremium && (
                      <span className={`absolute top-2 right-2 text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                        premiumAllowed ? 'bg-fuchsia-600 text-white' : 'bg-gray-300 text-gray-700'
                      }`}>
                        {premiumAllowed ? '✓ UNLOCKED' : '🔒 LOCKED'}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{theme.emoji}</span>
                      <span className="text-sm font-bold">{theme.name}</span>
                      {currentTheme === theme.id && (
                        <span className="ml-auto text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Active</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{theme.description}</p>
                    {locked && (
                      <p className="text-[10px] text-fuchsia-700 mt-1 font-semibold">
                        Premium feature — Super Admin allotment required
                      </p>
                    )}
                    <div className="flex gap-1 mt-2">
                      {['--primary', '--background', '--card', '--accent', '--pos-sidebar'].map(varName => (
                        <div
                          key={varName}
                          className="h-4 w-4 rounded-full border border-border/50"
                          style={{ backgroundColor: `hsl(${theme.variables[varName]})` }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-4">
          {/* WhatsApp Number & Floating Button Settings */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-[#25D366]/15 text-[#25D366] flex items-center justify-center shrink-0">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold">WhatsApp Floating Button</h3>
                <p className="text-[11px] text-muted-foreground">
                  Online order web pe bottom-right corner mein WhatsApp button dikhega. Customer click kare to seedha WhatsApp pe chala jaye ga.
                </p>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-primary/30 bg-primary/5">
              <div>
                <div className="text-sm font-bold">💬 Enable Floating Button</div>
                <div className="text-[11px] text-muted-foreground">Online order pages pe WhatsApp button show kare</div>
              </div>
              <Switch
                checked={settings.whatsappFloatingEnabled !== false}
                onCheckedChange={v => setSettings({ ...settings, whatsappFloatingEnabled: v })}
              />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">WhatsApp Number</label>
                <Input
                  value={settings.supportWhatsappNumber || ''}
                  onChange={e => setSettings({ ...settings, supportWhatsappNumber: e.target.value })}
                  placeholder="03001234567 ya +923001234567"
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Customers are redirected to this number. If empty, phone1 is used.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Default Button Message</label>
                <Input
                  value={settings.whatsappFloatingMessage || ''}
                  onChange={e => setSettings({ ...settings, whatsappFloatingMessage: e.target.value })}
                  placeholder="Salam! Mujhe order ke baare me poochna tha."
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">This pre-filled message will be sent to the customer's WhatsApp.</p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <h3 className="text-sm font-bold">WhatsApp Message Templates</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Edit auto message templates here. Variables: {'{customer_name}'}, {'{order_number}'}, {'{grand_total}'}, {'{restaurant_name}'}, {'{delivery_status_line}'}, {'{rider_block}'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Default paid message</label>
                <Select
                  value={settings.defaultPaidWhatsAppTemplateId || 'paid-default'}
                  onValueChange={(value) => setSettings({ ...settings, defaultPaidWhatsAppTemplateId: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                  <SelectContent>
                    {getWhatsAppTemplates(settings).map(template => (
                      <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Default delivery message</label>
                <Select
                  value={settings.defaultDeliveryWhatsAppTemplateId || 'delivery-default'}
                  onValueChange={(value) => setSettings({ ...settings, defaultDeliveryWhatsAppTemplateId: value })}
                >
                  <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                  <SelectContent>
                    {getWhatsAppTemplates(settings).map(template => (
                      <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => setSettings({
                  ...settings,
                  whatsappTemplates: [
                    ...getWhatsAppTemplates(settings),
                    { id: `custom-${Date.now()}`, name: 'Custom Template', body: 'Assalam o Alaikum {customer_name},\n' },
                  ],
                })}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Template
              </Button>
            </div>

            {getWhatsAppTemplates(settings).map((template) => (
              <div key={template.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold">{template.name}</p>
                    <p className="text-[10px] text-muted-foreground">ID: {template.id}</p>
                  </div>
                  <div className="flex gap-2">
                    {!['paid-default', 'delivery-default'].includes(template.id) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSettings({
                          ...settings,
                          whatsappTemplates: getWhatsAppTemplates(settings).filter(t => t.id !== template.id),
                          defaultPaidWhatsAppTemplateId: (settings.defaultPaidWhatsAppTemplateId === template.id ? 'paid-default' : settings.defaultPaidWhatsAppTemplateId),
                          defaultDeliveryWhatsAppTemplateId: (settings.defaultDeliveryWhatsAppTemplateId === template.id ? 'delivery-default' : settings.defaultDeliveryWhatsAppTemplateId),
                        })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <Input
                  value={template.name}
                  onChange={e => setSettings({
                    ...settings,
                    whatsappTemplates: getWhatsAppTemplates(settings).map(t => t.id === template.id ? { ...t, name: e.target.value } : t),
                  })}
                />
                <Textarea
                  rows={6}
                  value={template.body}
                  onChange={e => setSettings({
                    ...settings,
                    whatsappTemplates: getWhatsAppTemplates(settings).map(t => t.id === template.id ? { ...t, body: e.target.value } : t),
                  })}
                />
              </div>
            ))}
          </div>

          <Button onClick={handleSaveSettings} className="w-full">Save WhatsApp Templates</Button>
        </TabsContent>

        {/* Receipt & QR Settings */}
        <TabsContent value="receipt" className="space-y-4">
          {/* Receipt Design Selector */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-bold">🎨 Receipt Design Template</h3>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'standard', name: '⭐ Standard (Recommended)', desc: '80mm compact, clean. Logo→Name→Address→Phone, table never wraps, toggles for all sections' },
                { id: 'compact-thermal', name: '🧾 Compact Thermal (Paper Saver)', desc: 'FoodFight/Zesto style — smallest fonts, tightest spacing, ~30-40% less paper. Auto-applies compact mode to print.' },
                { id: 'classic', name: '📋 Classic', desc: 'Bordered table, traditional look' },
                { id: 'modern', name: '🖤 Modern Branded', desc: 'Clean lines, inverted header' },
                { id: 'compact', name: '📏 Compact Mini', desc: 'Minimal size, paper saver' },
                { id: 'luxury', name: '✨ Luxury VIP', desc: 'Double borders, serif fonts' },
                { id: 'executive', name: '🏢 Executive', desc: 'Premium corporate, monogram + striped rows' },
                { id: 'royal', name: '👑 Royal Dining', desc: 'Fine-dining ornaments, serif elegance' },
                { id: 'bistro', name: '☕ Bistro Café', desc: 'Friendly café vibe, rounded badges' },
                { id: 'heritage', name: '🏛 Heritage', desc: 'Vintage stamp header, classic ledger feel' },
                { id: 'metro', name: '🚇 Metro', desc: 'Bold uppercase, ticket-style bands' },
                { id: 'shahenshah', name: '👑 Shahenshah Style', desc: 'Boxed header sections, classic dhaba look' },
                { id: 'taste-bistro', name: '🍴 Taste Bistro', desc: 'Chef hat header, bordered items table' },
                { id: 'food-palace', name: '🍽 Food Palace', desc: 'Circle cloche logo, clean minimal lines' },
                { id: 'spice-house', name: '🌶 Spice House', desc: 'Crossed cutlery emblem, dotted item rows' },
                { id: 'taimoor', name: '📋 Taimoor', desc: 'Clean customer receipt — chef logo header, # / Item / Qty / Rate / Amount table' },
                { id: 'design1-table', name: '📊 Design 1 — Table Style', desc: 'Classic bordered table, dashed separators, full info grid' },
                { id: 'design2-box', name: '📦 Design 2 — Box Style', desc: 'Boxed info layout, bordered items, dark change bar' },
                { id: 'design3-modern', name: '🎨 Design 3 — Modern Style', desc: 'Black banner header, icon info rows, 3-col totals' },
                { id: 'design4-compact', name: '📏 Design 4 — Compact Style', desc: 'Ultra compact, short labels, minimal spacing' },
                { id: 'design5-delivery', name: '🚚 Design 5 — Delivery Style', desc: 'Delivery receipt with driver info, delivery charge' },
                { id: 'sero', name: '✨ Sero — Sleek Minimal', desc: 'Customer receipt: clean lines, dotted rows, bold total band' },
                { id: 'bero', name: '⚡ Bero — Bold Contrast', desc: 'Customer receipt: inverted header, boxed details, dark grand total' },
                { id: 'kot-style', name: '👨‍🍳 KOT Style', desc: 'Customer receipt: chef hat logo header, info grid, bordered Qty/Note table, Special Notes box' },
                { id: 'kot-classic', name: '🍽 KOT Classic', desc: 'Clean dashed lines, chef-hat & cloche logo, dotted item rows, fully editable text & fonts' },
                { id: 'premium-paid-banner', name: '🧾 Premium — Paid Banner', desc: 'Centred header, bold PAID/UNPAID banner, full meta block, bordered item grid' },
                { id: 'premium-tax-invoice', name: '🧮 Premium — Tax Invoice', desc: 'Large name, tax-number row, boxed date bar, full grid and a QR block' },
                { id: 'premium-panel', name: '🗂 Premium — Panelled Bill', desc: 'Framed address panel, bold title bar, big boxed order number, panelled totals' },
                { id: 'premium-fine-dining', name: '🍷 Premium — Fine Dining', desc: 'Serif type, generous spacing, rules instead of boxes, large table number' },
                { id: 'premium-grid-invoice', name: '📐 Premium — Grid Invoice', desc: 'Two-column meta grid and a fully ruled table with a variant column' },
                { id: 'premium-hall-detail', name: '🏨 Premium — Hall Detail', desc: 'Every charge itemised, plus the grand total spelled out in words' },
                { id: 'premium-quick-bill', name: '⚡ Premium — Quick Bill', desc: 'Dashed rules, big bill number, oversized grand total, QR to pay' },
                { id: 'premium-two-column', name: '🪧 Premium — Two Column', desc: 'Logo left with shop details right, paired meta columns, heavy net line' },
                { id: 'premium-retail', name: '🛍 Premium — Retail Counter', desc: 'Shop-counter layout with policy footer and contact block' },
                { id: 'premium-grouped', name: '🍱 Premium — Grouped Menu', desc: 'Items gathered under their menu category, boxed payable block and QR' },
                { id: 'premium-token-hero', name: '🎫 Premium — Token Hero', desc: 'Very large token number under a decorated header, compact item list' },
                { id: 'premium-boxed-ledger', name: '📒 Premium — Boxed Ledger', desc: 'Stacked framed meta panels, totals inside the item frame, amount in words' },
                { id: 'premium-rounded-panel', name: '🫧 Premium — Rounded Panel', desc: 'Logo beside the shop block, soft-cornered item table and totals panel' },
              ] as const).map(d => (
                <button
                  key={d.id}
                  onClick={() => setSettings({ ...settings, receiptDesign: d.id })}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    (settings.receiptDesign || 'classic') === d.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-accent'
                  }`}
                >
                  <div className="text-sm font-bold">{d.name}</div>
                  <div className="text-xs opacity-80">{d.desc}</div>
                </button>
              ))}
            </div>

            {/* Live Receipt Preview — shows currently selected design with sample data */}
            <div className="mt-4 border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold">👁 Live Preview — <span className="text-primary">{settings.receiptDesign || 'classic'}</span></h4>
                <span className="text-[10px] text-muted-foreground">Sample order — the actual print looks the same</span>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 overflow-auto max-h-[520px] flex justify-center">
                <div className="bg-white shadow-md">
                  <ReceiptPreview order={sampleOrder as any} settings={settings} showPrintButton={false} />
                </div>
              </div>
            </div>
          </div>

          {/* ===== Standard Receipt — Section Toggles ===== */}
          <div className="border-t pt-3 mt-2">
            <h4 className="text-xs font-bold mb-2">⭐ Standard Receipt — Show/Hide Sections</h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                { key: 'receiptShowLogo',      label: 'Show Logo',          def: true },
                { key: 'receiptShowAddress',   label: 'Show Address',       def: true },
                { key: 'receiptShowPhone',     label: 'Show Phone',         def: true },
                { key: 'receiptShowDiscount',  label: 'Show Discount',      def: true },
                { key: 'receiptShowTax',       label: 'Show Tax / Service Charge', def: true },
                { key: 'receiptShowFooter',    label: 'Show Footer (Thank You)', def: true },
                { key: 'receiptShowPoweredBy', label: 'Show "Powered by Digital Target"', def: true },
                { key: 'receiptCompactMode',   label: '🧾 Compact Print Mode (GLOBAL — applies to ALL receipts + KOT, saves 30-40% paper)', def: false },
              ].map(t => {
                const val = (settings as any)[t.key];
                const on = val === undefined ? t.def : !!val;
                return (
                  <label key={t.key} className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2 rounded-lg cursor-pointer">
                    <span className="text-xs font-semibold">{t.label}</span>
                    <button type="button" onClick={() => setSettings({ ...settings, [t.key]: !on } as any)}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                      <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                );
              })}
            </div>
            <div className="mt-2">
              <label className="text-xs font-medium text-muted-foreground">Support Phone (shown in "Powered by" line)</label>
              <Input value={(settings as any).supportPhone ?? ''} placeholder="0345-1873354"
                onChange={e => setSettings({ ...settings, supportPhone: e.target.value } as any)} />
            </div>

            {/* Compact Mode tuning — only meaningful when Compact Print Mode is ON */}
            <div className="mt-3 p-3 rounded-lg border bg-muted/30">
              <div className="text-xs font-bold mb-2">🧾 Compact Print — Fine Tuning</div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Compact Font Size (px)</label>
                  <Input type="number" min={8} max={16} step={1}
                    value={(settings as any).receiptCompactFontSize ?? 11}
                    onChange={e => setSettings({ ...settings, receiptCompactFontSize: Math.max(8, Math.min(16, Number(e.target.value) || 11)) } as any)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Compact Line Spacing (1.0 – 2.0)</label>
                  <Input type="number" min={1} max={2} step={0.05}
                    value={(settings as any).receiptCompactLineHeight ?? 1.15}
                    onChange={e => setSettings({ ...settings, receiptCompactLineHeight: Math.max(1, Math.min(2, Number(e.target.value) || 1.15)) } as any)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Logo in Compact Mode</label>
                  {(() => {
                    const preserve = (settings as any).receiptCompactPreserveLogo !== false; // default true
                    return (
                      <label className="flex items-center justify-between gap-2 bg-background px-3 py-2 rounded-lg cursor-pointer border mt-1">
                        <span className="text-xs font-semibold">{preserve ? 'Keep original size' : 'Shrink (40×40)'}</span>
                        <button type="button" onClick={() => setSettings({ ...settings, receiptCompactPreserveLogo: !preserve } as any)}
                          className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${preserve ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                          <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${preserve ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                      </label>
                    );
                  })()}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-2">
                These values apply only when Compact Mode is ON. The logo prints at its set size by default — compact mode does not shrink it.
              </div>
            </div>
          </div>




          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">"Thank You" Text (Receipt)</label>
              <Input value={settings.thankYouText ?? ''} placeholder="Thank You!" onChange={e => setSettings({ ...settings, thankYouText: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">"Visit Again" Text (Receipt)</label>
              <Input value={settings.visitAgainText ?? ''} placeholder="Please Visit Again" onChange={e => setSettings({ ...settings, visitAgainText: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">KOT "Thank You" Text</label>
              <Input value={settings.kotThankYouText ?? ''} placeholder="Thank You" onChange={e => setSettings({ ...settings, kotThankYouText: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">KOT Footer Note</label>
              <Input value={settings.kotFooterNote ?? ''} placeholder="Please check the order before preparing" onChange={e => setSettings({ ...settings, kotFooterNote: e.target.value })} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Receipt Footer Text</label>
            <Textarea value={settings.receiptFooter} onChange={e => setSettings({ ...settings, receiptFooter: e.target.value })} rows={3} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Marketing Footer (printed at bottom of every receipt)</label>
            <Textarea
              value={settings.marketingFooter || ''}
              onChange={e => setSettings({ ...settings, marketingFooter: e.target.value })}
              rows={4}
              placeholder={'DIGITAL TARGET SOFTWARE SOLUTIONS\nDeveloped By: Taimoor Younas\n📞 0345-1873354'}
            />
            <p className="text-[10px] text-muted-foreground mt-1">Editable — appears on POS receipt, kitchen ticket and reports.</p>
          </div>


          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-bold">QR Code Settings</h3>
            
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">QR Mode</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setSettings({ ...settings, qrMode: 'auto' })}
                  className={`flex-1 p-3 rounded-lg border text-xs font-semibold text-center transition-colors ${
                    settings.qrMode === 'auto'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-accent'
                  }`}
                >
                  🔄 Auto QR
                  <p className="text-[10px] font-normal mt-0.5 opacity-80">Auto-generate QR per bill with order data</p>
                </button>
                <button
                  onClick={() => setSettings({ ...settings, qrMode: 'custom' })}
                  className={`flex-1 p-3 rounded-lg border text-xs font-semibold text-center transition-colors ${
                    settings.qrMode === 'custom'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-accent'
                  }`}
                >
                  📱 Custom QR
                  <p className="text-[10px] font-normal mt-0.5 opacity-80">Upload your own QR (JazzCash, Reviews, etc.)</p>
                </button>
              </div>
            </div>

            {settings.qrMode === 'custom' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Upload Custom QR Image</label>
                <div className="flex items-center gap-3 mt-1">
                  {settings.customQrImage && (
                    <img src={settings.customQrImage} alt="Custom QR" className="h-20 w-20 object-contain rounded border bg-background" />
                  )}
                  <div className="flex flex-col gap-1">
                    <Button variant="outline" size="sm" asChild>
                      <label className="cursor-pointer">
                        Upload QR Image
                        <input type="file" accept="image/*" className="hidden" onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 500 * 1024) { toast.error('Image must be under 500KB'); return; }
                          const reader = new FileReader();
                          reader.onload = () => setSettings({ ...settings, customQrImage: reader.result as string });
                          reader.readAsDataURL(file);
                        }} />
                      </label>
                    </Button>
                    {settings.customQrImage && (
                      <Button variant="ghost" size="sm" onClick={() => setSettings({ ...settings, customQrImage: '' })}>Remove</Button>
                    )}
                    <p className="text-[10px] text-muted-foreground">e.g. Google Review QR, JazzCash/Easypaisa, Bank Payment QR</p>
                  </div>
                </div>
              </div>
            )}

            {settings.qrMode === 'custom' && settings.customQrImage && (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">QR Width (px)</label>
                    <Input
                      type="number"
                      min={40}
                      max={400}
                      value={settings.customQrWidth ?? 80}
                      onChange={e => {
                        const v = Math.max(40, Math.min(400, Number(e.target.value) || 80));
                        setSettings({ ...settings, customQrWidth: v });
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">QR Height (px)</label>
                    <Input
                      type="number"
                      min={40}
                      max={400}
                      value={settings.customQrHeight ?? 80}
                      onChange={e => {
                        const v = Math.max(40, Math.min(400, Number(e.target.value) || 80));
                        setSettings({ ...settings, customQrHeight: v });
                      }}
                      className="mt-1"
                    />
                  </div>
                </div>
                <input
                  type="range"
                  min={40}
                  max={400}
                  value={settings.customQrWidth ?? 80}
                  onChange={e => {
                    const v = Number(e.target.value);
                    setSettings({ ...settings, customQrWidth: v, customQrHeight: v });
                  }}
                  className="w-full"
                />
                <div className="flex items-center gap-3 bg-background rounded border p-2">
                  <span className="text-[10px] text-muted-foreground">Live preview:</span>
                  <img
                    src={settings.customQrImage}
                    alt="QR preview"
                    style={{
                      width: `${settings.customQrWidth ?? 80}px`,
                      height: `${settings.customQrHeight ?? 80}px`,
                      objectFit: 'contain',
                      background: '#fff',
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">{settings.customQrWidth ?? 80} × {settings.customQrHeight ?? 80} px</span>
                </div>
                <p className="text-[10px] text-muted-foreground">⚠ Pressing Save Receipt Settings is required, otherwise printing will use the old size.</p>
              </div>
            )}

            {/* Bank Name for QR */}
            {settings.qrMode === 'custom' && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bank Name (printed with QR)</label>
                <Input
                  value={settings.bankName || ''}
                  onChange={e => setSettings({ ...settings, bankName: e.target.value })}
                  placeholder="e.g. Meezan Bank, JazzCash, Easypaisa"
                  className="mt-1"
                />
              </div>
            )}

            {settings.qrMode === 'auto' && (
              <div className="bg-accent rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  ✅ Each receipt will auto-generate a QR code containing: Order ID, Date, Type, Total, Customer info. Works fully offline.
                </p>
              </div>
            )}
          </div>

          <Button onClick={handleSaveSettings}>Save Receipt Settings</Button>
        </TabsContent>

        {/* Receipt Text Styling Tab */}
        <TabsContent value="receiptstyle" className="space-y-4">
          <div className="bg-accent/50 rounded-lg p-3 mb-2">
            <p className="text-xs font-bold">📝 ہر ٹیکسٹ لائن کا فونٹ، سائز، بولڈ، اور پوزیشن الگ الگ سیٹ کریں</p>
            <p className="text-[10px] text-muted-foreground mt-1">ہر سیکشن کا اپنا فونٹ، سائز (px)، بولڈ، اور الائنمنٹ (Left/Center/Right) ہے</p>
          </div>

          {([
            { key: 'restaurantName', label: '🏪 Restaurant Name', preview: settings.name || 'Restaurant' },
            { key: 'address', label: '📍 Address', preview: settings.address || 'Address' },
            { key: 'phone', label: '📞 Phone Number', preview: settings.phone1 || '0300-0000000' },
            { key: 'orderId', label: '🔢 Order # / Header', preview: 'ORDER # 123' },
            { key: 'items', label: '🍽️ Item Names', preview: 'Chicken Biryani' },
            { key: 'totals', label: '💰 Totals / Grand Total', preview: 'Grand Total: 1500' },
            { key: 'footer', label: '📜 Footer Text', preview: settings.receiptFooter?.slice(0, 30) || 'Thank you!' },
            { key: 'status', label: '✅ Status (PAID/HOLD)', preview: '★ PAID ★' },
            { key: 'customerDetails', label: '👤 Customer Details', preview: 'Name / Phone / Address' },
              { key: 'visitAgain', label: '🔁 Visit Again Text', preview: 'Please Visit Again' },
              { key: 'marketingFooter', label: '🏷 Marketing Footer', preview: (settings.marketingFooter || 'DIGITAL TARGET').split('\n')[0] },
          ] as const).map(item => {
            const defaultStyle: ReceiptTextStyle = { font: 'default', size: 12, align: 'center', bold: true };
            const currentStyle = settings.receiptStyles?.[item.key] || defaultStyle;
            return (
              <ReceiptStyleEditor
                key={item.key}
                label={item.label}
                preview={item.preview}
                style={currentStyle}
                onChange={(newStyle) => setSettings({
                  ...settings,
                  receiptStyles: {
                    ...settings.receiptStyles,
                    [item.key]: newStyle,
                  },
                })}
                onReset={() => {
                  const next = { ...(settings.receiptStyles || {}) };
                  delete (next as Record<string, unknown>)[item.key];
                  setSettings({ ...settings, receiptStyles: next });
                }}
              />
            );
          })}

          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-bold mb-3">🖥️ POS Display Fonts</h3>
            <p className="text-[10px] text-muted-foreground mb-3">POS سکرین پر کیٹیگری اور آئٹم کے فونٹ سیٹ کریں</p>
            <div className="space-y-4">
              <ReceiptStyleEditor
                label="📂 Category Names"
                preview="Biryani / بریانی"
                style={settings.categoryStyle || { font: 'default', size: 12, align: 'left', bold: true }}
                onChange={(s) => setSettings({ ...settings, categoryStyle: s })}
              />
              <ReceiptStyleEditor
                label="🍽️ Menu Item Names"
                preview="Chicken Karahi / چکن کڑاہی"
                style={settings.menuItemStyle || { font: 'default', size: 12, align: 'left', bold: true }}
                onChange={(s) => setSettings({ ...settings, menuItemStyle: s })}
              />
              <div>
                <label className="text-[11px] font-bold text-muted-foreground mb-1 block">🧮 Menu Items Per Row</label>
                <select
                  className="w-full sm:w-auto h-9 rounded-md border bg-background px-2 text-sm"
                  value={settings.menuGridColumns || 6}
                  onChange={e => setSettings({ ...settings, menuGridColumns: Number(e.target.value) })}
                >
                  <option value={3}>3 columns</option>
                  <option value={4}>4 columns</option>
                  <option value={5}>5 columns</option>
                  <option value={6}>6 columns</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">How many menu items to show per line on the POS screen (more useful when the sidebar is collapsed).</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground mb-1 block">📂 Category Layout (POS)</label>
                <select
                  className="w-full sm:w-auto h-9 rounded-md border bg-background px-2 text-sm"
                  value={settings.categoryLayout || 'top'}
                  onChange={e => setSettings({ ...settings, categoryLayout: e.target.value as 'top' | 'side' })}
                >
                  <option value="top">Top — horizontal ribbon (default)</option>
                  <option value="side">Side — left vertical sidebar</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">Admin can select the position of categories according to their restaurant — on top (ribbon) or beside the menu (sidebar).</p>
              </div>
            </div>
          </div>

          {/* ===== Advanced Menu Flow (Flavors + Size/Inch) ===== */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-lg p-4 space-y-3 border border-amber-200/50">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">🍕 Advanced Menu Flow</h3>
              <p className="text-[11px] text-muted-foreground">Flavor → Size/Inch selection for pizza-style items. No difference for simple items (Burger, Fries, Beverages).</p>
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={!!settings.advancedMenuFlow}
                onCheckedChange={(v) => setSettings({ ...settings, advancedMenuFlow: !!v })}
                className="mt-0.5"
              />
              <div className="text-xs">
                <div className="font-bold">Enable Advanced Menu Flow</div>
                <div className="text-[10px] text-muted-foreground">ON: for items with Size/Inch variants set, a selection popup opens in POS. OFF: classic flow runs.</div>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={!!settings.enableFlavorLayer}
                onCheckedChange={(v) => setSettings({ ...settings, enableFlavorLayer: !!v })}
                className="mt-0.5"
              />
              <div className="text-xs">
                <div className="font-bold">Enable Sub-Category / Flavor Layer</div>
                <div className="text-[10px] text-muted-foreground">ON: tapping a category shows flavors first (Chicken Fajita / BBQ / Supreme …), then the item.</div>
              </div>
            </label>

          </div>

          <Button onClick={handleSaveSettings} className="w-full">Save Receipt Font Settings</Button>
        </TabsContent>

        <TabsContent value="tables" className="space-y-4">
          {/* Floors section */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Floors / Sections</h4>
                <p className="text-[10px] text-muted-foreground">e.g. Ground, First Floor, Outdoor, Car Dining, Family Hall</p>
              </div>
              <Button size="sm" variant="outline" onClick={addFloor}><Plus className="h-3 w-3 mr-1" /> Add Floor</Button>
            </div>
            {floors.length === 0 && <p className="text-[11px] text-muted-foreground italic">No floors yet. Tables will show under "Unassigned".</p>}
            <div className="flex flex-wrap gap-2">
              {floors.map(f => (
                <div key={f.id} className="flex items-center gap-1 bg-card border rounded-md pl-2 pr-1 py-1">
                  <Input
                    value={f.name}
                    className="h-6 w-32 text-xs border-0 p-0 focus-visible:ring-0"
                    onChange={e => { const v = e.target.value; setFloors(prev => prev.map(x => x.id === f.id ? { ...x, name: v } : x)); saveFloor({ ...f, name: v }); }}
                  />
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFloor(f.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Kitchens section */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Kitchens / Stations</h4>
                <p className="text-[10px] text-muted-foreground">e.g. Main, BBQ, Beverage, Basement, Outdoor — used to route items on KDS.</p>
              </div>
              <Button size="sm" variant="outline" onClick={addKitchen}><Plus className="h-3 w-3 mr-1" /> Add Kitchen</Button>
            </div>
            {kitchens.length === 0 && <p className="text-[11px] text-muted-foreground italic">No kitchens yet. All items will show on the default kitchen display.</p>}
            <div className="flex flex-wrap gap-2">
              {kitchens.map(k => (
                <div key={k.id} className="flex items-center gap-1 bg-card border rounded-md pl-2 pr-1 py-1">
                  <Input
                    value={k.name}
                    className="h-6 w-32 text-xs border-0 p-0 focus-visible:ring-0"
                    onChange={e => { const v = e.target.value; setKitchens(prev => prev.map(x => x.id === k.id ? { ...x, name: v } : x)); saveKitchen({ ...k, name: v }); }}
                  />
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeKitchen(k.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground pt-1">Assign each menu item to a kitchen from <strong>Menu Manager → Edit Item → Kitchen</strong>.</p>
          </div>



          {/* Tables list */}
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tables</h4>
            <Button size="sm" onClick={addTable}><Plus className="h-3 w-3 mr-1" /> Add Table</Button>
          </div>
          {tables.map(t => (
            <div key={t.id} className="flex items-center gap-2 bg-card border rounded-lg p-3 flex-wrap">
              <Input value={t.name} className="flex-1 min-w-[120px] h-8 text-xs" placeholder="Name"
                onChange={e => { const v = e.target.value; setTables(prev => prev.map(x => x.id === t.id ? { ...x, name: v } : x)); saveTable({ ...t, name: v }); }} />
              <Input type="number" min={1} max={20} value={t.seats} className="w-20 h-8 text-xs" placeholder="Chairs"
                onChange={e => { const v = Math.max(1, Number(e.target.value) || 1); setTables(prev => prev.map(x => x.id === t.id ? { ...x, seats: v } : x)); saveTable({ ...t, seats: v }); }} />
              <Select
                value={t.shape || 'square'}
                onValueChange={(v) => { const sh = v as any; setTables(prev => prev.map(x => x.id === t.id ? { ...x, shape: sh } : x)); saveTable({ ...t, shape: sh }); }}
              >
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Shape" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="round">🟢 Round</SelectItem>
                  <SelectItem value="square">🟦 Square</SelectItem>
                  <SelectItem value="rectangle">▭ Rectangle</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={t.floorId || '__none__'}
                onValueChange={(v) => { const fid = v === '__none__' ? undefined : v; setTables(prev => prev.map(x => x.id === t.id ? { ...x, floorId: fid } : x)); saveTable({ ...t, floorId: fid }); }}
              >
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Floor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Unassigned —</SelectItem>
                  {floors.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => { deleteTable(t.id); setTables(getTables().slice()); }}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </TabsContent>


        <TabsContent value="waiters" className="space-y-3">
          <Button size="sm" onClick={addWaiter}><Plus className="h-3 w-3 mr-1" /> Add Waiter</Button>
          {waiters.map(w => (
            <div key={w.id} className="flex items-center gap-2 bg-card border rounded-lg p-3">
              <Input value={w.name} className="flex-1 h-8 text-xs" placeholder="Name"
                onChange={e => { const v = e.target.value; setWaiters(prev => prev.map(x => x.id === w.id ? { ...x, name: v } : x)); saveWaiter({ ...w, name: v }); }} />
              <Input value={w.phone} className="w-32 h-8 text-xs" placeholder="Phone"
                onChange={e => { const v = e.target.value; setWaiters(prev => prev.map(x => x.id === w.id ? { ...x, phone: v } : x)); saveWaiter({ ...w, phone: v }); }} />
              <Button variant="ghost" size="sm" onClick={() => { deleteWaiter(w.id); setWaiters(getWaiters().slice()); }}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="riders" className="space-y-3">
          <Button size="sm" onClick={addRider}><Plus className="h-3 w-3 mr-1" /> Add Rider</Button>
          <p className="text-[11px] text-muted-foreground">
            Riders log in to this restaurant's <b>Rider Portal</b> with phone + PIN. Default PIN = <b>0000</b>.
          </p>
          {riders.map(r => (
            <div key={r.id} className="flex items-center gap-2 bg-card border rounded-lg p-3 flex-wrap">
              <Input value={r.name} className="flex-1 min-w-[120px] h-8 text-xs" placeholder="Name"
                onChange={e => { const v = e.target.value; setRiders(prev => prev.map(x => x.id === r.id ? { ...x, name: v } : x)); saveRider({ ...r, name: v }); }} />
              <Input value={r.phone} className="w-32 h-8 text-xs" placeholder="Phone (03xxxxxxxxx)"
                onChange={e => { const v = e.target.value; setRiders(prev => prev.map(x => x.id === r.id ? { ...x, phone: v } : x)); saveRider({ ...r, phone: v }); }} />
              <Input value={r.pin || ''} maxLength={6} className="w-20 h-8 text-xs font-mono" placeholder="PIN"
                onChange={e => { const v = e.target.value.replace(/\D/g, ''); setRiders(prev => prev.map(x => x.id === r.id ? { ...x, pin: v } : x)); saveRider({ ...r, pin: v }); }} />
              <label className="flex items-center gap-1 text-[11px]">
                <input type="checkbox" checked={r.isActive} onChange={e => { saveRider({ ...r, isActive: e.target.checked }); setRiders(getRiders().slice()); }} />
                Active
              </label>
              <Button variant="ghost" size="sm" onClick={() => { deleteRider(r.id); setRiders(getRiders().slice()); }}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </TabsContent>

        {/* KOT Settings Tab */}
        <TabsContent value="kot" className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🍳</span>
              <h3 className="text-sm font-bold">Kitchen Order Ticket (KOT) Settings</h3>
            </div>
            <p className="text-xs text-muted-foreground">کچن پرچی کا ڈیزائن، عناصر اور پرنٹ طریقہ یہاں سے کنٹرول کریں۔</p>
          </div>

          {/* ===== Professional Printing Settings ===== */}
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold">Printing Settings (Print Service)</h3>
            </div>
            <p className="text-xs text-muted-foreground">One-phase printing — order create par sirf KOT, payment par receipt. Duplicate print band.</p>

            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { key: 'kotEnabled', label: 'Enable KOT Printing', def: true },
                { key: 'autoPrintKot', label: 'Auto Print KOT on New Order', def: true },
                { key: 'noReceiptOnPay', label: 'No Receipt on Pay (pay pe parchi na nikle)', def: false },
                { key: 'paymentDialogEnabled', label: 'Payment Received screen on Pay (OFF = seedha cash paid + fori print)', def: true },
                { key: 'tokenPrintEnabled', label: 'Tandoor Token (roti/naan ka alag token slip)', def: false },
                { key: 'tokenCountsInSales', label: 'Token items sale count me shamil hon', def: true },
                { key: 'manualSendToKitchen', label: 'Manual "Send to Kitchen" only', def: false },
                { key: 'autoPrintCustomerReceipt', label: 'Auto Print Customer Receipt (on payment)', def: false },
                { key: 'showBillOnScreen', label: 'Show bill on screen after payment (OFF = sirf print, screen par kuch na aaye)', def: false },
              ].map(t => {
                const val = (settings as any)[t.key];
                const on = val === undefined ? t.def : !!val;
                return (
                  <label key={t.key} className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2 rounded-lg cursor-pointer">
                    <span className="text-xs font-semibold">{t.label}</span>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, [t.key]: !on } as any)}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    >
                      <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                );
              })}
            </div>

            {/* ===== Per-Order-Type Auto KOT switches ===== */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🎛️</span>
                <h4 className="text-xs font-bold">Order Type wise Auto-KOT</h4>
              </div>
              <p className="text-[11px] text-muted-foreground">Turn each order type's (Dining / Takeaway / Delivery) auto-KOT ON/OFF separately. If turned OFF, that type's KOT will not auto print — "Send to Kitchen" will need to be done manually.</p>
              <div className="grid sm:grid-cols-3 gap-2">
                {[
                  { key: 'autoKotDining',   label: '🍽️ Dining (Dine-in)' },
                  { key: 'autoKotTakeaway', label: '🥡 Takeaway' },
                  { key: 'autoKotDelivery', label: '🛵 Delivery' },
                ].map(t => {
                  const masterOn = (settings.autoPrintKot ?? (settings as any).autoKitchenPrint ?? false);
                  const raw = (settings as any)[t.key];
                  const on = raw === undefined ? !!masterOn : !!raw;
                  return (
                    <label key={t.key} className="flex items-center justify-between gap-2 bg-background px-3 py-2 rounded-md border cursor-pointer">
                      <span className="text-xs font-semibold">{t.label}</span>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, [t.key]: !on } as any)}
                        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${on ? 'bg-status-success' : 'bg-muted-foreground/30'}`}
                      >
                        <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ===== Cancel KOT switch ===== */}
            <label className="flex items-center justify-between gap-2 bg-rose-500/5 border border-rose-500/30 px-3 py-2 rounded-lg cursor-pointer">
              <div>
                <p className="text-xs font-bold text-rose-700">❌ Print CANCEL KOT to Kitchen</p>
                <p className="text-[11px] text-muted-foreground">When an order is cancelled / voided, send a CANCELLED slip to the kitchen so cooking stops.</p>
              </div>
              {(() => {
                const on = settings.printKotOnCancel !== false; // default ON
                return (
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, printKotOnCancel: !on })}
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${on ? 'bg-rose-500' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                );
              })()}
            </label>


            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Printer Type</label>
                <select
                  value={settings.printerType || 'browser'}
                  onChange={e => setSettings({ ...settings, printerType: e.target.value as any })}
                  className="w-full h-9 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="browser">Browser Print</option>
                  <option value="network">Network Printer</option>
                  <option value="usb">USB Printer</option>
                  <option value="silent">Silent Print Agent</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">KOT Copies</label>
                <select
                  value={settings.kotCopies || 1}
                  onChange={e => setSettings({ ...settings, kotCopies: Number(e.target.value) })}
                  className="w-full h-9 rounded-md border bg-background px-2 text-xs"
                >
                  <option value={1}>1 Copy</option>
                  <option value={2}>2 Copies</option>
                  <option value={3}>3 Copies</option>
                </select>
              </div>
              <label className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2 rounded-lg cursor-pointer self-end">
                <span className="text-xs font-semibold">Auto Cut Paper</span>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, autoCut: settings.autoCut === false })}
                  className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${settings.autoCut !== false ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.autoCut !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </label>
            </div>

            {/* Per-station KOT printer assignment */}
            {kitchens.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground block">Assign KOT Printer by Station</label>
                {kitchens.map(k => (
                  <div key={k.id} className="flex items-center gap-2">
                    <span className="text-xs font-semibold w-28 shrink-0 truncate">{k.name}</span>
                    <select
                      value={(settings.stationPrinters || {})[k.id] || ''}
                      onChange={e => setSettings({ ...settings, stationPrinters: { ...(settings.stationPrinters || {}), [k.id]: e.target.value } })}
                      className="flex-1 h-9 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="">Default KOT printer</option>
                      {printers.map(p => <option key={p.name} value={p.name}>{p.name}{p.isDefault ? ' (default)' : ''}</option>)}
                    </select>
                  </div>
                ))}
                {!isElectron() && <p className="text-[10px] text-muted-foreground">Per-station physical routing works in desktop (Silent Agent) mode. Browser mode uses the default printer.</p>}
              </div>
            )}

            {settings.tokenPrintEnabled && (
              <div className="py-2 border-t">
                <p className="text-sm font-medium">Token Categories &amp; Items</p>
                <p className="text-xs text-muted-foreground">
                  Assign as many categories as you need, plus individual menu items, in
                  Printer Settings → <b>Token Printing — Rules &amp; Design</b>. An item gets a
                  token if either rule covers it.
                </p>
              </div>
            )}


            {/* KOT Design Templates */}
          </div>

          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-2">KOT Template Design</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'classic', label: '🍳 Classic', desc: 'روایتی ڈیزائن — آئیکنز اور ڈیش بارڈرز' },
                  { value: 'bold', label: '★ Bold', desc: 'موٹا فونٹ — بڑی QTY، بلیک بار' },
                  { value: 'minimal', label: '◻ Minimal', desc: 'سادہ اور صاف — کم سے کم عناصر' },
                  { value: 'elegant', label: '✦ Elegant', desc: 'خوبصورت — لیٹر سپیسنگ اور نفیس لک' },
                  { value: 'vip-chef', label: '👨‍🍳 VIP Chef', desc: 'بڑے بولڈ بیج — شیف کے لیے بہترین' },
                  { value: 'station', label: '🏷 Station', desc: 'COLD/HOT/BEVG ٹیگ — اسٹیشن روٹنگ' },
                  { value: 'taimoor1', label: '📋 Taimoor 1', desc: 'صاف ٹیبل ڈیزائن — Order/Token/Date/Time/Type/Table' },
                  { value: 'taimoor2', label: '📋 Taimoor 2', desc: 'Taimoor 1 + Waiter + Pax + Printed time' },
                ] as const).map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSettings({ ...settings, kotDesign: t.value })}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      (settings.kotDesign || 'classic') === t.value
                        ? 'bg-primary text-primary-foreground border-primary shadow-md'
                        : 'bg-card hover:bg-accent hover:shadow-sm'
                    }`}
                  >
                    <span className="text-sm font-bold block">{t.label}</span>
                    <span className="text-[10px] block mt-0.5 opacity-80">{t.desc}</span>
                  </button>
                ))}
              </div>

              {/* Live KOT Preview — shows currently selected KOT design with sample data */}
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold">👁 Live KOT Preview — <span className="text-primary">{settings.kotDesign || 'classic'}</span></h4>
                  <span className="text-[10px] text-muted-foreground">Sample KOT — the actual print looks the same</span>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 overflow-auto max-h-[520px] flex justify-center">
                  <div className="bg-white shadow-md">
                    <KitchenReceipt order={sampleOrder as any} settings={settings} showPrintButton={false} noPrintPortal />
                  </div>
                </div>
              </div>
            </div>


            {/* KOT Elements Toggle */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground block">KOT میں کیا دکھائیں</label>
              {([
                { key: 'kotShowLogo', label: 'Logo', desc: 'ریسٹورنٹ لوگو دکھائیں' },
                { key: 'kotShowAddress', label: 'Address', desc: 'پتہ دکھائیں' },
                { key: 'kotShowPhone', label: 'Phone', desc: 'فون نمبر دکھائیں' },
                { key: 'kotShowDateTime', label: 'Date & Time', desc: 'تاریخ اور وقت' },
                { key: 'kotShowWaiter', label: 'Waiter Name', desc: 'ویٹر کا نام' },
                { key: 'kotShowCustomer', label: 'Customer Info', desc: 'کسٹمر کی معلومات' },
                { key: 'kotShowCustomerAddress', label: 'Customer Address', desc: 'ڈلیوری/کسٹمر کا پتہ KOT پر دکھائیں' },
                { key: 'kotShowRider', label: 'Rider Name', desc: 'رائیڈر کا نام' },
                { key: 'kotShowNotes', label: 'Order Notes', desc: 'آرڈر نوٹس' },
              ] as const).map(item => (
                <div key={item.key} className="flex items-center justify-between bg-card border rounded-lg p-2.5">
                  <div>
                    <p className="text-xs font-bold">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, [item.key]: !(settings[item.key as keyof RestaurantSettings] !== false) })}
                    className={`w-10 h-5 rounded-full transition-colors relative ${(settings[item.key as keyof RestaurantSettings] !== false) ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`block w-4 h-4 rounded-full bg-white shadow absolute top-0.5 transition-transform ${(settings[item.key as keyof RestaurantSettings] !== false) ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>

            {/* Special Note Presets — quick-pick chips on POS/Order Taker cart */}
            <div className="space-y-2 border-t pt-4">
              <label className="text-xs font-bold block">📝 Special Note Presets</label>
              <p className="text-[10px] text-muted-foreground">
                Create quick-note buttons here (e.g. "No onion", "Extra spicy"). They will appear as chips on the POS and Order Taker cart — click to add to the order. Manual typing is still available.
              </p>
              <NotePresetsEditor
                value={settings.kotNotePresets || []}
                onChange={(list) => setSettings({ ...settings, kotNotePresets: list })}
              />
            </div>


            {/* KOT Text Font Settings */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-xs font-bold">🔤 KOT Print Text Font</h4>
              <p className="text-[10px] text-muted-foreground">Control the kitchen print's font, size, bold and alignment from here. The item font applies to the whole KOT.</p>
              <ReceiptStyleEditor
                label="Header (Restaurant Name / Title)"
                style={settings.kotStyles?.header || { font: 'default', size: 14, align: 'center', bold: true }}
                onChange={s => setSettings({ ...settings, kotStyles: { ...(settings.kotStyles || {}), header: s } })}
                onReset={() => setSettings({ ...settings, kotStyles: { ...(settings.kotStyles || {}), header: undefined } })}
                preview={settings.name || 'Restaurant'}
              />
              <ReceiptStyleEditor
                label="Items (Main Body — applies to all KOT text)"
                style={settings.kotStyles?.items || { font: 'default', size: 12, align: 'left', bold: true }}
                onChange={s => setSettings({ ...settings, kotStyles: { ...(settings.kotStyles || {}), items: s } })}
                onReset={() => setSettings({ ...settings, kotStyles: { ...(settings.kotStyles || {}), items: undefined } })}
                preview="1. Chicken Karahi ×2"
              />
              <ReceiptStyleEditor
                label="Footer / Notes"
                style={settings.kotStyles?.footer || { font: 'default', size: 10, align: 'center', bold: false }}
                onChange={s => setSettings({ ...settings, kotStyles: { ...(settings.kotStyles || {}), footer: s } })}
                onReset={() => setSettings({ ...settings, kotStyles: { ...(settings.kotStyles || {}), footer: undefined } })}
                preview="— Kitchen Copy —"
              />
            </div>

            {/* Auto Kitchen Print */}
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-xs font-bold">🖨️ KOT Print Mode</h4>
              <div className="flex items-center justify-between bg-card border rounded-lg p-3">
                <div>
                  <p className="text-xs font-bold">Auto Kitchen Print</p>
                  <p className="text-[10px] text-muted-foreground">آرڈر بنتے ہی آٹو کچن پرچی نکلے</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, autoKitchenPrint: !settings.autoKitchenPrint })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.autoKitchenPrint ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.autoKitchenPrint ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {settings.autoKitchenPrint && (
                <>
                  <div className="flex items-center justify-between bg-card border rounded-lg p-3 ml-3 border-l-2 border-l-primary">
                    <div>
                      <p className="text-xs font-bold">Combined Print (Receipt + KOT)</p>
                      <p className="text-[10px] text-muted-foreground">رسیپٹ کے ساتھ KOT بھی نکلے — دونوں الگ الگ cut ہوں گے</p>
                    </div>
                    <button
                      onClick={() => setSettings({ ...settings, kotCombinedPrint: !settings.kotCombinedPrint })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.kotCombinedPrint ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.kotCombinedPrint ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-card border rounded-lg p-3 ml-3 border-l-2 border-l-primary">
                    <div>
                      <p className="text-xs font-bold">Fallback to Receipt Printer</p>
                      <p className="text-[10px] text-muted-foreground">اگر کچن پرنٹر سیٹ نہ ہو تو KOT کاؤنٹر (Receipt) پرنٹر سے نکلے</p>
                    </div>
                    <button
                      onClick={() => setSettings({ ...settings, kotFallbackToReceipt: settings.kotFallbackToReceipt === false ? true : false })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.kotFallbackToReceipt !== false ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.kotFallbackToReceipt !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-card border rounded-lg p-3 ml-3 border-l-2 border-l-amber-500">
                    <div>
                      <p className="text-xs font-bold">🪞 KOT Mirror on Cash Printer (Verify)</p>
                      <p className="text-[10px] text-muted-foreground">ہر KOT کی ایک ایکسٹرا کاپی Cash/Receipt پرنٹر سے بھی نکلے گی — تاکہ پتہ چلے KOT بن رہا ہے یا نہیں</p>
                    </div>
                    <button
                      onClick={() => setSettings({ ...settings, kotMirrorToReceiptPrinter: !settings.kotMirrorToReceiptPrinter })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${settings.kotMirrorToReceiptPrinter ? 'bg-amber-500' : 'bg-muted'}`}
                    >
                      <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.kotMirrorToReceiptPrinter ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </>
              )}

              {/* Auto-KOT trigger toggles (Phase 2) */}
              <div className="border-t pt-3 mt-2 space-y-2">
                <h4 className="text-xs font-bold">🎯 Auto KOT Triggers</h4>
                <p className="text-[10px] text-muted-foreground">When should automatic KOT printing happen — each one can be toggled on/off separately.</p>
                {([
                  { key: 'autoKotOnOrderTakerSave', label: 'Order Taker saves', desc: 'Print the KOT as soon as an order is saved from the Order Taker portal' },
                  { key: 'autoKotOnOnlineOrder', label: 'Online order receive ho', desc: 'Website se naya order aate hi KOT print' },
                  { key: 'autoKotOnDeliveryRunning', label: 'Delivery → Preparing', desc: 'Delivery order Preparing pe move kare to KOT print' },
                ] as const).map(item => {
                  const on = settings[item.key as keyof RestaurantSettings] !== false;
                  return (
                    <div key={item.key} className="flex items-center justify-between bg-card border rounded-lg p-3 ml-3 border-l-2 border-l-orange-500">
                      <div>
                        <p className="text-xs font-bold">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                      </div>
                      <button
                        onClick={() => setSettings({ ...settings, [item.key]: !on })}
                        className={`w-12 h-6 rounded-full transition-colors relative ${on ? 'bg-orange-500' : 'bg-muted'}`}
                      >
                        <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${on ? 'translate-x-6' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Silent / Hold KOT Mode — master kill switch */}
              <div className="border-t pt-3 mt-2 space-y-2">
                <h4 className="text-xs font-bold">🤫 Silent KOT Mode (Hold All Tokens)</h4>
                <p className="text-[10px] text-muted-foreground">
                  When ON, no automatic KOT/Token print will come out until you manually approve / print. Receipts are unaffected.
                </p>
                <div className="flex items-center justify-between bg-card border-2 rounded-lg p-3 border-l-4 border-l-rose-500">
                  <div>
                    <p className="text-xs font-bold">{settings.kotSilentMode ? '🔴 Silent Mode ON — KOT printing PAUSED' : '🟢 Silent Mode OFF — KOT auto-printing'}</p>
                    <p className="text-[10px] text-muted-foreground">Master switch — overrides all the auto-KOT triggers above.</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, kotSilentMode: !settings.kotSilentMode })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.kotSilentMode ? 'bg-rose-500' : 'bg-muted'}`}
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.kotSilentMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* Test Print buttons */}
                <div className="bg-card border rounded-lg p-3 ml-3 border-l-2 border-l-blue-500 space-y-2">
                  <p className="text-xs font-bold">🧪 Test Print</p>
                  <p className="text-[10px] text-muted-foreground">Print with a test order — check whether the printer is working correctly. (KOT from the Kitchen printer, Receipt from the Cash printer.)</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTestPrintKind('kot')}>
                      🍳 Test KOT Print
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTestPrintKind('receipt')}>
                      🧾 Test Receipt Print
                    </Button>
                  </div>
                </div>
              </div>

              {/* Order Taker portal share link */}
              {(() => {
                const tid = getTenantId() || '';
                const origin = typeof window !== 'undefined' ? window.location.origin : '';
                const url = tid ? `${origin}/#/order-taker/${tid}` : `${origin}/#/order-taker`;
                return (
                  <div className="border-t pt-3 mt-2 space-y-2">
                    <h4 className="text-xs font-bold">📋 Order Taker Portal Link</h4>
                    <p className="text-[10px] text-muted-foreground">Order taker staff will log in via this link by entering a PIN — they will only have access to POS, Tables and Running Bills.</p>
                    <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                      <code className="text-[11px] flex-1 truncate font-mono">{url}</code>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]"
                        onClick={() => { navigator.clipboard.writeText(url); toast.success('Order Taker link copied!'); }}>
                        📋 Copy
                      </Button>
                      <a href={url.replace(origin, '')} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]">↗ Open</Button>
                      </a>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Create a new user from the Users page → role: <b>Order Taker</b> → set username + PIN.</p>
                  </div>
                );
              })()}
            </div>

            <div className="border-t pt-4 space-y-3">
              <h4 className="text-xs font-bold">⏱ Kitchen Delay Timer</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Preparing Minutes</label>
                  <Input
                    type="number"
                    value={settings.kitchenPreparingMinutes ?? 5}
                    onChange={e => {
                      const preparing = Math.max(1, Math.min(120, Number(e.target.value) || 1));
                      setSettings({
                        ...settings,
                        kitchenPreparingMinutes: preparing,
                        kitchenWarningMinutes: Math.max(settings.kitchenWarningMinutes ?? 10, preparing + 1),
                      });
                    }}
                    min={1}
                    max={120}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Delayed Minutes</label>
                  <Input
                    type="number"
                    value={settings.kitchenWarningMinutes ?? 10}
                    onChange={e => {
                      const delayed = Math.max((settings.kitchenPreparingMinutes ?? 5) + 1, Math.min(180, Number(e.target.value) || 1));
                      setSettings({ ...settings, kitchenWarningMinutes: delayed });
                    }}
                    min={(settings.kitchenPreparingMinutes ?? 5) + 1}
                    max={180}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Kitchen display اسی حساب سے Preparing, In Progress, اور Delayed دکھائے گی۔</p>
            </div>
          </div>

          <Button onClick={handleSaveSettings} className="w-full">Save KOT Settings</Button>

          {/* ===== v1.0.4 — Business Day Timing (Shift) ===== */}
          <div className="border rounded-lg p-4 space-y-3 bg-card mt-6">
            <div className="flex items-center gap-2">
              <span className="text-lg">🕒</span>
              <h3 className="text-sm font-bold">Business Day Timing (Shift)</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Set the restaurant's business day Start and Close time. For example, if Start is <b>08:00 AM</b> and Close is <b>03:00 AM</b> (next day),
              then all sales from 08 AM until 03 AM the next day are counted in <b>a single business day</b>. Dashboard, reports and exports all follow this timing.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Business Day Start</label>
                <Input
                  type="time"
                  value={settings.businessDayStart || '08:00'}
                  onChange={(e) => setSettings({ ...settings, businessDayStart: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Business Day Close</label>
                <Input
                  type="time"
                  value={settings.businessDayClose || '03:00'}
                  onChange={(e) => setSettings({ ...settings, businessDayClose: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground mt-1">If the Close time is earlier than the Start time, it will be treated as the next day.</p>
              </div>
            </div>
            <Button onClick={handleSaveSettings} className="w-full">Save Business Day Timing</Button>
          </div>
        </TabsContent>

        {/* Printer Settings Tab */}
        <TabsContent value="printer" className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Printer className="h-5 w-5" />
              <h3 className="text-sm font-bold">🖨️ Printer Settings</h3>
            </div>
            <p className="text-xs text-muted-foreground">سسٹم میں installed printers یہاں دکھائے جائیں گے۔ Default printer منتخب کریں۔</p>

            {/* Auto-start on Windows boot (Electron only) */}
            {isElectron() && (
              <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div>
                  <div className="text-sm font-medium">Auto-start on Windows boot</div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">DT POS will launch in the background as soon as the computer turns on.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={autoStartEnabled}
                    onChange={e => handleToggleAutoStart(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-muted rounded-full peer-checked:bg-primary transition-colors relative">
                    <div className={`absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full shadow transition-transform ${autoStartEnabled ? 'translate-x-5' : ''}`} />
                  </div>
                </label>
              </div>
            )}


            {/* Printer Selection */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Default Printer</label>
              {isElectron() ? (
                printers.length > 0 ? (
                  <select
                    className="w-full border rounded-lg p-2 text-sm bg-card"
                    value={settings.defaultPrinter || ''}
                    onChange={e => setSettings({ ...settings, defaultPrinter: e.target.value })}
                  >
                    <option value="">-- Select Printer --</option>
                    {printers.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isDefault ? '(System Default)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground bg-accent rounded-lg p-3">کوئی پرنٹر نہیں ملا۔ پہلے Windows میں printer install کریں۔</p>
                )
              ) : (
                <div className="bg-accent rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">⚠️ Printer selection صرف Desktop App (Electron) میں دستیاب ہے۔ Browser میں system print dialog استعمال ہوگا۔</p>
                </div>
              )}
            </div>

            {/* KOT (Kitchen) Printer Selection */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                🍳 Kitchen (KOT) Printer
                <span className="ml-2 text-[10px] text-muted-foreground/70">— Network/USB printer for kitchen tickets</span>
              </label>
              {isElectron() ? (
                printers.length > 0 ? (
                  <select
                    className="w-full border rounded-lg p-2 text-sm bg-card"
                    value={settings.kotPrinter || ''}
                    onChange={e => setSettings({ ...settings, kotPrinter: e.target.value })}
                  >
                    <option value="">— Same as Receipt Printer —</option>
                    {printers.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isDefault ? '(System Default)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground bg-accent rounded-lg p-3">کوئی پرنٹر نہیں ملا۔</p>
                )
              ) : (
                <div className="bg-accent rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">⚠️ KOT printer selection صرف Desktop App میں دستیاب ہے۔</p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                دو پرنٹر سیٹ اپ: اوپر والا <b>Receipt</b> (POS بل) کے لیے، یہ والا <b>Kitchen</b> (KOT) کے لیے۔ Network printer ہو تو پہلے Windows میں اس کا shared name install کریں، یہاں خود نظر آجائے گا۔
              </p>
            </div>

            {/* ===== Phase-3: Backup Printer + Auto-Reprint + Offline Alert ===== */}
            <div className="border-t pt-3 mt-2 space-y-3">
              <h4 className="text-xs font-bold">🛟 Backup Printer & Failover</h4>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Backup Printer
                  <span className="ml-2 text-[10px] text-muted-foreground/70">— used if primary printer fails after retries</span>
                </label>
                {isElectron() && printers.length > 0 ? (
                  <select
                    className="w-full border rounded-lg p-2 text-sm bg-card"
                    value={settings.backupPrinter || ''}
                    onChange={e => setSettings({ ...settings, backupPrinter: e.target.value })}
                  >
                    <option value="">— None —</option>
                    {printers.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground bg-accent rounded-lg p-3">⚠️ Backup printer Desktop App me hi available hai.</p>
                )}
              </div>
              <div className="flex items-center justify-between bg-card border rounded-lg p-3 border-l-2 border-l-emerald-500">
                <div>
                  <p className="text-xs font-bold">Auto Reprint on Failure</p>
                  <p className="text-[10px] text-muted-foreground">If the primary printer fails, the job automatically moves to the backup printer</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, autoReprintOnFailure: settings.autoReprintOnFailure === false ? true : false })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.autoReprintOnFailure !== false ? 'bg-emerald-500' : 'bg-muted'}`}
                >
                  <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.autoReprintOnFailure !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between bg-card border rounded-lg p-3 border-l-2 border-l-red-500">
                <div>
                  <p className="text-xs font-bold">Offline Printer Alert</p>
                  <p className="text-[10px] text-muted-foreground">Printer offline hone par persistent red banner show ho ga (jobs held)</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, offlinePrinterAlert: settings.offlinePrinterAlert === false ? true : false })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${settings.offlinePrinterAlert !== false ? 'bg-red-500' : 'bg-muted'}`}
                >
                  <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.offlinePrinterAlert !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Token Printer Selection (separate from receipt + kot) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                🎫 Token / Customer-Token Printer
                <span className="ml-2 text-[10px] text-muted-foreground/70">— Optional 3rd printer for token slips</span>
              </label>
              {isElectron() ? (
                printers.length > 0 ? (
                  <select
                    className="w-full border rounded-lg p-2 text-sm bg-card"
                    value={settings.tokenPrinter || ''}
                    onChange={e => setSettings({ ...settings, tokenPrinter: e.target.value })}
                  >
                    <option value="">— Same as Receipt Printer —</option>
                    {printers.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isDefault ? '(System Default)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-muted-foreground bg-accent rounded-lg p-3">کوئی پرنٹر نہیں ملا۔</p>
                )
              ) : (
                <div className="bg-accent rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">⚠️ Token printer selection صرف Desktop App میں دستیاب ہے۔</p>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                تیسرا printer جو صرف <b>Token / Customer slip</b> کے لیے استعمال ہوگا۔ خالی چھوڑیں تو Receipt printer ہی use ہوگا۔
              </p>
            </div>

            {/* Silent Print Toggle */}
            <div className="flex items-center justify-between bg-card border rounded-lg p-3">
              <div>
                <p className="text-xs font-bold">Silent Print (بغیر ڈائیلاگ)</p>
                <p className="text-[10px] text-muted-foreground">Pay/Print پر receipt سیدھا printer سے نکلے، dialog نہ آئے</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, silentPrint: !settings.silentPrint })}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.silentPrint ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.silentPrint ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Receipt Size Presets - lock-in 3 ready combos */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Receipt Size (80mm Quick Preset)</label>
              <p className="text-[10px] text-muted-foreground mb-2">Three ready 80mm options for the DTB Pro 20 / FP-1100 — compact, standard, bold. Width stays the same; only the text and layout change.</p>
              <div className="grid grid-cols-3 gap-2">
                {receiptSizePresets.map(preset => {
                  const active = (settings.receiptSizePreset || 'standard-80') === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => setSettings({
                        ...settings,
                        receiptSizePreset: preset.key,
                        paperSize: preset.paperSize,
                        receiptScale: preset.receiptScale,
                        receiptMarginTop: preset.receiptMarginTop,
                        receiptMarginBottom: preset.receiptMarginBottom,
                        receiptMarginLeft: preset.receiptMarginLeft,
                        receiptMarginRight: preset.receiptMarginRight,
                        receiptTrimMm: preset.receiptTrimMm,
                        receiptDesign: preset.receiptDesign,
                      })}
                      className={`p-3 rounded-lg border text-center transition-colors ${
                        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-accent'
                      }`}
                    >
                      <div className="text-xl">{preset.emoji}</div>
                      <div className="text-xs font-bold mt-1">{preset.label}</div>
                      <div className="text-[10px] opacity-80">{preset.sub}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">To avoid a blank top feed, all presets are tuned for continuous roll with a zero top-margin approach.</p>
            </div>

            {/* FP-1100 Raster One-Click Preset */}
            <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm font-bold flex items-center gap-2">🖨️ Fujitsu FP-1100 Raster Preset</div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ek click me FP-1100 Raster driver ke liye optimal settings: Windows GDI driver, 80mm width, top margin 0, extra-feed off, trim 0, cut allowance 0. Top blank-feed minimize karne ke liye tuned.
                  </p>
                </div>
                <button
                  onClick={() => setSettings({
                    ...settings,
                    paperSize: '80mm',
                    printerDriverType: 'windows',
                    receiptMode: 'continuous',
                    receiptMarginTop: 0,
                    receiptMarginBottom: 1,
                    receiptMarginLeft: 3,
                    receiptMarginRight: 3,
                    receiptTrimMm: 0,
                    disableExtraFeed: true,
                    autoCut: true,
                    receiptScale: 100,
                  })}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 whitespace-nowrap"
                >
                  Apply FP-1100
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Receipt Mode</label>
                <div className="flex gap-2">
                  {([
                    { value: 'continuous', label: 'Continuous Roll' },
                    { value: 'paged', label: 'Page Mode' },
                  ] as const).map(mode => (
                    <button
                      key={mode.value}
                      onClick={() => setSettings({ ...settings, receiptMode: mode.value })}
                      className={`flex-1 p-3 rounded-lg border text-xs font-bold text-center transition-colors ${
                        (settings.receiptMode || 'continuous') === mode.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card hover:bg-accent'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Driver Type</label>
                <div className="flex gap-2">
                    {([
                      { value: 'escpos', label: 'ESC/POS (Recommended)' },
                    { value: 'windows', label: 'Windows GDI' },
                  ] as const).map(driver => (
                    <button
                      key={driver.value}
                      onClick={() => setSettings({ ...settings, printerDriverType: driver.value })}
                      className={`flex-1 p-3 rounded-lg border text-xs font-bold text-center transition-colors ${
                        (settings.printerDriverType || 'escpos') === driver.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card hover:bg-accent'
                      }`}
                    >
                      {driver.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Header/Footer Toggle */}
            <div className="flex items-center justify-between bg-card border rounded-lg p-3">
              <div>
                <p className="text-xs font-bold">Print Header & Footer</p>
                <p className="text-[10px] text-muted-foreground">Browser print header/footer (URL, date etc.)</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, printHeaderFooter: !settings.printHeaderFooter })}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.printHeaderFooter ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.printHeaderFooter ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center justify-between bg-card border rounded-lg p-3">
                <div>
                  <p className="text-xs font-bold">Disable Extra Feed</p>
                  <p className="text-[10px] text-muted-foreground">Suppress the blank paper feed before the receipt starts — keep on for the FP-1100</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, disableExtraFeed: !(settings.disableExtraFeed !== false) })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${(settings.disableExtraFeed !== false) ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${(settings.disableExtraFeed !== false) ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between bg-card border rounded-lg p-3">
                <div>
                  <p className="text-xs font-bold">Auto Cut After Receipt</p>
                  <p className="text-[10px] text-muted-foreground">Receipt ke end par cut exactly wahi ho</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, autoCut: !(settings.autoCut !== false) })}
                  className={`w-12 h-6 rounded-full transition-colors relative ${(settings.autoCut !== false) ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${(settings.autoCut !== false) ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Cut Mode</label>
              <div className="flex gap-2">
                {([
                  { value: 'full', label: 'Full Cut' },
                  { value: 'partial', label: 'Partial Cut' },
                ] as const).map(mode => (
                  <button
                    key={mode.value}
                    onClick={() => setSettings({ ...settings, cutMode: mode.value })}
                    className={`flex-1 p-3 rounded-lg border text-xs font-bold text-center transition-colors ${
                      (settings.cutMode || 'full') === mode.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card hover:bg-accent'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Kitchen Print - moved to KOT Settings tab */}
          </div>

          {/* Receipt Scale & Margin Controls */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-bold">📐 Receipt Scale & Margins</h3>
            <p className="text-xs text-muted-foreground">Receipt/KOT ko cut se bachane ke liye left/right safe margin minimum 3mm rakha gaya hai.</p>

            {/* Scale */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Scale: {settings.receiptScale || 100}%</label>
              <Slider
                value={[settings.receiptScale || 100]}
                onValueChange={([v]) => setSettings({ ...settings, receiptScale: v })}
                min={50}
                max={200}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>50%</span>
                <span>100%</span>
                <span>200%</span>
              </div>
            </div>

            {/* Margins */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Top Margin (mm)</label>
                <Input
                  type="number"
                  value={settings.receiptMarginTop ?? 0}
                  onChange={e => setSettings({ ...settings, receiptMarginTop: Math.max(0, Math.min(6, Number(e.target.value))) })}
                  min={0} max={20} step={0.5}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Bottom Margin (mm)</label>
                <Input
                  type="number"
                  value={settings.receiptMarginBottom ?? 0}
                  onChange={e => setSettings({ ...settings, receiptMarginBottom: Math.max(0, Math.min(6, Number(e.target.value))) })}
                  min={0} max={20} step={0.5}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Left Margin (mm)</label>
                <Input
                  type="number"
                  value={settings.receiptMarginLeft ?? 3}
                  onChange={e => setSettings({ ...settings, receiptMarginLeft: Math.max(3, Math.min(12, Number(e.target.value))) })}
                  min={3} max={12} step={0.5}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Right Margin (mm)</label>
                <Input
                  type="number"
                  value={settings.receiptMarginRight ?? 3}
                  onChange={e => setSettings({ ...settings, receiptMarginRight: Math.max(3, Math.min(12, Number(e.target.value))) })}
                  min={3} max={12} step={0.5}
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Paper Cut Trim (mm) — extra paper kam karne ke liye barhayein
                </label>
                <Input
                  type="number"
                  value={settings.receiptTrimMm ?? 3}
                  onChange={e => setSettings({ ...settings, receiptTrimMm: Math.max(0, Math.min(12, Number(e.target.value))) })}
                  min={0} max={20} step={1}
                  className="h-8 text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  2–3mm is best for a Fujitsu / Fishto FP-1100 80mm. If the last line gets cut, reduce to 1–2mm, and if extra paper appears at the end, increase up to 4mm.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 text-[11px] leading-5 text-muted-foreground">
              <p className="font-bold text-foreground mb-1">Windows printer preference for this printer</p>
              <p>Paper: 80mm Receipt / Roll, Source: Roll Paper, Orientation: Portrait, Margins: None, Scale: 100%, Copies: 1, Continuous paper mode on. Do not select A4 or Letter.</p>
            </div>

            {/* Preview box */}
            <div className="border-2 border-dashed rounded-lg p-2 bg-accent/30">
              <p className="text-[10px] text-center text-muted-foreground mb-1">Preview (approximate)</p>
              <div
                className="mx-auto bg-white border rounded"
                style={{
                  width: '60mm',
                  height: '40mm',
                  position: 'relative',
                }}
              >
                <div
                  className="bg-muted/50 absolute"
                  style={{
                    top: `${(settings.receiptMarginTop ?? 0) * 1.5}px`,
                    bottom: `${(settings.receiptMarginBottom ?? 0) * 1.5}px`,
                    left: `${(settings.receiptMarginLeft ?? 0) * 1.5}px`,
                    right: `${(settings.receiptMarginRight ?? 0) * 1.5}px`,
                  }}
                >
                  <p className="text-[8px] text-center text-muted-foreground mt-2" style={{ transform: `scale(${(settings.receiptScale || 100) / 100})` }}>
                    Receipt Content ({settings.receiptScale || 100}%)
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSaveSettings} className="flex-1">Save Printer Settings</Button>
            <Button variant="outline" onClick={() => { window.print(); toast.info('Test print sent'); }}>
              🖨️ Print Test
            </Button>
          </div>
        </TabsContent>

        {/* Display Settings Tab */}
        <TabsContent value="display" className="space-y-4">
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-bold">📺 Customer Display / Kitchen Screen</h3>
            <p className="text-xs text-muted-foreground">سیکنڈری سکرین پر کسٹمر کو آرڈر اور ٹوٹل دکھائیں یا پروموشنل ویڈیو/امیجز چلائیں۔</p>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between bg-card border rounded-lg p-3">
              <div>
                <p className="text-xs font-bold">Enable Display Screen</p>
                <p className="text-[10px] text-muted-foreground">سیکنڈری سکرین یا TV پر ڈسپلے آن کریں</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, displayEnabled: !settings.displayEnabled })}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.displayEnabled ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.displayEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {settings.displayEnabled && (
              <div className="space-y-3 pl-2 border-l-2 border-primary/30">
                {/* Show Items */}
                <div className="flex items-center justify-between bg-card border rounded-lg p-3">
                  <div>
                    <p className="text-xs font-bold">Show Live Order Items</p>
                    <p className="text-[10px] text-muted-foreground">آرڈر کی آئٹمز لائیو دکھائیں</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, displayShowItems: !settings.displayShowItems })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.displayShowItems !== false ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.displayShowItems !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* Show Total */}
                <div className="flex items-center justify-between bg-card border rounded-lg p-3">
                  <div>
                    <p className="text-xs font-bold">Show Total Amount</p>
                    <p className="text-[10px] text-muted-foreground">ٹوٹل رقم بڑے فونٹ میں دکھائیں</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, displayShowTotal: !settings.displayShowTotal })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.displayShowTotal !== false ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.displayShowTotal !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* Fullscreen */}
                <div className="flex items-center justify-between bg-card border rounded-lg p-3">
                  <div>
                    <p className="text-xs font-bold">Fullscreen Mode</p>
                    <p className="text-[10px] text-muted-foreground">ڈسپلے فل سکرین ہو</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, displayFullscreen: !settings.displayFullscreen })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.displayFullscreen ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings.displayFullscreen ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {/* Promo Images Upload */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Promotional Images / Slideshow</label>
                  <p className="text-[10px] text-muted-foreground mb-2">جب کوئی آرڈر نہ ہو تو یہ تصاویر سلائیڈ شو کے طور پر دکھائی جائیں گی</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(settings.displayPromoImages || []).map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img src={img} alt={`Promo ${idx + 1}`} className="h-16 w-24 rounded object-cover border" />
                        <button
                          onClick={() => {
                            const imgs = [...(settings.displayPromoImages || [])];
                            imgs.splice(idx, 1);
                            setSettings({ ...settings, displayPromoImages: imgs });
                          }}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <label className="cursor-pointer">
                      Add Image
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 1024 * 1024) { toast.error('Image max 1MB'); return; }
                        const reader = new FileReader();
                        reader.onload = () => {
                          setSettings({
                            ...settings,
                            displayPromoImages: [...(settings.displayPromoImages || []), reader.result as string]
                          });
                        };
                        reader.readAsDataURL(file);
                      }} />
                    </label>
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleSaveSettings} className="w-full">Save Display Settings</Button>
        </TabsContent>

        {/* Day Close Tab */}
        <TabsContent value="dayclose" className="space-y-4">
          {/* Client #2: Day Close report — today/yesterday/week/month/year + custom, print */}
          <div className="bg-card border rounded-xl p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold">🧾 Day Close / Shift Report</h3>
              <p className="text-xs text-muted-foreground">Sales summary — category-wise, product-wise, payment-wise. Thermal print ya poori report.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([['today','Today'],['yesterday','Yesterday'],['week','Week'],['month','Month'],['year','Year']] as [string,string][]).map(([k,lbl]) => (
                <Button key={k} size="sm" variant="outline" onClick={async () => {
                  const now = new Date();
                  const sod = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
                  const eod = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
                  let from = sod(now), to = eod(now), label = 'Today';
                  if (k === 'yesterday') { const y = new Date(now); y.setDate(y.getDate()-1); from = sod(y); to = eod(y); label = 'Yesterday'; }
                  if (k === 'week') { const f = new Date(now); f.setDate(f.getDate()-6); from = sod(f); label = 'Last 7 Days'; }
                  if (k === 'month') { from = sod(new Date(now.getFullYear(), now.getMonth(), 1)); label = 'This Month'; }
                  if (k === 'year') { from = sod(new Date(now.getFullYear(), 0, 1)); label = 'This Year'; }
                  toast.info(`Printing ${label} Shift Report…`);
                  const r = await printShiftReport({ from, to, label, startingCash: Number((settings as any).startingCash || 0) });
                  r.success ? toast.success('Report printer pe bhej diya') : toast.error('Print fail: ' + (r.error || 'unknown'));
                }}>{lbl}</Button>
              ))}
              <Button size="sm" onClick={() => navigate('/sales-report')}>📊 Full Sales Report</Button>
            </div>
            {/* Client requirement: dates select kar ke report print */}
            <div className="flex items-center gap-2 flex-wrap border-t pt-2">
              <span className="text-xs font-medium text-muted-foreground">Custom dates:</span>
              <Input type="date" className="h-8 w-40" value={dcFrom} onChange={e => setDcFrom(e.target.value)} />
              <span className="text-xs text-muted-foreground">se</span>
              <Input type="date" className="h-8 w-40" value={dcTo} onChange={e => setDcTo(e.target.value)} />
              <Button size="sm" variant="outline" disabled={!dcFrom} onClick={async () => {
                const sod = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
                const eod = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
                const from = sod(new Date(dcFrom));
                const to = eod(new Date(dcTo || dcFrom));
                toast.info('Report print ho rahi…');
                const r = await printShiftReport({ from, to, label: `${dcFrom} → ${dcTo || dcFrom}`, startingCash: Number((settings as any).startingCash || 0) });
                r.success ? toast.success('Report printer pe bhej diya') : toast.error('Print fail: ' + (r.error || 'unknown'));
              }}>🖨️ Print selected dates</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              💡 Even after Day Close, you can still get reports for past dates — orders go into permanent archive.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Starting cash (drawer float)</span>
              <Input type="number" className="h-8 w-32" value={(settings as any).startingCash ?? 0}
                onChange={e => setSettings({ ...settings, startingCash: Number(e.target.value) } as any)} />
            </div>
          </div>

          <DayCloseModulesPanel />

          {/* Header */}
          <div className="bg-card border rounded-xl p-6 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-status-warning shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold">Day Closing / Reset Sales</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Cashier can only send a <b>Request</b>. Actual deletion only happens when <b>Admin</b> confirms — so the admin can manage weekly / monthly reports.
                </p>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground bg-accent rounded p-2">
              Logged in as: <b>{currentUser?.name || '—'}</b> ({currentUser?.role || 'guest'}) — {isAdmin ? 'Full control' : (canDayClose ? 'Can request only' : 'No Day Close access')}
            </div>
          </div>

          {/* Admin-only: configure what gets deleted */}
          {isAdmin && (
            <div className="bg-card border rounded-xl p-6 space-y-3">
              <div>
                <h3 className="text-sm font-bold">✅ Day Close pe kya delete ho?</h3>
                <p className="text-[11px] text-muted-foreground">Check — only this data will be cleared. The Archive (admin history) is always preserved.</p>
              </div>
              {/* Client request: select ALL with one click — so no module is left out */}
              <div className="flex gap-2 pb-1">
                <Button size="sm" variant="outline" onClick={() => {
                  const all: any = { ...dayCloseCfg };
                  (['clearPaidOrders','clearRunningHoldBills','clearVoidComp','clearCreditOrders','resetTables','resetOrderNumber','autoBackup'] as const)
                    .forEach(k => { all[k] = true; });
                  setDayCloseCfg(all); saveDayCloseConfig(all);
                  toast.success('All modules selected — everything will be zeroed on Day Close');
                }}>✅ Select All</Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const none: any = { ...dayCloseCfg };
                  (['clearPaidOrders','clearRunningHoldBills','clearVoidComp','clearCreditOrders','resetTables','resetOrderNumber'] as const)
                    .forEach(k => { none[k] = false; });
                  setDayCloseCfg(none); saveDayCloseConfig(none);
                  toast.success('All unchecked — nothing will be deleted');
                }}>Sab Uncheck</Button>
              </div>
              {([
                { k: 'clearPaidOrders',       label: 'Paid / Closed bills (aaj ki sales)' },
                { k: 'clearRunningHoldBills', label: 'Running + Hold bills (unpaid)' },
                { k: 'clearVoidComp',         label: 'Void / Complimentary / Cancelled bills' },
                { k: 'clearCreditOrders',     label: 'Credit orders' },
                { k: 'resetTables',           label: 'Reset tables to Free' },
                { k: 'resetOrderNumber',      label: 'Reset Daily Order # (start from 0 / 1)' },
                { k: 'autoBackup',            label: 'Auto JSON backup download (safety)' },
              ] as { k: keyof DayCloseConfig; label: string }[]).map(row => (
                <label key={row.k} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={dayCloseCfg[row.k]}
                    onCheckedChange={(v) => setDayCloseCfg(c => ({ ...c, [row.k]: !!v }))}
                  />
                  <span>{row.label}</span>
                </label>
              ))}
              <Button size="sm" variant="outline" onClick={handleSaveDayCloseConfig}>💾 Save Day Close Config</Button>
              <div className="text-[10px] text-muted-foreground bg-status-success/10 rounded p-2">
                💡 User access (which cashier gets the Day Close request option) — check the <b>"Day Close"</b> permission from the Users &amp; Roles page.
              </div>
            </div>
          )}

          {/* Pending requests panel (visible to admin) */}
          {isAdmin && pendingRequests.length > 0 && (
            <div className="bg-status-warning/10 border border-status-warning/40 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-bold">⏳ Cashier Day Close Requests ({pendingRequests.length})</h3>
              <div className="space-y-1">
                {pendingRequests.map(r => (
                  <div key={r.id} className="flex items-center justify-between text-xs bg-background rounded p-2">
                    <span><b>{r.byName}</b> — {new Date(r.at).toLocaleString()}</span>
                    <Button variant="ghost" size="sm" onClick={() => handleDismissRequest(r.id)}>Dismiss</Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="bg-card border rounded-xl p-6 space-y-3">
            {canDayClose ? (
              isAdmin ? (
                <Button
                  size="lg"
                  className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 text-sm font-bold"
                  onClick={() => setShowDayClose(true)}
                >
                  🌙 Confirm &amp; Run Day Close (Admin)
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="w-full text-sm font-bold"
                    onClick={handleRequestDayClose}
                  >
                    📨 Request Day Close (Admin will confirm)
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    Data has not been deleted yet. Admin will confirm from their panel, then it will be cleared.
                  </p>
                </>
              )
            ) : (
              <p className="text-xs text-center text-muted-foreground">No Day Close access. Ask Admin for permission.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>



      {/* Day Close Confirmation */}
      <Dialog open={showDayClose} onOpenChange={setShowDayClose}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Confirm Day Close
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              کیا آپ واقعی دن بند کرنا چاہتے ہیں؟ تمام آرڈرز ڈیلیٹ ہو جائیں گے اور بیک اپ آٹو ڈاؤنلوڈ ہوگا۔
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDayClose(false)}>Cancel</Button>
              <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDayClose}>
                Confirm Day Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden Test Print render — KitchenReceipt / ReceiptPreview with autoPrint */}
      {testPrintKind && (() => {
        const now = new Date().toISOString();
        const testOrder: any = {
          id: 'TEST-' + Date.now(),
          orderNumber: 9999,
          orderType: 'dine-in',
          status: 'pending',
          source: 'pos',
          tableName: 'TEST',
          cashierName: currentUser?.name || 'Test',
          items: [
            { id: 'ti1', name: 'Test Item A', qty: 1, price: 100, total: 100, unit: 'pcs', categoryName: 'Test' },
            { id: 'ti2', name: 'Test Item B', qty: 2, price: 50, total: 100, unit: 'pcs', categoryName: 'Test', notes: 'Extra cheese' },
          ],
          subtotal: 200, discount: 0, tax: 0, serviceCharge: 0, serviceChargePercent: 0,
          grandTotal: 200, paymentMethod: 'cash',
          createdAt: now, notes: '*** TEST PRINT — this is not a real order ***',
        };
        return (
          <div style={{ position: 'fixed', left: -9999, top: -9999, width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
            {testPrintKind === 'kot' ? (
              <KitchenReceipt
                order={testOrder}
                settings={settings}
                autoPrint
                autoPrintDelayMs={80}
                showPrintButton={false}
                onAutoPrintComplete={() => { setTestPrintKind(null); toast.success('Test KOT print bhej diya'); }}
              />
            ) : (
              <ReceiptPreview
                order={testOrder}
                settings={settings}
                autoPrint
                showPrintButton={false}
              />
            )}
          </div>
        );
      })()}
    </div>
  );
}

// Reusable per-surface logo uploader (used in General tab)
function SurfaceLogoRow({ label, hint, value, onChange }: { label: string; hint?: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="bg-card border rounded-lg p-3 space-y-2">
      <div>
        <div className="text-xs font-bold">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex items-center gap-3">
        {value
          ? <img src={value} alt="" className="h-14 w-14 rounded-lg object-cover border" />
          : <div className="h-14 w-14 rounded-lg border-2 border-dashed bg-muted/40 flex items-center justify-center text-[9px] text-muted-foreground">No logo</div>}
        <div className="flex-1 flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <label className="cursor-pointer">
              {value ? 'Replace' : 'Upload'}
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const f = e.target.files?.[0]; if (!f) return;
                if (f.size > 500 * 1024) { toast.error('Logo must be under 500KB'); return; }
                const r = new FileReader();
                r.onload = () => onChange(String(r.result));
                r.readAsDataURL(f);
              }} />
            </label>
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange('')}>Remove</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// NotePresetsEditor — manage a list of quick-pick special-note chips.
// =====================================================================
function NotePresetsEditor({ value, onChange }: { value: string[]; onChange: (list: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (value.some(x => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
    onChange([...value, v].slice(0, 30));
    setDraft('');
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value.slice(0, 80))}
          placeholder="e.g. No onion"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          className="h-9 text-xs"
        />
        <Button type="button" size="sm" onClick={add} className="h-9 px-3">Add</Button>
      </div>
      {value.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">No preset yet — type above and click Add.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {value.map((n, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/30 text-[11px] font-semibold text-primary">
              {n}
              <button type="button" onClick={() => remove(i)} className="hover:bg-destructive/20 rounded-full px-1 text-destructive font-bold leading-none">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
function toEmbedUrl(mapUrl?: string, lat?: number, lng?: number): string | null {
  if (mapUrl) {
    // If user pasted full iframe HTML, extract src
    const srcMatch = mapUrl.match(/src=["']([^"']+)["']/i);
    const url = srcMatch ? srcMatch[1] : mapUrl;
    if (url.includes('google.com/maps/embed')) return url;
    // Short link expansion not possible client-side; fall through
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d5000!2d${lng}!3d${lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2s`;
  }
  return null;
}

// ServiceAreasEditor: City + Area entry with suggestions + GPS + Map Embed
// =============================================================================
function ServiceAreasEditor({
  settings,
  setSettings,
  onSave,
}: {
  settings: RestaurantSettings;
  setSettings: (s: RestaurantSettings) => void;
  onSave: () => void;
}) {
  const [cityInput, setCityInput] = useState('');
  const [areaCity, setAreaCity] = useState<string>('');
  const [areaInput, setAreaInput] = useState('');
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  // Flatten PK dataset for suggestions
  const allCities = PAKISTAN_AREAS.flatMap(p => p.cities.map(c => c.city));
  const cityToAreas: Record<string, string[]> = {};
  PAKISTAN_AREAS.forEach(p => p.cities.forEach(c => { cityToAreas[c.city.toLowerCase()] = c.areas; }));

  const cities = settings.serviceCities || [];
  const areas = settings.serviceAreas || [];
  const locs = settings.serviceLocations || {};

  const updateLoc = (key: string, patch: Partial<{ lat: number; lng: number; mapUrl: string }>) => {
    const next = { ...(settings.serviceLocations || {}) };
    next[key] = { ...(next[key] || {}), ...patch };
    setSettings({ ...settings, serviceLocations: next });
  };
  const clearLoc = (key: string) => {
    const next = { ...(settings.serviceLocations || {}) };
    delete next[key];
    setSettings({ ...settings, serviceLocations: next });
  };

  const addCity = () => {
    const val = cityInput.trim();
    if (!val) return;
    if (cities.some(x => x.toLowerCase() === val.toLowerCase())) {
      toast.error('This city already exists'); return;
    }
    setSettings({ ...settings, serviceCities: [...cities, val] });
    setCityInput('');
  };

  const addArea = () => {
    const val = areaInput.trim();
    if (!val) return;
    if (!areaCity) { toast.error('Select a city first'); return; }
    const key = `${areaCity}::${val}`;
    if (areas.some(x => x.toLowerCase() === val.toLowerCase()) &&
        !!locs[key] === false) {
      // allow same area string under different city via prefix display, but warn duplicate plain area
    }
    if (areas.includes(val) === false) {
      setSettings({ ...settings, serviceAreas: [...areas, val] });
    }
    setAreaInput('');
  };

  // Capture current GPS for a key
  const captureGps = async (key: string, label: string) => {
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        if (!navigator.geolocation) return rej(new Error('No geolocation'));
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 });
      });
      const lat = +pos.coords.latitude.toFixed(6);
      const lng = +pos.coords.longitude.toFixed(6);
      updateLoc(key, { lat, lng, mapUrl: `https://www.google.com/maps?q=${lat},${lng}` });
      toast.success(`📍 Location saved for ${label}`);
    } catch (e: any) {
      toast.error('GPS unavailable: ' + (e?.message || 'denied'));
    }
  };

  const editMapUrl = async (key: string, label: string) => {
    const current = locs[key]?.mapUrl || '';
    const v = await askText(`Map link for ${label}`, 'Paste Google Maps link or embed code', current);
    if (v === null) return;
    const raw = v.trim();
    if (!raw) { clearLoc(key); return; }
    // Strip iframe wrapper if pasted
    const srcMatch = raw.match(/src=["']([^"']+)["']/i);
    const url = srcMatch ? srcMatch[1] : raw;
    const patch: any = { mapUrl: url };
    // try extract lat/lng from URL
    const m = url.match(/[?&@\/]([+-]?\d+\.\d+)[,%2C\s]+([+-]?\d+\.\d+)/);
    if (m) { patch.lat = parseFloat(m[1]); patch.lng = parseFloat(m[2]); }
    updateLoc(key, patch);
    toast.success('Map link saved');
  };

  const MapPreview = ({ mapUrl, lat, lng }: { mapUrl?: string; lat?: number; lng?: number }) => {
    const embed = toEmbedUrl(mapUrl, lat, lng);
    if (!embed) return null;
    return (
      <div className="mt-2 rounded-lg overflow-hidden border bg-white">
        <iframe
          src={embed}
          width="100%"
          height="260"
          style={{ border: 0, display: 'block' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Map"
        />
      </div>
    );
  };

  return (
    <div className="bg-card border rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 text-xl">🚚</div>
        <div>
          <h3 className="text-sm font-extrabold">Delivery Service Areas</h3>
          <p className="text-[11px] text-muted-foreground">
            Type the city name — suggestions will appear automatically. Then select the city and add its areas. You can also save a GPS / map link for each city/area. Use the 🗺️ button to preview the map.
          </p>
        </div>
      </div>

      {/* ===== Cities ===== */}
      <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
        <div className="text-xs font-extrabold text-primary">🏙️ Service Cities</div>
        <div className="flex gap-2">
          <input
            list="svc-city-suggest"
            type="text"
            value={cityInput}
            onChange={e => setCityInput(e.target.value)}
            placeholder="e.g. Burewala, Jhang, Lahore…"
            className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-sm"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCity(); } }}
          />
          <datalist id="svc-city-suggest">
            {allCities.map(c => <option key={c} value={c} />)}
          </datalist>
          <Button size="sm" onClick={addCity}>➕ Add</Button>
        </div>

        {cities.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">No city has been added.</div>
        ) : (
          <div className="space-y-1.5">
            {cities.map(c => {
              const key = c;
              const loc = locs[key];
              const hasLoc = !!(loc?.lat && loc?.lng) || !!loc?.mapUrl;
              const isPreview = previewKey === key;
              return (
                <div key={c} className="bg-card border rounded-md px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary flex-1">🏙️ {c}</span>
                    {loc?.lat && loc?.lng ? (
                      <a href={loc.mapUrl || `https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline truncate max-w-[160px]">
                        📍 {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                      </a>
                    ) : loc?.mapUrl ? (
                      <a href={loc.mapUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline truncate max-w-[160px]">📍 Map link</a>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">no location</span>
                    )}
                    {hasLoc && (
                      <Button size="sm" variant="ghost" className={`h-7 px-2 text-[10px] ${isPreview ? 'text-primary bg-primary/10' : ''}`} onClick={() => setPreviewKey(isPreview ? null : key)} title="Map preview">
                        🗺️ {isPreview ? 'Hide' : 'View'}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => captureGps(key, c)} title="Use my current GPS">📡 GPS</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => editMapUrl(key, c)} title="Paste Google Maps URL / embed code">🔗 Link</Button>
                    <button
                      onClick={() => {
                        setSettings({ ...settings, serviceCities: cities.filter(x => x !== c) });
                        clearLoc(key);
                        if (previewKey === key) setPreviewKey(null);
                      }}
                      className="text-destructive font-bold px-1.5"
                      title="Remove"
                    >×</button>
                  </div>
                  {isPreview && <MapPreview mapUrl={loc?.mapUrl} lat={loc?.lat} lng={loc?.lng} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Areas ===== */}
      <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
        <div className="text-xs font-extrabold text-primary">📍 Service Areas / Neighborhoods</div>

        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2">
          <select
            value={areaCity}
            onChange={e => { setAreaCity(e.target.value); setAreaInput(''); }}
            className="px-2 py-2 rounded-md border border-border bg-background text-sm"
          >
            <option value="">— Select city —</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <input
            list={areaCity ? `svc-area-suggest-${areaCity}` : undefined}
            type="text"
            value={areaInput}
            onChange={e => setAreaInput(e.target.value)}
            placeholder={areaCity ? `${areaCity} area, e.g. Model Town` : 'Select a city first'}
            disabled={!areaCity}
            className="px-3 py-2 rounded-md border border-border bg-background text-sm disabled:opacity-60"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
          />
          {areaCity && (
            <datalist id={`svc-area-suggest-${areaCity}`}>
              {(cityToAreas[areaCity.toLowerCase()] || []).map(a => <option key={a} value={a} />)}
            </datalist>
          )}
          <Button size="sm" onClick={addArea} disabled={!areaCity}>➕ Add</Button>
        </div>

        {areas.length === 0 ? (
          <div className="text-[11px] text-muted-foreground italic">No area has been added.</div>
        ) : (
          <div className="space-y-1.5">
            {areas.map(a => {
              // pick best matching key: if any key starts with `${city}::${a}` use it; else plain a
              const matchKey = Object.keys(locs).find(k => k.endsWith(`::${a}`)) || a;
              const loc = locs[matchKey];
              const hasLoc = !!(loc?.lat && loc?.lng) || !!loc?.mapUrl;
              const isPreview = previewKey === matchKey;
              return (
                <div key={a} className="bg-card border rounded-md px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold flex-1">📍 {a}</span>
                    {loc?.lat && loc?.lng ? (
                      <a href={loc.mapUrl || `https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline truncate max-w-[160px]">
                        📍 {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                      </a>
                    ) : loc?.mapUrl ? (
                      <a href={loc.mapUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 underline truncate max-w-[160px]">📍 Map link</a>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">no location</span>
                    )}
                    {hasLoc && (
                      <Button size="sm" variant="ghost" className={`h-7 px-2 text-[10px] ${isPreview ? 'text-primary bg-primary/10' : ''}`} onClick={() => setPreviewKey(isPreview ? null : matchKey)} title="Map preview">
                        🗺️ {isPreview ? 'Hide' : 'View'}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => captureGps(areaCity ? `${areaCity}::${a}` : a, a)} title="Use my current GPS">📡 GPS</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={() => editMapUrl(areaCity ? `${areaCity}::${a}` : a, a)} title="Paste Google Maps URL / embed code">🔗 Link</Button>
                    <button
                      onClick={() => {
                        setSettings({ ...settings, serviceAreas: areas.filter(x => x !== a) });
                        // remove any location keys for this area
                        const next = { ...(settings.serviceLocations || {}) };
                        Object.keys(next).forEach(k => { if (k === a || k.endsWith(`::${a}`)) delete next[k]; });
                        setSettings({ ...settings, serviceAreas: areas.filter(x => x !== a), serviceLocations: next });
                        if (previewKey === matchKey) setPreviewKey(null);
                      }}
                      className="text-destructive font-bold px-1.5"
                      title="Remove"
                    >×</button>
                  </div>
                  {isPreview && <MapPreview mapUrl={loc?.mapUrl} lat={loc?.lat} lng={loc?.lng} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded">
        <b>{cities.length} cities</b> · <b>{areas.length} areas</b> · <b>{Object.keys(locs).length} with location</b> — delivery form & online order me dikheinge.
      </div>

      <Button onClick={onSave} className="w-full">💾 Save Service Areas</Button>
    </div>
  );
}
