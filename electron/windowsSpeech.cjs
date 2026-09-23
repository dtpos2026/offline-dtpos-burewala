// ============================================================
// WINDOWS SPEECH (OneCore) — the voices Chromium cannot see.
//
// Chromium's speechSynthesis on Windows lists the classic SAPI voices only.
// Voices added through Windows Settings → Time & language → Speech → Add
// voices (Hindi "Kalpana"/"Hemant"/"Swara", and any other language pack) are
// "OneCore" voices: Windows apps can use them, Chromium cannot. This bridge
// lets DT POS use them through the Windows.Media.SpeechSynthesis API.
//
// One warm PowerShell process for the whole session (the same pattern as the
// RAW print worker): starting PowerShell per announcement would add a second
// of silence before every order number. Text travels as base64 JSON on stdin,
// never on a command line, so nothing a shop types can become a command.
// Windows only; everywhere else the calls answer "not available".
// ============================================================
const fs = require('fs');
const os = require('os');
const path = require('path');

const TTS_PS = String.raw`
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
  $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
} catch {
  [Console]::Out.WriteLine('FATAL:' + ($_.Exception.Message -replace '[\r\n]+', ' '))
  exit 1
}
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1'
})[0]
function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $null = $t.Wait(-1)
  $t.Result
}
[Console]::Out.WriteLine('READY')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq 'VOICES') {
    try {
      $list = @()
      foreach ($v in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
        $list += [pscustomobject]@{ name = [string]$v.DisplayName; id = [string]$v.Id; lang = [string]$v.Language; gender = [string]$v.Gender }
      }
      $default = ''
      try { $default = [string][Windows.Media.SpeechSynthesis.SpeechSynthesizer]::DefaultVoice.Id } catch {}
      $json = ConvertTo-Json -InputObject @{ voices = @($list); defaultId = $default } -Compress -Depth 4
      [Console]::Out.WriteLine('VOICES:' + $json)
    } catch {
      [Console]::Out.WriteLine('VOICES:{"voices":[],"error":"' + ($_.Exception.Message -replace '[\r\n"\\]+', ' ') + '"}')
    }
    continue
  }
  if ($line.StartsWith('SPEAK:')) {
    $parts = $line.Split(':', 3)
    $id = $parts[1]
    try {
      $job = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($parts[2])) | ConvertFrom-Json
      $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Id -eq $job.voiceId } | Select-Object -First 1
      if (-not $voice) { $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -eq $job.voice } | Select-Object -First 1 }
      if ($voice) { $synth.Voice = $voice }
      try { $synth.Options.SpeakingRate = [double]$job.rate } catch {}
      try { $synth.Options.AudioVolume = [double]$job.volume } catch {}
      $stream = Await ($synth.SynthesizeTextToStreamAsync([string]$job.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
      $net = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream.GetInputStreamAt(0))
      $ms = New-Object System.IO.MemoryStream
      $net.CopyTo($ms)
      $ms.Position = 0
      $player = New-Object System.Media.SoundPlayer($ms)
      $player.PlaySync()
      $player.Dispose(); $ms.Dispose(); $net.Dispose(); $stream.Dispose()
      [Console]::Out.WriteLine('DONE:' + $id)
    } catch {
      [Console]::Out.WriteLine('ERR:' + $id + ':' + ($_.Exception.Message -replace '[\r\n]+', ' '))
    }
  }
}
`;

let scriptPath = null;
function ensureScript() {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  const p = path.join(os.tmpdir(), 'dtpos-speech-worker-v1.ps1');
  fs.writeFileSync(p, TTS_PS, 'utf8');
  scriptPath = p;
  return p;
}

let worker = null;
let ready = null;
let buffer = '';
const waiters = new Map(); // key → { resolve, timer }
let chain = Promise.resolve();
let voicesCache = null;

function settle(key, value) {
  const w = waiters.get(key);
  if (!w) return;
  waiters.delete(key);
  clearTimeout(w.timer);
  w.resolve(value);
}

function stop() {
  try { worker?.kill(); } catch { /* already gone */ }
  worker = null;
  ready = null;
  buffer = '';
  for (const key of [...waiters.keys()]) settle(key, { ok: false, error: 'Speech stopped' });
}

