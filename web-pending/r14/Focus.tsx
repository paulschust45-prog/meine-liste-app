import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { api, image } from '@appdeploy/client';
import { goFullscreen, leaveFullscreen, notifyAway } from './Modes';
import { focusLockStart, focusLockStop } from './native';
import {
  Check,
  Flame,
  ImagePlus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  X,
  Zap,
} from 'lucide-react';

// ---------- Typen ----------
export type Cover =
  | { kind: 'preset'; preset: string; motto?: string; dim?: number }
  | { kind: 'img'; id: string; motto?: string; dim?: number };

export interface FocusPrefs {
  bg: 'aurora' | 'calm' | 'photo';
  clock?: 'big' | 'ring';
  pv?: number;
  quotes: boolean;
  minutes: number;
  own: string[];
  cover?: Cover;
}

export const DEFAULT_FOCUS: FocusPrefs = { bg: 'photo', clock: 'big', pv: 2, quotes: true, minutes: 25, own: [] };

// ---------- Fokus-Statistik ----------
// Pro Tag: s = Sekunden im Fokus, n = Sitzungen (ab 1 Min), d = im Fokus erledigte Aufgaben
export type Stats = Record<string, { s: number; n: number; d: number }>;

export function normStats(raw: unknown): Stats {
  const out: Stats = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === 'number' && isFinite(x) && x >= 0 ? Math.round(x) : 0);
    out[k] = { s: num(o.s), n: num(o.n), d: num(o.d) };
  }
  return out;
}

export const fmtMin = (sec: number) => {
  const m = Math.round(sec / 60);
  if (m < 60) return m + ' Min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h + ' Std' + (r ? ' ' + r : '');
};

const dayKey = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const shift = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};

export function FocusStats({ stats }: { stats: Stats }) {
  const now = new Date();
  const today = dayKey(now);
  const mon = shift(now, -((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => dayKey(shift(mon, i)));
  const get = (k: string) => stats[k] || { s: 0, n: 0, d: 0 };
  const week = days.reduce((a, k) => a + get(k).s, 0);
  const weekDone = days.reduce((a, k) => a + get(k).d, 0);
  const weekSess = days.reduce((a, k) => a + get(k).n, 0);
  const max = Math.max(1800, ...days.map(k => get(k).s));
  // Serie: Tage in Folge mit mindestens 1 Minute Fokus (heute zählt, wenn schon begonnen)
  let streak = 0;
  let cur = get(today).s >= 60 ? now : shift(now, -1);
  while (get(dayKey(cur)).s >= 60 && streak < 999) {
    streak++;
    cur = shift(cur, -1);
  }
  const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  return (
    <div className="fs">
      <div className="fs-tiles">
        <div>
          <b>{fmtMin(get(today).s)}</b>
          <span>Heute</span>
        </div>
        <div>
          <b>{fmtMin(week)}</b>
          <span>Diese Woche</span>
        </div>
        <div>
          <b>{streak}</b>
          <span>{streak === 1 ? 'Tag in Folge' : 'Tage in Folge'}</span>
        </div>
      </div>
      <div
        className="fs-bars"
        role="img"
        aria-label={'Fokus-Minuten diese Woche: ' + days.map((k, i) => names[i] + ' ' + Math.round(get(k).s / 60)).join(', ')}
      >
        {days.map((k, i) => {
          const v = get(k).s;
          return (
            <div
              key={k}
              className={'fs-bar' + (k === today ? ' today' : '') + (k > today ? ' future' : '')}
              title={names[i] + ': ' + fmtMin(v) + (get(k).n ? ' · ' + get(k).n + ' Sitzungen' : '')}
            >
              <em>{v >= 60 ? Math.round(v / 60) : ''}</em>
              <div className="fs-track">
                <i style={{ height: v > 0 ? Math.max(4, (v / max) * 100) + '%' : 0 }} />
              </div>
              <span>{names[i]}</span>
            </div>
          );
        })}
      </div>
      <p className="fs-note">
        {weekSess} {weekSess === 1 ? 'Sitzung' : 'Sitzungen'} · {weekDone} im Fokus erledigt · Minuten pro Tag
      </p>
    </div>
  );
}

export const PRESETS: { id: string; name: string }[] = [
  { id: 'aurora', name: 'Morgen' },
  { id: 'nebula', name: 'Dämmerung' },
  { id: 'ocean', name: 'Meer' },
  { id: 'forest', name: 'Wald' },
  { id: 'glut', name: 'Glut' },
  { id: 'mono', name: 'Stein' },
];

// Motivierende Fotos (einmalig per KI erzeugt, im App-Speicher abgelegt)
export const PHOTOS: { id: string; name: string; fb: string }[] = [
  { id: 'ph-gipfel', name: 'Gipfel', fb: 'aurora' },
  { id: 'ph-meer', name: 'Weite', fb: 'ocean' },
  { id: 'ph-wald', name: 'Lichtung', fb: 'forest' },
  { id: 'ph-weg', name: 'Der Weg', fb: 'nebula' },
  { id: 'ph-duene', name: 'Düne', fb: 'glut' },
  { id: 'ph-stadt', name: 'Früh wach', fb: 'mono' },
];
const photoCache = new Map<string, Promise<string | null>>();
export function photoUrl(id: string): Promise<string | null> {
  let pr = photoCache.get(id);
  if (!pr) {
    pr = api
      .get('/api/bg?id=' + encodeURIComponent(id))
      .then(r => (typeof r.data?.url === 'string' ? (r.data.url as string) : null))
      .catch(() => null);
    photoCache.set(id, pr);
    pr.then(u => {
      if (!u) photoCache.delete(id);
    });
  }
  return pr;
}
function usePhoto(id: string) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setU(null);
    if (id) photoUrl(id).then(x => live && setU(x));
    return () => {
      live = false;
    };
  }, [id]);
  return u;
}

