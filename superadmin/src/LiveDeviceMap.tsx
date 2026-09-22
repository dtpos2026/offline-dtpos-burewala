// ============================================================
// LIVE DEVICE MAP — computers that report a heartbeat.
//
// Colour = connection + server decision. Positions from the heartbeat are
// usually city-level estimates from the internet connection; the popup says
// so. Computers without any position are listed underneath as
// "Location unavailable" instead of being placed somewhere made up.
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import DeviceMap, { escapeHtml, type MapMarker } from './DeviceMap';
import { watchDevices, watchDeviceStatuses, watchLicenseStatuses, docIdFor, type DeviceDoc, type StatusDoc } from './cloud';
import { isOnline, lastSeenLabel, locationLabel, serverDecision } from './deviceState';
import { BRAND, MUTED, card } from './theme';

const COLOUR = { online: '#16a34a', offline: '#64748b', blocked: '#dc2626' };

export default function LiveDeviceMap() {
  const [devices, setDevices] = useState<DeviceDoc[]>([]);
  const [devStatus, setDevStatus] = useState<Map<string, StatusDoc>>(new Map());
  const [licStatus, setLicStatus] = useState<Map<string, StatusDoc>>(new Map());
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => watchDevices(setDevices, e => setErr(e.message)), []);
  useEffect(() => watchDeviceStatuses(setDevStatus, e => setErr(e.message)), []);
  useEffect(() => watchLicenseStatuses(setLicStatus, e => setErr(e.message)), []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);

  const { markers, unplaced } = useMemo(() => {
    const markers: MapMarker[] = [];
    const unplaced: DeviceDoc[] = [];
    for (const d of devices) {
      const has = typeof d.latitude === 'number' && typeof d.longitude === 'number' && (d.latitude !== 0 || d.longitude !== 0);
      if (!has) { unplaced.push(d); continue; }
      const on = isOnline(d, now);
      const dec = serverDecision(devStatus.get(docIdFor(d.deviceId)), d.licenseKey ? licStatus.get(docIdFor(d.licenseKey)) : undefined, d);
      const colour = dec.status !== 'active' ? COLOUR.blocked : on ? COLOUR.online : COLOUR.offline;
      markers.push({
        lat: d.latitude as number, lng: d.longitude as number, colour,
        approximate: d.locationSource !== 'device',
        html: `<div style="font-family:system-ui;min-width:200px">
          <div style="font-weight:800;color:${BRAND};font-size:13px">${escapeHtml(d.business || 'Unnamed shop')}</div>
          <div style="font-size:11px;color:#555">${escapeHtml(d.hostname || '')}</div>
          <hr style="border:none;border-top:1px solid #eee;margin:7px 0"/>
          <div style="font-size:11px"><b>Device</b> <span style="font-family:monospace">${escapeHtml(d.deviceId.slice(0, 22))}…</span></div>
          <div style="font-size:11px"><b>Connection</b> ${on ? 'Online' : 'Offline'} · last seen ${escapeHtml(lastSeenLabel(d.lastSyncAt, now))}</div>
          <div style="font-size:11px"><b>Status</b> <span style="color:${colour};font-weight:700">${escapeHtml(dec.status)}</span></div>
          <div style="font-size:10.5px;color:#888;margin-top:4px">${escapeHtml(locationLabel(d))}</div>
        </div>`,
      });
    }
    return { markers, unplaced };
  }, [devices, devStatus, licStatus, now]);

  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Live installations</h2>
        <span style={{ fontSize: 12, color: MUTED }}>{markers.length} placed · {unplaced.length} without a location</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11, color: MUTED }}>
          <Legend c={COLOUR.online} t="Online" /><Legend c={COLOUR.offline} t="Offline" /><Legend c={COLOUR.blocked} t="Blocked" />
        </span>
      </div>
      {err && <p role="alert" style={{ color: '#b91c1c', fontSize: 12 }}>{err}</p>}
      <DeviceMap
        markers={markers}
        emptyTitle="No live locations yet"
        emptyText="A computer is placed here once it reports a location with its heartbeat. Most positions are approximate (city level, from the internet connection)."
      />
      <p style={{ fontSize: 11.5, color: MUTED, marginTop: 10, lineHeight: 1.6 }}>
        Shaded circles mark approximate positions derived from the shop's internet connection — not GPS.
      </p>
      {unplaced.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>Location unavailable</div>
          {unplaced.map(d => (
            <div key={d.deviceId} style={{ fontSize: 12, color: MUTED, padding: '3px 0' }}>
              {d.business || '—'} · <span style={{ fontFamily: 'monospace' }}>{d.deviceId.slice(0, 18)}…</span> · {isOnline(d, now) ? 'Online' : `Offline, last seen ${lastSeenLabel(d.lastSyncAt, now)}`}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'inline-block' }} />{t}</span>;
}