function getWorker() {
  if (process.platform !== 'win32') return Promise.reject(new Error('Windows only'));
  if (worker && ready) return ready;
  const { spawn } = require('child_process');
  worker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ensureScript()], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const me = worker;
  ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('Speech worker startup timed out')); if (worker === me) stop(); }, 10000);
    me.stdout.on('data', (chunk) => {
      buffer += String(chunk || '');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (t === 'READY') { clearTimeout(timer); resolve(me); continue; }
        if (t.startsWith('FATAL:')) { clearTimeout(timer); reject(new Error(t.slice(6) || 'Windows speech is not available')); continue; }
        if (t.startsWith('VOICES:')) {
          let parsed = { voices: [] };
          try { parsed = JSON.parse(t.slice(7)); } catch { /* malformed → empty */ }
          settle('voices', { ok: true, ...parsed });
          continue;
        }
        const m = /^(DONE|ERR):([^:]+)(?::(.*))?$/.exec(t);
        if (m) settle(m[2], m[1] === 'DONE' ? { ok: true } : { ok: false, error: m[3] || 'Speech failed' });
      }
    });
    me.once('error', (e) => { clearTimeout(timer); reject(e); if (worker === me) stop(); });
    me.once('exit', () => { clearTimeout(timer); reject(new Error('Speech worker exited')); if (worker === me) stop(); });
  });
  ready.catch(() => { /* reported to the caller that awaits it */ });
  return ready;
}

function wait(key, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => settle(key, { ok: false, error: 'Speech timed out' }), ms);
    waiters.set(key, { resolve, timer });
  });
}

async function listVoices(refresh = false) {
  if (process.platform !== 'win32') return { ok: false, voices: [], error: 'Windows only' };
  if (voicesCache && !refresh) return voicesCache;
  try {
    const w = await getWorker();
    const p = wait('voices', 8000);
    w.stdin.write('VOICES\n');
    const r = await p;
    const voices = Array.isArray(r.voices) ? r.voices
      .filter(v => v && typeof v.name === 'string')
      .map(v => ({ name: v.name, id: String(v.id || ''), lang: String(v.lang || ''), gender: String(v.gender || ''), isDefault: !!r.defaultId && v.id === r.defaultId }))
      : [];
    const out = r.ok ? { ok: true, voices, error: r.error } : { ok: false, voices: [], error: r.error };
    if (out.ok) voicesCache = out;
    return out;
  } catch (e) {
    return { ok: false, voices: [], error: e?.message || 'Windows speech is not available' };
  }
}

function speak(job) {
  const text = String(job?.text || '').slice(0, 600);
  if (!text.trim()) return Promise.resolve({ ok: false, error: 'Nothing to say' });
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, error: 'Windows only' });
  const task = async () => {
    try {
      const w = await getWorker();
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      const payload = Buffer.from(JSON.stringify({
        text,
        voice: String(job.voice || ''),
        voiceId: String(job.voiceId || ''),
        rate: Math.max(0.5, Math.min(2, Number(job.rate) || 0.9)),
        volume: Math.max(0, Math.min(1, Number(job.volume ?? 1))),
      }), 'utf8').toString('base64');
      // Long enough for the sentence, short enough that a stuck audio device
      // never holds the queue: ~0.15 s a character, 4–30 s.
      const p = wait(id, Math.min(30000, 4000 + text.length * 150));
      w.stdin.write(`SPEAK:${id}:${payload}\n`);
      return await p;
    } catch (e) {
      return { ok: false, error: e?.message || 'Windows speech is not available' };
    }
  };
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

function cancel() {
  // Killing the process is the only way to cut PlaySync short. The next
  // announcement starts a fresh worker.
  if (worker) stop();
  chain = Promise.resolve();
  return { ok: true };
}

function registerSpeechIpc(ipcMain, app) {
  ipcMain.handle('tts-voices', (_e, refresh) => listVoices(!!refresh));
  ipcMain.handle('tts-speak', (_e, job) => speak(job));
  ipcMain.handle('tts-cancel', () => cancel());
  app.on('before-quit', stop);
}

module.exports = { registerSpeechIpc, TTS_PS };
