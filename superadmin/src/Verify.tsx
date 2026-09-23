// ============================================================
// INVOICE VERIFICATION — what an invoice QR opens (no sign-in).
//
// The QR carries only a random reference. This page reads that one record
// (invoiceVerify/{code}) and shows what a customer may check: invoice number,
// restaurant, owner, masked license, license status and payment status.
// ============================================================
import { useEffect, useState } from 'react';
import { fetchVerification } from './billingCloud';
import { money, type VerifyRecord } from './billingModel';
import { BRAND, INK, LINE, MUTED, STATUS, TEXT, card } from './theme';

export default function Verify({ code }: { code: string }) {
  const [state, setState] = useState<'loading' | 'found' | 'missing' | 'error'>('loading');
  const [rec, setRec] = useState<VerifyRecord | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    let live = true;
    fetchVerification(code.trim().toUpperCase())
      .then(r => { if (!live) return; setRec(r); setState(r ? 'found' : 'missing'); setCheckedAt(new Date()); })
      .catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, [code]);

  const Row = ({ k, v }: { k: string; v: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
      <span style={{ color: MUTED }}>{k}</span><span style={{ fontWeight: 700, textAlign: 'right' }}>{v || '—'}</span>
    </div>
  );
  const licenceTone = rec?.licenseStatus === 'active' ? STATUS.active : rec?.licenseStatus === 'suspended' || rec?.licenseStatus === 'pending' ? STATUS.suspended : STATUS.expired;

  return (
    <div style={{ minHeight: '100vh', background: INK, color: TEXT, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...card, width: 'min(460px, 100%)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <img src="./dt-mark.png" alt="" width={44} height={44} style={{ background: BRAND, borderRadius: 12, padding: 6 }} />
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Invoice verification</div>
            <div style={{ fontSize: 12, color: MUTED, fontFamily: 'monospace' }}>Ref {code}</div>
          </div>
        </div>
        {state === 'loading' && <p style={{ color: MUTED }}>Checking…</p>}
        {state === 'error' && <p style={{ color: STATUS.expired.fg, fontWeight: 700 }}>The records could not be reached. Check the internet connection and try again.</p>}
        {state === 'missing' && <p style={{ color: STATUS.expired.fg, fontWeight: 700 }}>No invoice was found for this reference. It may have been cancelled, or the code is not genuine.</p>}
        {state === 'found' && rec && (
          <>
            <p style={{ color: STATUS.active.fg, fontWeight: 800, margin: '0 0 8px' }}>✓ This invoice is on record with {rec.issuer}.</p>
            <Row k="Invoice" v={rec.invoiceNo} />
            <Row k="Date" v={rec.date} />
            <Row k="Restaurant" v={rec.restaurant} />
            <Row k="Owner" v={rec.owner} />
            <Row k="License" v={rec.licenseMasked} />
            <Row k="Plan" v={rec.plan} />
            <Row k="Valid until" v={rec.expiry} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${LINE}`, fontSize: 14 }}>
              <span style={{ color: MUTED }}>License status</span>
              <span style={{ fontWeight: 800, color: licenceTone.fg, textTransform: 'capitalize' }}>{rec.licenseStatus}</span>
            </div>
            <Row k="Total" v={money(rec.total, rec.currency)} />
            <Row k="Payment" v={rec.paid ? `Paid${rec.paymentDate ? ' on ' + rec.paymentDate : ''}` : 'Unpaid'} />
            <Row k="Contact" v={`${rec.issuer} · ${rec.issuerContact}`} />
            <p style={{ fontSize: 11.5, color: MUTED, marginTop: 12 }}>
              Record last updated {new Date(rec.updatedAt).toLocaleString()} · checked {checkedAt?.toLocaleString()}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
