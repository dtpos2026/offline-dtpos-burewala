// Map pins derived from the client registry — kept out of DeviceMap.tsx so
// that file exports only its component.
import type { Client } from './registry';

export interface MapPin {
  client: Client;
  deviceId: string;
  lat: number;
  lng: number;
  activatedAt: number;
}

export function pinsFrom(clients: Client[]): MapPin[] {
  const out: MapPin[] = [];
  for (const c of clients) {
    for (const d of c.devices) {
      if (typeof d.lat === 'number' && typeof d.lng === 'number') {
        out.push({ client: c, deviceId: d.id, lat: d.lat, lng: d.lng, activatedAt: d.activatedAt });
      }
    }
  }
  return out;
}

