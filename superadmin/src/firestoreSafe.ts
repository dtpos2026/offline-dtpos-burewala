// ============================================================
// FIRESTORE-SAFE DATA — no `undefined` ever reaches a write.
//
// Firestore rejects a whole write when ANY field is `undefined`:
//   "Function setDoc() called with invalid data. Unsupported field value:
//    undefined (found in document clients/…)"
// Optional fields are everywhere in this panel — a device registered from an
// activation code without a location has no lat/lng, a code from an older POS
// has no version, a support note may have no shop. An absent optional field
// must simply be left out, so every write goes through this first.
//
// Only plain objects and arrays are rebuilt. Anything else (Firestore
// sentinels such as serverTimestamp()/arrayRemove(), Timestamps, Dates) is
// passed through untouched. `null` is a real value and is kept.
// ============================================================

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** A copy of `value` with every `undefined` field (at any depth) removed. */
export function firestoreSafe<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter(v => v !== undefined).map(v => firestoreSafe(v)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = firestoreSafe(v);
    }
    return out as T;
  }
  return value;
}
