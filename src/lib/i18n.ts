// ============================================================
// DT POS i18n — central language system.
// Languages: English · اردو · Roman Urdu · العربية
// Add new strings here and they will be available across the app.
// Usage: import { t } from '@/lib/i18n';  t('pay')
// ============================================================

export type Lang = 'en' | 'ur' | 'rur' | 'ar';

const LANG_KEY = 'dtpos-lang';

export const LANGUAGES: { code: Lang; label: string; rtl?: boolean }[] = [
  { code: 'en', label: 'English' },
  { code: 'ur', label: 'اردو', rtl: true },
  { code: 'rur', label: 'Roman Urdu' },
  { code: 'ar', label: 'العربية', rtl: true },
];

type Dict = Record<string, string>;

const en: Dict = {
  pay: '💰 PAY', hold: '⏸ Hold', send: 'Send', clr: 'CLR', apply: '✓ Apply', cash: '→ Cash',
  tokenPrint: '🫓 TOKEN PRINT', running: 'Running', total: 'Total', subtotal: 'Subtotal',
  discount: 'Discount', tax: 'GST / Tax', serviceCharge: 'Service Charge', change: 'Change',
  cashReceived: 'Cash Received', payment: 'Payment', printReceipt: 'Print Receipt',
  sendKitchen: 'Send to Kitchen', reprintKot: 'Reprint KOT', reprintReceipt: 'Reprint Receipt',
  edit: 'Edit', delete: 'Delete', save: 'Save', cancel: 'Cancel', close: 'Close', search: 'Search',
  table: 'Table', waiter: 'Waiter', customer: 'Customer', items: 'Items', qty: 'Qty', price: 'Price',
  dining: 'Dining', takeaway: 'Takeaway', delivery: 'Delivery',
  runningBills: 'Running Bills', retrieve: 'Retrieve', reports: 'Reports', settings: 'Settings',
  tokenModule: 'Token Module', printingCenter: 'Printing Center', menu: 'Menu', tables: 'Tables',
  dashboard: 'Dashboard', paid: 'Paid', pending: 'Pending', credit: 'Credit / Udhaar',
};

const ur: Dict = {
  pay: '💰 ادائیگی', hold: '⏸ ہولڈ', send: 'کچن بھیجیں', clr: 'صاف', apply: '✓ لگائیں', cash: '→ نقد',
  tokenPrint: '🫓 ٹوکن پرنٹ', running: 'جاری', total: 'کل رقم', subtotal: 'ذیلی کل',
  discount: 'رعایت', tax: 'ٹیکس / جی ایس ٹی', serviceCharge: 'سروس چارج', change: 'بقایا واپسی',
  cashReceived: 'نقد وصول', payment: 'ادائیگی', printReceipt: 'رسید پرنٹ',
  sendKitchen: 'کچن کو بھیجیں', reprintKot: 'کے او ٹی دوبارہ', reprintReceipt: 'رسید دوبارہ',
  edit: 'ترمیم', delete: 'حذف', save: 'محفوظ', cancel: 'منسوخ', close: 'بند', search: 'تلاش',
  table: 'ٹیبل', waiter: 'ویٹر', customer: 'گاہک', items: 'اشیاء', qty: 'تعداد', price: 'قیمت',
  dining: 'ڈائننگ', takeaway: 'ٹیک اوے', delivery: 'ڈیلیوری',
  runningBills: 'جاری بل', retrieve: 'واپس کھولیں', reports: 'رپورٹس', settings: 'سیٹنگز',
  tokenModule: 'ٹوکن ماڈیول', printingCenter: 'پرنٹنگ سینٹر', menu: 'مینیو', tables: 'ٹیبلز',
  dashboard: 'ڈیش بورڈ', paid: 'ادا شدہ', pending: 'باقی', credit: 'ادھار',
};