// Eigene Sprüche (keine echten Zitate)
const SAYINGS = [
  'Eine Sache. Jetzt. Der Rest wartet.',
  'Anfangen ist der schwerste Teil – und du bist schon da.',
  'Fertig ist besser als perfekt.',
  'Kleine Schritte bewegen große Dinge.',
  'Fokus heißt, zu allem anderen kurz Nein zu sagen.',
  'Du musst nicht motiviert sein. Nur angefangen.',
  'Jede erledigte Aufgabe macht den Kopf ein Stück freier.',
  'Nicht alles heute. Aber das hier.',
  'Fünf Minuten zählen mehr als null.',
  'Der Timer läuft. Das Handy kann warten.',
  'Was du heute erledigst, verfolgt dich morgen nicht.',
  'Tief durchatmen. Und los.',
  'Konzentration ist trainierbar – du trainierst gerade.',
  'Ein Haken mehr. Das fühlt sich gleich gut an.',
  'Langsam ist okay. Stillstand nicht.',
  'Du baust gerade etwas. Stein für Stein.',
];

export function normFocus(raw: unknown): FocusPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FOCUS };
  const r = raw as Partial<FocusPrefs>;
  // Einmalig: Fotos als Hintergrund und große Ziffern als neue Standards
  const fresh = r.pv !== 2;
  return {
    bg: fresh ? 'photo' : r.bg === 'calm' ? 'calm' : r.bg === 'photo' ? 'photo' : 'aurora',
    clock: fresh ? 'big' : r.clock === 'ring' ? 'ring' : 'big',
    pv: 2,
    quotes: r.quotes !== false,
    minutes: typeof r.minutes === 'number' && r.minutes >= 1 && r.minutes <= 180 ? Math.round(r.minutes) : 25,
    own: Array.isArray(r.own) ? r.own.filter(s => typeof s === 'string').slice(0, 50) : [],
    cover: normCover(r.cover),
  };
}

export function normCover(raw: unknown): Cover | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const motto = typeof c.motto === 'string' ? c.motto.slice(0, 28) : undefined;
  const dim = typeof c.dim === 'number' ? Math.min(0.85, Math.max(0, c.dim)) : undefined;
  if (c.kind === 'preset' && typeof c.preset === 'string') return { kind: 'preset', preset: c.preset, motto, dim };
  if (c.kind === 'img' && typeof c.id === 'string') return { kind: 'img', id: c.id, motto, dim };
  return undefined;
}

