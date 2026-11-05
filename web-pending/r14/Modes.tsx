import { useEffect, useState } from 'react';
import { ArrowRight, Check, Flame, Lock, Moon, Target, X } from 'lucide-react';

// ---------- Modi ----------
// normal:   du entscheidest Reihenfolge und Tempo
// fokus:    Start = nur noch diese Aufgabe (Vollbild, Erinnerung beim Verlassen)
// hardcore: ausgewählte Aufgaben mit Beweis, Zeitlimit und Codewort
export type Mode = 'normal' | 'fokus' | 'hardcore';
export type HardLevel = 1 | 2 | 3;

export interface HardState {
  on: boolean;
  day: string;
  ids: string[];
  until: string;
  level: HardLevel;
  hash: string;
  leaves: number;
  started: number;
  // Aufgaben, die vorher keinen Foto-Beweis hatten (wird beim Ende zurückgesetzt)
  addedProof: string[];
}
export const NO_HARD: HardState = {
  on: false,
  day: '',
  ids: [],
  until: '18:00',
  level: 2,
  hash: '',
  leaves: 0,
  started: 0,
  addedProof: [],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const strArr = (v: unknown, max: number) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [];

export const normMode = (v: unknown): Mode => (v === 'fokus' || v === 'hardcore' ? v : 'normal');

export function normHard(raw: unknown): HardState {
  if (!raw || typeof raw !== 'object') return { ...NO_HARD, ids: [], addedProof: [] };
  const r = raw as Record<string, unknown>;
  return {
    on: r.on === true,
    day: typeof r.day === 'string' ? r.day : '',
    ids: strArr(r.ids, 20),
    until: typeof r.until === 'string' && HHMM.test(r.until) ? r.until : '18:00',
    level: r.level === 1 || r.level === 3 ? r.level : 2,
    hash: typeof r.hash === 'string' ? r.hash.slice(0, 80) : '',
    leaves: typeof r.leaves === 'number' ? Math.max(0, Math.min(999, Math.round(r.leaves))) : 0,
    started: typeof r.started === 'number' ? r.started : 0,
    addedProof: strArr(r.addedProof, 20),
  };
}

// Codewort nie im Klartext speichern
export async function hashWord(w: string): Promise<string> {
  const data = new TextEncoder().encode('meine-liste:' + w.trim().toLowerCase());
  try {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Fallback ohne WebCrypto (sehr alte Browser)
    let h = 0;
    for (const c of data) h = (h * 31 + c) | 0;
    return 'x' + h;
  }
}

// Erinnerung, wenn man die App verlässt (lokale Benachrichtigung)
export function notifyAway(title: string, body: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, tag: 'meine-liste-away', renotify: true } as NotificationOptions;
    if (navigator.serviceWorker) {
      navigator.serviceWorker
        .getRegistration()
        .then(r => {
          if (r) void r.showNotification(title, opts);
          else new Notification(title, opts);
        })
        .catch(() => undefined);
    } else new Notification(title, opts);
  } catch {
    /* nicht unterstützt */
  }
}
export async function askNotify() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch {
    /* egal */
  }
}
export function goFullscreen() {
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) return;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  } catch {
    /* nicht unterstützt */
  }
}
export function leaveFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  } catch {
    /* egal */
  }
}

// Sprüche, wenn man etwas zum zweiten Mal nach hinten schieben will
export const NO_BUMP = [
  'Du hast es schon einmal nach hinten geschoben. Jetzt ist es dran.',
  'Genug gefaulenzt. Die schweren Sachen macht man zuerst.',
  'Zweimal schieben gilt nicht. Fang mit fünf Minuten an.',
  'Die Aufgabe wird nicht kleiner, wenn du sie schiebst.',
];

// ---------- Modus-Auswahl (im Menü) ----------
const MODES: [Mode, string, string, typeof Target][] = [
  ['normal', 'Locker', 'Du entscheidest Reihenfolge und Tempo.', Check],
  ['fokus', 'Fokussiert', 'Start heißt: nur noch diese Aufgabe. Vollbild und Erinnerung, wenn du rausgehst.', Target],
  ['hardcore', 'Hart', 'Ausgewählte Aufgaben mit Foto-Beweis, Zeitlimit und Codewort. Mit Handy-App: Apps gesperrt.', Flame],
];

