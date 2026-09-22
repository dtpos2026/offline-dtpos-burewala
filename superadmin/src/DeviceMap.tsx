// ============================================================
// DEVICE MAP — Leaflet map of registered computers.
//
// Two sources feed it (see MapTab in App.tsx):
//   • activation codes the shop sent back (location the shop allowed)
//   • live heartbeats — usually an APPROXIMATE, city-level position derived
//     from the internet connection, labelled as such. A computer with no
//     position is listed as "Location unavailable", never guessed.
// Map tiles come from OpenStreetMap, on Digital Target's own machine.
// ============================================================
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BRAND, ACCENT, MUTED, LINE } from './theme';
import { statusOf } from './registry';
import type { MapPin } from './pins';

const DOT: Record<string, string> = {
  active: '#10B981', expired: '#EF4444', suspended: '#F59E0B',
};

export interface MapMarker {
  lat: number;
  lng: number;
  colour: string;
  /** Pre-escaped HTML for the popup. */
  html: string;
  /** Draw a faint circle: the position is only approximate. */
  approximate?: boolean;
}

/** Markers for the activation-code registry. */
export function markersFromPins(pins: MapPin[]): MapMarker[] {
  return pins.map(p => {
    const status = statusOf(p.client);
    const colour = DOT[status] || ACCENT;
    return {
      lat: p.lat, lng: p.lng, colour,
      html: `<div style="font-family:system-ui;min-width:190px">
           <div style="font-weight:800;color:${BRAND};font-size:13px">${escapeHtml(p.client.business || 'Unnamed shop')}</div>
           <div style="font-size:11px;color:#555;margin-top:2px">${escapeHtml(p.client.owner)} · ${escapeHtml(p.client.phone)}</div>
           <hr style="border:none;border-top:1px solid #eee;margin:7px 0"/>
           <div style="font-size:11px"><b>Key</b> <span style="font-family:monospace">${escapeHtml(p.client.key)}</span></div>
           <div style="font-size:11px"><b>Device</b> <span style="font-family:monospace">${escapeHtml(p.deviceId.slice(0, 22))}…</span></div>
           <div style="font-size:11px"><b>Activated</b> ${new Date(p.activatedAt).toLocaleDateString()}</div>
           <div style="font-size:11px"><b>Status</b> <span style="color:${colour};font-weight:700">${status}</span></div>
           <div style="font-size:10px;color:#888;margin-top:4px">Location sent in the activation code</div>
         </div>`,
    };
  });
}

export default function DeviceMap({ pins, markers, height = 420, emptyTitle, emptyText }: {
  pins?: MapPin[];
  markers?: MapMarker[];
  height?: number;
  emptyTitle?: string;
  emptyText?: React.ReactNode;
}) {
  const list = useMemo(() => markers ?? markersFromPins(pins ?? []), [markers, pins]);
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { attributionControl: true, zoomControl: true })
      .setView([30.1575, 71.5249], 6);   // Pakistan, a sensible default view
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!list.length) return;

    for (const m of list) {
      if (m.approximate) {
        L.circle([m.lat, m.lng], { radius: 5000, color: m.colour, weight: 1, fillOpacity: 0.08 }).addTo(layer);
      }
      L.circleMarker([m.lat, m.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: m.colour, fillOpacity: 0.95,
      }).bindPopup(m.html).addTo(layer);
    }
    map.fitBounds(L.latLngBounds(list.map(m => [m.lat, m.lng] as [number, number])).pad(0.25), { maxZoom: 12 });
  }, [list]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={elRef} style={{ height, borderRadius: 14, overflow: 'hidden', border: `1px solid ${LINE}` }} />
      {list.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(247,243,252,0.9)', borderRadius: 14, pointerEvents: 'none',
          textAlign: 'center', padding: 24,
        }}>
          <div>
            <div style={{ fontSize: 30, marginBottom: 8 }}>📍</div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{emptyTitle || 'No device locations yet'}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6, maxWidth: 340, lineHeight: 1.6 }}>
              {emptyText || (<>
                A pin appears when you paste a shop's activation code under
                <b style={{ color: BRAND }}> Register a device</b>. The shop gets that code
                on screen right after activating and can send it on WhatsApp.
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}