const rur: Dict = {
  pay: '💰 PAY KARO', hold: '⏸ Hold', send: 'Kitchen Bhejo', clr: 'Saaf', apply: '✓ Lagao', cash: '→ Naqad',
  tokenPrint: '🫓 TOKEN PRINT', running: 'Jaari', total: 'Kul Raqam', subtotal: 'Subtotal',
  discount: 'Riayat', tax: 'Tax / GST', serviceCharge: 'Service Charge', change: 'Bakaya Wapsi',
  cashReceived: 'Naqad Wasool', payment: 'Adaigi', printReceipt: 'Raseed Print',
  sendKitchen: 'Kitchen Bhejo', reprintKot: 'KOT Dobara', reprintReceipt: 'Raseed Dobara',
  edit: 'Tabdeeli', delete: 'Hatao', save: 'Mehfooz', cancel: 'Mansookh', close: 'Band', search: 'Talash',
  table: 'Table', waiter: 'Waiter', customer: 'Gahak', items: 'Cheezein', qty: 'Tadaad', price: 'Qeemat',
  dining: 'Dining', takeaway: 'Takeaway', delivery: 'Delivery',
  runningBills: 'Jaari Bill', retrieve: 'Wapis Kholo', reports: 'Reports', settings: 'Settings',
  tokenModule: 'Token Module', printingCenter: 'Printing Center', menu: 'Menu', tables: 'Tables',
  dashboard: 'Dashboard', paid: 'Ada Shuda', pending: 'Baqi', credit: 'Udhaar',
};

const ar: Dict = {
  pay: '💰 دفع', hold: '⏸ تعليق', send: 'إرسال للمطبخ', clr: 'مسح', apply: '✓ تطبيق', cash: '→ نقدًا',
  tokenPrint: '🫓 طباعة الرمز', running: 'جارٍ', total: 'الإجمالي', subtotal: 'المجموع الفرعي',
  discount: 'خصم', tax: 'ضريبة', serviceCharge: 'رسوم الخدمة', change: 'الباقي',
  cashReceived: 'النقد المستلم', payment: 'الدفع', printReceipt: 'طباعة الإيصال',
  sendKitchen: 'إرسال للمطبخ', reprintKot: 'إعادة طباعة KOT', reprintReceipt: 'إعادة طباعة الإيصال',
  edit: 'تعديل', delete: 'حذف', save: 'حفظ', cancel: 'إلغاء', close: 'إغلاق', search: 'بحث',
  table: 'طاولة', waiter: 'نادل', customer: 'زبون', items: 'الأصناف', qty: 'الكمية', price: 'السعر',
  dining: 'صالة', takeaway: 'سفري', delivery: 'توصيل',
  runningBills: 'الفواتير الجارية', retrieve: 'استرجاع', reports: 'التقارير', settings: 'الإعدادات',
  tokenModule: 'وحدة الرموز', printingCenter: 'مركز الطباعة', menu: 'القائمة', tables: 'الطاولات',
  dashboard: 'لوحة التحكم', paid: 'مدفوع', pending: 'معلق', credit: 'آجل',
};

const DICTS: Record<Lang, Dict> = { en, ur, rur, ar };

export function getLang(): Lang {
  try {
    const l = localStorage.getItem(LANG_KEY) as Lang | null;
    if (l && DICTS[l]) return l;
  } catch {}
  return 'en';
}

export function setLang(l: Lang) {
  try { localStorage.setItem(LANG_KEY, l); } catch {}
  try {
    document.documentElement.lang = l;
    // Layout stays LTR (so the app's design doesn't break) — only the text
    // gets translated. Urdu/Arabic text handles its own RTL direction inline
    // via unicode.
  } catch {}
  try { window.dispatchEvent(new Event('dtpos-lang-change')); } catch {}
}

/** Translate a key in the current language (fallback: English → key). */
export function t(key: string): string {
  const l = getLang();
  return DICTS[l][key] ?? en[key] ?? key;
}

/** Small hook to re-render React when the language changes. */
import { useEffect, useState } from 'react';
export function useLang(): Lang {
  const [l, setL] = useState<Lang>(getLang());
  useEffect(() => {
    const h = () => setL(getLang());
    window.addEventListener('dtpos-lang-change', h);
    return () => window.removeEventListener('dtpos-lang-change', h);
  }, []);
  return l;
}
