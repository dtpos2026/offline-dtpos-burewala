import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { Search, Plus, Minus, Trash2, CreditCard, Pause, Weight, Edit3, ShoppingCart, RotateCcw, Delete, User, Phone, Ban, Gift, XCircle, ChefHat, MessageCircle, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react';
import { normalizePhone, buildPaidMessage, buildDeliveryMessage, openWhatsApp } from '@/lib/whatsapp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Category, MenuItem, CartItem, OrderType, Order, PaymentMethod,
} from '@/lib/types';
import {
  getCategories, getMenuItems, getSettings, getOrders,
  saveOrder, genId, getNextOrderNumber, getNextOrderNumberAsync, peekNextOrderNumber, getTables, saveTable, getWaiters, getRiders, getUsers,
  getCurrentBranchId, getBranches, validatePromoCode, incrementPromoUsage
} from '@/lib/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import ReceiptPreview from '@/components/ReceiptPreview';
import CachedImage from '@/components/CachedImage';
import KitchenReceipt from '@/components/KitchenReceipt';
import { useSearchParams } from 'react-router-dom';
import { getProvinces, getCitiesOf, getAreasOf } from '@/lib/pakistan-areas';
import { getDeals } from '@/lib/blink-modules';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';
import LocationCapture from '@/components/LocationCapture';
// Phase-1: lazy-load PaymentDialog (heavy child — only mounted on checkout)
const PaymentDialog = lazy(() => import('@/components/PaymentDialog'));
import { enqueueKot, enqueueReceipt, enqueueReceiptOnPay, enqueueKotUpdate, enqueueKotCancel, computeKotDiff } from '@/lib/printQueue';
import { printTokenDirect, nextTokenSerial } from '@/lib/tokenSlip';
import { resolveTokenRules, getTokenLinesFromCart } from '@/lib/tokenRules';
import MinimartPanel from '@/components/MinimartPanel';
import { attachBarcodeScanner, parseBarcode, DEFAULT_EMBEDDED } from '@/lib/barcode';
import {
  weightScale, loadScaleConfig, autoConnectScale, computeWeightPrice, weightNote,
} from '@/lib/weightScale';
import { t, useLang } from '@/lib/i18n';
import { getMenuItems as getAllMenuItems } from '@/lib/store';
import BillingStatusBar from '@/components/BillingStatusBar';
import { isPrintPreviewEnabled } from '@/lib/printPreferences';

const DEALS_CATEGORY_ID = 'cat-deals';

function buildDealNote(dealId: string, allItems: MenuItem[]): string {
  const deal = getDeals().find(d => d.id === dealId);
  if (!deal) return '';
  return deal.items
    .map(di => `${di.quantity}× ${allItems.find(m => m.id === di.menuItemId)?.name || 'Item'}`)
    .join(', ');
}