export function ModePicker({ mode, onPick }: { mode: Mode; onPick: (m: Mode) => void }) {
  return (
    <div className="md-list" role="radiogroup" aria-label="Strenge">
      {MODES.map(([k, n, d, Icon]) => (
        <button key={k} role="radio" aria-checked={mode === k} className={'md-row ' + k} onClick={() => onPick(k)}>
          <Icon size={18} />
          <span>
            {n}
            <small>{d}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- Hardcore einrichten ----------
const LEVELS: [HardLevel, string, string][] = [
  [1, 'Erinnern', 'Verlässt du die App, kommt eine Erinnerung. Wegklickbar.'],
  [2, 'Streng', 'Erinnerung bei jedem Verlassen, Vollbild, Beenden nur mit Codewort.'],
  [3, 'Kompromisslos', 'Wie Streng. Mit der Handy-App zusätzlich: Social Media gesperrt, auch nach Neustart.'],
];

interface SetupProps {
  tasks: { id: string; text: string }[];
  onStart: (h: { ids: string[]; until: string; level: HardLevel; hash: string }) => void;
  onClose: () => void;
}

export function HardSetup({ tasks, onStart, onClose }: SetupProps) {
  const [ids, setIds] = useState<string[]>(() => tasks.slice(0, 3).map(t => t.id));
  const now = new Date();
  const def = new Date(now.getTime() + 3 * 3600000);
  const [until, setUntil] = useState(
    String(Math.min(23, def.getHours())).padStart(2, '0') + ':' + (def.getHours() > 23 ? '59' : '00')
  );
  const [level, setLevel] = useState<HardLevel>(2);
  const [word, setWord] = useState('');
  const [word2, setWord2] = useState('');
  const ok = ids.length > 0 && word.trim().length >= 4 && word.trim() === word2.trim();

  return (
    <div className="nv-scrim center" onClick={onClose}>
      <div className="pl hc-setup" role="dialog" aria-modal="true" aria-label="Hardcore einrichten" onClick={e => e.stopPropagation()}>
        <header className="rt-head">
          <span className="rt-when">
            <Flame size={16} />
            Hardcore
          </span>
          <button className="nv-ib" aria-label="Schließen" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <h2 className="rt-title">Keine Ausreden.</h2>
        <p className="rt-meta">
          Diese Aufgaben musst du erledigen und jeweils mit einem Foto belegen. Bis dahin siehst du nichts anderes.
        </p>

        <p className="pl-q">Welche Aufgaben?</p>
        {tasks.length === 0 && <p className="nv-none">Heute ist nichts offen.</p>}
        <div className="hc-tasks">
          {tasks.map(t => (
            <label key={t.id} className="hc-task">
              <input
                type="checkbox"
                checked={ids.includes(t.id)}
                onChange={e => setIds(e.target.checked ? [...ids, t.id] : ids.filter(x => x !== t.id))}
              />
              <span>{t.text}</span>
            </label>
          ))}
        </div>

        <label className="nv-fld">
          Erledigt bis
          <input type="time" value={until} onChange={e => setUntil(e.target.value || '18:00')} />
        </label>

        <p className="pl-q">Wie hart?</p>
        <div className="ct-rules" role="radiogroup" aria-label="Härte">
          {LEVELS.map(([k, n, d]) => (
            <button key={k} role="radio" aria-checked={level === k} className="ct-rule" onClick={() => setLevel(k)}>
              <span className="ct-dot" />
              <span>
                {n}
                <small>{d}</small>
              </span>
            </button>
          ))}
        </div>

        <p className="pl-q">Codewort zum Abbrechen</p>
        <div className="nv-grid2">
          <label className="nv-fld">
            Codewort
            <input type="password" value={word} maxLength={40} autoComplete="new-password" onChange={e => setWord(e.target.value)} />
          </label>
          <label className="nv-fld">
            Wiederholen
            <input type="password" value={word2} maxLength={40} autoComplete="new-password" onChange={e => setWord2(e.target.value)} />
          </label>
        </div>
        <p className="pl-note">
          Mindestens 4 Zeichen. Tipp: Lass es dir von jemandem ausdenken und gib es nicht preis – dann kannst du wirklich
          nicht schummeln.
        </p>

        <button
          className="nv-btn pri pl-go hc-go"
          disabled={!ok}
          onClick={async () => {
            await askNotify();
            onStart({ ids, until, level, hash: await hashWord(word) });
          }}
        >
          <Lock size={16} />
          Hardcore starten ({ids.length})
        </button>
      </div>
    </div>
  );
}

// ---------- Codewort-Abfrage ----------
export function CodeDialog({ hash, onOk, onClose }: { hash: string; onOk: () => void; onClose: () => void }) {
  const [w, setW] = useState('');
  const [bad, setBad] = useState(false);
  return (
    <div className="nv-scrim center" onClick={onClose}>
      <form
        className="nv-ask hc-code"
        role="dialog"
        aria-modal="true"
        aria-label="Codewort eingeben"
        onClick={e => e.stopPropagation()}
        onSubmit={async e => {
          e.preventDefault();
          if ((await hashWord(w)) === hash) onOk();
          else {
            setBad(true);
            setW('');
          }
        }}
      >
        <p className="nv-ask-h">Hardcore abbrechen?</p>
        <p className="nv-ask-task">Nur mit dem Codewort, das du vorher festgelegt hast.</p>
        <input
          className="nv-in"
          type="password"
          autoFocus
          aria-label="Codewort"
          value={w}
          onChange={e => {
            setW(e.target.value);
            setBad(false);
          }}
        />
        {bad && <p className="hc-bad">Falsch. Dann wohl doch erledigen.</p>}
        <div className="nv-ask-btns">
          <button className="nv-btn pri" type="button" onClick={onClose}>
            Weitermachen
          </button>
          <button className="nv-btn" type="submit" disabled={!w}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- Hardcore-Leiste oben ----------
export function HardBar({
  hard,
  done,
  total,
  onEnd,
}: {
  hard: HardState;
  done: number;
  total: number;
  onEnd: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(h);
  }, []);
  const [hh, mm] = hard.until.split(':').map(Number);
  const end = new Date();
  end.setHours(hh, mm, 0, 0);
  const left = end.getTime() - now;
  const over = left <= 0;
  const h = Math.floor(Math.abs(left) / 3600000);
  const m = Math.floor((Math.abs(left) % 3600000) / 60000);
  return (
    <div className={'hc-bar' + (over ? ' over' : '')}>
      <div className="hc-bar-top">
        <span className="hc-badge">
          <Flame size={13} />
          Hardcore
        </span>
        <button className="hc-end" onClick={onEnd}>
          <Lock size={13} />
          Beenden
        </button>
      </div>
      <h1 className="hc-h">
        {done} von {total}
        <span> erledigt</span>
      </h1>
      <p className="hc-sub">
        {over ? 'Zeit abgelaufen – erledige es trotzdem.' : 'Bis ' + hard.until + ' · noch ' + (h ? h + ' h ' : '') + m + ' min'}
        {hard.leaves > 0 ? ' · ' + hard.leaves + '× rausgegangen' : ''}
      </p>
      <div className="hc-prog">
        <span style={{ width: (total ? (done / total) * 100 : 0) + '%' }} />
      </div>
    </div>
  );
}

// ---------- Tagesrückblick ----------
interface ReviewProps {
  dayLabel: string;
  done: { id: string; text: string }[];
  open: { id: string; text: string; movable: boolean }[];
  focusMin: number;
  note: string;
  onNote: (s: string) => void;
  onLater: (id: string) => void;
  onAllLater: () => void;
  onClose: () => void;
}

export function ReviewSheet(p: ReviewProps) {
  const n = p.done.length + p.open.length;
  const share = n ? p.done.length / n : 0;
  const head =
    n === 0
      ? 'Ein ruhiger Tag.'
      : share >= 1
        ? 'Alles geschafft.'
        : share >= 0.6
          ? 'Starker Tag.'
          : p.done.length > 0
            ? 'Ein Anfang ist gemacht.'
            : 'Morgen ist ein neuer Versuch.';
  const movable = p.open.filter(o => o.movable);
  return (
    <div className="nv-scrim center" onClick={p.onClose}>
      <div className="pl" role="dialog" aria-modal="true" aria-label="Tagesrückblick" onClick={e => e.stopPropagation()}>
        <header className="rt-head">
          <span className="rt-when">
            <Moon size={16} />
            {p.dayLabel}
          </span>
          <button className="nv-ib" aria-label="Schließen" onClick={p.onClose}>
            <X size={18} />
          </button>
        </header>
        <h2 className="rt-title">{head}</h2>
        <div className="rv-num">
          <b>{p.done.length}</b>
          <span>
            von {n} geschafft
            {p.focusMin > 0 ? ' · ' + p.focusMin + ' Min. im Fokus' : ''}
          </span>
        </div>
        <div className="rt-bar">
          <span style={{ width: share * 100 + '%' }} />
        </div>

        {p.done.length > 0 && (
          <div className="pl-np">
            <h4>Erledigt</h4>
            {p.done.map(d => (
              <p key={d.id} className="rv-done">
                <Check size={14} /> {d.text}
              </p>
            ))}
          </div>
        )}

        {p.open.length > 0 && (
          <div className="pl-np">
            <h4>Noch offen</h4>
            {p.open.map(o => (
              <div key={o.id} className="rv-open">
                <span>{o.text}</span>
                {o.movable && (
                  <button className="nv-cfoot-b" onClick={() => p.onLater(o.id)}>
                    <ArrowRight size={13} />
                    Morgen
                  </button>
                )}
              </div>
            ))}
            {movable.length > 1 && (
              <button className="nv-btn rv-all" onClick={p.onAllLater}>
                Alle {movable.length} auf morgen
              </button>
            )}
          </div>
        )}

        <label className="nv-fld">
          Was lief heute gut?
          <textarea
            rows={2}
            maxLength={280}
            defaultValue={p.note}
            placeholder="Ein Satz reicht."
            onBlur={e => p.onNote(e.target.value.trim())}
          />
        </label>
      </div>
    </div>
  );
}
