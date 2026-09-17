// ============================================================
// askText — chhota "naam likhein" dialog.
//
// Kyun: Electron (desktop app) me window.prompt() kaam NAHI karta — wahan
// woh chup chaap null deta hai, is liye "Add Floor" / "Add Kitchen" jaise
// buttons kuch bhi save nahi karte the. Yeh helper apna khud ka overlay
// banata hai (koi library nahi), is liye browser aur desktop dono me chalta hai.
// ============================================================

export function askText(title: string, placeholder = '', initial = ''): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(15,10,35,.55);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)';

    const card = document.createElement('div');
    card.style.cssText =
      'background:#fff;color:#1b1235;border-radius:16px;padding:20px;width:min(420px,100%);box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:inherit';

    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = 'font-size:15px;font-weight:800;margin-bottom:12px';

    const input = document.createElement('input');
    input.value = initial;
    input.placeholder = placeholder;
    input.style.cssText =
      'width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #d9d3ea;border-radius:10px;font-size:14px;outline:none';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px';

    const mkBtn = (label: string, primary: boolean) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = primary
        ? 'padding:9px 18px;border:0;border-radius:10px;background:#6d28d9;color:#fff;font-weight:700;cursor:pointer'
        : 'padding:9px 18px;border:1.5px solid #d9d3ea;border-radius:10px;background:#fff;color:#4b4162;font-weight:700;cursor:pointer';
      return b;
    };
    const cancel = mkBtn('Cancel', false);
    const ok = mkBtn('Save', true);

    const close = (val: string | null) => {
      try { document.removeEventListener('keydown', onKey, true); } catch {}
      try { overlay.remove(); } catch {}
      resolve(val);
    };
    const confirm = () => {
      const v = input.value.trim();
      close(v ? v : null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
    };

    cancel.onclick = () => close(null);
    ok.onclick = confirm;
    overlay.onclick = (e) => { if (e.target === overlay) close(null); };
    document.addEventListener('keydown', onKey, true);

    row.append(cancel, ok);
    card.append(h, input, row);
    overlay.append(card);
    document.body.appendChild(overlay);
    setTimeout(() => { try { input.focus(); input.select(); } catch {} }, 30);
  });
}

/** Same idea for yes/no — window.confirm bhi Electron me bharosay ke qabil nahi. */
export function askConfirm(message: string): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(15,10,35,.55);display:flex;align-items:center;justify-content:center;padding:16px';
    const card = document.createElement('div');
    card.style.cssText =
      'background:#fff;color:#1b1235;border-radius:16px;padding:20px;width:min(420px,100%);box-shadow:0 24px 60px rgba(0,0,0,.35)';
    const p = document.createElement('div');
    p.textContent = message;
    p.style.cssText = 'font-size:14px;font-weight:600;line-height:1.5';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px';
    const no = document.createElement('button');
    no.textContent = 'No';
    no.style.cssText = 'padding:9px 18px;border:1.5px solid #d9d3ea;border-radius:10px;background:#fff;font-weight:700;cursor:pointer';
    const yes = document.createElement('button');
    yes.textContent = 'Yes';
    yes.style.cssText = 'padding:9px 18px;border:0;border-radius:10px;background:#b91c1c;color:#fff;font-weight:700;cursor:pointer';
    const close = (v: boolean) => { try { overlay.remove(); } catch {} resolve(v); };
    no.onclick = () => close(false);
    yes.onclick = () => close(true);
    row.append(no, yes);
    card.append(p, row);
    overlay.append(card);
    document.body.appendChild(overlay);
  });
}
