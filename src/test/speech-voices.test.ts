// ============================================================
// SPEECH — Urdu, Hindi and English voices on Windows (section 3).
//
// What is proven here: which voice each line goes to, that Urdu is never
// handed to an English voice, that a Hindi voice gets Hindi script, that the
// settings message tells the truth, and that speech failing never throws.
// What cannot be proven here: how a real Windows voice sounds.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { urduToDevanagari, approximateUrduWords, hasUrduScript } from '@/lib/urduToHindi';
import { planSpeech, describeSupport, speakLines, cancelSpeech, listAllVoices, type VoiceInfo } from '@/lib/speech';
import { ANNOUNCEMENT_VOICES } from '@/lib/customerDisplay';
import {
  KITCHEN_ANNOUNCEMENTS, DEFAULT_KITCHEN_DISPLAY, announceKitchenOrder, loadKitchenDisplay, saveKitchenDisplay,
} from '@/lib/kitchenDisplay';

const v = (name: string, lang: string, extra: Partial<VoiceInfo> = {}): VoiceInfo => ({ name, lang, local: true, isDefault: false, provider: 'web', ...extra });
const EN = v('Microsoft Hazel', 'en-gb');
const HI = v('Microsoft Kalpana', 'hi-in');
const UR = v('Urdu Voice', 'ur-pk');

describe('Urdu → Hindi script', () => {
  it('spells the announcement sentences exactly', () => {
    expect(urduToDevanagari('آرڈر نمبر 25 تیار ہے۔')).toBe('ऑर्डर नंबर 25 तैयार है।');
    expect(urduToDevanagari('آرڈر نمبر 25 تیار ہے۔ براہِ کرم کاؤنٹر سے وصول کریں۔'))
      .toBe('ऑर्डर नंबर 25 तैयार है। बराहे करम काउंटर से वसूल करें।');
    expect(urduToDevanagari('کچن، نیا آرڈر نمبر 7 آیا ہے۔')).toBe('किचन, नया ऑर्डर नंबर 7 आया है।');
  });
  it('turns Urdu digits into numbers the voice reads', () => {
    expect(urduToDevanagari('آرڈر نمبر ۱۰۵')).toBe('ऑर्डर नंबर 105');
  });
  it('every built-in Urdu wording uses only exactly-spelled words', () => {
    const urdu = [...ANNOUNCEMENT_VOICES, ...KITCHEN_ANNOUNCEMENTS].filter(x => x.lang.startsWith('ur'));
    expect(urdu.length).toBeGreaterThanOrEqual(5);
    for (const w of urdu) expect(approximateUrduWords(w.text), w.id).toEqual([]);
  });
  it('other words still come out in Hindi script (approximate), never as Urdu letters', () => {
    const out = urduToDevanagari('بریانی تیار ہے');
    expect(hasUrduScript(out)).toBe(false);
    expect(out).toMatch(/तैयार है$/);
  });
  it('leaves English and Roman Urdu alone', () => {
    expect(urduToDevanagari('Order 12 tayyar hai')).toBe('Order 12 tayyar hai');
  });
});

describe('which voice reads which line', () => {
  const urdu = 'آرڈر نمبر 5 تیار ہے۔';
  it('an Urdu voice, when Windows has one', () => {
    const r = planSpeech(urdu, 'ur-PK', [EN, HI, UR]);
    expect(r).toMatchObject({ kind: 'native', voice: { name: 'Urdu Voice' }, text: urdu });
  });
  it('otherwise the Hindi voice, with the sentence rewritten in Hindi script', () => {
    const r = planSpeech(urdu, 'ur-PK', [EN, HI]);
    expect(r).toMatchObject({ kind: 'hindi-for-urdu', voice: { name: 'Microsoft Kalpana' }, lang: 'hi-IN', text: 'ऑर्डर नंबर 5 तैयार है।' });
  });
  it('an Urdu sentence mis-tagged as English still goes to the Hindi voice, not the English one', () => {
    expect(planSpeech(urdu, 'en-GB', [EN, HI]).kind).toBe('hindi-for-urdu');
  });
  it('the shop can turn the Hindi fallback off', () => {
    const r = planSpeech(urdu, 'ur-PK', [EN, HI], { hindiForUrdu: false });
    expect(r.kind).toBe('skip');
    expect((r as any).reason).toMatch(/No Urdu voice/);
  });
  it('never an English voice for Urdu letters — the line is skipped with a reason', () => {
    const r = planSpeech(urdu, 'ur-PK', [EN]);
    expect(r).toMatchObject({ kind: 'skip' });
    expect((r as any).reason).toMatch(/No Urdu or Hindi voice/);
  });
  it('Roman Urdu is Latin text, so the English voice may read it', () => {
    expect(planSpeech('Order 5 tayyar hai', 'ur-PK', [EN])).toMatchObject({ kind: 'native', voice: { name: 'Microsoft Hazel' } });
  });
  it('Hindi wording goes to the Hindi voice, or is skipped without one', () => {
    expect(planSpeech('ऑर्डर नंबर 5 तैयार है।', 'hi-IN', [EN, HI])).toMatchObject({ kind: 'native', voice: { name: 'Microsoft Kalpana' } });
    expect(planSpeech('ऑर्डर नंबर 5 तैयार है।', 'hi-IN', [EN]).kind).toBe('skip');
  });
  it('English goes to an English voice', () => {
    expect(planSpeech('Order 5 is ready.', 'en-GB', [HI, EN])).toMatchObject({ kind: 'native', voice: { name: 'Microsoft Hazel' } });
    expect(planSpeech('Order 5 is ready.', 'en-GB', [v('US', 'en-us')])).toMatchObject({ kind: 'native', voice: { name: 'US' } });
  });
  it('nothing to say, or no voices at all', () => {
    expect(planSpeech('  ', 'en-GB', [EN]).kind).toBe('skip');
    expect(planSpeech('Order 1', 'en-GB', []).kind).toBe('skip');
  });
});