// ---------- Bild-Speicher (Gerät + Konto) ----------
const IDB = 'meine-liste-covers';
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('c');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbPut(id: string, data: string) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction('c', 'readwrite');
      tx.objectStore('c').put(data, id);
      tx.oncomplete = () => res(null);
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* Speicher nicht verfügbar */
  }
}
async function idbGet(id: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise(res => {
      const q = db.transaction('c', 'readonly').objectStore('c').get(id);
      q.onsuccess = () => res(typeof q.result === 'string' ? q.result : null);
      q.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

async function coverSrc(id: string, signedIn: boolean): Promise<string | null> {
  const local = await idbGet(id);
  if (local) return local;
  if (!signedIn) return null;
  try {
    const { data } = await api.get('/api/cover?id=' + encodeURIComponent(id));
    return typeof data?.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}

function useCoverSrc(cover: Cover | undefined, signedIn: boolean) {
  const [src, setSrc] = useState<string | null>(null);
  const id = cover && cover.kind === 'img' ? cover.id : '';
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (id) coverSrc(id, signedIn).then(s => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [id, signedIn]);
  return src;
}

// ---------- Cover-Darstellung ----------
export function CoverView({ cover, signedIn, small }: { cover: Cover; signedIn: boolean; small?: boolean }) {
  const src = useCoverSrc(cover, signedIn);
  const ph = cover.kind === 'preset' ? PHOTOS.find(x => x.id === cover.preset) : undefined;
  const purl = usePhoto(ph ? ph.id : '');
  const style: CSSProperties =
    cover.kind === 'img' && src
      ? { backgroundImage: 'url("' + src + '")' }
      : purl
        ? { backgroundImage: 'url("' + purl + '")' }
        : {};
  const cls =
    cover.kind === 'img'
      ? src
        ? 'cv-img'
        : 'cv-mono'
      : ph
        ? purl
          ? 'cv-img cv-photo'
          : 'cv-' + ph.fb
        : 'cv-' + cover.preset;
  return (
    <div className={'fx-cv ' + cls + (small ? ' sm' : '')} style={style}>
      <div className="fx-dim" style={{ opacity: cover.dim ?? 0.35 }} />
      {cover.motto && !small && (
        <div
          className="fx-motto"
          style={{ fontSize: 'min(' + Math.round(150 / Math.max(5, cover.motto.length)) + 'vw, 150px)' }}
        >
          {cover.motto}
        </div>
      )}
    </div>
  );
}

// ---------- Ton am Ende ----------
function chime() {
  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {
    /* nicht unterstützt */
  }
  try {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctx = W.AudioContext || W.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 0.55);
    });
    window.setTimeout(() => ctx.close(), 1500);
  } catch {
    /* kein Ton */
  }
}

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

// ---------- Fokus-Modus ----------
interface Props {
  text: string;
  imp: boolean;
  urg: boolean;
  areaName: string;
  areaColor: string;
  taskCover?: Cover;
  prefs: FocusPrefs;
  signedIn: boolean;
  nextText?: string;
  todaySec: number;
  startMin?: number;
  onLog: (ms: number, session: boolean) => void;
  onPrefs: (p: FocusPrefs) => void;
  onTaskCover: (c: Cover | undefined) => void;
  onDone: () => boolean | void;
  onNext: () => void;
  // Fokus-/Hardcore-Modus: Start = Verpflichtung, Vollbild, Erinnerung beim Verlassen
  strict?: boolean;
  onClose: () => void;
  // Fokus-Block: mehrere Aufgaben unter einem Timer
  batch?: { id: string; text: string; done: boolean }[];
  onBatchToggle?: (id: string) => void;
}

export default function Focus(p: Props) {
  const { prefs } = p;
  const [total, setTotal] = useState((p.startMin ?? prefs.minutes) * 60000);
  const [left, setLeft] = useState((p.startMin ?? prefs.minutes) * 60000);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [panel, setPanel] = useState(false);
  const [target, setTarget] = useState<'task' | 'all'>('task');
  const [win, setWin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const running = endAt !== null;
  const [commit, setCommit] = useState(false);
  const [away, setAway] = useState(0);
  const [askQuit, setAskQuit] = useState(false);
  const [bgPhoto] = useState(() => PHOTOS[Math.floor(Math.random() * PHOTOS.length)].id);

  // Fokuszeit mitschreiben
  const runStart = useRef<number | null>(null);
  const acc = useRef(0);
  const counted = useRef(false);
  const logRef = useRef(p.onLog);
  logRef.current = p.onLog;
  const flush = () => {
    if (runStart.current === null) return;
    const ms = Date.now() - runStart.current;
    runStart.current = null;
    acc.current += ms;
    const session = !counted.current && acc.current >= 60000;
    if (session) counted.current = true;
    if (ms > 500 || session) logRef.current(ms, session);
  };
  useEffect(() => () => flush(), []);
  const liveMs = runStart.current !== null ? Date.now() - runStart.current : 0;
  const started = running || left !== total;

  const list = [...SAYINGS, ...prefs.own];
  const [qi, setQi] = useState(() => Math.floor(Math.random() * list.length));

  // Timer
  useEffect(() => {
    if (!endAt) return;
    const h = window.setInterval(() => {
      const l = Math.max(0, endAt - Date.now());
      setLeft(l);
      if (l <= 0) {
        flush();
        setEndAt(null);
        setFinished(true);
        chime();
      }
    }, 250);
    return () => window.clearInterval(h);
  }, [endAt]);

  // Bildschirm wach halten, Titel zeigt Restzeit
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
    if (running && nav.wakeLock) {
      nav.wakeLock
        .request('screen')
        .then(l => (lock = l))
        .catch(() => undefined);
    }
    return () => {
      lock?.release().catch(() => undefined);
    };
  }, [running]);
  useEffect(() => {
    const old = document.title;
    document.title = running ? fmt(left) + ' · Fokus' : 'Fokus · Meine Liste';
    return () => {
      document.title = old;
    };
  }, [running, left]);

  // Strenger Modus: Verlassen der App wird bemerkt
  useEffect(() => {
    if (!p.strict || !running) return;
    const h = () => {
      if (document.visibilityState === 'hidden') {
        setAway(a => a + 1);
        notifyAway('Zurück zum Fokus', 'Erst das: ' + p.text);
      }
    };
    document.addEventListener('visibilitychange', h);
    const bu = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', bu);
    return () => {
      document.removeEventListener('visibilitychange', h);
      window.removeEventListener('beforeunload', bu);
    };
  }, [p.strict, running, p.text]);
  useEffect(() => () => leaveFullscreen(), []);
  // Handy-App: während des Fokus nur Meine Liste erlauben
  useEffect(() => {
    if (!p.strict || !started || win) return;
    focusLockStart(p.text, 0);
    return () => focusLockStop();
  }, [p.strict, started, win, p.text]);

  // Sprüche wechseln
  useEffect(() => {
    if (!prefs.quotes) return;
    const h = window.setInterval(() => setQi(i => (i + 1) % Math.max(1, list.length)), 25000);
    return () => window.clearInterval(h);
  }, [prefs.quotes, list.length]);

  // Escape schließt
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (panel) setPanel(false);
      else tryClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const tryClose = () => {
    if (p.strict && started && !win) {
      setAskQuit(true);
      return;
    }
    flush();
    p.onClose();
  };
  const start = () => {
    if (p.strict && !started && !commit) {
      setCommit(true);
      return;
    }
    if (p.strict) goFullscreen();
    runStart.current = Date.now();
    setFinished(false);
    setEndAt(Date.now() + (left > 0 ? left : total));
    if (left <= 0) setLeft(total);
  };
  const pause = () => {
    flush();
    if (endAt) setLeft(Math.max(0, endAt - Date.now()));
    setEndAt(null);
  };
  const reset = () => {
    flush();
    setEndAt(null);
    setLeft(total);
    setFinished(false);
  };
  const setDur = (min: number) => {
    flush();
    setEndAt(null);
    setFinished(false);
    setTotal(min * 60000);
    setLeft(min * 60000);
    if (min !== prefs.minutes && !p.batch) p.onPrefs({ ...prefs, minutes: min });
  };
  const plus5 = () => {
    setFinished(false);
    setTotal(t => t + 300000);
    if (endAt) setEndAt(endAt + 300000);
    else setLeft(l => l + 300000);
  };
  const done = () => {
    flush();
    setEndAt(null);
    leaveFullscreen();
    if (p.onDone() !== false) setWin(true);
  };

  // Cover
  const cover = p.taskCover ?? prefs.cover;
  const curCover = target === 'task' ? p.taskCover : prefs.cover;
  const applyCover = (c: Cover | undefined) => {
    if (target === 'task') p.onTaskCover(c);
    else p.onPrefs({ ...prefs, cover: c });
  };
  const pickPreset = (id: string) =>
    applyCover({ kind: 'preset', preset: id, motto: curCover?.motto, dim: curCover?.dim });
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setNote('');
    try {
      const img = await image.resizeIfNeeded(f, { maxDimension: 1600, quality: 0.8, mimeType: 'image/jpeg' });
      const id = 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await idbPut(id, 'data:' + img.mimeType + ';base64,' + img.data);
      if (p.signedIn) {
        try {
          await api.post('/api/cover', { id, data: img.data, mimeType: img.mimeType });
        } catch {
          setNote('Bild nur auf diesem Gerät gespeichert (Upload fehlgeschlagen).');
        }
      } else {
        setNote('Bild bleibt auf diesem Gerät. Mit Anmeldung ist es überall da.');
      }
      applyCover({ kind: 'img', id, motto: curCover?.motto, dim: curCover?.dim ?? 0.45 });
    } catch {
      setNote('Das Bild konnte nicht geladen werden.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const pct = total ? 1 - left / total : 0;
  const R = 92;
  const C = 2 * Math.PI * R;

  return (
    <div className="fx" role="dialog" aria-modal="true" aria-label="Fokus-Modus">
      <div className="fx-bg" aria-hidden="true">
        {cover ? (
          <CoverView cover={cover} signedIn={p.signedIn} />
        ) : prefs.bg === 'photo' ? (
          <CoverView cover={{ kind: 'preset', preset: bgPhoto, dim: 0.42 }} signedIn={p.signedIn} />
        ) : prefs.bg === 'aurora' ? (
          <div className="fx-aurora">
            <i />
            <i />
            <i />
          </div>
        ) : (
          <div className="fx-calm" />
        )}
        <div className="fx-vignette" />
      </div>

      <header className="fx-top">
        <button
          className="fx-ib"
          aria-label="Fokus beenden"
          onClick={tryClose}
        >
          <X size={20} />
        </button>
        <span className="fx-label">
          Fokus · heute {fmtMin((p.todaySec * 1000 + liveMs) / 1000)}
        </span>
        <button className="fx-ib" aria-label="Fokus anpassen" aria-expanded={panel} onClick={() => setPanel(v => !v)}>
          <SlidersHorizontal size={19} />
        </button>
      </header>

      <main className="fx-main">
        <div className="fx-head">
          <span className="fx-area" style={{ '--c': p.areaColor } as CSSProperties}>
            <i />
            {p.areaName}
          </span>
          {p.imp && (
            <span className="fx-flag imp">
              <Zap size={13} />
              wichtig
            </span>
          )}
          {p.urg && (
            <span className="fx-flag urg">
              <Flame size={13} />
              dringend
            </span>
          )}
        </div>
        <h1 className={'fx-task' + (p.batch ? ' blk' : '')}>{p.text}</h1>

        {away > 0 && running && (
          <p className="fx-away">Du warst {away}× kurz weg. Weiter geht's – nur das hier.</p>
        )}
        <div
          className={
            'fx-timer' + (running ? ' run' : '') + (finished ? ' end' : '') + (prefs.clock === 'ring' ? '' : ' big')
          }
        >
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle className="t0" cx="100" cy="100" r={R} />
            <circle
              className="t1"
              cx="100"
              cy="100"
              r={R}
              style={{ strokeDasharray: C, strokeDashoffset: C * (1 - pct) }}
            />
          </svg>
          <div className="fx-time" role="timer" aria-live="off">
            {fmt(left)}
          </div>
          <div className="fx-state">
            {finished ? 'Zeit um' : running ? 'läuft' : started ? 'pausiert' : Math.round(total / 60000) + ' Minuten'}
          </div>
          <div className="fx-line" aria-hidden="true">
            <span style={{ width: pct * 100 + '%' }} />
          </div>
        </div>

        {p.batch && (
          <ul className="fx-batch" aria-label="Aufgaben im Block">
            {p.batch.map(b => (
              <li key={b.id}>
                <button className={b.done ? 'on' : ''} aria-pressed={b.done} onClick={() => p.onBatchToggle?.(b.id)}>
                  <span className="fx-bchk">{b.done && <Check size={13} strokeWidth={3} />}</span>
                  <span className="fx-btxt">{b.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!started && (
          <div className="fx-durs" role="group" aria-label="Dauer">
            {(p.batch ? [25, 45, 60, 90] : [5, 15, 25, 45]).map(m => (
              <button key={m} aria-pressed={Math.round(total / 60000) === m} onClick={() => setDur(m)}>
                {m}
              </button>
            ))}
          </div>
        )}

        <div className="fx-ctrls">
          <button className="fx-ib round" aria-label="Zurücksetzen" onClick={reset} disabled={!started && !finished}>
            <RotateCcw size={19} />
          </button>
          <button className="fx-play" aria-label={running ? 'Pause' : 'Start'} onClick={running ? pause : start}>
            {running ? <Pause size={28} /> : <Play size={28} />}
          </button>
          <button className="fx-ib round" aria-label="5 Minuten mehr" onClick={plus5}>
            <Plus size={16} />5
          </button>
        </div>

        <button className="fx-done" onClick={done}>
          <Check size={18} strokeWidth={3} />
          {p.batch
            ? p.batch.every(b => b.done)
              ? 'Block geschafft'
              : 'Block beenden (' + p.batch.filter(b => b.done).length + '/' + p.batch.length + ')'
            : 'Erledigt'}
        </button>
      </main>

      {prefs.quotes && list.length > 0 && (
        <footer className="fx-quote" key={qi}>
          {list[qi % list.length]}
        </footer>
      )}

      {panel && (
        <div className="fx-panel" role="dialog" aria-label="Fokus anpassen">
          <div className="fx-ph">
            <b>Anpassen</b>
            <button className="fx-ib" aria-label="Schließen" onClick={() => setPanel(false)}>
              <X size={18} />
            </button>
          </div>

          <p className="fx-h">Cover</p>
          <div className="fx-seg">
            <button aria-pressed={target === 'task'} onClick={() => setTarget('task')}>
              Diese Aufgabe
            </button>
            <button aria-pressed={target === 'all'} onClick={() => setTarget('all')}>
              Alle Aufgaben
            </button>
          </div>
          <div className="fx-covers">
            <button className={'fx-sw none' + (!curCover ? ' on' : '')} onClick={() => applyCover(undefined)}>
              Ohne
            </button>
            {[...PHOTOS, ...PRESETS].map(pr => (
              <button
                key={pr.id}
                className={'fx-sw' + (curCover?.kind === 'preset' && curCover.preset === pr.id ? ' on' : '')}
                onClick={() => pickPreset(pr.id)}
                aria-label={pr.name}
              >
                <CoverView cover={{ kind: 'preset', preset: pr.id }} signedIn={p.signedIn} small />
                <span>{pr.name}</span>
              </button>
            ))}
            <button
              className={'fx-sw up' + (curCover?.kind === 'img' ? ' on' : '')}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {curCover?.kind === 'img' ? (
                <CoverView cover={curCover} signedIn={p.signedIn} small />
              ) : (
                <ImagePlus size={20} />
              )}
              <span>{busy ? 'Lädt …' : 'Eigenes Bild'}</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={e => upload(e.target.files?.[0])}
          />
          {note && <p className="fx-note">{note}</p>}
          {curCover && (
            <>
              <label className="fx-fld">
                Motto auf dem Cover
                <input
                  key={(curCover.kind === 'img' ? curCover.id : curCover.preset) + target}
                  defaultValue={curCover.motto || ''}
                  maxLength={28}
                  placeholder="z. B. Durchziehen"
                  onBlur={e => applyCover({ ...curCover, motto: e.target.value.trim() || undefined })}
                />
              </label>
              <label className="fx-fld">
                Abdunkeln
                <input
                  type="range"
                  min={0}
                  max={85}
                  value={Math.round((curCover.dim ?? 0.35) * 100)}
                  onChange={e => applyCover({ ...curCover, dim: Number(e.target.value) / 100 })}
                />
              </label>
            </>
          )}

          <p className="fx-h">Uhr</p>
          <div className="fx-seg">
            <button aria-pressed={prefs.clock !== 'ring'} onClick={() => p.onPrefs({ ...prefs, clock: 'big' })}>
              Große Ziffern
            </button>
            <button aria-pressed={prefs.clock === 'ring'} onClick={() => p.onPrefs({ ...prefs, clock: 'ring' })}>
              Kreis
            </button>
          </div>

          <p className="fx-h">Hintergrund ohne Cover</p>
          <div className="fx-seg">
            <button aria-pressed={prefs.bg === 'photo'} onClick={() => p.onPrefs({ ...prefs, bg: 'photo' })}>
              Fotos
            </button>
            <button aria-pressed={prefs.bg === 'aurora'} onClick={() => p.onPrefs({ ...prefs, bg: 'aurora' })}>
              Warm
            </button>
            <button aria-pressed={prefs.bg === 'calm'} onClick={() => p.onPrefs({ ...prefs, bg: 'calm' })}>
              Ruhig
            </button>
          </div>

          <p className="fx-h">Sprüche</p>
          <label className="fx-switch">
            <input
              type="checkbox"
              checked={prefs.quotes}
              onChange={e => p.onPrefs({ ...prefs, quotes: e.target.checked })}
            />
            Motivierende Sprüche unten anzeigen
          </label>
          <label className="fx-fld">
            Eigene Sprüche (einer pro Zeile)
            <textarea
              defaultValue={prefs.own.join('\n')}
              rows={3}
              placeholder="Heute ist ein guter Tag zum Durchziehen."
              onBlur={e =>
                p.onPrefs({
                  ...prefs,
                  own: e.target.value
                    .split('\n')
                    .map(s => s.trim())
                    .filter(Boolean)
                    .slice(0, 50),
                })
              }
            />
          </label>
        </div>
      )}

      {commit && !started && (
        <div className="fx-commit" role="dialog" aria-modal="true" aria-label="Verpflichtung">
          <p className="fx-c-k">Ab jetzt nur das</p>
          <h2>{p.text}</h2>
          <p className="fx-c-s">
            Erst erledigen, dann alles andere. Der Bildschirm geht ins Vollbild – verlässt du die App, erinnere ich dich.
          </p>
          <button
            className="fx-done"
            onClick={() => {
              setCommit(false);
              goFullscreen();
              runStart.current = Date.now();
              setFinished(false);
              setEndAt(Date.now() + (left > 0 ? left : total));
            }}
          >
            <Play size={18} />
            Los, ich mach's
          </button>
          <button className="fx-ghost" onClick={() => setCommit(false)}>
            Noch nicht
          </button>
          <p className="fx-c-tip">
            Tipp für Android: Unter Einstellungen → Sicherheit → „App anheften“ einschalten. Dann bleibt das Handy wirklich bei
            dieser App.
          </p>
        </div>
      )}

      {askQuit && (
        <div className="fx-commit" role="dialog" aria-modal="true" aria-label="Wirklich abbrechen?">
          <p className="fx-c-k">Wirklich aufhören?</p>
          <h2>{p.text}</h2>
          <p className="fx-c-s">Du hast dich festgelegt. Noch ein paar Minuten, dann ist es geschafft.</p>
          <button className="fx-done" onClick={() => setAskQuit(false)}>
            Weitermachen
          </button>
          <button
            className="fx-ghost"
            onClick={() => {
              setAskQuit(false);
              flush();
              leaveFullscreen();
              p.onClose();
            }}
          >
            Trotzdem abbrechen
          </button>
        </div>
      )}

      {win && (
        <div className="fx-win" role="status">
          <div className="fx-burst" />
          <b>{p.batch && !p.batch.every(b => b.done) ? 'Gut gearbeitet.' : 'Geschafft.'}</b>
          <span className="fx-today">Heute {fmtMin(p.todaySec)} im Fokus</span>
          {p.batch ? (
            <>
              <p className="fx-next">
                {p.batch.filter(b => b.done).length} von {p.batch.length} Aufgaben im Block erledigt.
              </p>
              <div className="fx-wbtns">
                <button className="fx-done" onClick={p.onClose}>
                  Schließen
                </button>
              </div>
            </>
          ) : p.nextText ? (
            <>
              <span className="fx-next-l">Als Nächstes</span>
              <p className="fx-next">{p.nextText}</p>
              <div className="fx-wbtns">
                <button className="fx-done" onClick={p.onNext}>
                  Weiter
                </button>
                <button className="fx-ghost" onClick={p.onClose}>
                  Pause machen
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="fx-next">Alles für heute erledigt.</p>
              <div className="fx-wbtns">
                <button className="fx-done" onClick={p.onClose}>
                  Schließen
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
