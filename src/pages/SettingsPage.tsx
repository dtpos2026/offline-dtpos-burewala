import { useState, useEffect, useRef } from 'react';
import ReceiptSettingsTab from '@/components/settings/ReceiptSettingsTab';
import PrinterSettingsTab from '@/components/settings/PrinterSettingsTab';
import KotSettingsTab from '@/components/settings/KotSettingsTab';
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
          <ReceiptSettingsTab
            settings={settings}
            setSettings={setSettings}
            onSave={handleSaveSettings}
            sampleOrder={sampleOrder}
          />
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
          <KotSettingsTab
            settings={settings}
            setSettings={setSettings}
            onSave={handleSaveSettings}
            printers={printers}
            kitchens={kitchens}
            sampleOrder={sampleOrder}
            onTestPrint={setTestPrintKind}
          />
        </TabsContent>

        {/* Printer Settings Tab */}
        <TabsContent value="printer" className="space-y-4">
          <PrinterSettingsTab
            settings={settings}
            setSettings={setSettings}
            onSave={handleSaveSettings}
            printers={printers}
            receiptSizePresets={receiptSizePresets}
            autoStartEnabled={autoStartEnabled}
            onToggleAutoStart={handleToggleAutoStart}
          />
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
                  r.success ? toast.success('Report sent to the printer.') : toast.error('Print fail: ' + (r.error || 'unknown'));
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
                r.success ? toast.success('Report sent to the printer.') : toast.error('Print fail: ' + (r.error || 'unknown'));
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
                onAutoPrintComplete={() => { setTestPrintKind(null); toast.success('Test KOT sent to the printer.'); }}
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