describe('what the settings screen says', () => {
  it('Urdu voice installed', () => {
    const s = describeSupport(true, [EN, UR]);
    expect(s.urduMode).toBe('urdu-voice');
    expect(s.message).toContain('Urdu Voice');
  });
  it('Hindi only — says Urdu is read by the Hindi voice, and does not claim an Urdu voice', () => {
    const s = describeSupport(true, [EN, HI]);
    expect(s.urduMode).toBe('hindi-voice');
    expect(s.urdu).toBeUndefined();
    expect(s.message).toMatch(/No Urdu voice is installed/);
    expect(s.message).toContain('Microsoft Kalpana');
  });
  it('neither — tells the shop how to add a Hindi voice', () => {
    const s = describeSupport(true, [EN]);
    expect(s.urduMode).toBe('unavailable');
    expect(s.message).toMatch(/Add a Hindi voice/);
  });
  it('no speech at all', () => {
    expect(describeSupport(false, []).message).toMatch(/no speech support/);
    expect(describeSupport(true, []).message).toMatch(/no speech voices/);
  });
});

// ---------- the engines, with a fake Windows ----------
function fakeSynth(voices: Array<{ name: string; lang: string }>, opts: { lateVoices?: boolean; throwOnSpeak?: boolean } = {}) {
  const spoken: Array<{ text: string; lang: string; voice?: string }> = [];
  let ready = !opts.lateVoices;
  const listeners: Array<() => void> = [];
  (window as any).SpeechSynthesisUtterance = function (this: any, text: string) { this.text = text; };
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => (ready ? voices : []),
      speak: (u: any) => { if (opts.throwOnSpeak) throw new Error('audio device gone'); spoken.push({ text: u.text, lang: u.lang, voice: u.voice?.name }); },
      cancel: vi.fn(),
      addEventListener: (_: string, f: () => void) => listeners.push(f),
      removeEventListener: () => {},
      speaking: false,
      pending: false,
    },
  });
  return { spoken, loadVoices: () => { ready = true; listeners.forEach(f => f()); } };
}

