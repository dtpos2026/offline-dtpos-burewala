// ============================================================
// OFFLINE BILLING / ERP — Digital Target's billing of offline POS customers.
//
// Separate from the POS's online billing: its own collections and screen.
// Customer + bill details, a branded A4 invoice and an 80 mm receipt drawn by
// invoiceRender.ts, a QR that opens a verification reference, and Print /
// PNG / JPG from that same drawing.
// ============================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Client } from './registry';
import {
  DEFAULT_PROFILE, emptyCustomer, invoiceTotal, maskLicenseKey, matchesSearch, money, newVerifyCode,
  nextInvoiceNo, today, verifyUrl, type BillingProfile, type OfflineInvoice,
} from './billingModel';
import { cachedInvoices, cachedProfile, deleteInvoice, saveInvoice, saveProfile, watchInvoices, watchProfile } from './billingCloud';
import { canvasMeasure, layoutInvoice, paintInvoice, type Images, type InvoiceFormat } from './invoiceRender';
import { ACCENT, BRAND, LINE, MUTED, STATUS, STRONG, TINT, card, ghostBtn, input, label, primaryBtn } from './theme';

type Filter = 'all' | 'paid' | 'unpaid';

const fallbackVerifyBase = () => (typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '');

function blankInvoice(existing: OfflineInvoice[], profile: BillingProfile): OfflineInvoice {
  const now = Date.now();
  return {
    id: `inv_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    invoiceNo: nextInvoiceNo(existing.map(i => i.invoiceNo), profile.invoicePrefix),
    date: today(),
    customer: emptyCustomer(),
    pkg: 'DT POS Enterprise',
    description: '',
    amount: 0,
    extras: [],
    discount: 0,
    paid: false,
    paymentDate: '',
    paymentMethod: '',
    notes: '',
    verifyCode: newVerifyCode(),
    createdAt: now,
    updatedAt: now,
  };
}

export default function Billing({ clients }: { clients: Client[] }) {
  const [invoices, setInvoices] = useState<OfflineInvoice[]>(cachedInvoices);
  const [profile, setProfile] = useState<BillingProfile>(cachedProfile);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<OfflineInvoice | null>(null);
  const [viewing, setViewing] = useState<OfflineInvoice | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => watchInvoices(setInvoices, e => setErr(e.message)), []);
  useEffect(() => watchProfile(setProfile, e => setErr(e.message)), []);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(''), 6000); };

  const rows = useMemo(() => invoices
    .filter(i => (filter === 'all' ? true : filter === 'paid' ? i.paid : !i.paid))
    .filter(i => matchesSearch(i, q))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt), [invoices, q, filter]);

  const totals = useMemo(() => {
    let billed = 0, paid = 0;
    for (const i of invoices) { const t = invoiceTotal(i); billed += t; if (i.paid) paid += t; }
    return { billed, paid, unpaid: billed - paid, count: invoices.length, unpaidCount: invoices.filter(i => !i.paid).length };
  }, [invoices]);

  const save = async (inv: OfflineInvoice) => {
    setErr('');
    if (!inv.customer.restaurant.trim()) { setErr('Enter the restaurant name.'); return false; }
    if (invoices.some(i => i.id !== inv.id && i.invoiceNo === inv.invoiceNo)) { setErr(`Invoice number ${inv.invoiceNo} is already used.`); return false; }
    try {
      await saveInvoice(inv, profile);
      flash(`Invoice ${inv.invoiceNo} saved.`);
      return true;
    } catch (e) {
      setErr(`Not saved: ${(e as Error).message}`);
      return false;
    }
  };

  const markPaid = async (inv: OfflineInvoice) => {
    const ok = await save({ ...inv, paid: true, paymentDate: inv.paymentDate || today() });
    if (ok) flash(`Invoice ${inv.invoiceNo} marked PAID.`);
  };

  const remove = async (inv: OfflineInvoice) => {
    if (!window.confirm(`Delete invoice ${inv.invoiceNo} for ${inv.customer.restaurant}?\n\nIts QR verification link stops working.`)) return;
    try { await deleteInvoice(inv); flash(`Invoice ${inv.invoiceNo} deleted.`); }
    catch (e) { setErr(`Not deleted: ${(e as Error).message}`); }
  };

  const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: MUTED, fontWeight: 800, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '9px 10px', fontSize: 12.5, borderTop: `1px solid ${LINE}`, whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Tile k="Invoices" v={String(totals.count)} />
        <Tile k="Billed" v={money(totals.billed, profile.currency)} />
        <Tile k="Received" v={money(totals.paid, profile.currency)} tone={STATUS.active.fg} />
        <Tile k={`Unpaid (${totals.unpaidCount})`} v={money(totals.unpaid, profile.currency)} tone={STATUS.suspended.fg} />
      </div>

      <section style={{ ...card, padding: 18 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: BRAND }}>Offline Billing / ERP</h2>
          <span style={{ fontSize: 11.5, color: MUTED }}>Offline POS customers — separate from online billing</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={ghostBtn} onClick={() => setShowProfile(true)}>Invoice settings</button>
            <button style={{ ...primaryBtn, padding: '9px 14px', fontSize: 13 }} onClick={() => setEditing(blankInvoice(invoices, profile))}>+ New invoice</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search invoice, restaurant, owner, phone, license…" style={{ ...input, marginTop: 0, maxWidth: 380 }} />
          {(['all', 'unpaid', 'paid'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...ghostBtn, background: filter === f ? ACCENT : TINT, color: filter === f ? '#fff' : BRAND }}>
              {f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Unpaid'}
            </button>
          ))}
        </div>
        {err && <p role="alert" style={{ color: STATUS.expired.fg, fontSize: 12.5, fontWeight: 700 }}>{err}</p>}
        {note && <p role="status" style={{ color: STATUS.active.fg, fontSize: 12.5, fontWeight: 700 }}>{note}</p>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Invoice', 'Date', 'Restaurant', 'License', 'Package', 'Total', 'Status', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700 }}>{i.invoiceNo}</td>
                  <td style={td}>{i.date}</td>
                  <td style={td}><div style={{ fontWeight: 700 }}>{i.customer.restaurant}</div><div style={{ fontSize: 11, color: MUTED }}>{i.customer.owner}{i.customer.phone ? ` · ${i.customer.phone}` : ''}</div></td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{maskLicenseKey(i.customer.licenseKey) || '—'}</td>
                  <td style={td}>{i.pkg}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{money(invoiceTotal(i), profile.currency)}</td>
                  <td style={td}>
                    <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, color: i.paid ? STATUS.active.fg : STATUS.suspended.fg, background: i.paid ? STATUS.active.bg : STATUS.suspended.bg, border: `1px solid ${i.paid ? STATUS.active.bd : STATUS.suspended.bd}` }}>
                      {i.paid ? 'PAID' : 'UNPAID'}
                    </span>
                    {i.paid && i.paymentDate && <div style={{ fontSize: 10.5, color: MUTED }}>{i.paymentDate}</div>}
                  </td>
                  <td style={td}>
                    <button style={{ ...ghostBtn, padding: '5px 9px', fontSize: 11, marginRight: 6 }} onClick={() => setViewing(i)}>View / Print</button>
                    <button style={{ ...ghostBtn, padding: '5px 9px', fontSize: 11, marginRight: 6 }} onClick={() => setEditing(i)}>Edit</button>
                    {!i.paid && <button style={{ ...ghostBtn, padding: '5px 9px', fontSize: 11, marginRight: 6, color: STATUS.active.fg }} onClick={() => markPaid(i)}>Mark paid</button>}
                    <button style={{ ...ghostBtn, padding: '5px 9px', fontSize: 11, color: STATUS.expired.fg }} onClick={() => remove(i)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} style={{ ...td, color: MUTED }}>{invoices.length ? 'No invoice matches.' : 'No invoices yet. Use “New invoice”.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <Editor
          inv={editing} clients={clients} currency={profile.currency}
          onClose={() => setEditing(null)}
          onSave={async (next, preview) => { if (await save(next)) { setEditing(null); if (preview) setViewing(next); } }}
        />
      )}
      {viewing && <Preview inv={viewing} profile={profile} onClose={() => setViewing(null)} />}
      {showProfile && (
        <ProfileEditor
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSave={async p => {
            try { await saveProfile(p); setShowProfile(false); flash('Invoice settings saved.'); }
            catch (e) { setErr(`Settings not saved: ${(e as Error).message}`); }
          }}
        />
      )}
    </div>
  );
}

function Tile({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div style={{ ...card, padding: '12px 14px' }}>
      <div style={{ ...label, color: MUTED }}>{k}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone || STRONG, marginTop: 4 }}>{v}</div>
    </div>
  );
}

function Modal({ title, children, onClose, width = 760 }: { title: string; children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, zIndex: 70, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, padding: 20, width: `min(${width}px, 100%)`, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: BRAND, fontSize: 16, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ ...ghostBtn, marginLeft: 'auto', padding: '5px 10px' }}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ k, children, span = 1 }: { k: string; children: React.ReactNode; span?: number }) {
  return <label style={{ gridColumn: `span ${span}` }}><span style={label}>{k}</span>{children}</label>;
}

function Editor({ inv, clients, currency, onClose, onSave }: {
  inv: OfflineInvoice; clients: Client[]; currency: string; onClose: () => void; onSave: (i: OfflineInvoice, preview: boolean) => void;
}) {
  const [f, setF] = useState<OfflineInvoice>(inv);
  const setC = (k: keyof OfflineInvoice['customer'], v: string) => setF(p => ({ ...p, customer: { ...p.customer, [k]: v } }));
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const fillFrom = (key: string) => {
    const c = clients.find(x => x.key === key);
    if (!c) return;
    setF(p => ({ ...p, customer: { ...p.customer, restaurant: c.business || p.customer.restaurant, owner: c.owner || p.customer.owner, phone: c.phone || p.customer.phone, licenseKey: c.key } }));
  };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 };
  return (
    <Modal title={inv.createdAt === inv.updatedAt && !inv.customer.restaurant ? 'New invoice' : `Edit ${inv.invoiceNo}`} onClose={onClose} width={860}>
      {clients.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={label}>Fill from a licensed client</span>
          <select style={input} defaultValue="" onChange={e => fillFrom(e.target.value)}>
            <option value="">— choose a client —</option>
            {clients.map(c => <option key={c.key} value={c.key}>{c.business || c.key} · {c.key}</option>)}
          </select>
        </div>
      )}
      <h4 style={{ color: BRAND, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, margin: '8px 0' }}>Customer</h4>
      <div style={grid}>
        <Field k="Restaurant name"><input style={input} value={f.customer.restaurant} onChange={e => setC('restaurant', e.target.value)} /></Field>
        <Field k="Owner name"><input style={input} value={f.customer.owner} onChange={e => setC('owner', e.target.value)} /></Field>
        <Field k="Phone"><input style={input} value={f.customer.phone} onChange={e => setC('phone', e.target.value)} /></Field>
        <Field k="WhatsApp"><input style={input} value={f.customer.whatsapp} onChange={e => setC('whatsapp', e.target.value)} /></Field>
        <Field k="Address" span={2}><input style={input} value={f.customer.address} onChange={e => setC('address', e.target.value)} /></Field>
        <Field k="License number"><input style={{ ...input, fontFamily: 'monospace' }} value={f.customer.licenseKey} onChange={e => setC('licenseKey', e.target.value.toUpperCase())} /></Field>
        <Field k="License reference / link"><input style={input} value={f.customer.licenseRef} onChange={e => setC('licenseRef', e.target.value)} /></Field>
      </div>
      <h4 style={{ color: BRAND, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, margin: '16px 0 8px' }}>Billing</h4>
      <div style={grid}>
        <Field k="Invoice number"><input style={{ ...input, fontFamily: 'monospace' }} value={f.invoiceNo} onChange={e => setF({ ...f, invoiceNo: e.target.value })} /></Field>
        <Field k="Date"><input type="date" style={input} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
        <Field k="Software / package"><input style={input} value={f.pkg} onChange={e => setF({ ...f, pkg: e.target.value })} /></Field>
        <Field k={`Payment amount (${currency})`}><input type="number" min={0} style={input} value={f.amount} onChange={e => setF({ ...f, amount: num(e.target.value) })} /></Field>
        <Field k="Description" span={2}><textarea rows={2} style={{ ...input, resize: 'vertical' }} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={label}>Additional payment details</span>
        {f.extras.map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input style={{ ...input, marginTop: 0 }} placeholder="e.g. Installation, extra device" value={x.label} onChange={e => setF({ ...f, extras: f.extras.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
            <input type="number" style={{ ...input, marginTop: 0, maxWidth: 160 }} value={x.amount} onChange={e => setF({ ...f, extras: f.extras.map((y, j) => (j === i ? { ...y, amount: num(e.target.value) } : y)) })} />
            <button style={{ ...ghostBtn, color: STATUS.expired.fg }} onClick={() => setF({ ...f, extras: f.extras.filter((_, j) => j !== i) })}>Remove</button>
          </div>
        ))}
        <button style={{ ...ghostBtn, marginTop: 8 }} onClick={() => setF({ ...f, extras: [...f.extras, { label: '', amount: 0 }] })}>+ Add a line</button>
      </div>
      <div style={{ ...grid, marginTop: 12 }}>
        <Field k={`Discount (${currency})`}><input type="number" min={0} style={input} value={f.discount} onChange={e => setF({ ...f, discount: num(e.target.value) })} /></Field>
        <Field k="Total"><div style={{ ...input, fontWeight: 800, color: BRAND }}>{money(invoiceTotal(f), currency)}</div></Field>
        <Field k="Status">
          <select style={input} value={f.paid ? 'paid' : 'unpaid'} onChange={e => setF({ ...f, paid: e.target.value === 'paid', paymentDate: e.target.value === 'paid' ? (f.paymentDate || today()) : '' })}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </Field>
        <Field k="Payment date"><input type="date" style={input} disabled={!f.paid} value={f.paymentDate} onChange={e => setF({ ...f, paymentDate: e.target.value })} /></Field>
        <Field k="Payment method"><input style={input} placeholder="Cash, bank transfer, JazzCash…" value={f.paymentMethod} onChange={e => setF({ ...f, paymentMethod: e.target.value })} /></Field>
        <Field k="Notes" span={2}><textarea rows={2} style={{ ...input, resize: 'vertical' }} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button style={primaryBtn} onClick={() => onSave(f, false)}>Save invoice</button>
        <button style={ghostBtn} onClick={() => onSave(f, true)}>Save and preview</button>
      </div>
    </Modal>
  );
}

// ---------- preview / print / export ----------
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function buildImages(inv: OfflineInvoice, profile: BillingProfile): Promise<Images> {
  const qr = document.createElement('canvas');
  // Generated large and drawn without smoothing: sharp at any export size.
  await QRCode.toCanvas(qr, verifyUrl(profile, inv.verifyCode, fallbackVerifyBase()), { errorCorrectionLevel: 'M', margin: 1, width: 600 });
  const [logo, signature] = await Promise.all([loadImage(profile.logo || './dt-mark.png'), loadImage(profile.signature)]);
  return { qr, logo: logo || undefined, signature: signature || undefined };
}

/** Pixels per layout unit: A4 ≈ 240 dpi, 80 mm ≈ 260 dpi (thermal heads are 203). */
const EXPORT_SCALE: Record<InvoiceFormat, number> = { a4: 2.5, '80mm': 2.7 };

function Preview({ inv, profile, onClose }: { inv: OfflineInvoice; profile: BillingProfile; onClose: () => void }) {
  const [format, setFormat] = useState<InvoiceFormat>('a4');
  const [images, setImages] = useState<Images | null>(null);
  const [msg, setMsg] = useState('');
  const shown = useRef<HTMLCanvasElement | null>(null);
  const layout = useMemo(() => layoutInvoice(inv, profile, format, canvasMeasure(), !!profile.signature), [inv, profile, format]);

  useEffect(() => { let live = true; void buildImages(inv, profile).then(i => { if (live) setImages(i); }); return () => { live = false; }; }, [inv, profile]);
  useEffect(() => { if (shown.current && images) paintInvoice(shown.current, layout, images, 2); }, [layout, images]);

  const render = (): HTMLCanvasElement | null => {
    if (!images) return null;
    const c = document.createElement('canvas');
    paintInvoice(c, layout, images, EXPORT_SCALE[format]);
    return c;
  };
  const fileBase = `${inv.invoiceNo}-${format}`.replace(/[^A-Za-z0-9_-]/g, '_');

  const exportAs = (type: 'image/png' | 'image/jpeg') => {
    const c = render();
    if (!c) return;
    c.toBlob(blob => {
      if (!blob) { setMsg('The image could not be created.'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${fileBase}.${type === 'image/png' ? 'png' : 'jpg'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setMsg(`${type === 'image/png' ? 'PNG' : 'JPG'} saved: ${c.width} × ${c.height} px.`);
    }, type, 0.95);
  };

  const print = () => {
    const c = render();
    if (!c) return;
    const w = window.open('', '_blank');
    if (!w) { setMsg('The print window was blocked — allow pop-ups for this page.'); return; }
    const size = format === 'a4' ? 'A4' : '80mm auto';
    const width = format === 'a4' ? '210mm' : '80mm';
    w.document.write(`<!doctype html><html><head><title>${inv.invoiceNo}</title><style>@page{size:${size};margin:0}html,body{margin:0;padding:0}img{display:block;width:${width}}</style></head><body><img src="${c.toDataURL('image/png')}" onload="setTimeout(function(){window.print();},200)"></body></html>`);
    w.document.close();
  };

  const link = verifyUrl(profile, inv.verifyCode, fallbackVerifyBase());
  return (
    <Modal title={`Invoice ${inv.invoiceNo}`} onClose={onClose} width={900}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {(['a4', '80mm'] as InvoiceFormat[]).map(k => (
          <button key={k} style={{ ...ghostBtn, background: format === k ? ACCENT : TINT, color: format === k ? '#fff' : BRAND }} onClick={() => setFormat(k)}>
            {k === 'a4' ? 'A4 invoice' : '80 mm receipt'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={primaryBtn} disabled={!images} onClick={print}>Print</button>
          <button style={ghostBtn} disabled={!images} onClick={() => exportAs('image/png')}>Export PNG</button>
          <button style={ghostBtn} disabled={!images} onClick={() => exportAs('image/jpeg')}>Export JPG</button>
        </span>
      </div>
      {msg && <p role="status" style={{ fontSize: 12, color: STATUS.active.fg, fontWeight: 700 }}>{msg}</p>}
      <div style={{ background: '#e9e4f0', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'center', maxHeight: '65vh', overflow: 'auto' }}>
        {!images && <span style={{ color: MUTED, fontSize: 13 }}>Preparing the invoice…</span>}
        <canvas ref={shown} style={{ width: format === 'a4' ? 'min(640px, 100%)' : 302, height: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.18)', background: '#fff', display: images ? 'block' : 'none' }} />
      </div>
      <p style={{ fontSize: 11.5, color: MUTED, marginTop: 10, wordBreak: 'break-all' }}>
        QR opens: <a href={link} target="_blank" rel="noreferrer" style={{ color: ACCENT }}>{link}</a> — it carries only this random reference; the page shows the invoice number, restaurant, owner, masked license and its status.
      </p>
    </Modal>
  );
}

// ---------- branding / settings ----------
/** Shrink an uploaded image so it fits in the settings document. */
function downscale(file: File, maxW: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image.'));
      img.onload = () => {
        const k = Math.min(1, maxW / img.naturalWidth);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}

function ProfileEditor({ profile, onClose, onSave }: { profile: BillingProfile; onClose: () => void; onSave: (p: BillingProfile) => void }) {
  const [p, setP] = useState<BillingProfile>({ ...DEFAULT_PROFILE, ...profile });
  const [err, setErr] = useState('');
  const set = (k: keyof BillingProfile, v: string) => setP(x => ({ ...x, [k]: v }));
  const upload = async (k: 'logo' | 'signature', file?: File) => {
    if (!file) return;
    setErr('');
    try {
      const url = await downscale(file, k === 'logo' ? 320 : 600);
      if (url.length > 350_000) { setErr('That image is too large even after resizing. Use a smaller file.'); return; }
      set(k, url);
    } catch (e) { setErr((e as Error).message); }
  };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
  return (
    <Modal title="Invoice settings" onClose={onClose} width={820}>
      <div style={grid}>
        <Field k="Business name"><input style={input} value={p.businessName} onChange={e => set('businessName', e.target.value)} /></Field>
        <Field k="Tagline"><input style={input} value={p.tagline} onChange={e => set('tagline', e.target.value)} /></Field>
        <Field k="Your name (signatory)"><input style={input} value={p.personName} onChange={e => set('personName', e.target.value)} /></Field>
        <Field k="Title"><input style={input} value={p.personTitle} onChange={e => set('personTitle', e.target.value)} /></Field>
        <Field k="Contact number"><input style={input} value={p.phone} onChange={e => set('phone', e.target.value)} /></Field>
        <Field k="WhatsApp"><input style={input} value={p.whatsapp} onChange={e => set('whatsapp', e.target.value)} /></Field>
        <Field k="Email"><input style={input} value={p.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field k="Website"><input style={input} value={p.website} onChange={e => set('website', e.target.value)} /></Field>
        <Field k="Address" span={2}><input style={input} value={p.address} onChange={e => set('address', e.target.value)} /></Field>
        <Field k="Invoice prefix"><input style={input} value={p.invoicePrefix} onChange={e => set('invoicePrefix', e.target.value.toUpperCase())} /></Field>
        <Field k="Currency"><input style={input} value={p.currency} onChange={e => set('currency', e.target.value)} /></Field>
        <Field k="Verification page (QR)" span={2}><input style={input} placeholder={fallbackVerifyBase()} value={p.verifyBaseUrl} onChange={e => set('verifyBaseUrl', e.target.value)} /></Field>
        <Field k="Footer note" span={2}><input style={input} value={p.footerNote} onChange={e => set('footerNote', e.target.value)} /></Field>
      </div>
      <div style={{ ...grid, marginTop: 14 }}>
        <div>
          <span style={label}>Logo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <img src={p.logo || './dt-mark.png'} alt="Logo" style={{ width: 56, height: 56, objectFit: 'contain', background: BRAND, borderRadius: 10, padding: 4 }} />
            <input type="file" accept="image/*" onChange={e => upload('logo', e.target.files?.[0])} />
            {p.logo && <button style={ghostBtn} onClick={() => set('logo', '')}>Use Digital Target mark</button>}
          </div>
        </div>
        <div>
          <span style={label}>Signature</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            {p.signature ? <img src={p.signature} alt="Signature" style={{ height: 56, maxWidth: 200, objectFit: 'contain', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 8 }} /> : <span style={{ fontSize: 12, color: MUTED }}>No signature uploaded</span>}
            <input type="file" accept="image/*" onChange={e => upload('signature', e.target.files?.[0])} />
            {p.signature && <button style={ghostBtn} onClick={() => set('signature', '')}>Remove</button>}
          </div>
        </div>
      </div>
      {err && <p role="alert" style={{ color: STATUS.expired.fg, fontSize: 12.5, fontWeight: 700 }}>{err}</p>}
      <button style={{ ...primaryBtn, marginTop: 16 }} onClick={() => onSave(p)}>Save settings</button>
    </Modal>
  );
}
