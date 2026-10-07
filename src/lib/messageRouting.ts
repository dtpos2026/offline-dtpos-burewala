// ============================================================
// MESSAGE ROUTING — which restaurant a support message belongs to.
//
// Shared by the POS (lib/cloudMessages.ts) and the Super Admin panel
// (superadmin/src/Support.tsx), so both sides read the address the same way.
//
//   • a message to (or from) one restaurant carries that restaurant's licence
//     key in `clientKey`, and only that restaurant ever sees it;
//   • an announcement for every restaurant is sent on purpose from the Super
//     Admin, and carries BROADCAST_KEY;
//   • a message with no `clientKey` (older panels defaulted to "All / general
//     note", so most of these were meant for one shop) is shown to nobody.
// ============================================================

/** `clientKey` of an announcement sent to every restaurant. Never a licence key. */
export const BROADCAST_KEY = '*';

export interface RoutedMessage {
  clientKey?: string;
  from?: string;
}

/** True when this message belongs in this restaurant's message box. */
export function isForShop(m: RoutedMessage, licenseKey: string | undefined | null): boolean {
  const key = (licenseKey || '').trim();
  if (!key) return false;
  if (m.clientKey === key) return true;
  // Only Digital Target can speak to everyone.
  return m.from === 'admin' && m.clientKey === BROADCAST_KEY;
}

export function isBroadcast(m: RoutedMessage): boolean {
  return m.clientKey === BROADCAST_KEY;
}
