import { MessageCircle, Mail, Facebook, Instagram } from 'lucide-react';
import logo from '@/assets/dt-mark.png';

const BRAND_BG = '#3c096c';

const LINKS = [
  { icon: MessageCircle, label: 'WhatsApp +92 345 1873354', href: 'https://wa.me/923451873354' },
  { icon: MessageCircle, label: 'WhatsApp +92 332 2373354', href: 'https://wa.me/923322373354' },
  { icon: Mail,          label: 'digitaltarget.digital@gmail.com', href: 'mailto:digitaltarget.digital@gmail.com' },
  { icon: Facebook,      label: 'Facebook',  href: 'https://web.facebook.com/digitaltargetpk/' },
  { icon: Instagram,     label: 'Instagram', href: 'https://www.instagram.com/digitaltarget_pk' },
];

function openExternal(href: string) {
  try {
    const api: any = (window as any).electronAPI;
    if (api?.openExternal) { api.openExternal(href); return; }
  } catch {}
  window.open(href, '_blank', 'noopener,noreferrer');
}

export default function PoweredByBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className="rounded-lg p-2 text-white shadow-md"
      style={{ background: BRAND_BG }}
      title="Software by Digital Target"
    >
      <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
        <img src={logo} alt="Digital Target" className="h-7 w-7 rounded bg-white/10 p-0.5 object-contain shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider opacity-70 leading-none">Powered by</div>
            <div className="text-[12px] font-bold leading-tight truncate">Digital Target</div>
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {LINKS.map((l, i) => {
            const Icon = l.icon;
            return (
              <button
                key={i}
                onClick={() => openExternal(l.href)}
                title={l.label}
                className="h-6 w-6 rounded flex items-center justify-center bg-white/10 hover:bg-white/25 transition-colors"
              >
                <Icon className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
