// Public routes (/order, /track, /rider-portal) get their tenant from the URL.
// Format supported:
//   #/order/{tenantId}
//   #/order?t={tenantId}
//   #/track/{tenantId}   or   #/track?t={tenantId}&o=...&p=...
//   #/rider-portal/{tenantId}
//
// We override the local tenant BEFORE initStore() so all reads/writes go to the right restaurant.

import { setTenant, getTenantId } from './tenant';

const PUBLIC_PREFIXES = ['#/order', '#/track', '#/rider-portal', '#/order-taker'];

export function isPublicTenantRoute(hash?: string): boolean {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  return PUBLIC_PREFIXES.some(p => h.startsWith(p));
}

/** Parse tenantId out of `#/order/abcd` or `#/order?t=abcd`. Returns null if absent. */
export function parsePublicTenantId(hash?: string): string | null {
  const h = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  if (!h) return null;
  // strip leading "#"
  const raw = h.startsWith('#') ? h.slice(1) : h;
  const [path, query = ''] = raw.split('?');
  // path style: /order/{tid} or /track/{tid} or /rider-portal/{tid}
  const parts = path.split('/').filter(Boolean); // ["order","abc"] or ["rider-portal","abc"]
  if (parts.length >= 2 && ['order', 'track', 'rider-portal', 'order-taker'].includes(parts[0])) {
    const candidate = parts[1];
    if (candidate && candidate.length >= 4) return decodeURIComponent(candidate);
  }
  // query style ?t=abc
  if (query) {
    const qs = new URLSearchParams(query);
    const t = qs.get('t') || qs.get('tenant');
    if (t) return t;
  }
  return null;
}

/** Apply tenant from URL synchronously — must be called BEFORE initStore() on public routes. */
export function applyPublicTenantFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  if (!isPublicTenantRoute()) return getTenantId();
  const tid = parsePublicTenantId();
  if (tid && tid !== getTenantId()) {
    setTenant(tid);
  }
  return getTenantId();
}