describe('speaking', () => {
  afterEach(() => { delete (window as any).electronAPI; });

  it('waits for Windows to list its voices instead of reading an empty list', async () => {
    const f = fakeSynth([{ name: 'Microsoft Kalpana', lang: 'hi-IN' }], { lateVoices: true });
    const p = speakLines([{ text: 'آرڈر نمبر 9 تیار ہے۔', lang: 'ur-PK' }]);
    setTimeout(f.loadVoices, 20);
    const r = await p;
    expect(r.spoken).toBe(1);
    expect(f.spoken[0]).toEqual({ text: 'ऑर्डर नंबर 9 तैयार है।', lang: 'hi-IN', voice: 'Microsoft Kalpana' });
  });

  it('a failing voice never throws into the order screen', async () => {
    fakeSynth([{ name: 'UK', lang: 'en-GB' }], { throwOnSpeak: true });
    const r = await speakLines([{ text: 'Order 1', lang: 'en-GB' }]);
    expect(r.spoken).toBe(0);
  });

  it('plays the lines it can and reports the ones it cannot', async () => {
    const f = fakeSynth([{ name: 'UK', lang: 'en-GB' }]);
    const r = await speakLines([{ text: 'Order 3 ready', lang: 'en-GB' }, { text: 'آرڈر نمبر 3', lang: 'ur-PK' }], 2);
    expect(f.spoken.map(x => x.text)).toEqual(['Order 3 ready', 'Order 3 ready']);
    expect(r.skipped[0]).toMatch(/No Urdu or Hindi voice/);
  });

  it('uses a Windows Settings (OneCore) Hindi voice that Chromium cannot see, after the English line', async () => {
    const f = fakeSynth([{ name: 'Microsoft Hazel - English (Great Britain)', lang: 'en-GB' }]);
    const order: string[] = [];
    const origSpeak = (window.speechSynthesis as any).speak;
    (window.speechSynthesis as any).speak = (u: any) => { order.push(`web:${u.text}`); origSpeak(u); };
    const ttsSpeak = vi.fn(async (job: any) => { order.push(`onecore:${job.text}`); return { ok: true }; });
    (window as any).electronAPI = {
      ttsVoices: async () => ({ ok: true, voices: [
        { name: 'Microsoft Hazel', id: 'h', lang: 'en-GB' }, // same voice as Chromium's — listed once
        { name: 'Microsoft Kalpana', id: 'k', lang: 'hi-IN' },
      ] }),
      ttsSpeak,
      ttsCancel: vi.fn(async () => ({ ok: true })),
    };
    const voices = await listAllVoices(true);
    expect(voices.filter(x => /Hazel/.test(x.name))).toHaveLength(1);
    const r = await speakLines([{ text: 'Order 4 ready', lang: 'en-GB' }, { text: 'آرڈر نمبر 4 تیار ہے۔', lang: 'ur-PK' }]);
    expect(r.spoken).toBe(2);
    expect(order).toEqual(['web:Order 4 ready', 'onecore:ऑर्डर नंबर 4 तैयार है।']);
    expect(ttsSpeak.mock.calls[0][0]).toMatchObject({ voice: 'Microsoft Kalpana', voiceId: 'k' });
    expect(f.spoken).toHaveLength(1);
  });

  it('cancel stops what is queued', async () => {
    const f = fakeSynth([{ name: 'UK', lang: 'en-GB' }]);
    const a = speakLines([{ text: 'first', lang: 'en-GB' }]);
    const b = speakLines([{ text: 'second', lang: 'en-GB' }]);
    cancelSpeech();
    await Promise.all([a, b]);
    expect(f.spoken.map(x => x.text)).not.toContain('second');
  });
});

describe('Kitchen Display announcement', () => {
  beforeEach(() => localStorage.clear());
  it('is off until the kitchen turns it on, and round-trips', () => {
    expect(loadKitchenDisplay().announce).toBe(false);
    saveKitchenDisplay({ ...DEFAULT_KITCHEN_DISPLAY, announce: true, announceTemplate2: KITCHEN_ANNOUNCEMENTS[2].text, announceLang2: 'ur-PK' });
    const back = loadKitchenDisplay();
    expect(back.announce).toBe(true);
    expect(back.announceTemplate2).toBe('نیا آرڈر نمبر {n}۔');
    expect(back.announceHindiForUrdu).toBe(true);
  });
  it('says the number in English and Urdu (via Hindi voice)', async () => {
    const f = fakeSynth([{ name: 'UK', lang: 'en-GB' }, { name: 'Microsoft Kalpana', lang: 'hi-IN' }]);
    const r = await announceKitchenOrder(31, { ...DEFAULT_KITCHEN_DISPLAY, announce: true, announceTemplate2: 'نیا آرڈر نمبر {n}۔', announceLang2: 'ur-PK' });
    expect(r.spoken).toBe(2);
    expect(f.spoken.map(x => x.text)).toEqual(['New order, number 31.', 'नया ऑर्डर नंबर 31।']);
  });
  it('the board speaks only when announce is on, after the beep, and never blocks', () => {
    const page = readFileSync(resolve(__dirname, '../pages/KdsTvPage.tsx'), 'utf8');
    expect(page).toMatch(/playBeep\(urgent\);[\s\S]{0,400}if \(d\.announce\)/);
    expect(page).toMatch(/void announceKitchenOrder\([^)]*\)\.catch/);
  });
});

describe('the Windows voice bridge', () => {
  it('passes text as base64 on stdin, never on a command line', () => {
    const src = readFileSync(resolve(__dirname, '../../electron/windowsSpeech.cjs'), 'utf8');
    expect(src).toMatch(/FromBase64String/);
    expect(src).toMatch(/w\.stdin\.write\(`SPEAK:\$\{id\}:\$\{payload\}\\n`\)/);
    expect(src).not.toMatch(/-Command[^\n]*text/);
    const main = readFileSync(resolve(__dirname, '../../electron/main.cjs'), 'utf8');
    expect(main).toMatch(/registerSpeechIpc\(ipcMain, app\)/);
    const preload = readFileSync(resolve(__dirname, '../../electron/preload.cjs'), 'utf8');
    expect(preload).toMatch(/ttsSpeak: \(job\) => ipcRenderer\.invoke\('tts-speak', job\)/);
  });
});
