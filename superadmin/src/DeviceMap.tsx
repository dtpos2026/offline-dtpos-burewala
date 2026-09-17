// ============================================================
// DEVICE MAP — every activated machine, where it was activated.
//
// Coordinates come from the activation code the shop sends back, so the
// POS itself never phones home. Map tiles are fetched from OpenStreetMap:
// that is this panel using the internet, on Digital Target's own machine —
// the POS in the shop stays completely offline.
// ============================================================
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BRAND, ACCENT, MUTED, LINE } from './theme';
import { statusOf } from './registry';
import type { MapPin } from './pins';

const DOT: Record<string, string> = {
  active: '#10B981', expired: '#EF4444', suspended: '#F59E0B',
};

export default function DeviceMap({ pins, height = 420 }: { pins: MapPin[]; height?: number }) {
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
    if (!pins.length) return;

    for (const p of pins) {
      const status = statusOf(p.client);
      const colour = DOT[status] || ACCENT;
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: colour, fillOpacity: 0.95,
      });
      marker.bindPopup(
        `<div style="font-family:system-ui;min-width:190px">
           <div style="font-weight:800;color:${BRAND};font-size:13px">${escapeHtml(p.client.business || 'Unnamed shop')}</div>
           <div style="font-size:11px;color:#555;margin-top:2px">${escapeHtml(p.client.owner)} · ${escapeHtml(p.client.phone)}</div>
           <hr style="border:none;border-top:1px solid #eee;margin:7px 0"/>
           <div style="font-size:11px"><b>Key</b> <span style="font-family:monospace">${escapeHtml(p.client.key)}</span></div>
           <div style="font-size:11px"><b>Device</b> <span style="font-family:monospace">${escapeHtml(p.deviceId.slice(0, 22))}…</span></div>
           <div style="font-size:11px"><b>Activated</b> ${new Date(p.activatedAt).toLocaleDateString()}</div>
           <div style="font-size:11px"><b>Status</b> <span style="color:${colour};font-weight:700">${status}</span></div>
           <div style="font-size:10px;color:#888;margin-top:4px">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
         </div>`,
      );
      marker.addTo(layer);
    }
    map.fitBounds(L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number])).pad(0.25), { maxZoom: 14 });
  }, [pins]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={elRef} style={{ height, borderRadius: 14, overflow: 'hidden', border: `1px solid ${LINE}` }} />
      {pins.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'rgba(247,243,252,0.9)', borderRadius: 14, pointerEvents: 'none',
          textAlign: 'center', padding: 24,
        }}>
          <div>
            <div style={{ fontSize: 30, marginBottom: 8 }}>📍</div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>No device locations yet</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6, maxWidth: 340, lineHeight: 1.6 }}>
              A pin appears when you paste a shop's activation code under
              <b style={{ color: BRAND }}> Register a device</b>. The shop gets that code
              on screen right after activating and can send it on WhatsApp.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}