export default function POSScreen() {
  useLang(); // language change par re-render
  const [categories, setCategories] = useState<Category[]>([]);
  const catRibbonRef = useRef<HTMLDivElement | null>(null);
  const scrollCatRibbon = (dir: 'left' | 'right') => {
    const el = catRibbonRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -el.clientWidth * 0.7 : el.clientWidth * 0.7, behavior: 'smooth' });
  };
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // ===== v1.0.38: Cart layout — collapsible secondary sections =====
  // Cart column me numpad aur special-note bohot jagah lete thay, is liye
  // poora cart scroll karna parta tha. Ab dono collapse ho sakte hain aur
  // choice localStorage me yaad rehti hai (refresh par bhi wahi rahegi).
  const CART_UI_KEY = 'dtpos-cart-ui';
  const loadCartUi = (): { numpad: boolean; note: boolean } => {
    try {
      const raw = localStorage.getItem(CART_UI_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return { numpad: p?.numpad !== false, note: p?.note === true };
      }
    } catch { /* first run / private mode */ }
    // ===== v1.0.40 default =====
    // The keypad stays OPEN on every screen size. It does not have to fit
    // whole: the item list and the keypad each scroll inside themselves, and
    // the totals + action bar are pinned, so nothing is ever unreachable —
    // you scroll only where there is more content than room.
    // Whatever the cashier chooses afterwards is remembered and always wins.
    return { numpad: true, note: false };
  };
  const [cartUi, setCartUi] = useState(loadCartUi);
  const setCartUiSection = useCallback((patch: Partial<{ numpad: boolean; note: boolean }>) => {
    setCartUi(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(CART_UI_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const [cartMoreOpen, setCartMoreOpen] = useState(false);

  // ===== v1.0.40 cart scrolling =====
  // The cart column is ONE scroll area. The header sticks to the top, and the
  // totals + action bar stick to the bottom, so GRAND TOTAL, PAY, Kitchen,
  // Receipt, Running and the 3-dot menu are on screen at 100% zoom no matter
  // how many lines the bill has or how tall the window is. Everything between
  // them (items, scan panel, keypad, note) simply scrolls — and only when
  // there is genuinely more content than room.
  //
  // The two sticky offsets are measured rather than hard-coded: the action bar
  // changes height with the user's role, so a fixed number would either leave
  // a gap or hide a row.
  const cartColRef = useRef<HTMLDivElement | null>(null);
  const cartActionsRef = useRef<HTMLDivElement | null>(null);
  const cartHeadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const col = cartColRef.current;
    if (!col || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      const actions = cartActionsRef.current?.offsetHeight ?? 0;
      const head = cartHeadRef.current?.offsetHeight ?? 0;
      col.style.setProperty('--dt-cart-actions-h', `${actions}px`);
      col.style.setProperty('--dt-cart-head-h', `${head}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    if (cartActionsRef.current) ro.observe(cartActionsRef.current);
    if (cartHeadRef.current) ro.observe(cartHeadRef.current);
    window.addEventListener('resize', apply);
    return () => { ro.disconnect(); window.removeEventListener('resize', apply); };
  }, []);


  // ===== v1.0.40: Cart column ki chaurai (client: "cart thodi bari ho,
  // 5-6 items nazar aayen, left-right adjust ho jaye") =====
  // Cart jitna chaura hoga, keypad utna kam vertical space lega aur item
  // list ko utni hi zyada jagah milegi. Width drag se badalti hai aur
  // localStorage me save rehti hai.
  const CART_W_KEY = 'dtpos-cart-width';
  const CART_W_MIN = 280;
  const CART_W_MAX = 560;
  const CART_W_DEFAULT = 380; // pehle 300 tha — ab default me hi ~5-6 items
  const [cartWidth, setCartWidth] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(CART_W_KEY));
      if (Number.isFinite(v) && v >= CART_W_MIN && v <= CART_W_MAX) return v;
    } catch {}
    return CART_W_DEFAULT;
  });
  const resizingRef = useRef(false);

  const startCartResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startW = cartWidth;
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      // handle cart ke BAAYEN kinare par hai → baayein kheenchne se chaura
      const next = Math.min(CART_W_MAX, Math.max(CART_W_MIN, startW + (startX - ev.clientX)));
      setCartWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setCartWidth(w => { try { localStorage.setItem(CART_W_KEY, String(w)); } catch {} return w; });
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [cartWidth]);

  const resetCartWidth = useCallback(() => {
    setCartWidth(CART_W_DEFAULT);
    try { localStorage.setItem(CART_W_KEY, String(CART_W_DEFAULT)); } catch {}
    toast.success('Cart width reset');
  }, []);
  const [orderType, setOrderType] = useState<OrderType>('dining');
  // Mandatory Order-Type gate: force staff to pick Delivery / Dine-In / Takeaway
  // before adding items to a new cart. Once picked (or once we're editing an
  // existing order), stays hidden for the life of that cart.
  const [orderTypePicked, setOrderTypePicked] = useState(false);
  const [showOrderTypeGate, setShowOrderTypeGate] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [discountMode, setDiscountMode] = useState<'pkr' | 'percent'>('pkr');
  const [discountPercentInput, setDiscountPercentInput] = useState(0);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoApplied, setPromoApplied] = useState<{ code: string; discount: number } | null>(null);
  const [showCustomerReceipt, setShowCustomerReceipt] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [showDiningDialog, setShowDiningDialog] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [selectedWaiter, setSelectedWaiter] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  // true = bill sirf dekhne ke liye khula hai (print queue pehle hi print kar chuki),
  // is liye dialog dobara auto-print na kare.
  const [receiptViewOnly, setReceiptViewOnly] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [showKitchenReceipt, setShowKitchenReceipt] = useState(false);
  const [pendingKitchenReceipt, setPendingKitchenReceipt] = useState(false);
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custLat, setCustLat] = useState<number | undefined>();
  const [custLng, setCustLng] = useState<number | undefined>();
  const [custLocAt, setCustLocAt] = useState<string | undefined>();
  const [custProvince, setCustProvince] = useState('Punjab');
  const [custCity, setCustCity] = useState('');
  const [custArea, setCustArea] = useState('');
  const [selectedRider, setSelectedRider] = useState('');
  // Special Note (Kitchen instructions, e.g. "no onion", "extra spicy") — prints on KOT.
  const [specialNote, setSpecialNote] = useState('');

  // ===== Advanced Menu Flow state =====
  /** When set, show that flavor/sub-category's items only. null = show flavor grid (advanced flow only). */
  const [selectedFlavor, setSelectedFlavor] = useState<string | null>(null);
  /** Item currently being configured in the Size/Inch picker. */
  const [variantPickerItem, setVariantPickerItem] = useState<MenuItem | null>(null);




  // Inline numpad state
  const [numpadValue, setNumpadValue] = useState('');
  const [numpadTarget, setNumpadTarget] = useState<'price' | 'weight' | null>(null);
  const [numpadItem, setNumpadItem] = useState<MenuItem | null>(null);
  const [weightUnit, setWeightUnit] = useState<'KG' | 'Gram' | 'Pao'>('KG');

  // Payment - integrated (no separate dialog)
  const [paymentReceived, setPaymentReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentAccountId, setPaymentAccountId] = useState<string | undefined>();
  const [paymentAccountName, setPaymentAccountName] = useState<string | undefined>();
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  // Retrieve/edit
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [showRunningBills, setShowRunningBills] = useState(false);
  const [runningBills, setRunningBills] = useState<Order[]>([]);
  // ===== Duplicate order guard =====
  // Prevents rapid double-click / network-lag double-submit from creating two
  // identical orders. Locked while processOrder is in flight. We also keep a
  // short-lived signature lock so identical retries within 4 s are rejected.
  const orderSubmitLockRef = useRef(false);
  const recentOrderSigRef = useRef<{ sig: string; at: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [billSearch, setBillSearch] = useState('');

  // Selected cart item
  const [selectedCartItem, setSelectedCartItem] = useState<string | null>(null);

  // Void/Comp dialogs
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidType, setVoidType] = useState<'void' | 'complimentary' | 'cancel'>('void');
  const [compName, setCompName] = useState('');
  const [compPhone, setCompPhone] = useState('');

  // Credit dialog
  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [creditName, setCreditName] = useState('');
  const [creditPhone, setCreditPhone] = useState('');
  const [creditAddress, setCreditAddress] = useState('');

  const settings = useMemo(() => getSettings(), []);
  // Order Taker = create-only mode (no billing / payment / credit / void)
  const isOrderTaker = useMemo(() => (localStorage.getItem('pos-user-role') || '') === 'order_taker', []);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    setCategories(getCategories());
    setMenuItems(getMenuItems());
  }, []);

  // Pick correct discount mode based on enabled flags (admin can disable Rs or %)
  useEffect(() => {
    const pkrOn = settings.pkrDiscountEnabled !== false;
    const pctOn = settings.percentDiscountEnabled !== false;
    if (!pkrOn && pctOn && discountMode === 'pkr') { setDiscountMode('percent'); setDiscount(0); }
    else if (!pctOn && pkrOn && discountMode === 'percent') { setDiscountMode('pkr'); setDiscountPercentInput(0); }
  }, [settings.pkrDiscountEnabled, settings.percentDiscountEnabled, discountMode]);

  useEffect(() => {
    const retrieveParam = searchParams.get('retrieve');

    if (retrieveParam === 'open') {
      setRunningBills(getOrders().filter(o => o.status === 'running' || o.status === 'hold'));
      setBillSearch('');
      setShowRunningBills(true);
      setSearchParams({}, { replace: true });
      return;
    }

    if (retrieveParam) {
      const order = getOrders().find(
        o => o.id === retrieveParam && (o.status === 'running' || o.status === 'hold')
      );

      if (order) {
        setCart(order.items);
        setDiscount(order.discount);
        setOrderType(order.orderType);
        setOrderTypePicked(true);
        setEditingOrderId(order.id);
        if (order.tableId) setSelectedTable(order.tableId);
        if (order.waiterId) setSelectedWaiter(order.waiterId);
        if (order.customer) {
          setCustName(order.customer.name);
          setCustPhone(order.customer.phone);
          setCustAddress(order.customer.address);
        }
        setSpecialNote(order.notes || '');
        // FIX (client #1/#4): when ?pay=1 is present, the PAYMENT SCREEN opens directly
        if (searchParams.get('pay') === '1') {
          toast.info(`Order #${order.orderNumber} — payment screen`);
          setTimeout(() => setShowPaymentDialog(true), 250);
        } else {
          toast.info(`Editing Order #${order.orderNumber}`);
        }
      }


      setSearchParams({}, { replace: true });
    }

    // Smart Customer DB: preload customer from URL (?customer=<phone>)
    // FIX: "Create Order" from the Tables page — table arrives pre-selected
    const tableParam = searchParams.get('table');
    if (tableParam) {
      try {
        const t = getTables().find((x: any) => x.id === tableParam);
        if (t) {
          setOrderType('dining');
          setSelectedTable(t.id);
          setOrderTypePicked(true);
          toast.info(`${t.name} — start order`);
        }
      } catch {}
      const sp = new URLSearchParams(searchParams);
      sp.delete('table');
      setSearchParams(sp, { replace: true });
    }

    const customerParam = searchParams.get('customer');
    if (customerParam) {
      import('@/lib/store').then(({ findCustomerByPhone }) => {
        const c = findCustomerByPhone(customerParam);
        if (c) {
          setCustName(c.name || '');
          setCustPhone(c.phone || '');
          setCustAddress(c.fullAddress || c.addresses?.[0] || '');
          setOrderType('delivery');
          setOrderTypePicked(true);
          toast.success(`Customer loaded: ${c.name}`);
        }
        setSearchParams({}, { replace: true });
      });
    }
  }, [searchParams, setSearchParams]);

  const refreshTables = () => getTables();
  const refreshWaiters = () => getWaiters();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('pos-search')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Items inside the currently selected category (used for both flavor grid and items grid)
  const categoryItems = useMemo(() => {
    return menuItems.filter(item => {
      if (!item.isActive) return false;
      if (selectedCat !== 'all' && item.categoryId !== selectedCat) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [menuItems, selectedCat, search]);

  // ===== Advanced Menu Flow gating =====
  // Flavor layer is shown only when:
  //  - advancedMenuFlow + enableFlavorLayer both ON
  //  - a real category is selected (not "all")
  //  - that category contains at least one item with a non-empty subCategory
  //  - user hasn't already drilled into a flavor
  //  - user isn't searching (search bypasses the flavor layer for speed)
  const flavorList = useMemo(() => {
    if (!settings.advancedMenuFlow || !settings.enableFlavorLayer) return [];
    if (selectedCat === 'all' || search.trim()) return [];
    const set = new Set<string>();
    for (const it of categoryItems) {
      const f = (it.subCategory || it.flavorGroup || '').trim();
      if (f) set.add(f);
    }
    return Array.from(set);
  }, [categoryItems, settings.advancedMenuFlow, settings.enableFlavorLayer, selectedCat, search]);

  const showFlavorGrid = flavorList.length > 0 && selectedFlavor == null;

  const filteredItems = useMemo(() => {
    if (showFlavorGrid) return [];
    if (selectedFlavor) {
      return categoryItems.filter(it => (it.subCategory || it.flavorGroup || '').trim() === selectedFlavor);
    }
    return categoryItems;
  }, [categoryItems, showFlavorGrid, selectedFlavor]);

  // Order-Type gate master switch — when OFF the dialog must NEVER appear,
  // not on the first bill and not after clearing/finishing a bill.
  const gatePromptOn = (settings as any).orderTypeGatePromptEnabled !== false;

  // Reset drill-in when category changes
  // Show the mandatory Order-Type gate on first open of an empty cart.
  useEffect(() => {
    if (!gatePromptOn) {
      if (!orderTypePicked) setOrderTypePicked(true);
      return;
    }
    if (!editingOrderId && cart.length === 0 && !orderTypePicked) {
      setShowOrderTypeGate(true);
    }
  }, [editingOrderId, cart.length, orderTypePicked, settings.orderTypeGatePromptEnabled]);

  useEffect(() => { setSelectedFlavor(null); }, [selectedCat]);

  /** Helper: does this item need a Size/Inch picker dialog? */
  const itemHasVariants = (item: MenuItem) =>
    (item.pricingType === 'size' || item.pricingType === 'inch' || item.pricingType === 'both') &&
    ((item.sizeVariants && item.sizeVariants.length > 0) || (item.inchVariants && item.inchVariants.length > 0));

  /** Add a configured variant to cart. */
  const addVariantToCart = useCallback((item: MenuItem, variant: { name: string; price: number; type: 'size' | 'inch' }) => {
    if (gatePromptOn && !orderTypePicked && !editingOrderId) { setShowOrderTypeGate(true); return; }
    const displayName = `${item.name} - ${variant.name}`;
    setCart(prev => {
      // Treat same item+variant as same line (qty++)
      const existing = prev.find(c => c.menuItemId === item.id && c.variantName === variant.name && c.variantType === variant.type);
      if (existing) {
        return prev.map(c => c === existing
          ? { ...c, quantity: c.quantity + 1, lineTotal: (c.quantity + 1) * c.price }
          : c
        );
      }
      return [...prev, {
        id: genId(), menuItemId: item.id, name: displayName,
        pricingType: 'fixed' as any, price: variant.price,
        quantity: 1, lineTotal: variant.price,
        note: '',
        variantType: variant.type,
        variantName: variant.name,
      }];
    });
  }, [orderTypePicked, editingOrderId]);

  // ===== MINIMART: barcode lookup + add weighed items straight to cart =====
  const addWeighedToCart = useCallback((item: MenuItem, kg: number) => {
    const grams = Math.round(kg * 1000);
    const rate = Number((item as any).ratePerKg) || Number(item.price) || 0;
    if (rate <= 0) {
      toast.error(`${item.name} has no "Rate per KG" set — set it in the Menu Manager`);
      return;
    }
    const price = computeWeightPrice(kg, rate);
    setCart(prev => [...prev, {
      id: genId(), menuItemId: item.id, name: item.name,
      pricingType: 'weight', price, quantity: 1,
      weightGrams: grams, lineTotal: price, note: weightNote(kg, rate),
    }]);
    toast.success(`${item.name} — ${kg.toFixed(3)} kg`);
  }, []);

  const findByBarcode = useCallback((code: string): MenuItem | undefined => {
    const c = String(code || '').trim();
    if (!c) return undefined;
    const items = getMenuItems();
    return items.find((m: any) => m.barcode && String(m.barcode).trim() === c)
        || items.find((m: any) => m.plu && String(m.plu).trim() === c)
        || items.find((m: any) => m.plu && String(Number(m.plu)) === String(Number(c)))
        || items.find((m: any) => String(m.id) === c);
  }, []);

  const handleScan = useCallback((res: { code: string; weightKg?: number; price?: number }) => {
    const item = findByBarcode(res.code);
    if (!item) { toast.error(`Barcode ${res.code} is not linked to any item — set the barcode in Menu`); return; }
    if (res.weightKg && res.weightKg > 0) { addWeighedToCart(item, res.weightKg); return; }
    if (res.price && res.price > 0) {
      setCart(prev => [...prev, {
        id: genId(), menuItemId: item.id, name: item.name,
        pricingType: 'manual', price: res.price!, quantity: 1, lineTotal: res.price!, note: 'label price',
      }]);
      toast.success(`${item.name} — ${res.price}`);
      return;
    }
    addToCart(item);
  }, [findByBarcode, addWeighedToCart]);

  // ===== v1.0.38: read weight from scale (button + F9) =====
  const [scaleConnected, setScaleConnected] = useState(weightScale.connected);
  useEffect(() => {
    const off = weightScale.onStatus((s) => setScaleConnected(s === 'connected'));
    // Auto-connect on POS startup (only if a port is already authorised).
    // Deliberately not awaited: the scale is an optional peripheral and the
    // billing screen must never wait on it.
    void autoConnectScale();
    return () => { off(); };
  }, []);

  const captureFromScale = useCallback(async () => {
    const sc = loadScaleConfig();
    if (!weightScale.portOpen) {
      const r = await weightScale.connect(sc);
      // Never a dead end: the numpad is already open in weight mode, so the
      // cashier types the weight and carries on.
      if (!r.ok) {
        toast.error(r.error || 'Could not connect to the scale — check the COM port in Settings', {
          description: 'You can type the weight on the keypad and press Apply.',
          duration: 8000,
        });
        return;
      }
    }
    const r = await weightScale.captureStable(4000, sc.stableOnly);
    if (!r || r.kg <= 0) {
      toast.error('No weight received — place the item on the scale, or type the weight on the keypad');
      return;
    }
    if (sc.stableOnly && !r.stable) { toast.warning('Weight is still fluctuating — please wait'); return; }
    setWeightUnit('KG');
    setNumpadValue(String(r.kg));
    toast.success(`⚖️ ${r.kg.toFixed(3)} kg`);
  }, []);

  // F9 = when the weight dialog is open, read weight from the scale
  useEffect(() => {
    if (numpadTarget !== 'weight') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F9') { e.preventDefault(); void captureFromScale(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numpadTarget, captureFromScale]);

  const handleScaleWeight = useCallback((kg: number) => {
    // Jo item cart me aakhri select hua ya pehla weight-item — usi pe lagao
    const items = getMenuItems();
    const sel = selectedCartItem ? cart.find(c => c.id === selectedCartItem) : undefined;
    const target = sel ? items.find(m => m.id === sel.menuItemId) : undefined;
    // FIX v1.0.38: previously a cart line had to be selected first, which is
    // backwards at the counter. Now: (1) selected line, else (2) the weight
    // item open in the numpad, else (3) the last weight item in the cart.
    let weightItem = target && target.pricingType === 'weight' ? target : undefined;
    if (!weightItem && numpadItem?.pricingType === 'weight') weightItem = numpadItem;
    if (!weightItem) {
      const lastWeighed = [...cart].reverse().find(c => c.pricingType === 'weight');
      if (lastWeighed) weightItem = items.find(m => m.id === lastWeighed.menuItemId);
    }
    if (!weightItem) { toast.error('First tap a weight item (or scan a barcode)'); return; }
    addWeighedToCart(weightItem, kg);
  }, [selectedCartItem, cart, addWeighedToCart, numpadItem]);

  // Keyboard-wedge scanner (USB scanner types like a keyboard)
  useEffect(() => {
    if (!(settings as any).minimartMode) return;
    const off = attachBarcodeScanner((code) => {
      const p = parseBarcode(code, { ...DEFAULT_EMBEDDED, mode: ((settings as any).embeddedBarcodeMode || 'weight') as any });
      handleScan({ code: p.lookupCode, weightKg: p.weightKg, price: p.price });
    });
    return off;
  }, [(settings as any).minimartMode, (settings as any).embeddedBarcodeMode, handleScan]);

  const addToCart = useCallback((item: MenuItem) => {
    if (gatePromptOn && !orderTypePicked && !editingOrderId) { setShowOrderTypeGate(true); return; }
    if (item.pricingType === 'weight') {
      setNumpadItem(item);
      setNumpadTarget('weight');
      setNumpadValue('');
      setWeightUnit('KG');
      // ===== v1.0.38 (client: crab @ 10/kg) =====
      // If the scale is connected and auto-capture is ON, read the weight
      // automatically — the cashier does not need to type it by hand.
      const sc = loadScaleConfig();
      if (sc.autoCapture && weightScale.portOpen) {
        void (async () => {
          const r = await weightScale.captureStable(4000, sc.stableOnly);
          if (r && r.kg > 0) {
            setNumpadValue(String(r.kg));
            toast.success(`⚖️ ${r.kg.toFixed(3)} kg — press Apply`);
          }
        })();
      }
      return;
    }
    if (item.pricingType === 'manual') {
      setNumpadItem(item);
      setNumpadTarget('price');
      setNumpadValue('');
      return;
    }
    if (itemHasVariants(item)) {
      setVariantPickerItem(item);
      return;
    }
    // Resolve a safe price. Some items may be saved with pricingType 'size'/'inch'/'both'
    // but no variants (edge case from imports) — fall back to item.price, else to the
    // cheapest variant price, else prompt for a manual price so cart/total never end
    // up at Rs.0.
    let safePrice = Number(item.price) || 0;
    if (!safePrice) {
      const vPrices = [
        ...((item.sizeVariants || []).map(v => Number(v.price) || 0)),
        ...((item.inchVariants || []).map(v => Number(v.price) || 0)),
      ].filter(p => p > 0);
      if (vPrices.length) safePrice = Math.min(...vPrices);
    }
    if (!safePrice) {
      // No price on file — open numpad so cashier enters it manually
      setNumpadItem(item);
      setNumpadTarget('price');
      setNumpadValue('');
      toast.error(`${item.name}: price not set. Enter price manually.`);
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id && !c.variantName);
      if (existing) {
        return prev.map(c => c.menuItemId === item.id && !c.variantName
          ? { ...c, quantity: c.quantity + 1, lineTotal: (c.quantity + 1) * (Number(c.price) || safePrice), price: Number(c.price) || safePrice }
          : c
        );
      }
      return [...prev, {
        id: genId(), menuItemId: item.id, name: item.name,
        pricingType: item.pricingType, price: safePrice,
        quantity: 1, lineTotal: safePrice,
        note: item.categoryId === DEALS_CATEGORY_ID ? buildDealNote(item.id, menuItems) : ''
      }];
    });
  }, [menuItems, orderTypePicked, editingOrderId]);

  // Numpad mode for selected cart item
  const [numpadCartMode, setNumpadCartMode] = useState<'qty' | 'price'>('qty');

  // Numpad key handler
  const handleNumpadKey = (key: string) => {
    if (key === 'CLR') { setNumpadValue(''); return; }
    if (key === '⌫') { setNumpadValue(v => v.slice(0, -1)); return; }
    if (key === '.' && numpadValue.includes('.')) return;
    setNumpadValue(v => v + key);
  };

  const applyNumpadValue = () => {
    const val = parseFloat(numpadValue);
    if (isNaN(val) || val <= 0) { toast.error('Enter a valid number'); return; }

    if (numpadTarget === 'weight' && numpadItem) {
      let kgValue = val;
      if (weightUnit === 'Gram') kgValue = val / 1000;
      if (weightUnit === 'Pao') kgValue = val * 0.25;
      const grams = Math.round(kgValue * 1000);
      // FIX v1.0.38: if the item had no ratePerKg, `kg * undefined` produced
      // NaN and the line went in at Rs.0. Now falls back to price and uses
      // the rounding config (PKR whole / $ decimal).
      const rate = Number(numpadItem.ratePerKg) || Number(numpadItem.price) || 0;
      if (rate <= 0) {
        toast.error(`${numpadItem.name} has no "Rate per KG" set — set it in the Menu Manager`);
        return;
      }
      const price = computeWeightPrice(kgValue, rate);
      setCart(prev => [...prev, {
        id: genId(), menuItemId: numpadItem.id, name: numpadItem.name,
        pricingType: 'weight', price, quantity: 1,
        weightGrams: grams, lineTotal: price, note: weightNote(kgValue, rate)
      }]);
    } else if (numpadTarget === 'price' && numpadItem) {
      setCart(prev => [...prev, {
        id: genId(), menuItemId: numpadItem.id, name: numpadItem.name,
        pricingType: 'manual', price: val, quantity: 1,
        lineTotal: val, note: ''
      }]);
    } else if (!numpadTarget && selectedCartItem) {
      // Apply qty or price to selected cart item
      const cartItem = cart.find(c => c.id === selectedCartItem);
      if (cartItem) {
        if (numpadCartMode === 'qty') {
          const qty = Math.max(1, Math.round(val));
          setCart(prev => prev.map(c => c.id === selectedCartItem
            ? { ...c, quantity: qty, lineTotal: qty * c.price }
            : c
          ));
        } else {
          setCart(prev => prev.map(c => c.id === selectedCartItem
            ? { ...c, price: val, lineTotal: val * c.quantity }
            : c
          ));
        }
      }
      setSelectedCartItem(null);
    } else if (!numpadTarget && !numpadItem && !selectedCartItem && cart.length > 0) {
      // Free calculator → set as Cash Received
      setPaymentReceived(String(val));
      toast.success(`Cash Received: PKR ${val.toLocaleString()}`);
    }
    setNumpadValue('');
    setNumpadItem(null);
    setNumpadTarget(null);
  };

  const cancelNumpad = () => {
    setNumpadValue('');
    setNumpadItem(null);
    setNumpadTarget(null);
  };

  const addManualItem = () => {
    if (!manualName || !manualPrice) return;
    const price = parseFloat(manualPrice);
    if (isNaN(price)) return;
    setCart(prev => [...prev, {
      id: genId(), menuItemId: 'manual', name: manualName,
      pricingType: 'manual', price, quantity: 1,
      lineTotal: price, note: ''
    }]);
    setShowManualDialog(false);
    setManualName('');
    setManualPrice('');
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const newQty = Math.max(1, c.quantity + delta);
      return { ...c, quantity: newQty, lineTotal: newQty * c.price };
    }));
  };

  const removeItem = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
    if (selectedCartItem === id) setSelectedCartItem(null);
  };

  const subtotal = useMemo(() => cart.reduce((sum, c) => sum + c.lineTotal, 0), [cart]);

  // Discount excluded items (categories + items)
  const excludedCatIds = settings.discountExcludedCategoryIds || [];
  const excludedItemIds = settings.discountExcludedItemIds || [];
  const discountableSubtotal = useMemo(() => {
    return cart.reduce((sum, c) => {
      const mi = menuItems.find(m => m.id === c.menuItemId);
      const excluded = (mi && excludedCatIds.includes(mi.categoryId)) || excludedItemIds.includes(c.menuItemId);
      return sum + (excluded ? 0 : c.lineTotal);
    }, 0);
  }, [cart, menuItems, excludedCatIds, excludedItemIds]);

  // Event discount (auto) — supports both percent and flat PKR
  const evtType = (settings.eventDiscountType || 'percent') as 'percent' | 'pkr';
  const eventActive = !!settings.eventDiscountEnabled && (
    (evtType === 'percent' && (settings.eventDiscountPercent || 0) > 0) ||
    (evtType === 'pkr' && (settings.eventDiscountAmount || 0) > 0)
  );
  const eventPct = evtType === 'percent' ? (settings.eventDiscountPercent || 0) : 0;
  const eventDiscountAmt = !eventActive ? 0
    : evtType === 'percent'
      ? Math.round(discountableSubtotal * eventPct / 100)
      : Math.min(discountableSubtotal, settings.eventDiscountAmount || 0);

  // Manual discount resolution (only one of pkr OR percent active at a time)
  const manualPercentAmt = discountMode === 'percent'
    ? Math.round(discountableSubtotal * (discountPercentInput || 0) / 100)
    : 0;
  const manualPkrAmt = discountMode === 'pkr' ? (discount || 0) : 0;
  const manualDiscount = Math.min(manualPercentAmt + manualPkrAmt, discountableSubtotal);

  // Promo code discount (on top of manual + event)
  const promoDiscount = promoApplied?.discount || 0;

  const totalDiscount = Math.min(discountableSubtotal, eventDiscountAmt + manualDiscount + promoDiscount);

  // ===== Service Charge + GST (client formula) =====
  // EXCLUSIVE: item 100 → SC 10% = 10 → subtotal 110 → GST 9% = 9.90 → total 119.90
  // INCLUSIVE: GST is already included in the total — it is only shown separately
  //            (base = total / 1.09, gst = total × 0.09 / 1.09)
  const scPercent = settings.serviceChargePercent || 0;
  const netSubtotal = subtotal - totalDiscount;
  const serviceCharge = Math.round(netSubtotal * scPercent / 100);
  const taxPct = Number((settings as any).taxPercent) || 0;
  const taxMode = ((settings as any).taxMode as 'exclusive' | 'inclusive') || 'exclusive';
  const taxableBase = netSubtotal + serviceCharge;
  let taxAmount = 0;
  let grandTotal = 0;
  if (taxPct > 0) {
    if (taxMode === 'inclusive') {
      grandTotal = taxableBase;
      taxAmount = Math.round((taxableBase * taxPct / (100 + taxPct)) * 100) / 100;
    } else {
      taxAmount = Math.round((taxableBase * taxPct / 100) * 100) / 100;
      grandTotal = taxableBase + taxAmount;
    }
  } else {
    taxAmount = settings.taxAmount || 0; // legacy flat tax
    grandTotal = taxableBase + taxAmount;
  }

  // ===== Delivery charge (only on delivery orders) =====
  const deliveryChargeAmt = orderType === 'delivery' ? Number(settings.deliveryCharge || 0) : 0;
  grandTotal += deliveryChargeAmt;

  // ===== Rounding to nearest 0.05 / 0.10 / 1 (client #5: cents) =====
  const roundStep = (() => {
    const m = (settings as any).roundingMode || 'none';
    return m === '0.05' ? 0.05 : m === '0.10' ? 0.10 : m === '1' ? 1 : 0;
  })();
  let roundingAdjust = 0;
  if (roundStep > 0) {
    const rounded = Math.round(grandTotal / roundStep) * roundStep;
    roundingAdjust = Math.round((rounded - grandTotal) * 100) / 100;
    grandTotal = Math.round(rounded * 100) / 100;
  }

  const paymentReceivedNum = parseFloat(paymentReceived) || 0;
  const changeAmount = paymentReceivedNum - grandTotal;

  const buildDiscountTitle = (): string | undefined => {
    const parts: string[] = [];
    if (eventActive && eventDiscountAmt > 0) {
      parts.push(evtType === 'percent'
        ? `${settings.eventDiscountTitle || 'Event Discount'} ${eventPct}%`
        : `${settings.eventDiscountTitle || 'Event Discount'} Rs.${settings.eventDiscountAmount || 0}`);
    }
    if (discountMode === 'percent' && discountPercentInput > 0) parts.push(`Manual ${discountPercentInput}%`);
    else if (discountMode === 'pkr' && (discount || 0) > 0) parts.push(`Manual PKR`);
    if (promoApplied) parts.push(`Promo ${promoApplied.code}`);
    return parts.length ? parts.join(' + ') : undefined;
  };

  // Re-validate promo whenever cart subtotal changes (in case cart shrinks below min)
  useEffect(() => {
    if (!promoApplied) return;
    const res = validatePromoCode(promoApplied.code, discountableSubtotal);
    if ('error' in res) {
      setPromoApplied(null);
      toast.info('Promo removed: ' + res.error);
    } else if (res.discount !== promoApplied.discount) {
      setPromoApplied({ code: res.promo.code, discount: res.discount });
    }
  }, [discountableSubtotal, promoApplied]);

  const applyPromo = () => {
    const res = validatePromoCode(promoCodeInput, discountableSubtotal);
    if ('error' in res) { toast.error(res.error); return; }
    setPromoApplied({ code: res.promo.code, discount: res.discount });
    toast.success(`Promo ${res.promo.code} applied: -Rs. ${res.discount.toLocaleString()}`);
  };
  const removePromo = () => { setPromoApplied(null); setPromoCodeInput(''); };

  const clearCart = () => {
    setCart([]);
    setOrderTypePicked(!gatePromptOn);
    setShowOrderTypeGate(gatePromptOn);
    setDiscount(0);
    setDiscountPercentInput(0);
    setDiscountMode('pkr');
    setPromoApplied(null);
    setPromoCodeInput('');
    setSelectedTable('');
    setSelectedWaiter('');
    setCustName('');
    setCustPhone('');
    setCustAddress('');
    setSelectedRider('');
    setSpecialNote('');

    setEditingOrderId(null);
    setSelectedCartItem(null);
    setNumpadValue('');
    setNumpadItem(null);
    setNumpadTarget(null);
    setPaymentReceived('');
  };

  const processOrder = async (status: 'paid' | 'partial' | 'running' | 'hold' | 'void' | 'complimentary' | 'cancelled', extras?: Partial<Order>) => {
    if (cart.length === 0 && status !== 'void' && status !== 'cancelled') { toast.error('Cart is empty'); return; }

    // ===== Duplicate-submit guard =====
    // 1) In-flight lock: while a save is processing, ignore further clicks.
    if (orderSubmitLockRef.current) {
      try { console.warn('[POS] processOrder duplicate-click suppressed'); } catch {}
      return;
    }
    // 2) Signature lock: same cart + status + table within 4s = ignore.
    if (!editingOrderId) {
      const sig = [
        status,
        orderType,
        selectedTable || '',
        custPhone || '',
        cart.length,
        Math.round((cart.reduce((s, i) => s + i.lineTotal, 0)) * 100),
      ].join('|');
      const last = recentOrderSigRef.current;
      if (last && last.sig === sig && Date.now() - last.at < 4000) {
        toast.info('Duplicate submit roka gaya — already saved');
        return;
      }
      recentOrderSigRef.current = { sig, at: Date.now() };
    }
    orderSubmitLockRef.current = true;
    setSubmitting(true);
    try {
      return await processOrderInner(status, extras);
    } finally {
      orderSubmitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const processOrderInner = async (status: 'paid' | 'partial' | 'running' | 'hold' | 'void' | 'complimentary' | 'cancelled', extras?: Partial<Order>) => {
    if (cart.length === 0 && status !== 'void' && status !== 'cancelled') { toast.error('Cart is empty'); return; }

    // Branch guard — order_taker users have branch auto-assigned at login, skip prompt
    const currentRole = (localStorage.getItem('pos-user-role') || '').toLowerCase();
    if (currentRole !== 'order_taker') {
      const activeBranches = getBranches().filter(b => b.isActive);
      const activeBranchId = getCurrentBranchId();
      if (activeBranches.length > 0 && !activeBranchId) {
        toast.error('First select an active Branch from the header, otherwise which branch should the bill be saved to?');
        return;
      }
    }

    const tables = refreshTables();
    const waiters = refreshWaiters();

    // FIX (client #3): dialog SIRF tab khule jab table select hi na ho.
    // Table selected + waiter missing → waiter ke baghair aage barho
    // (do not ask again) — waiter is optional.
    if (orderType === 'dining' && status === 'running' && !selectedTable && !editingOrderId) {
      setShowDiningDialog(true);
      return;
    }
    if (orderType === 'delivery' && !custName && !editingOrderId) {
      setShowDeliveryDialog(true);
      return;
    }

    if (editingOrderId) {
      const existingOrders = getOrders();
      const existing = existingOrders.find(o => o.id === editingOrderId);
      if (existing) {
        const allWaitersE = getWaiters();
        const allRidersE = getRiders();
        const allUsersE = getUsers();
        const currentUserIdE = localStorage.getItem('pos-user-id') || '';
        const currentUserE = allUsersE.find(u => u.id === currentUserIdE);
        const waiterObjE = allWaitersE.find(w => w.id === (selectedWaiter || existing.waiterId));
        const riderObjE = allRidersE.find(r => r.id === (selectedRider || existing.riderId));
        const tableObjE = tables.find(t => t.id === (selectedTable || existing.tableId));

        const updated: Order = {
          ...existing,
          items: cart,
          subtotal,
          discount: totalDiscount,
          discountPercent: discountMode === 'percent' ? discountPercentInput : (eventActive && evtType === 'percent' ? eventPct : undefined),
          discountTitle: buildDiscountTitle(),
          promoCode: promoApplied?.code,
          promoCodeDiscount: promoApplied?.discount,
          tax: taxAmount,
          serviceCharge,
          serviceChargePercent: scPercent,
          deliveryChargeAmount: deliveryChargeAmt,
          roundingAdjust: roundingAdjust,
          grandTotal,
          status,
          paymentMethod: status === 'paid' ? paymentMethod : existing.paymentMethod,
          paymentAccountId: status === 'paid' ? paymentAccountId : existing.paymentAccountId,
          paymentAccountName: status === 'paid' ? paymentAccountName : existing.paymentAccountName,
          cashReceived: status === 'paid' && paymentReceivedNum > 0 ? paymentReceivedNum : existing.cashReceived,
          changeReturned: status === 'paid' && paymentReceivedNum > 0 ? Math.max(0, paymentReceivedNum - grandTotal) : existing.changeReturned,
          customer: (custName || custPhone) ? { id: existing.customer?.id || genId(), name: custName, phone: custPhone, address: custAddress, fullAddress: custAddress, province: custProvince, city: custCity, area: custArea, lat: custLat, lng: custLng, locationCapturedAt: custLocAt } : existing.customer,
          paidAt: status === 'paid' ? new Date().toISOString() : undefined,
          // Integrated flow: paid orders auto-clear from KDS
          kitchenStatus: status === 'paid' ? 'served' as const : existing.kitchenStatus,
          kitchenStatusAt: status === 'paid' ? new Date().toISOString() : existing.kitchenStatusAt,
          notes: specialNote.trim() || existing.notes || '',

          tableName: tableObjE?.name || existing.tableName,
          waiterName: waiterObjE?.name || existing.waiterName,
          riderName: riderObjE?.name || existing.riderName,
          riderPhone: riderObjE?.phone || existing.riderPhone,
          cashierName: currentUserE?.name || existing.cashierName || 'Unknown',
          ...extras,
        };
        saveOrder(updated);
        if (status === 'paid' && promoApplied?.code) {
          incrementPromoUsage(promoApplied.code);
        }

        // ===== UPDATE KOT — when an existing order is edited and new items
        //       were added, send ONLY the new items to the kitchen so the
        //       earlier items are not re-cooked.
        const masterAuto = settings.autoPrintKot ?? settings.autoKitchenPrint ?? true; // default ON — pehli save par KOT khud jaye
        const perTypeAuto = existing.orderType === 'dining'   ? (settings.autoKotDining   ?? masterAuto)
                          : existing.orderType === 'takeaway' ? (settings.autoKotTakeaway ?? masterAuto)
                          : existing.orderType === 'delivery' ? (settings.autoKotDelivery ?? masterAuto)
                          : masterAuto;
        const editAutoKot = settings.kotEnabled !== false
          && perTypeAuto
          && !settings.manualSendToKitchen;
        // Track if this handler already enqueued a KOT so the takeaway-pay
        // safety net below doesn't queue a SECOND duplicate slip.
        let kotEnqueuedThisCall = false;
        if (editAutoKot && (status === 'running' || status === 'paid' || status === 'hold' || status === 'partial')) {
          const diff = computeKotDiff(updated);
          if (diff.hasDiff) {
            if (existing.kotPrinted) {
              enqueueKotUpdate(updated);
              kotEnqueuedThisCall = true;
              toast.info(`KOT update sent — ${diff.diffItemIds.length} naye items kitchen ko bhej diye`);
            } else {
              // first KOT never went out — send a normal full KOT
              enqueueKot(updated);
              kotEnqueuedThisCall = true;
            }
          }
        }
        // Takeaway pay safety net — only fires if NO KOT was queued above and
        // the order's first KOT never went out. Prevents duplicate silent prints.
        if (!kotEnqueuedThisCall && status === 'paid' && settings.kotEnabled !== false && updated.orderType === 'takeaway' && !updated.kotPrinted && !existing.kotPrinted) {
          try { enqueueKot(updated, { force: true }); } catch {}
        }

        // ===== CANCEL KOT — if the order is cancelled/voided and the KOT already went to the kitchen,
        //       to kitchen ko ek CANCELLED slip bhejen taa ke cooking ruk jaye.
        if ((status === 'cancelled' || status === 'void') && settings.kotEnabled !== false
            && (settings.printKotOnCancel !== false) && existing.kotPrinted) {
          try { enqueueKotCancel(updated); } catch {}
        }


        if (existing.tableId) {
          const t = tables.find(t => t.id === existing.tableId);
          if (t) {
            saveTable({
              ...t,
              status: (status === 'paid' || status === 'void' || status === 'complimentary' || status === 'cancelled') ? 'free' : 'running',
              currentOrderId: (status === 'paid' || status === 'void' || status === 'complimentary' || status === 'cancelled') ? undefined : existing.id
            });
          }
        }

        setLastOrder(updated);
        if (status === 'paid') {
          if (isPrintPreviewEnabled()) {
            // Preview mode: pehle screen par bill, Print button se nikle ga.
            setReceiptViewOnly(true); setShowReceipt(true);
          } else {
            try { enqueueReceiptOnPay(updated); } catch {}
            if (settings.showBillOnScreen) { setReceiptViewOnly(true); setShowReceipt(true); }
          }
          toast.success(`Order #${updated.orderNumber} paid — receipt printing`);
        } else if (status === 'partial') {
          try { enqueueReceiptOnPay(updated); } catch {}
          const due = Math.max(0, (updated.grandTotal || 0) - (updated.amountPaid || 0));
          toast.success(`#${updated.orderNumber} Partial — Paid Rs.${(updated.amountPaid||0).toLocaleString()} · Due Rs.${due.toLocaleString()}`);
        } else if (status === 'void') {
          toast.info(`Order #${updated.orderNumber} voided`);
        } else if (status === 'complimentary') {
          toast.info(`Order #${updated.orderNumber} marked complimentary`);
        } else if (status === 'cancelled') {
          toast.info(`Order #${updated.orderNumber} cancelled`);
        } else {
          toast.info(`Order #${updated.orderNumber} updated & held`);
        }
        clearCart();
        return;
      }
    }


    const allWaiters = getWaiters();
    const allRiders = getRiders();
    const allUsers = getUsers();
    const currentUserId = localStorage.getItem('pos-user-id') || '';
    const currentUser = allUsers.find(u => u.id === currentUserId);
    const cashierName = currentUser?.name || 'Unknown';
    const waiterObj = allWaiters.find(w => w.id === selectedWaiter);
    const riderObj = allRiders.find(r => r.id === selectedRider);
    const tableObj = tables.find(t => t.id === selectedTable);

    const order: Order = {
      id: genId(),
      orderNumber: await getNextOrderNumberAsync(),
      orderType,
      status,
      tableId: orderType === 'dining' ? selectedTable : undefined,
      tableName: orderType === 'dining' && tableObj ? tableObj.name : undefined,
      waiterId: orderType === 'dining' ? selectedWaiter : undefined,
      waiterName: orderType === 'dining' && waiterObj ? waiterObj.name : undefined,
      riderId: orderType === 'delivery' ? selectedRider : undefined,
      riderName: orderType === 'delivery' && riderObj ? riderObj.name : undefined,
      riderPhone: orderType === 'delivery' && riderObj ? riderObj.phone : undefined,
      cashierName,
      cashierId: currentUserId || undefined,
      customer: (custName || custPhone || orderType === 'delivery') ? { id: genId(), name: custName, phone: custPhone, address: custAddress, fullAddress: custAddress, province: custProvince, city: custCity, area: custArea, lat: custLat, lng: custLng, locationCapturedAt: custLocAt } : undefined,
      items: cart,
      subtotal,
      discount: totalDiscount,
      discountPercent: discountMode === 'percent' ? discountPercentInput : (eventActive && evtType === 'percent' ? eventPct : undefined),
      discountTitle: buildDiscountTitle(),
      promoCode: promoApplied?.code,
      promoCodeDiscount: promoApplied?.discount,
      tax: taxAmount,
      serviceCharge,
      serviceChargePercent: scPercent,
      deliveryChargeAmount: deliveryChargeAmt,
      roundingAdjust: roundingAdjust,
      grandTotal,
      paymentMethod: status === 'paid' ? paymentMethod : undefined,
      paymentAccountId: status === 'paid' ? paymentAccountId : undefined,
      paymentAccountName: status === 'paid' ? paymentAccountName : undefined,
      cashReceived: status === 'paid' && paymentReceivedNum > 0 ? paymentReceivedNum : undefined,
      changeReturned: status === 'paid' && paymentReceivedNum > 0 ? Math.max(0, paymentReceivedNum - grandTotal) : undefined,
      deliveryStatus: orderType === 'delivery' ? 'pending' : undefined,
      createdAt: new Date().toISOString(),
      paidAt: status === 'paid' ? new Date().toISOString() : undefined,
      // Integrated flow: a brand-new order paid immediately doesn't need KDS
      kitchenStatus: status === 'paid' ? 'served' as const : undefined,
      kitchenStatusAt: status === 'paid' ? new Date().toISOString() : undefined,
      notes: specialNote.trim(),

      branchId: getCurrentBranchId() || undefined,
      source: (localStorage.getItem('pos-user-role') === 'order_taker') ? 'order_taker' : 'pos',
      ...extras,
    };

    saveOrder(order);
    if (status === 'paid' && promoApplied?.code) {
      incrementPromoUsage(promoApplied.code);
    }

    if (orderType === 'dining' && selectedTable) {
      const t = tables.find(t => t.id === selectedTable);
      if (t) {
        saveTable({
          ...t,
          status: (status === 'paid' || status === 'void' || status === 'complimentary' || status === 'cancelled') ? 'free' : 'running',
          currentOrderId: (status === 'paid' || status === 'void' || status === 'complimentary' || status === 'cancelled') ? undefined : order.id
        });
      }
    }

    setLastOrder(order);
    // ===== Centralized one-phase printing =====
    const role = localStorage.getItem('pos-user-role') || '';
    const isOrderTaker = role === 'order_taker';
    const isNewOrder = status === 'running' || status === 'paid' || status === 'partial';
    const kotAllowed = settings.kotEnabled !== false;
    const masterAutoNew = settings.autoPrintKot ?? settings.autoKitchenPrint ?? true; // default ON — pehli save par KOT khud jaye
    const perTypeAutoNew = order.orderType === 'dining'   ? (settings.autoKotDining   ?? masterAutoNew)
                         : order.orderType === 'takeaway' ? (settings.autoKotTakeaway ?? masterAutoNew)
                         : order.orderType === 'delivery' ? (settings.autoKotDelivery ?? masterAutoNew)
                         : masterAutoNew;
    const autoKot = isOrderTaker
      ? settings.autoKotOnOrderTakerSave !== false
      : perTypeAutoNew;
    if (status === 'paid') {
      if (isPrintPreviewEnabled()) {
        setReceiptViewOnly(true); setShowReceipt(true);
      } else {
        try { enqueueReceiptOnPay(order); } catch {}
        if (settings.showBillOnScreen) { setReceiptViewOnly(true); setShowReceipt(true); }
      }
      toast.success(`Order #${order.orderNumber} paid — receipt printing`);
    } else if (status === 'partial') {
      try { enqueueReceiptOnPay(order); } catch {}
      const due = Math.max(0, (order.grandTotal || 0) - (order.amountPaid || 0));
      toast.success(`Order #${order.orderNumber} — Partial paid Rs.${(order.amountPaid||0).toLocaleString()} · Pending Rs.${due.toLocaleString()}`);
    } else if (status === 'hold') {
      toast.info(`Order #${order.orderNumber} on hold`);
    } else if (isOrderTaker) {
      toast.success(`Order #${order.orderNumber} kitchen ko bhej diya gaya ✅`);
    } else {
      toast.info(`Order #${order.orderNumber} saved as ${status}`);
    }

    // Queue kitchen output only after the customer receipt. AutoKotPrinter also
    // prioritises receipts, but this ordering removes the short KOT-first race
    // that could happen between two localStorage queue notifications on Pay.
    if (isNewOrder && kotAllowed && autoKot && !settings.manualSendToKitchen && !isOrderTaker) {
      enqueueKot(order);
    } else if (status === 'paid' && kotAllowed && order.orderType === 'takeaway' && !isOrderTaker) {
      try { enqueueKot(order, { force: true }); } catch {}
    }
    clearCart();
  };


  // One-hand PAY: opens payment account picker dialog.
  // Setting "Payment Received screen on Pay" OFF = no screen, straight cash paid
  // + immediate print (rush hours ke liye).
  const handleDirectPay = () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    if ((settings as any).paymentDialogEnabled === false) {
      const stamp = new Date().toISOString();
      const by = localStorage.getItem('pos-user-name') || 'cashier';
      setPaymentMethod('cash');
      processOrder('paid', {
        paymentMethod: 'cash',
        cashReceived: grandTotal,
        amountPaid: grandTotal,
        changeReturned: 0,
        payments: [{ id: genId(), method: 'cash', amount: grandTotal, at: stamp, by }],
      } as any);
      return;
    }
    setShowPaymentDialog(true);
  };

  const handlePaymentConfirm = (r: {
    method: PaymentMethod;
    accountId?: string;
    accountName?: string;
    cashReceived?: number;
    payments: Array<{ method: 'cash' | 'online' | 'card'; accountId?: string; accountName?: string; amount: number }>;
    totalReceived: number;
    loyaltyPointsUsed?: number;
    loyaltyRedeemValue?: number;
  }) => {
    setShowPaymentDialog(false);
    setPaymentMethod(r.method);
    setPaymentAccountId(r.accountId);
    setPaymentAccountName(r.accountName);
    if (r.cashReceived != null) setPaymentReceived(String(r.cashReceived));
    setTimeout(() => {
      const loyValue = r.loyaltyRedeemValue || 0;
      const adjGrand = Math.max(0, grandTotal - loyValue);
      const totalRecv = Math.min(r.totalReceived, adjGrand);
      const isFullyPaid = totalRecv >= adjGrand - 0.5; // tolerance for rounding
      const stamp = new Date().toISOString();
      const by = localStorage.getItem('pos-user-name') || 'cashier';
      const paymentsFull = r.payments.map(p => ({ ...p, id: genId(), at: stamp, by }));
      const titleExtra = loyValue > 0 ? ` + Loyalty Rs.${loyValue}` : '';
      processOrder(isFullyPaid ? 'paid' : 'partial', {
        paymentMethod: r.method,
        paymentAccountId: r.accountId,
        paymentAccountName: r.accountName,
        cashReceived: r.cashReceived,
        changeReturned: r.cashReceived && isFullyPaid ? Math.max(0, r.cashReceived - adjGrand) : undefined,
        amountPaid: totalRecv,
        payments: paymentsFull,
        ...(loyValue > 0 ? {
          grandTotal: adjGrand,
          discount: totalDiscount + loyValue,
          discountTitle: (buildDiscountTitle() || '') + titleExtra,
          loyaltyPointsUsed: r.loyaltyPointsUsed,
          loyaltyRedeemValue: loyValue,
        } : {}),
      } as any);
    }, 0);
  };

  const confirmDining = async () => {
    setShowDiningDialog(false);
    // If cart already has items, send to running. Otherwise just remember the table selection
    // and let the cashier keep adding items — they'll process later.
    if (cart.length > 0) {
      await processOrder('running');
      if (pendingKitchenReceipt) { setShowKitchenReceipt(true); setPendingKitchenReceipt(false); }
    } else if (selectedTable) {
      setPendingKitchenReceipt(false);
      toast.success('Table selected — add items to start order');
    }
  };

  const confirmDelivery = async () => {
    setShowDeliveryDialog(false);
    if (cart.length > 0) {
      await processOrder('running');
      if (pendingKitchenReceipt) { setShowKitchenReceipt(true); setPendingKitchenReceipt(false); }
    } else if (custName) {
      setPendingKitchenReceipt(false);
      toast.success('Customer saved — add items to start order');
    }
  };


  const retrieveOrder = (order: Order) => {
    setCart(order.items);
    setDiscount(order.discount);
    setOrderType(order.orderType);
    setOrderTypePicked(true);
    setEditingOrderId(order.id);
    if (order.tableId) setSelectedTable(order.tableId);
    if (order.waiterId) setSelectedWaiter(order.waiterId);
    if (order.customer) {
      setCustName(order.customer.name);
      setCustPhone(order.customer.phone);
      setCustAddress(order.customer.address);
    }
    setSpecialNote(order.notes || '');
    setShowRunningBills(false);

    toast.info(`Editing Order #${order.orderNumber}`);
  };

  const openRunningBills = () => {
    setRunningBills(getOrders().filter(o => o.status === 'running' || o.status === 'hold'));
    setBillSearch('');
    setShowRunningBills(true);
  };

  // Void/Comp/Cancel
  const handleVoidAction = () => {
    if (voidType === 'complimentary') {
      processOrder('complimentary', { voidReason: voidReason, voidBy: compName, creditCustomerName: compName, creditCustomerPhone: compPhone });
    } else if (voidType === 'void') {
      processOrder('void', { voidReason });
    } else {
      processOrder('cancelled', { voidReason });
    }
    setShowVoidDialog(false);
    setVoidReason('');
    setCompName('');
    setCompPhone('');
  };

  // Credit sale
  const handleCreditSale = () => {
    if (!creditName) { toast.error('Enter customer name'); return; }
    processOrder('paid', {
      paymentMethod: 'credit',
      creditCustomerName: creditName,
      creditCustomerPhone: creditPhone,
      creditCustomerAddress: creditAddress,
    });
    setShowCreditDialog(false);
    setCreditName('');
    setCreditPhone('');
    setCreditAddress('');
  };

  // Mark bill status from retrieve
  const markBillStatus = (order: Order, status: 'running' | 'hold' | 'void' | 'cancelled') => {
    const updated = { ...order, status };
    saveOrder(updated);
    if (order.tableId && (status === 'void' || status === 'cancelled')) {
      const tables = refreshTables();
      const t = tables.find(t => t.id === order.tableId);
      if (t) saveTable({ ...t, status: 'free', currentOrderId: undefined });
    }
    if ((status === 'void' || status === 'cancelled')
        && settings.kotEnabled !== false
        && (settings.printKotOnCancel !== false)
        && order.kotPrinted) {
      try { enqueueKotCancel(updated); } catch {}
    }
    setRunningBills(prev => prev.map(o => o.id === order.id ? updated : o).filter(o => o.status === 'running' || o.status === 'hold'));
    toast.success(`Bill #${order.orderNumber} marked as ${status}`);
  };


  const payBillFromRetrieve = (order: Order) => {
    const updated = { ...order, status: 'paid' as const, paidAt: new Date().toISOString() };
    saveOrder(updated);
    if (order.tableId) {
      const tables = refreshTables();
      const t = tables.find(t => t.id === order.tableId);
      if (t) saveTable({ ...t, status: 'free', currentOrderId: undefined });
    }
    setRunningBills(prev => prev.filter(o => o.id !== order.id));
    setLastOrder(updated);
    if (isPrintPreviewEnabled()) {
      setReceiptViewOnly(true); setShowReceipt(true);
    } else {
      if (settings.showBillOnScreen) { setReceiptViewOnly(true); setShowReceipt(true); }
      try { enqueueReceiptOnPay(updated); } catch {}
    }
    toast.success(`Bill #${order.orderNumber} paid`);
  };

  // ===== Professional keyboard shortcuts (fast billing) =====
  // Enter  = OK / Apply (ya cart bhara ho to Pay dialog)
  // +      = foran PAID bill + print (cash)
  // F2     = Hold, F3 = Running/Update, F4 = Pay dialog
  // F1     = search, F8 = last bill reprint, Esc = dialog band / numpad clear
  const shortcutRef = useRef<any>({});
  shortcutRef.current = {
    cartLen: cart.length,
    numpadValue,
    numpadItem,
    applyNumpadValue,
    cancelNumpad,
    processOrder,
    handleDirectPay,
    lastOrder,
    isOrderTaker,
    setShowReceipt,
    setReceiptViewOnly,
    setNumpadValue,
  };
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const n = el as HTMLElement | null;
      if (!n) return false;
      const tag = (n.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || n.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      const a = shortcutRef.current;
      const typing = isTyping(e.target);
      const dialogOpen = !!document.querySelector('[role="dialog"]');

      if (e.key === 'F1') { e.preventDefault(); (document.getElementById('pos-search') as HTMLInputElement | null)?.focus(); return; }
      if (e.key === 'F2') { e.preventDefault(); if (a.cartLen > 0) a.processOrder('hold'); return; }
      if (e.key === 'F3') { e.preventDefault(); if (a.cartLen > 0) a.processOrder('running'); return; }
      if (e.key === 'F4') { e.preventDefault(); if (!a.isOrderTaker) a.handleDirectPay(); return; }
      if (e.key === 'F8') {
        e.preventDefault();
        if (a.lastOrder) { a.setReceiptViewOnly(false); a.setShowReceipt(true); }
        else toast.error('Koi pichla bill nahi mila');
        return;
      }
      if (dialogOpen) return; // dialogs apne Enter/Esc khud handle karte hain

      if (e.key === 'Escape' && !typing) {
        e.preventDefault();
        a.setNumpadValue('');
        a.cancelNumpad();
        return;
      }
      if ((e.key === '+' || e.key === 'Add') && !typing) {
        // Instant PAID bill — printer par seedha nikal jata hai
        e.preventDefault();
        if (a.cartLen === 0) { toast.error('Cart is empty'); return; }
        if (a.isOrderTaker) { a.processOrder('running'); return; }
        a.processOrder('paid');
        return;
      }
      if (e.key === 'Enter' && !typing) {
        e.preventDefault();
        if (a.numpadValue || a.numpadItem) { a.applyNumpadValue(); return; }
        if (a.cartLen > 0 && !a.isOrderTaker) { a.handleDirectPay(); return; }
        if (a.cartLen > 0 && a.isOrderTaker) a.processOrder('running');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);


  const orderTypes: { value: OrderType; label: string; color: string }[] = [
    { value: 'dining', label: 'Dining', color: 'bg-status-info text-status-info-foreground' },
    { value: 'takeaway', label: 'Takeaway', color: 'bg-status-warning text-status-warning-foreground' },
    { value: 'delivery', label: 'Delivery', color: 'bg-status-teal text-status-teal-foreground' },
    ...(settings.foodpandaEnabled ? [{ value: 'foodpanda' as OrderType, label: 'Foodpanda', color: 'bg-pink-600 text-white' }] : []),
  ];

  const handleOrderTypeChange = (newType: OrderType) => {
    if (editingOrderId) return;
    setOrderType(newType);
    setOrderTypePicked(true);
    setShowOrderTypeGate(false);
    if (newType === 'dining' && !selectedTable) {
      setShowDiningDialog(true);
    } else if (newType === 'delivery' && !custName) {
      setShowDeliveryDialog(true);
    }
  };

  const tables = refreshTables();
  const waiters = refreshWaiters();


  // Filtered running bills
  const filteredBills = useMemo(() => {
    if (!billSearch) return runningBills;
    const q = billSearch.toLowerCase();
    return runningBills.filter(o => {
      const table = o.tableId ? tables.find(t => t.id === o.tableId) : null;
      const waiter = o.waiterId ? waiters.find(w => w.id === o.waiterId) : null;
      return (
        o.orderNumber.toString().includes(q) ||
        (table?.name?.toLowerCase().includes(q)) ||
        (waiter?.name?.toLowerCase().includes(q))
      );
    });
  }, [runningBills, billSearch, tables, waiters]);

  // New numpad layout: 1-2-3 / 4-5-6 / 7-8-9 / CLR-0-DEL
  const numpadRows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', '⌫'],
  ];

  return (
    // Fill whatever height AppLayout's <main> actually has. The old
    // `h-[calc(100vh-3rem)]` assumed the 3rem header was the only chrome, so
    // whenever an update banner or a licence-expiry strip appeared above it
    // the POS became taller than its container and the bottom controls
    // scrolled out of reach.
    <div className="flex h-full min-h-0 overflow-hidden">


      {/* CENTER: Top header + Category ribbon + Items grid */}
      <div className="flex-1 bg-pos-grid flex flex-col min-w-0">
        {/* TOP BAR — compact: Search + Manual only.
            Order-type tabs (Dining/Takeaway/Delivery) live inside the Cart panel header. */}
        <div className="bg-card border-b shadow-sm px-3 py-1.5 flex items-center gap-2 shrink-0">
          {editingOrderId && (
            <Badge variant="secondary" className="text-[10px] bg-status-warning/20 text-status-warning border-status-warning/30 shrink-0">
              Editing Order
            </Badge>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="pos-search"
              placeholder="Search items... (F1 / Ctrl+K)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-7 text-xs rounded-full bg-background"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] rounded-full px-3 shrink-0"
            onClick={() => setShowManualDialog(true)}
          >
            <Edit3 className="h-3 w-3 mr-1" /> Manual
          </Button>
        </div>

        {/* CATEGORY RIBBON — horizontal pills with scroll arrows (TOP layout only) */}
        {(settings.categoryLayout || 'top') !== 'side' && (
        <div className="relative border-b-2 border-border/60 bg-card/40 shrink-0">
          <button
            type="button"
            onClick={() => scrollCatRibbon('left')}
            aria-label="Scroll categories left"
            className="hidden md:flex absolute left-0 top-0 bottom-0 z-10 items-center justify-center w-8 bg-gradient-to-r from-card via-card/90 to-transparent hover:from-primary/15 transition-colors"
          >
            <ChevronLeft className="h-5 w-5 text-foreground/80" />
          </button>
          <div
            ref={catRibbonRef}
            className="cat-ribbon flex gap-2 overflow-x-auto px-10 py-2.5 scroll-smooth"
            style={{ scrollbarWidth: 'thin' }}
          >
            <button
              onClick={() => setSelectedCat('all')}
              data-active={selectedCat === 'all'}
              className="cat-pill"
            >
              📋 All
            </button>
            {categories.map(cat => {
              const catFont = settings.categoryStyle;
              const catFontStyle: React.CSSProperties = catFont && catFont.font !== 'default' ? {
                fontFamily: `'${catFont.font}', serif`,
                fontSize: `${catFont.size}px`,
                fontWeight: catFont.bold ? 800 : 400,
                direction: ['Aseer Unicode', 'AA Sameer Armaa', 'Jameel Noori Nastaleeq', 'Jameel Noori Nastaleeq Regular'].includes(catFont.font) ? 'rtl' : 'ltr',
              } : {};
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCat(cat.id)}
                  data-active={selectedCat === cat.id}
                  className="cat-pill flex items-center gap-1.5 shrink-0"
                  style={catFontStyle}
                >
                  {cat.image ? (
                    <img src={cat.image} alt={cat.name} className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <span className="text-sm">{cat.icon}</span>
                  )}
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => scrollCatRibbon('right')}
            aria-label="Scroll categories right"
            className="hidden md:flex absolute right-0 top-0 bottom-0 z-10 items-center justify-center w-8 bg-gradient-to-l from-card via-card/90 to-transparent hover:from-primary/15 transition-colors"
          >
            <ChevronRight className="h-5 w-5 text-foreground/80" />
          </button>
        </div>
        )}

        {/* ITEMS AREA — optional left sidebar (SIDE layout) + grid */}
        <div className="flex-1 flex overflow-hidden">
          {(settings.categoryLayout === 'side') && (
            <aside className="w-36 md:w-44 shrink-0 border-r-2 border-border/60 bg-card/40 overflow-y-auto pos-scrollbar py-2">
              <button
                onClick={() => setSelectedCat('all')}
                data-active={selectedCat === 'all'}
                className="cat-pill w-[calc(100%-12px)] mx-1.5 mb-1.5 justify-start"
              >
                📋 All
              </button>
              {categories.map(cat => {
                const catFont = settings.categoryStyle;
                const catFontStyle: React.CSSProperties = catFont && catFont.font !== 'default' ? {
                  fontFamily: `'${catFont.font}', serif`,
                  fontSize: `${catFont.size}px`,
                  fontWeight: catFont.bold ? 800 : 400,
                  direction: ['Aseer Unicode', 'AA Sameer Armaa', 'Jameel Noori Nastaleeq', 'Jameel Noori Nastaleeq Regular'].includes(catFont.font) ? 'rtl' : 'ltr',
                } : {};
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCat(cat.id)}
                    data-active={selectedCat === cat.id}
                    className="cat-pill w-[calc(100%-12px)] mx-1.5 mb-1.5 flex items-center gap-1.5 justify-start"
                    style={catFontStyle}
                  >
                    {cat.image ? (
                      <img src={cat.image} alt={cat.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="text-sm shrink-0">{cat.icon}</span>
                    )}
                    <span className="truncate text-left">{cat.name}</span>
                  </button>
                );
              })}
            </aside>
          )}

        {/* ITEMS GRID */}
        <div className="flex-1 overflow-y-auto pos-scrollbar p-3">

        {/* Advanced-flow breadcrumb + Back button */}
        {(showFlavorGrid || selectedFlavor) && (
          <div className="mb-2 flex items-center gap-2 text-xs">
            {selectedFlavor && (
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => setSelectedFlavor(null)}>
                <ChevronLeft className="h-3 w-3 mr-1" /> Back to Flavors
              </Button>
            )}
            <span className="font-bold text-muted-foreground">
              {categories.find(c => c.id === selectedCat)?.name || 'Menu'}
              {selectedFlavor && <span className="text-primary"> · {selectedFlavor}</span>}
            </span>
          </div>
        )}

        {/* FLAVOR GRID (advanced flow only) */}
        {showFlavorGrid ? (
          <div className={{
            3: 'grid grid-cols-2 sm:grid-cols-3 gap-3',
            4: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3',
            5: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2',
            6: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2',
          }[settings.menuGridColumns || 6]}>
            {flavorList.map(fl => {
              // pick first item in this flavor for a representative image
              const sample = categoryItems.find(it => (it.subCategory || it.flavorGroup || '').trim() === fl);
              return (
                <button
                  key={fl}
                  onClick={() => setSelectedFlavor(fl)}
                  className="bg-card rounded-xl text-left hover:shadow-xl hover:ring-2 hover:ring-primary/40 hover:-translate-y-0.5 transition-all duration-200 group overflow-hidden border border-border/50 hover:border-primary/30"
                >
                  {sample?.image ? (
                    <div className="w-full h-24 overflow-hidden bg-muted">
                      <CachedImage src={sample.image} alt={fl} fallbackLabel={fl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    </div>
                  ) : (
                    <div className="w-full h-20 bg-gradient-to-br from-primary/10 to-accent/30 flex items-center justify-center">
                      <span className="text-3xl opacity-50">🍕</span>
                    </div>
                  )}
                  <div className="p-2.5">
                    <p className="text-xs font-bold text-foreground truncate leading-tight">{fl}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Tap to view flavors</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
        /* Items grid - PREMIUM CARD DESIGN */
        <div className={{
          3: 'grid grid-cols-2 sm:grid-cols-3 gap-3',
          4: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3',
          5: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2',
          6: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2',
        }[settings.menuGridColumns || 6]}>
          {filteredItems.map(item => {
            const itemFont = settings.menuItemStyle;
            const itemFontStyle: React.CSSProperties = itemFont && itemFont.font !== 'default' ? {
              fontFamily: `'${itemFont.font}', serif`,
              fontSize: `${itemFont.size}px`,
              fontWeight: itemFont.bold ? 800 : 400,
              textAlign: itemFont.align,
              direction: ['Aseer Unicode', 'AA Sameer Armaa', 'Jameel Noori Nastaleeq', 'Jameel Noori Nastaleeq Regular'].includes(itemFont.font) ? 'rtl' : 'ltr',
            } : {};
            const inCart = cart.find(c => c.menuItemId === item.id);
            // Compute "from" price for variant items
            const hasVar = itemHasVariants(item);
            const minVarPrice = hasVar ? Math.min(
              ...(item.sizeVariants || []).map(v => v.price || Infinity),
              ...(item.inchVariants || []).map(v => v.price || Infinity),
              Infinity
            ) : 0;
            return (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              className={`bg-card rounded-xl text-left hover:shadow-xl hover:ring-2 hover:ring-primary/40 hover:-translate-y-0.5 transition-all duration-200 group overflow-hidden border border-border/50 hover:border-primary/30 relative ${
                inCart ? 'ring-2 ring-primary/30 shadow-md' : 'shadow-sm'
              }`}
            >
              {/* Quantity badge */}
              {inCart && (
                <div className="absolute top-1.5 right-1.5 z-10 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-lg">
                  {inCart.quantity}
                </div>
              )}
              {/* Item Image */}
              {item.image ? (
                <div className="w-full h-24 overflow-hidden bg-muted">
                  <CachedImage src={item.image} alt={item.name} fallbackLabel={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                </div>
              ) : (
                <div className="w-full h-16 bg-gradient-to-br from-primary/8 to-accent/30 flex items-center justify-center">
                  <span className="text-2xl opacity-40 group-hover:scale-110 transition-transform duration-200">
                    {categories.find(c => c.id === item.categoryId)?.icon || '🍽️'}
                  </span>
                </div>
              )}
              <div className="p-2.5">
                <p className="text-xs font-bold text-foreground truncate leading-tight" style={itemFontStyle}>{item.name}</p>
                {item.categoryId === DEALS_CATEGORY_ID && (() => {
                  const deal = getDeals().find(d => d.id === item.id);
                  if (!deal || !deal.items?.length) return null;
                  return (
                    <p className="text-[9px] text-muted-foreground italic mt-0.5 line-clamp-2">
                      🎁 {deal.items.map(di => `${di.quantity}× ${menuItems.find(m => m.id === di.menuItemId)?.name || 'Item'}`).join(', ')}
                    </p>
                  );
                })()}
                <div className="flex items-center justify-between mt-2">
                  {hasVar && isFinite(minVarPrice) ? (
                    <span className="text-xs font-extrabold text-primary">From Rs.{minVarPrice.toLocaleString()}</span>
                  ) : item.pricingType === 'fixed' ? (
                    <span className="text-sm font-extrabold text-primary">Rs.{item.price.toLocaleString()}</span>
                  ) : item.pricingType === 'weight' ? (
                    <span className="text-xs font-bold text-status-teal flex items-center gap-0.5">
                      <Weight className="h-3 w-3" /> {item.ratePerKg.toLocaleString()}/kg
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-status-warning">Manual</span>
                  )}
                  <div className="bg-primary/10 text-primary rounded-full p-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
                    <Plus className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </button>
            );
          })}
          {filteredItems.length === 0 && (
            <div className="col-span-full text-center py-16 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No items found</p>
            </div>
          )}
        </div>
        )}
        </div>
        </div>
      </div>


      {/* Mobile floating Cart button */}
      <button
        onClick={() => setMobileCartOpen(true)}
        className="md:hidden fixed bottom-4 right-4 z-40 bg-primary text-primary-foreground rounded-full shadow-elegant px-4 py-3 flex items-center gap-2 font-bold text-sm"
      >
        <ShoppingCart className="h-4 w-4" />
        Cart
        {cart.length > 0 && (
          <span className="bg-accent text-primary rounded-full h-5 min-w-5 px-1.5 text-[11px] font-extrabold flex items-center justify-center">{cart.length}</span>
        )}
      </button>

      {/* Mobile cart backdrop */}
      {mobileCartOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileCartOpen(false)} />
      )}

      {/* RIGHT: Cart + Calculator + Payment Panel */}
      {/* Drag handle — cart ko chaura/chhota karne ke liye (sirf desktop) */}
      <div
        onMouseDown={startCartResize}
        onDoubleClick={resetCartWidth}
        title="Drag to resize the cart · double-click to reset"
        className="hidden md:block w-1.5 shrink-0 cursor-col-resize bg-border/40 hover:bg-primary/50 active:bg-primary transition-colors"
      />
      {/* ===== CART COLUMN (v1.0.38 layout fix, v1.0.40 resizable) =====
          Pehle is container par `overflow-y-auto` tha AUR andar item-list par
          bhi — yani NESTED scrolling. Cashier ko totals/payment tak pahunchne
          ke liye baar baar scroll karna parta tha (client complaint).
          Ab: container overflow-hidden + flex column. SIRF item list scroll
          hoti hai; totals, payment aur action buttons hamesha nazar aate hain.
          v1.0.40: chaurai drag se adjust hoti hai (localStorage me save). */}
      <div
        style={mobileCartOpen ? undefined : { width: cartWidth }}
        ref={cartColRef}
        className={`${mobileCartOpen ? 'fixed inset-y-0 right-0 w-[88%] max-w-[340px] z-50 flex' : 'hidden'} md:relative md:flex bg-pos-cart border-l flex-col shrink-0 shadow-lg min-h-0 overflow-y-auto overflow-x-hidden pos-scrollbar`}
      >
        {/* Cart Header with order type + customer fields — pinned */}
        <div ref={cartHeadRef} className="sticky top-0 z-30 bg-pos-cart px-3 py-2 border-b space-y-1.5 shrink-0">
          <h2 className="text-sm font-extrabold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            CART
            <Badge variant="secondary" className="ml-auto text-[10px] font-bold">{cart.length} items</Badge>
            {/* v1.0.40: the cart-width -/+ buttons used to sit here, right next
                to the per-line quantity -/+ controls. Staff hit them by
                mistake while changing a quantity and the whole billing column
                jumped wider or squeezed narrower. Resizing now lives in the
                3-dot menu (and on the drag handle), so nothing in the item
                area can change the layout. */}
            <button onClick={() => setMobileCartOpen(false)} className="md:hidden ml-1 text-muted-foreground hover:text-foreground" aria-label="Close">
              <XCircle className="h-5 w-5" />
            </button>
          </h2>
          {/* Order type quick switch — branded, matches sidebar across all themes */}
          <div className="grid grid-cols-3 gap-1">
            {orderTypes.map(ot => (
              <button
                key={ot.value}
                onClick={() => { if (!editingOrderId) { setOrderType(ot.value); setOrderTypePicked(true); setShowOrderTypeGate(false); } }}
                disabled={!!editingOrderId}
                className={`h-7 rounded-md text-[10px] font-extrabold uppercase tracking-wide transition-all border ${
                  orderType === ot.value
                    ? 'bg-gradient-sidebar text-sidebar-foreground border-sidebar-border shadow-md ring-1 ring-sidebar-foreground/20'
                    : 'bg-muted/60 text-muted-foreground border-transparent hover:bg-accent hover:text-foreground'
                } ${editingOrderId ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {ot.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <User className="absolute left-1.5 top-1.5 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Customer Name"
                value={custName}
                onChange={e => setCustName(e.target.value)}
                className="h-6 text-[10px] pl-5 font-semibold"
              />
            </div>
            <div className="relative flex-1">
              <Phone className="absolute left-1.5 top-1.5 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Phone"
                value={custPhone}
                onChange={e => setCustPhone(e.target.value)}
                className="h-6 text-[10px] pl-5 font-semibold"
              />
            </div>
          </div>
        </div>


        {/* Cart items — the ONLY scrollable region in the cart column.
            `min-h-0` zaroori hai warna flex child shrink nahi hoti aur
            scroll wapas poore column par chala jata hai.
            v1.0.40 (client: "sirf 2 items nazar aati hain"): `basis` se
            item list ko baqi sections par tarjeeh milti hai, aur
            `min-h-[190px]` se kam se kam ~5-6 rows hamesha nazar aati hain. */}
        <div className="shrink-0">
          {/* Table header — matches sidebar color across all themes */}
          <div className="sticky top-[var(--dt-cart-head-h,0px)] z-20 bg-gradient-sidebar backdrop-blur-sm px-3 py-2 flex items-center text-[9px] font-extrabold text-sidebar-foreground uppercase tracking-[0.14em] shadow-md border-b border-sidebar-border">
            <span className="w-5 text-center opacity-70">#</span>
            <span className="flex-1 pl-1">Item</span>
            <span className="w-12 text-center">Qty</span>
            <span className="w-14 text-right">Price</span>
            <span className="w-16 text-right">Total</span>
            <span className="w-5" />
          </div>
          {cart.map((item, idx) => (
            <div
              key={item.id}
              onClick={() => setSelectedCartItem(item.id)}
              className={`px-3 py-2 cursor-pointer border-b border-border/30 transition-all duration-150 hover:shadow-sm ${
                selectedCartItem === item.id
                  ? 'bg-primary/10 ring-1 ring-primary/40 shadow-sm'
                  : idx % 2 === 0 ? 'bg-card' : 'bg-accent/20'
              }`}
            >
              <div className="flex items-center">
                <span className="w-5 text-center text-[10px] text-muted-foreground/70 font-bold">{idx + 1}</span>
                <div className="flex-1 pl-1.5 min-w-0">
                  <p className="text-[11px] font-extrabold text-foreground truncate leading-tight">{item.name}</p>
                  {item.note && <p className="text-[8px] text-muted-foreground italic mt-0.5">📝 {item.note}</p>}
                </div>
                <div className="w-12 flex items-center justify-center gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); updateQty(item.id, -1); }} className="h-5 w-5 rounded-md bg-muted/80 flex items-center justify-center hover:bg-destructive/20 hover:text-destructive transition-colors">
                    <Minus className="h-2.5 w-2.5" />
                  </button>
                  <span className="text-[11px] font-extrabold w-5 text-center">{item.quantity}</span>
                  <button onClick={(e) => { e.stopPropagation(); updateQty(item.id, 1); }} className="h-5 w-5 rounded-md bg-muted/80 flex items-center justify-center hover:bg-primary/20 hover:text-primary transition-colors">
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                </div>
                <span className="w-14 text-right text-[10px] text-muted-foreground font-medium">{item.price.toLocaleString()}</span>
                <span className="w-16 text-right text-[11px] font-extrabold text-primary">{item.lineTotal.toLocaleString()}</span>
                <button onClick={(e) => { e.stopPropagation(); removeItem(item.id); }} className="w-5 text-destructive/60 hover:text-destructive ml-0.5 transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="text-center py-10 text-muted-foreground/60">
              <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-[11px] font-medium">Add items to start an order</p>
            </div>
          )}
        </div>

        {/* MINIMART: barcode + scale panel.
            Its own region rather than part of the totals block: it adds ~150px
            and, sitting inside a shrink-0 container, that height was pushing
            the Running / 3-dot row off the bottom of a 768px screen. Here it
            can shrink and scroll instead, and the action bar always survives. */}
        {(settings as any).minimartMode && (
          <div className="border-t border-border/50 px-3 py-2 shrink-0">
            <MinimartPanel
              onScan={handleScan}
              onWeight={handleScaleWeight}
              embeddedMode={((settings as any).embeddedBarcodeMode || 'weight') as any}
            />
          </div>
        )}

        {/* Billing Summary - Luxury */}
        {/* Totals / discounts / payment — hamesha nazar aata hai (scroll nahi hota) */}
        <div className="sticky bottom-[var(--dt-cart-actions-h,0px)] z-20 border-t-2 border-primary/20 bg-card bg-gradient-to-b from-card to-accent/10 px-3 py-2.5 space-y-1 shrink-0">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground font-medium">Subtotal</span>
            <span className="font-bold">PKR {subtotal.toLocaleString()}</span>
          </div>
          {/* Quick discount buttons — percent + amount. Dono OPTIONAL:
              leave it empty in settings and no button will appear. */}
          {cart.length > 0 && (() => {
            const pcts = (((settings as any).discountPresets as number[]) || []).filter(n => n > 0 && n < 100);
            const amts = (((settings as any).discountAmountPresets as number[]) || []).filter(n => n > 0);
            if (pcts.length === 0 && amts.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1 mb-1">
                {pcts.map((p) => (
                  <button
                    key={`p${p}`}
                    onClick={() => { setDiscountMode('percent'); setDiscountPercentInput(discountPercentInput === p && discountMode === 'percent' ? 0 : p); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold border transition-all active:scale-95 ${discountPercentInput === p && discountMode === 'percent' ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'}`}
                  >-{p}%</button>
                ))}
                {amts.map((a) => (
                  <button
                    key={`a${a}`}
                    onClick={() => { setDiscountMode('pkr'); setDiscount(discount === a && discountMode === 'pkr' ? 0 : a); }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold border transition-all active:scale-95 ${discount === a && discountMode === 'pkr' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'}`}
                  >-{a}</button>
                ))}
              </div>
            );
          })()}
          {eventActive && eventDiscountAmt > 0 && (
            <div className="flex justify-between text-xs text-green-700">
              <span className="font-medium">{settings.eventDiscountTitle || 'Event Discount'} {evtType === 'percent' ? `${eventPct}%` : ''}</span>
              <span>- PKR {eventDiscountAmt.toLocaleString()}</span>
            </div>
          )}
          {!isOrderTaker && (() => {
            const currentRole = (localStorage.getItem('pos-user-role') || '').toLowerCase();
            const isCashierRole = currentRole === 'cashier';
            const discountBlocked = isCashierRole && !!settings.cashierDiscountRequiresApproval;
            if (discountBlocked) {
              return (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground font-medium">Discount</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 border border-amber-500/30 font-bold">
                      🔒 Admin approval required — apply via Bill Editor
                    </span>
                  </div>
                </div>
              );
            }
            return (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground font-medium">Discount</span>
                <div className="ml-auto flex items-center gap-1">
                  {settings.pkrDiscountEnabled !== false && settings.percentDiscountEnabled !== false && (
                    <div className="flex border rounded overflow-hidden">
                      <button
                        type="button"
                        onClick={() => { setDiscountMode('pkr'); setDiscountPercentInput(0); }}
                        className={`px-1.5 text-[10px] font-bold ${discountMode === 'pkr' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                      >Rs</button>
                      <button
                        type="button"
                        onClick={() => { setDiscountMode('percent'); setDiscount(0); }}
                        className={`px-1.5 text-[10px] font-bold ${discountMode === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                      >%</button>
                    </div>
                  )}
                  {discountMode === 'pkr' ? (
                    <Input
                      type="number"
                      value={discount || ''}
                      onChange={e => setDiscount(Number(e.target.value) || 0)}
                      className="h-5 w-16 text-[10px] text-right border-primary/30"
                      placeholder="0"
                      disabled={settings.pkrDiscountEnabled === false}
                    />
                  ) : (
                    <Input
                      type="number"
                      value={discountPercentInput || ''}
                      onChange={e => setDiscountPercentInput(Math.min(100, Number(e.target.value) || 0))}
                      className="h-5 w-16 text-[10px] text-right border-primary/30"
                      placeholder="0"
                      disabled={settings.percentDiscountEnabled === false}
                    />
                  )}
                  {(manualDiscount > 0) && (
                    <span className="text-[10px] text-green-700 font-bold">-Rs.{manualDiscount.toLocaleString()}</span>
                  )}
                </div>
              </div>
            );
          })()}
          {/* Promo Code */}
          {!isOrderTaker && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground font-medium">Promo</span>
            <div className="ml-auto flex items-center gap-1">
              {promoApplied ? (
                <>
                  <span className="text-[10px] font-bold text-green-700">{promoApplied.code} -Rs.{promoApplied.discount.toLocaleString()}</span>
                  <button type="button" onClick={removePromo} className="text-[10px] text-destructive font-bold px-1">×</button>
                </>
              ) : (
                <>
                  <Input
                    type="text"
                    value={promoCodeInput}
                    onChange={e => setPromoCodeInput(e.target.value.toUpperCase())}
                    className="h-5 w-20 text-[10px] text-right border-primary/30 uppercase font-mono"
                    placeholder="CODE"
                  />
                  <button
                    type="button"
                    onClick={applyPromo}
                    className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded"
                  >Apply</button>
                </>
              )}
            </div>
          </div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground font-medium">Tax</span>
              <span>PKR {taxAmount.toLocaleString()}</span>
            </div>
          )}
          {serviceCharge > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground font-medium">Service ({scPercent}%)</span>
              <span>PKR {serviceCharge.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t-2 border-primary/30">
            <span className="text-sm font-extrabold tracking-tight">GRAND TOTAL</span>
            <span className="text-primary text-xl font-black tracking-tight">PKR {grandTotal.toLocaleString()}</span>
          </div>

          {/* Payment area */}
          {cart.length > 0 && !isOrderTaker && (
            <div className="flex items-center gap-2 pt-1.5">
              <div className="flex-1">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider">Payment</label>
                <Input
                  type="number"
                  value={paymentReceived}
                  onChange={e => setPaymentReceived(e.target.value)}
                  placeholder={grandTotal.toLocaleString()}
                  className="h-7 text-xs font-bold text-right border-primary/30"
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider">Change</label>
                <div className={`h-7 rounded-md border px-2 flex items-center justify-end text-xs font-extrabold ${
                  changeAmount >= 0 ? 'text-status-success bg-status-success/10 border-status-success/30' : 'text-destructive bg-destructive/10 border-destructive/30'
                }`}>
                  {paymentReceivedNum > 0 ? `PKR ${Math.abs(changeAmount).toLocaleString()}` : '—'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Inline Calculator / Numpad — collapsible (v1.0.38) */}
        {/* The keypad is the one region allowed to give up space when the
            window is short. It scrolls inside itself, so shrinking it never
            hides a control — and never pushes the action bar off-screen. */}
        <div className="border-t-2 border-primary/20 bg-gradient-to-b from-accent/30 to-transparent shrink-0">
          <button
            type="button"
            onClick={() => setCartUiSection({ numpad: !cartUi.numpad })}
            className="w-full px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors shrink-0"
            title={cartUi.numpad ? 'Minimize keypad' : 'Show keypad'}
          >
            <span>🔢 Keypad</span>
            {!cartUi.numpad && numpadValue && (
              <span className="font-mono text-primary normal-case">{numpadValue}</span>
            )}
            <span className="ml-auto text-sm leading-none">{cartUi.numpad ? '▾' : '▸'}</span>
          </button>
          {cartUi.numpad && (
          <div className="px-3 pb-2">
          {/* Numpad display bar */}
          <div className="bg-card rounded-lg px-3 py-1.5 mb-2 flex items-center justify-between border border-border/50 shadow-sm">
            <span className="text-[10px] text-muted-foreground font-semibold">
              {numpadItem ? (
                numpadTarget === 'weight'
                  ? `⚖️ ${numpadItem.name} (${numpadItem.ratePerKg}/KG)`
                  : `💰 ${numpadItem.name} — Enter Price`
              ) : selectedCartItem ? (
                <span className="flex items-center gap-1">
                  ✏️ {cart.find(c => c.id === selectedCartItem)?.name}
                  <button onClick={() => setNumpadCartMode('qty')} className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-colors ${numpadCartMode === 'qty' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted hover:bg-accent'}`}>QTY</button>
                  <button onClick={() => setNumpadCartMode('price')} className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-colors ${numpadCartMode === 'price' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted hover:bg-accent'}`}>PRICE</button>
                </span>
              ) : '🔢 Calculator'}
            </span>
            <span className="text-base font-extrabold font-mono text-foreground tracking-wider">
              {numpadValue || '0'}
              {numpadTarget === 'weight' && <span className="text-[10px] text-muted-foreground ml-1">{weightUnit}</span>}
            </span>
          </div>

          {/* Weight unit buttons */}
          {numpadTarget === 'weight' && (
            <>
              <div className="flex gap-1.5 mb-2">
                {(['KG', 'Gram', 'Pao'] as const).map(u => (
                  <button
                    key={u}
                    onClick={() => setWeightUnit(u)}
                    className={`flex-1 h-8 rounded-lg text-[11px] font-bold transition-all ${
                      weightUnit === u
                        ? 'bg-status-teal text-status-teal-foreground shadow-sm'
                        : 'bg-card border hover:bg-accent'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
              {/* v1.0.38: button to read weight directly from the scale (F9) */}
              <button
                onClick={captureFromScale}
                className="w-full h-9 mb-2 rounded-lg bg-status-teal/15 border border-status-teal/40 text-status-teal text-xs font-extrabold hover:bg-status-teal/25 transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                ⚖️ {scaleConnected ? 'Get Weight from Scale (F9)' : 'Connect Scale (F9)'}
              </button>
            </>
          )}

          {/* Numpad grid — keys match sidebar color across all themes */}
          <div className="grid grid-cols-3 gap-1.5">
            {numpadRows.map((row) => row.map(key => (
              <button
                key={key}
                onClick={() => handleNumpadKey(key)}
                className="h-9 rounded-lg bg-gradient-sidebar border border-sidebar-border text-sidebar-foreground text-sm font-extrabold hover:opacity-90 hover:shadow-lg transition-all duration-150 active:scale-95 flex items-center justify-center shadow-md"
              >
                {key === '⌫' ? <Delete className="h-5 w-5" /> : key}
              </button>
            )))}

          </div>


          </div>
          )}
        </div>
        {/* Special Kitchen Note — collapsible (v1.0.38). Note lagi ho to
            header par badge dikhta hai taake collapsed halat me bhi pata chale. */}
        <div className="border-t border-border/50 shrink-0">
          <button
            type="button"
            onClick={() => setCartUiSection({ note: !cartUi.note })}
            className="w-full px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground hover:bg-accent/40 transition-colors"
            title={cartUi.note ? 'Minimize note' : 'Add a kitchen note'}
          >
            <span>📝 Special Note</span>
            {!cartUi.note && specialNote && (
              <span className="normal-case font-semibold text-primary truncate max-w-[120px]">{specialNote}</span>
            )}
            <span className="ml-auto text-sm leading-none">{cartUi.note ? '▾' : '▸'}</span>
          </button>
          {cartUi.note && (
          <div className="px-2 pb-2">
          <div className="text-[9px] text-muted-foreground/70 mb-1">Prints on the KOT</div>
          {(settings.kotNotePresets || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {(settings.kotNotePresets || []).map((preset, i) => {
                const active = specialNote.split(/\s*,\s*/).some(p => p.toLowerCase() === preset.toLowerCase());
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const parts = specialNote.split(/\s*,\s*/).map(p => p.trim()).filter(Boolean);
                      const idx = parts.findIndex(p => p.toLowerCase() === preset.toLowerCase());
                      const next = idx >= 0
                        ? parts.filter((_, j) => j !== idx)
                        : [...parts, preset];
                      setSpecialNote(next.join(', ').slice(0, 200));
                    }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all active:scale-95 ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}{preset}
                  </button>
                );
              })}
            </div>
          )}
          <textarea
            value={specialNote}
            onChange={e => setSpecialNote(e.target.value.slice(0, 200))}
            placeholder="e.g. No onion, extra spicy, less salt..."
            rows={2}
            className="w-full text-[12px] rounded-md border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          </div>
          )}
        </div>

        {/* ===== ACTION BAR (v1.0.40) — ALWAYS VISIBLE =====
            CLR / Hold / PAY and the Kitchen + Receipt buttons used to live
            INSIDE the collapsible keypad. That meant PAY vanished entirely
            when the cashier minimised the keypad, and on a 768px-tall laptop
            at 100% zoom the keypad (which is allowed to shrink) clipped the
            row off the bottom of the screen — the reason staff had to drop
            the app to 85% zoom. The bar is now its own `shrink-0` region
            pinned to the bottom of the cart column, so PAY is reachable at
            every window size, item count and keypad state. */}
        <div ref={cartActionsRef} className="sticky bottom-0 z-30 border-t-2 border-primary/25 bg-card bg-gradient-to-b from-card to-accent/10 px-2 py-1.5 space-y-1 shrink-0 relative">
          {/* Keyboard shortcut hint — professional POS feel */}
          <div className="hidden sm:flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-muted-foreground">
            <span><kbd className="px-1 rounded bg-muted">F1</kbd> Search</span>
            <span><kbd className="px-1 rounded bg-muted">F2</kbd> Hold</span>
            <span><kbd className="px-1 rounded bg-muted">F3</kbd> Running</span>
            <span><kbd className="px-1 rounded bg-muted">F4</kbd> Pay</span>
            <span><kbd className="px-1 rounded bg-muted">+</kbd> Paid+Print</span>
            <span><kbd className="px-1 rounded bg-muted">F8</kbd> Reprint</span>
            <span><kbd className="px-1 rounded bg-muted">Enter</kbd> OK</span>
          </div>
          {/* Bottom row: CLR - Hold/Apply - PAY */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => { setNumpadValue(''); cancelNumpad(); }}
              className="h-9 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-extrabold hover:bg-destructive/20 transition-all duration-150 active:scale-95"
            >
              {t('clr')}
            </button>
            {(numpadItem || numpadValue) ? (
              <button
                onClick={applyNumpadValue}
                className="h-9 rounded-lg bg-status-info/10 border border-status-info/30 text-status-info text-xs font-extrabold hover:bg-status-info/20 transition-all duration-150 active:scale-95"
                disabled={!numpadValue}
              >
                {!numpadItem && !selectedCartItem && cart.length > 0 ? '→ Cash' : '✓ Apply'}
              </button>
            ) : (
              <button
                onClick={() => processOrder('hold')}
                className="h-9 rounded-lg bg-status-warning/10 border border-status-warning/30 text-status-warning text-xs font-extrabold hover:bg-status-warning/20 transition-all duration-150 active:scale-95"
              >
                {t('hold')}
              </button>
            )}
            {isOrderTaker ? (
              <button
                onClick={() => { if (cart.length === 0) { toast.error('Cart is empty'); return; } processOrder('running'); }}
                className="h-9 rounded-lg bg-status-success text-status-success-foreground text-sm font-extrabold hover:bg-status-success/90 transition-all duration-150 active:scale-95 shadow-lg hover:shadow-xl flex items-center justify-center gap-1"
              >
                <ChefHat className="h-4 w-4" /> {t('send')}
              </button>
            ) : (
              <button
                onClick={handleDirectPay}
                className="h-9 rounded-lg bg-status-success text-status-success-foreground text-sm font-extrabold hover:bg-status-success/90 transition-all duration-150 active:scale-95 shadow-lg hover:shadow-xl"
              >
                {t('pay')}
              </button>
            )}
          </div>

          {/* Token ON: Token takes Kitchen's fixed slot. Kitchen moves to More.
              Token OFF: the familiar Kitchen + Customer Receipt layout stays unchanged. */}
          <div className={`grid ${isOrderTaker ? 'grid-cols-1' : 'grid-cols-2'} gap-1.5`}>
            {(settings as any).tokenPrintEnabled ? (
            <button
              onClick={async () => {
                const st: any = settings;
                if (!resolveTokenRules(st).hasRules) {
                  toast.error('No token categories or items selected. Set them in Printing Center.');
                  return;
                }
                // Categories AND individually-selected items, applied together.
                const tokenCartItems = getTokenLinesFromCart(cart as any, st, getAllMenuItems() as any);
                const items = tokenCartItems.map((c: any) => ({ name: c.name, qty: c.quantity }));
                if (items.length === 0) { toast.error('No token items in the cart.'); return; }
                const tokenNo = nextTokenSerial();
                const r = await printTokenDirect({ orderNumber: tokenNo, items }, st);
                if (r.success) {
                  const printedIds = new Set(tokenCartItems.map((c: any) => c.id));
                  setCart(prev => prev.filter(c => !printedIds.has(c.id)));
                  setSelectedCartItem(null);
                  setNumpadValue('');
                  toast.success(`Token ${tokenNo} printed and recorded`);
                } else toast.error('Token printing failed: ' + (r.error || 'unknown error'));
              }}
              className="h-8 rounded-lg bg-status-warning/10 border border-status-warning/40 text-status-warning text-[11px] font-extrabold hover:bg-status-warning/20 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              🎟️ {t('tokenPrint')}
            </button>
            ) : (
            <button
              onClick={async () => {
                // Auto-create a running order (no payment required) and show kitchen slip
                if (cart.length === 0 && !lastOrder) { toast.error('کوئی آرڈر نہیں ہے'); return; }
                if (cart.length > 0) {
                  // Dining/Delivery need their info dialog first — defer kitchen slip until confirm.
                  if (orderType === 'dining' && !selectedTable && !editingOrderId) {
                    setPendingKitchenReceipt(true);
                    setShowDiningDialog(true);
                    return;
                  }
                  if (orderType === 'delivery' && !custName && !editingOrderId) {
                    setPendingKitchenReceipt(true);
                    setShowDeliveryDialog(true);
                    return;
                  }
                  await processOrder('running');
                  setShowKitchenReceipt(true);
                } else if (lastOrder) {
                  setShowKitchenReceipt(true);
                }
              }}
              className="h-8 rounded-lg bg-accent/50 border border-border/50 text-[11px] font-bold hover:bg-accent transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              <ChefHat className="h-3.5 w-3.5" /> 🍳 Kitchen
            </button>
            )}
            {!isOrderTaker && (
            <button
              onClick={() => {
                // Build a preview order if no real one exists yet — supports unpaid / credit
                if (cart.length === 0 && !lastOrder) { toast.error('کوئی آرڈر نہیں ہے'); return; }
                if (lastOrder) {
                  setReceiptViewOnly(false); setShowReceipt(true);
                } else {
                  const tempOrder: Order = {
                    id: 'preview',
                    orderNumber: peekNextOrderNumber(),
                    orderType,
                    status: 'running',
                    items: cart,
                    subtotal,
                    discount: totalDiscount,
                    discountTitle: buildDiscountTitle(),
                    tax: taxAmount,
                    serviceCharge,
                    serviceChargePercent: scPercent,
                    grandTotal,
                    cashReceived: paymentReceivedNum > 0 ? paymentReceivedNum : undefined,
                    changeReturned: paymentReceivedNum > 0 ? Math.max(0, paymentReceivedNum - grandTotal) : undefined,
                    createdAt: new Date().toISOString(),
                    notes: '',
                    customer: (custName || custPhone) ? { id: 'tmp', name: custName, phone: custPhone, address: custAddress } : undefined,
                  };
                  setLastOrder(tempOrder);
                  setReceiptViewOnly(false); setShowReceipt(true);
                }
              }}
              className="h-8 rounded-lg bg-primary/10 border border-primary/30 text-primary text-[11px] font-bold hover:bg-primary/20 transition-all flex items-center justify-center gap-1.5 active:scale-[0.98]"
            >
              🧾 Customer Receipt
            </button>
            )}
          </div>

          {/* Running / Update + the 3-dot secondary menu */}
          <div className="flex gap-1.5 relative">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-[10px] border-status-warning text-status-warning hover:bg-status-warning/10"
            onClick={() => processOrder('running')}
          >
            <Pause className="h-3 w-3 mr-1" /> {editingOrderId ? 'Update' : (isOrderTaker ? 'Send to Kitchen' : 'Running')}
          </Button>

          {!isOrderTaker && (
            <>
              {/* 3-dot menu: Kitchen (when Token is on) / Credit / Void / Cancel */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-9 px-0 shrink-0"
                onClick={() => setCartMoreOpen(v => !v)}
                title="More actions"
                aria-label="More actions"
                aria-expanded={cartMoreOpen}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>

              {cartMoreOpen && (
                <>
                  {/* click-outside catcher */}
                  <div className="fixed inset-0 z-40" onClick={() => setCartMoreOpen(false)} />
                  <div className="absolute bottom-full right-2 mb-1 z-50 w-52 rounded-lg border bg-popover shadow-xl overflow-hidden">
                    {/* Cart width — moved off the header so it can never be
                        confused with the per-item quantity buttons. */}
                    <div className="hidden md:flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cart width</span>
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setCartWidth(w => { const n = Math.max(CART_W_MIN, w - 40); try { localStorage.setItem(CART_W_KEY, String(n)); } catch { /* quota */ } return n; })}
                          disabled={cartWidth <= CART_W_MIN}
                          title="Make the cart narrower"
                          className="h-5 w-5 rounded border text-[12px] leading-none font-bold text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >−</button>
                        <button
                          type="button"
                          onClick={() => setCartWidth(w => { const n = Math.min(CART_W_MAX, w + 40); try { localStorage.setItem(CART_W_KEY, String(n)); } catch { /* quota */ } return n; })}
                          disabled={cartWidth >= CART_W_MAX}
                          title="Make the cart wider"
                          className="h-5 w-5 rounded border text-[12px] leading-none font-bold text-muted-foreground hover:bg-accent disabled:opacity-30"
                        >+</button>
                        <button
                          type="button"
                          onClick={resetCartWidth}
                          title="Reset the cart to its default width"
                          className="h-5 px-1.5 rounded border text-[9px] font-bold text-muted-foreground hover:bg-accent"
                        >Reset</button>
                      </div>
                    </div>
                    {(settings as any).tokenPrintEnabled && (
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-[11px] font-bold text-status-warning hover:bg-accent flex items-center gap-2 border-b"
                        onClick={async () => {
                          setCartMoreOpen(false);
                          if (cart.length === 0 && !lastOrder) { toast.error('کوئی آرڈر نہیں ہے'); return; }
                          if (cart.length > 0) {
                            if (orderType === 'dining' && !selectedTable && !editingOrderId) { setPendingKitchenReceipt(true); setShowDiningDialog(true); return; }
                            if (orderType === 'delivery' && !custName && !editingOrderId) { setPendingKitchenReceipt(true); setShowDeliveryDialog(true); return; }
                            await processOrder('running');
                          }
                          setShowKitchenReceipt(true);
                        }}
                      >
                        <ChefHat className="h-3 w-3" /> Kitchen Receipt
                      </button>
                    )}
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-[11px] font-bold text-status-purple hover:bg-accent flex items-center gap-2"
                      onClick={() => {
                        setCartMoreOpen(false);
                        if (cart.length === 0) { toast.error('Cart is empty'); return; }
                        setShowCreditDialog(true);
                      }}
                    >
                      💳 Credit
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-[11px] font-bold text-destructive hover:bg-accent flex items-center gap-2 border-t"
                      onClick={() => {
                        setCartMoreOpen(false);
                        if (cart.length === 0 && !editingOrderId) { toast.error('No order to void'); return; }
                        setVoidType('void');
                        setShowVoidDialog(true);
                      }}
                    >
                      <Ban className="h-3 w-3" /> Void
                    </button>
                    {editingOrderId && (
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-[11px] font-bold text-muted-foreground hover:bg-accent border-t"
                        onClick={() => { setCartMoreOpen(false); clearCart(); }}
                      >
                        ✕ Cancel Edit
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      {/* Manual Item Dialog */}
      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Manual Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Item name" value={manualName} onChange={e => setManualName(e.target.value)} autoFocus />
            <Input type="number" placeholder="Price (PKR)" value={manualPrice} onChange={e => setManualPrice(e.target.value)} />
            <Button className="w-full" onClick={addManualItem}>Add to Cart</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dining Dialog */}
      <Dialog open={showDiningDialog} onOpenChange={setShowDiningDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Select Table & Waiter</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={selectedTable} onValueChange={setSelectedTable}>
              <SelectTrigger><SelectValue placeholder="Select Table" /></SelectTrigger>
              <SelectContent>
                {tables.filter(t => t.status === 'free').map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name} ({t.seats} seats)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedWaiter} onValueChange={setSelectedWaiter}>
              <SelectTrigger><SelectValue placeholder="Select Waiter" /></SelectTrigger>
              <SelectContent>
                {waiters.filter(w => w.isActive).map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="w-full" onClick={confirmDining} disabled={!selectedTable}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mandatory Order-Type gate — user must pick before adding items. */}
      <Dialog open={showOrderTypeGate && gatePromptOn} onOpenChange={setShowOrderTypeGate}>
        <DialogContent className="sm:max-w-md" aria-describedby="order-type-gate-desc">
          <DialogHeader><DialogTitle className="text-center text-lg">Select Order Type</DialogTitle></DialogHeader>
          <p id="order-type-gate-desc" className="text-center text-sm text-muted-foreground -mt-2">Choose the order type before adding items.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3">
            <Button size="lg" className="h-20 text-base bg-blue-600 hover:bg-blue-700 text-white" onClick={() => { setOrderType('dining'); setOrderTypePicked(true); setShowOrderTypeGate(false); }}>🍽️  Dine-In</Button>
            <Button size="lg" className="h-20 text-base bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => { setOrderType('takeaway'); setOrderTypePicked(true); setShowOrderTypeGate(false); }}>🛍️  Takeaway</Button>
            <Button size="lg" className="h-20 text-base bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { setOrderType('delivery'); setOrderTypePicked(true); setShowOrderTypeGate(false); }}>🛵  Delivery</Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground pt-1">Press X to close — you can also open another module from the sidebar.</p>
        </DialogContent>
      </Dialog>

      {/* Delivery Dialog */}
      <Dialog open={showDeliveryDialog} onOpenChange={setShowDeliveryDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Customer & Delivery Details</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <CustomerAutocomplete
              mode="name" value={custName} onChange={setCustName}
              onSelect={(c) => {
                setCustName(c.name || ''); setCustPhone(c.phone || '');
                setCustAddress(c.fullAddress || c.addresses?.[0] || '');
                if (c.lat != null && c.lng != null) { setCustLat(c.lat); setCustLng(c.lng); setCustLocAt(c.locationCapturedAt); }
                if (c.province) setCustProvince(c.province);
                if (c.city) setCustCity(c.city);
                if (c.area) setCustArea(c.area);
                toast.success(`Loaded: ${c.name} (${c.totalOrders} orders)`);
              }}
              placeholder="Customer Name (auto-suggest)"
            />
            <CustomerAutocomplete
              mode="phone" value={custPhone} onChange={setCustPhone}
              onSelect={(c) => {
                setCustName(c.name || ''); setCustPhone(c.phone || '');
                setCustAddress(c.fullAddress || c.addresses?.[0] || '');
                if (c.lat != null && c.lng != null) { setCustLat(c.lat); setCustLng(c.lng); setCustLocAt(c.locationCapturedAt); }
                if (c.province) setCustProvince(c.province);
                if (c.city) setCustCity(c.city);
                if (c.area) setCustArea(c.area);
              }}
              placeholder="Phone (auto-suggest)"
            />
            <div className="grid grid-cols-3 gap-2">
              <Select value={custProvince} onValueChange={v => { setCustProvince(v); setCustCity(''); setCustArea(''); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Province" /></SelectTrigger>
                <SelectContent>
                  {getProvinces().map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={custCity} onValueChange={v => { setCustCity(v); setCustArea(''); }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="City" /></SelectTrigger>
                <SelectContent>
                  {getCitiesOf(custProvince).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={custArea} onValueChange={v => {
                setCustArea(v);
                // Prepend area to address if empty/not already containing it
                if (v && !custAddress.toLowerCase().includes(v.toLowerCase())) {
                  setCustAddress(prev => prev ? `${v}, ${prev}` : `${v}, ${custCity}`);
                }
              }}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Area" /></SelectTrigger>
                <SelectContent>
                  {getAreasOf(custProvince, custCity).map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Full Delivery Address (house #, street, landmark)" value={custAddress} onChange={e => setCustAddress(e.target.value)} />
            {custAddress && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(custAddress)}`}
                target="_blank" rel="noreferrer"
                className="text-[11px] text-primary underline inline-flex items-center gap-1"
              >📍 View on Google Maps</a>
            )}
            <Select value={selectedRider} onValueChange={setSelectedRider}>
              <SelectTrigger><SelectValue placeholder="Select Rider (optional)" /></SelectTrigger>
              <SelectContent>
                {getRiders().filter(r => r.isActive).map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <LocationCapture lat={custLat} lng={custLng} capturedAt={custLocAt}
              onChange={({ lat, lng, capturedAt }) => { setCustLat(lat); setCustLng(lng); setCustLocAt(capturedAt); }} />
            <Button className="w-full" onClick={confirmDelivery} disabled={!custName}>Confirm</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Void / Complimentary / Cancel Dialog */}
      <Dialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>
            {voidType === 'void' ? '🚫 Void Bill' : voidType === 'complimentary' ? '🎁 Complimentary' : '❌ Cancel Bill'}
          </DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {(['void', 'complimentary', 'cancel'] as const).map(t => (
                <button key={t} onClick={() => setVoidType(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors capitalize ${
                    voidType === t ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
                  }`}>
                  {t === 'cancel' ? 'Cancel Bill' : t}
                </button>
              ))}
            </div>
            {voidType === 'complimentary' && (
              <>
                <Input placeholder="Guest Name" value={compName} onChange={e => setCompName(e.target.value)} />
                <Input placeholder="Phone (optional)" value={compPhone} onChange={e => setCompPhone(e.target.value)} />
              </>
            )}
            <Input placeholder="Reason / Note" value={voidReason} onChange={e => setVoidReason(e.target.value)} />
            <Button className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleVoidAction}>
              Confirm {voidType === 'cancel' ? 'Cancel' : voidType}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Credit / Udhar Dialog */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>💳 Credit / Udhar Sale</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-primary/10 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">AMOUNT DUE</p>
              <p className="text-2xl font-bold text-primary">PKR {grandTotal.toLocaleString()}</p>
            </div>
            <Input placeholder="Customer Name *" value={creditName} onChange={e => setCreditName(e.target.value)} autoFocus />
            <Input placeholder="Phone Number" value={creditPhone} onChange={e => setCreditPhone(e.target.value)} />
            <Input placeholder="Address (optional)" value={creditAddress} onChange={e => setCreditAddress(e.target.value)} />
            <Button className="w-full bg-status-purple text-status-purple-foreground hover:bg-status-purple/90" onClick={handleCreditSale}>
              Confirm Credit Sale
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Receive Dialog (cash / online account) — lazy mounted */}
      {showPaymentDialog && (
        <Suspense fallback={null}>
          <PaymentDialog
            open={showPaymentDialog}
            grandTotal={grandTotal}
            onClose={() => setShowPaymentDialog(false)}
            onConfirm={handlePaymentConfirm}
            customerPhone={custPhone}
          />
        </Suspense>
      )}

      {/* Receipt + Kitchen Print Dialog */}
      <Dialog open={showReceipt || showKitchenReceipt} onOpenChange={(v) => { if (!v) { setShowReceipt(false); setShowKitchenReceipt(false); } }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {showKitchenReceipt && !showReceipt ? '🍳 Kitchen Slip' : '🧾 Receipt'}
            </DialogTitle>
          </DialogHeader>
          {lastOrder && (
            <div className="flex gap-1.5 mb-2">
              <button
                onClick={() => { setReceiptViewOnly(false); setShowReceipt(true); setShowKitchenReceipt(false); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${showReceipt && !showKitchenReceipt ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
              >
                🧾 Customer Receipt
              </button>
              <button
                onClick={() => { setShowKitchenReceipt(true); setShowReceipt(false); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${showKitchenReceipt && !showReceipt ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}
              >
                🍳 Kitchen Slip
              </button>
            </div>
          )}
          {lastOrder && showReceipt && !showKitchenReceipt && (
            <ReceiptPreview key={`rcpt-${lastOrder.id}`} order={lastOrder} settings={settings} autoPrint={!receiptViewOnly} />
          )}
          {lastOrder && showKitchenReceipt && !showReceipt && (() => {
            const d = computeKotDiff(lastOrder);
            const isUpdate = !!lastOrder.kotPrinted && d.hasDiff;
            return (
              <KitchenReceipt
                key={`kot-${lastOrder.id}-${isUpdate ? 'upd' : 'full'}`}
                order={lastOrder}
                settings={settings}
                autoPrint
                updateMode={isUpdate}
                diffItemIds={isUpdate ? d.diffItemIds : undefined}
                diffDeltas={isUpdate ? d.diffDeltas : undefined}
                cancelDeltas={isUpdate ? d.cancelDeltas : undefined}
                cancelNames={isUpdate ? d.cancelNames : undefined}
              />
            );
          })()}
          {/* Combined mode: receipt visible + KOT auto-prints as separate cut job (staggered) */}
          {lastOrder && showReceipt && showKitchenReceipt && (() => {
            const d = computeKotDiff(lastOrder);
            const isUpdate = !!lastOrder.kotPrinted && d.hasDiff;
            return (
              <>
                <ReceiptPreview key={`rcpt-${lastOrder.id}`} order={lastOrder} settings={settings} autoPrint={!receiptViewOnly} />
                <div style={{ position: 'absolute', left: '-99999px', top: 0, width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true">
                  <KitchenReceipt
                    key={`kot-${lastOrder.id}-${isUpdate ? 'upd' : 'full'}`}
                    order={lastOrder}
                    settings={settings}
                    autoPrint
                    autoPrintDelayMs={1800}
                    showPrintButton={false}
                    updateMode={isUpdate}
                    diffItemIds={isUpdate ? d.diffItemIds : undefined}
                    diffDeltas={isUpdate ? d.diffDeltas : undefined}
                    cancelDeltas={isUpdate ? d.cancelDeltas : undefined}
                    cancelNames={isUpdate ? d.cancelNames : undefined}
                  />
                </div>
              </>
            );
          })()}
          {lastOrder && lastOrder.status === 'paid' && (
            <Button
              className="w-full mt-2 bg-[#25D366] hover:bg-[#1ebe57] text-white"
              disabled={!normalizePhone(lastOrder.customer?.phone)}
              onClick={() => {
                const phone = normalizePhone(lastOrder.customer?.phone);
                if (!phone) { toast.error('Customer number not available'); return; }
                const msg = lastOrder.orderType === 'delivery'
                  ? buildDeliveryMessage(lastOrder, settings)
                  : buildPaidMessage(lastOrder, settings);
                openWhatsApp(phone, msg);
              }}
            >
              <MessageCircle className="h-4 w-4 mr-1" /> Send WhatsApp Message
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Running Bills Retrieve Dialog */}
      <Dialog open={showRunningBills} onOpenChange={setShowRunningBills}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh]">
          <DialogHeader><DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-status-warning" /> Retrieve Bills
          </DialogTitle></DialogHeader>

          {/* Legend + Summary */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-status-success" /> Running</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-status-warning" /> Hold</span>
            </div>
            {(() => {
              const runCount = filteredBills.filter(o => o.status === 'running').length;
              const holdCount = filteredBills.filter(o => o.status === 'hold').length;
              const totalAmt = filteredBills.reduce((s, o) => s + (o.grandTotal || 0), 0);
              const dineCount = filteredBills.filter(o => o.orderType === 'dining').length;
              const dlvCount = filteredBills.filter(o => o.orderType === 'delivery').length;
              const taCount = filteredBills.filter(o => o.orderType === 'takeaway').length;
              return (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border-2 border-primary/30 bg-primary/5">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Summary:</div>
                  <Badge className="bg-status-success/15 text-status-success border-status-success/30 text-[10px]">Running: {runCount}</Badge>
                  <Badge className="bg-status-warning/15 text-status-warning border-status-warning/30 text-[10px]">Hold: {holdCount}</Badge>
                  <Badge variant="secondary" className="text-[10px]">Dine: {dineCount}</Badge>
                  <Badge variant="secondary" className="text-[10px]">Dlv: {dlvCount}</Badge>
                  <Badge variant="secondary" className="text-[10px]">T/A: {taCount}</Badge>
                  <div className="text-[11px] font-bold text-primary border-l border-primary/30 pl-2 ml-1">
                    Total: PKR {totalAmt.toLocaleString()}
                  </div>
                </div>
              );
            })()}
          </div>


          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Table, Bill #, Waiter..."
              value={billSearch}
              onChange={e => setBillSearch(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>

          {/* Bill table */}
          <div className="overflow-y-auto pos-scrollbar max-h-[50vh]">
            {filteredBills.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No running/hold bills found</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground bg-muted/50">
                    <th className="text-left py-2 px-2 font-bold">Bill #</th>
                    <th className="text-left py-2 px-2 font-bold">Status</th>
                    <th className="text-left py-2 px-2 font-bold">Table</th>
                    <th className="text-left py-2 px-2 font-bold">Waiter / Rider</th>
                    <th className="text-left py-2 px-2 font-bold">Type</th>
                    <th className="text-left py-2 px-2 font-bold">Time</th>
                    <th className="text-right py-2 px-2 font-bold">Total</th>
                    <th className="text-center py-2 px-2 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.map(order => {
                    const table = order.tableId ? tables.find(t => t.id === order.tableId) : null;
                    const waiter = order.waiterId ? waiters.find(w => w.id === order.waiterId) : null;
                    const isRunning = order.status === 'running';
                    const rowBg = isRunning ? 'bg-status-success/5' : 'bg-status-warning/5';
                    const assignedLabel = order.orderType === 'delivery'
                      ? (order.riderName
                          ? <span><span className="font-semibold">🛵 {order.riderName}</span>{order.riderPhone && <span className="text-muted-foreground"> · {order.riderPhone}</span>}</span>
                          : <span className="text-muted-foreground">No rider</span>)
                      : (waiter?.name
                          ? <span><span className="font-semibold">👤 {waiter.name}</span>{table?.name && <span className="text-muted-foreground"> · {table.name}</span>}</span>
                          : <span className="text-muted-foreground">—</span>);
                    return (
                      <tr key={order.id} className={`border-b hover:bg-accent/50 transition-colors ${rowBg}`}>
                        <td className="py-2 px-2 font-bold">#{order.orderNumber}</td>
                        <td className="py-2 px-2">
                          <Badge className={`text-[10px] ${isRunning ? 'bg-status-success/20 text-status-success border-status-success/30' : 'bg-status-warning/20 text-status-warning border-status-warning/30'}`}>
                            {order.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-2">{table?.name || (order.orderType === 'delivery' ? 'DLV' : order.orderType === 'takeaway' ? 'T/A' : '—')}</td>
                        <td className="py-2 px-2">{assignedLabel}</td>

                        <td className="py-2 px-2">
                          <Badge variant="secondary" className="capitalize text-[10px]">{order.orderType}</Badge>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {new Date(order.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-primary">PKR {order.grandTotal.toLocaleString()}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center justify-center gap-1">
                            <Button size="sm" className="h-8 text-[10px] px-3" onClick={() => retrieveOrder(order)}>
                              Retrieve
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-[10px] px-2 bg-status-success/10 text-status-success border-status-success/30 hover:bg-status-success/20"
                              onClick={() => payBillFromRetrieve(order)}>
                              Pay
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-[10px] px-2"
                              onClick={() => { setLastOrder(order); setReceiptViewOnly(false); setShowReceipt(true); }}>
                              Print
                            </Button>
                            {isRunning ? (
                              <Button size="sm" variant="outline" className="h-8 text-[10px] px-2 text-status-warning border-status-warning/30 hover:bg-status-warning/10"
                                onClick={() => markBillStatus(order, 'hold')}>
                                Hold
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" className="h-8 text-[10px] px-2 text-status-success border-status-success/30 hover:bg-status-success/10"
                                onClick={() => markBillStatus(order, 'running')}>
                                Resume
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-8 text-[10px] px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => markBillStatus(order, 'cancelled')}>
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="lg" className="text-sm px-6" onClick={() => setShowRunningBills(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Size / Inch Variant Picker (Advanced Menu Flow) ===== */}
      <Dialog open={!!variantPickerItem} onOpenChange={(v) => { if (!v) setVariantPickerItem(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {variantPickerItem?.name}
              {variantPickerItem?.subCategory && (
                <span className="text-xs text-muted-foreground font-normal ml-2">· {variantPickerItem.subCategory}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          {variantPickerItem && (() => {
            const showSize = (variantPickerItem.pricingType === 'size' || variantPickerItem.pricingType === 'both')
              && (variantPickerItem.sizeVariants?.length || 0) > 0;
            const showInch = (variantPickerItem.pricingType === 'inch' || variantPickerItem.pricingType === 'both')
              && (variantPickerItem.inchVariants?.length || 0) > 0;
            return (
              <div className="space-y-4">
                {showSize && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Size</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(variantPickerItem.sizeVariants || []).map(v => (
                        <button
                          key={v.name}
                          onClick={() => { addVariantToCart(variantPickerItem, { name: v.name, price: v.price, type: 'size' }); setVariantPickerItem(null); }}
                          className="border rounded-lg p-3 hover:border-primary hover:bg-primary/5 transition-all text-left"
                        >
                          <div className="text-sm font-bold">{v.name}</div>
                          <div className="text-xs text-primary font-extrabold mt-1">Rs.{v.price.toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {showInch && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Inches</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(variantPickerItem.inchVariants || []).map(v => (
                        <button
                          key={v.name}
                          onClick={() => { addVariantToCart(variantPickerItem, { name: v.name, price: v.price, type: 'inch' }); setVariantPickerItem(null); }}
                          className="border rounded-lg p-3 hover:border-primary hover:bg-primary/5 transition-all text-left"
                        >
                          <div className="text-sm font-bold">{v.name}</div>
                          <div className="text-xs text-primary font-extrabold mt-1">Rs.{v.price.toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!showSize && !showInch && (
                  <p className="text-xs text-muted-foreground italic">No variants configured. Go to Menu Manager to add Size or Inch variants.</p>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
