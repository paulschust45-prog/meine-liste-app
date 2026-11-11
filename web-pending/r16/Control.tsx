import { useEffect, useState } from 'react';
import { Camera, Check, Download, Lock, Plus, Power, ShieldCheck, Smartphone, X } from 'lucide-react';
import { guard, isNative, nativePlatform } from './native';
import type { GuardStatus } from './native';
import { photoUrl } from './Focus';
import { image } from '@appdeploy/client';
import { hashWord } from './Modes';

// Download-Adresse der Android-App (GitHub-Release, sobald eingerichtet)
export const APK_URL = 'https://github.com/paulschust45-prog/meine-liste-app/releases/download/latest/meine-liste.apk';

// ---------- Handykontrolle (Grundgerüst) ----------
// Die Web-App legt hier schon Regeln fest. Das echte Sperren von Apps
// übernimmt später die Handy-App (Android: Nutzungszugriff/Bedienungshilfe,
// iOS: Bildschirmzeit-API). Sie liest genau diese Einstellungen aus meta.control.
export type LockRule = 'top' | 'all' | 'proof';
export interface ControlPrefs {
  on: boolean;
  apps: string[];
  rule: LockRule;
  breaks: boolean;
  screen: LockScreen;
  // 1 = nur erinnern („Weiter“ möglich), 2 = sperren (Notfall-Pause), 3 = streng (nur Notfall-Code)
  strength: 1 | 2 | 3;
  // „Weiter“ auf dem Sperrbildschirm: unbegrenzt, höchstens 3× 5 Min. am Tag, oder gar nicht (nur Notfall-Pause)
  skip: 'free' | 'limited' | 'none';
  // Notfall-Code (nur als Hash gespeichert)
  codeHash: string;
  // Pop-up: erst nach X Minuten (0 = sofort), und To-dos darauf vorschlagen
  grace: 0 | 5 | 10;
  tips: boolean;
}
// Eigener Sperrbildschirm: Bild, Spruch, Wartezeit, Uhr
export interface LockScreen {
  img: string; // 'mo-…' Motivationsbild, 'own' eigenes Foto, 'none' dunkel
  quote: string;
  wait: number; // Sekunden, bevor „Trotzdem“/„Pause“ möglich ist
  time: boolean; // Uhrzeit und Restzeit zeigen
}
export const LOCK_IMAGES: { id: string; name: string }[] = [
  { id: 'mo-gym', name: 'Training' },
  { id: 'mo-work', name: 'Am Arbeiten' },
  { id: 'mo-run', name: 'Morgenlauf' },
  { id: 'mo-box', name: 'Vor dem Kampf' },
  { id: 'mo-climb', name: 'Gipfel' },
  { id: 'mo-study', name: 'Lernen' },
];
// Eigene Sprüche (keine echten Zitate)
export const LOCK_QUOTES = [
  'Der Feed läuft nicht weg. Deine Ziele schon.',
  'Fünf Minuten Arbeit schlagen fünfzig Minuten Scrollen.',
  'Wer du morgen bist, entscheidest du jetzt.',
  'Durchs Scrollen ist noch niemand stärker geworden.',
  'Erst liefern, dann belohnen.',
  'Halte dein Wort – auch dir selbst gegenüber.',
  'Disziplin heißt: machen, auch ohne Lust.',
  '„Später“ ist kein Tag der Woche.',
  'Das Training findet jetzt statt, nicht im Handy.',
  'Du hast dir das vorgenommen. Zieh es durch.',
];
export const DEFAULT_SCREEN: LockScreen = { img: 'mo-gym', quote: LOCK_QUOTES[0], wait: 10, time: true };
export const DEFAULT_CONTROL: ControlPrefs = {
  on: false,
  apps: [],
  rule: 'top',
  breaks: true,
  screen: { ...DEFAULT_SCREEN },
  strength: 2,
  skip: 'limited',
  codeHash: '',
  grace: 0,
  tips: true,
};
const normScreen = (raw: unknown): LockScreen => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCREEN };
  const r = raw as Record<string, unknown>;
  return {
    img: typeof r.img === 'string' && /^(mo-[a-z]+|own|none)$/.test(r.img) ? r.img : DEFAULT_SCREEN.img,
    quote: typeof r.quote === 'string' ? r.quote.slice(0, 140) : DEFAULT_SCREEN.quote,
    wait: [0, 5, 10, 30].includes(r.wait as number) ? (r.wait as number) : 10,
    time: r.time !== false,
  };
};
const OWN_KEY = 'ml-lock-own';
export const ownLockImage = (): string => {
  try {
    return localStorage.getItem(OWN_KEY) || '';
  } catch {
    return '';
  }
};

export function normControl(raw: unknown): ControlPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONTROL, apps: [], screen: { ...DEFAULT_SCREEN } };
  const r = raw as Record<string, unknown>;
  return {
    on: r.on === true,
    apps: Array.isArray(r.apps)
      ? r.apps
          .filter((a): a is string => typeof a === 'string')
          .map(a => a.slice(0, 24))
          .slice(0, 30)
      : [],
    rule: r.rule === 'all' || r.rule === 'proof' ? r.rule : 'top',
    breaks: r.breaks !== false,
    screen: normScreen(r.screen),
    strength: r.strength === 1 || r.strength === 3 ? r.strength : 2,
    skip: r.skip === 'free' || r.skip === 'none' ? r.skip : 'limited',
    codeHash: typeof r.codeHash === 'string' ? r.codeHash.slice(0, 80) : '',
    grace: r.grace === 5 || r.grace === 10 ? r.grace : 0,
    tips: r.tips !== false,
  };
}

const APPS = ['Instagram', 'TikTok', 'YouTube', 'Snapchat', 'X', 'Reddit', 'Netflix', 'Spiele'];
const RULES: [LockRule, string, string][] = [
  ['top', 'Bis die oberste Aufgabe erledigt ist', 'Eine Sache zuerst, dann ist das Handy wieder frei.'],
  ['all', 'Bis alles von heute erledigt ist', 'Streng: erst Feierabend, dann Feed.'],
  ['proof', 'Bis eine Aufgabe mit Foto bestätigt ist', 'Kein Abhaken ohne Beweis.'],
];

interface Props {
  prefs: ControlPrefs;
  onChange: (p: ControlPrefs) => void;
  openCount: number;
  topText: string;
}

// Vorschau-Bild laden (gleiche KI-Bilder wie im Backend)
function useLockImg(id: string) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setU(null);
    if (id === 'own') setU(ownLockImage() || null);
    else if (id.startsWith('mo-')) photoUrl(id).then(x => live && setU(x));
    return () => {
      live = false;
    };
  }, [id]);
  return u;
}

function LockThumb({ id, name, on, onPick }: { id: string; name: string; on: boolean; onPick: () => void }) {
  const u = useLockImg(id);
  return (
    <button
      className={'ls-thumb' + (on ? ' on' : '')}
      aria-pressed={on}
      onClick={onPick}
      style={u ? { backgroundImage: 'url("' + u + '")' } : undefined}
    >
      <span>{name}</span>
    </button>
  );
}

function LockEditor({ s, onChange }: { s: LockScreen; onChange: (s: LockScreen) => void }) {
  const bg = useLockImg(s.img);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(h);
  }, []);
  const own = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const img = await image.resizeIfNeeded(f, { maxDimension: 1080, quality: 0.72, mimeType: 'image/jpeg' });
      try {
        localStorage.setItem(OWN_KEY, 'data:' + img.mimeType + ';base64,' + img.data);
      } catch {
        /* Speicher voll */
      }
      onChange({ ...s, img: 'own' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="ls-prev" style={bg ? { backgroundImage: 'url("' + bg + '")' } : undefined}>
        <div className="ls-shade" />
        <div className="ls-in">
          {s.time && <p className="ls-time">{now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>}
          <p className="ls-badge">Gesperrt</p>
          <p className="ls-q">{s.quote || 'Erst die Aufgabe, dann das Handy.'}</p>
          <span className="ls-btn">Zurück zu Meine Liste</span>
          {s.wait > 0 && <span className="ls-wait">Pause erst nach {s.wait} Sek.</span>}
        </div>
      </div>

      <p className="pl-q">Bild</p>
      <div className="ls-grid">
        {LOCK_IMAGES.map(m => (
          <LockThumb key={m.id} id={m.id} name={m.name} on={s.img === m.id} onPick={() => onChange({ ...s, img: m.id })} />
        ))}
        <label className={'ls-thumb own' + (s.img === 'own' ? ' on' : '')}>
          <span>{busy ? 'Lädt …' : 'Eigenes Foto'}</span>
          <input type="file" accept="image/*" hidden onChange={e => own(e.target.files?.[0])} />
        </label>
        <button className={'ls-thumb dark' + (s.img === 'none' ? ' on' : '')} onClick={() => onChange({ ...s, img: 'none' })}>
          <span>Schlicht</span>
        </button>
      </div>

      <p className="pl-q">Spruch</p>
      <div className="ls-quotes">
        {LOCK_QUOTES.map(q => (
          <button key={q} className={'ls-quote' + (s.quote === q ? ' on' : '')} onClick={() => onChange({ ...s, quote: q })}>
            {q}
          </button>
        ))}
      </div>
      <label className="nv-fld">
        Eigener Spruch
        <input
          value={s.quote}
          maxLength={140}
          placeholder="Was soll dich stoppen?"
          onChange={e => onChange({ ...s, quote: e.target.value })}
        />
      </label>

      <p className="pl-q">Timer</p>
      <div className="rt-whens" role="group" aria-label="Wartezeit">
        {[0, 5, 10, 30].map(w => (
          <button key={w} aria-pressed={s.wait === w} onClick={() => onChange({ ...s, wait: w })}>
            {w === 0 ? 'Sofort' : w + ' Sek.'}
          </button>
        ))}
      </div>
      <p className="nv-note">So lange musst du den Sperrbildschirm ansehen, bevor „Trotzdem“ oder die Notfall-Pause geht.</p>
      <label className="nv-switch">
        <input type="checkbox" checked={s.time} onChange={e => onChange({ ...s, time: e.target.checked })} />
        Uhrzeit und Restzeit zeigen
      </label>
    </>
  );
}

// Notfall-Code festlegen: entsperrt am Handy bis Mitternacht
function CodeSetter({ hash, onSet }: { hash: string; onSet: (h: string) => void }) {
  const [edit, setEdit] = useState(!hash);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const ok = a.trim().length >= 4 && a.trim() === b.trim();
  if (!edit)
    return (
      <div className="ct-code set">
        <Lock size={16} />
        <span>Notfall-Code ist gesetzt</span>
        <button className="nv-link" onClick={() => setEdit(true)}>
          Ändern
        </button>
      </div>
    );
  return (
    <div className="ct-code">
      <p className="pl-q">Notfall-Code</p>
      <p className="nv-note">
        Damit schaltest du die Sperre im Notfall bis Mitternacht ab – direkt auf dem Sperrbildschirm. Mindestens 4 Zeichen.
      </p>
      <div className="nv-grid2">
        <input
          className="nv-in"
          type="password"
          inputMode="text"
          autoComplete="new-password"
          placeholder="Code"
          value={a}
          maxLength={40}
          onChange={e => setA(e.target.value)}
        />
        <input
          className="nv-in"
          type="password"
          inputMode="text"
          autoComplete="new-password"
          placeholder="Wiederholen"
          value={b}
          maxLength={40}
          onChange={e => setB(e.target.value)}
        />
      </div>
      <div className="ct-code-btns">
        <button
          className="nv-btn pri"
          disabled={!ok}
          onClick={async () => {
            onSet(await hashWord(a));
            setA('');
            setB('');
            setEdit(false);
          }}
        >
          Code speichern
        </button>
        {hash && (
          <button className="nv-btn" onClick={() => setEdit(false)}>
            Abbrechen
          </button>
        )}
      </div>
    </div>
  );
}

export default function ControlPage({ prefs, onChange: save, openCount, topText }: Props) {
  const [custom, setCustom] = useState('');
  // Jede Änderung wird sofort gespeichert – sichtbar bestätigt
  const [savedAt, setSavedAt] = useState(0);
  const onChange = (c: ControlPrefs) => {
    save(c);
    setSavedAt(Date.now());
  };
  useEffect(() => {
    if (!savedAt) return;
    const h = window.setTimeout(() => setSavedAt(0), 1800);
    return () => window.clearTimeout(h);
  }, [savedAt]);
  // Ausschalten: bei „Kein Weiter“ mit Notfall-Code nur mit Code
  const [offAsk, setOffAsk] = useState(false);
  const [offCode, setOffCode] = useState('');
  const [offErr, setOffErr] = useState('');
  const turnOff = async () => {
    if (prefs.codeHash && prefs.skip === 'none' && !offAsk) {
      setOffAsk(true);
      setOffErr('');
      return;
    }
    if (prefs.codeHash && prefs.skip === 'none') {
      if ((await hashWord(offCode)) !== prefs.codeHash) {
        setOffErr('Der Code stimmt nicht.');
        return;
      }
    }
    setOffAsk(false);
    setOffCode('');
    onChange({ ...prefs, on: false });
  };
  const native = isNative();
  const [st, setSt] = useState<GuardStatus | null>(null);
  const [installed, setInstalled] = useState<{ id: string; name: string }[]>([]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    const g = guard();
    if (!g) return;
    const load = () => {
      g.status().then(setSt).catch(() => undefined);
    };
    load();
    g.listApps()
      .then(r => setInstalled((r.apps || []).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => undefined);
    // Nach der Rückkehr aus den Einstellungen neu prüfen
    const v = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, []);
  useEffect(() => {
    const g = guard();
    if (!g) return;
    const h = window.setTimeout(() => g.status().then(setSt).catch(() => undefined), 700);
    return () => window.clearTimeout(h);
  }, [prefs]);
  const nameOf = (a: string) => installed.find(x => x.id === a)?.name || a;
  const toggleApp = (a: string) =>
    onChange({ ...prefs, apps: prefs.apps.includes(a) ? prefs.apps.filter(x => x !== a) : [...prefs.apps, a] });
  const addCustom = () => {
    const v = custom.trim();
    if (!v || prefs.apps.includes(v)) return;
    onChange({ ...prefs, apps: [...prefs.apps, v.slice(0, 24)] });
    setCustom('');
  };
  const locked = prefs.on && prefs.apps.length > 0 && openCount > 0;
  const all = native && installed.length
    ? Array.from(new Set([...prefs.apps, ...installed.map(x => x.id)])).slice(0, showAll ? 400 : 24)
    : Array.from(new Set([...APPS, ...prefs.apps]));

  return (
    <>
      <div className="ct-hero">
        <Smartphone size={22} />
        <div>
          <b>Erst die Aufgabe, dann das Handy.</b>
          <p>
            Ausgewählte Apps bleiben gesperrt, bis du erledigt hast, was ansteht. Gesperrt wird auf dem Handy mit der
            Android-App – hier legst du fest, was und wie.
          </p>
        </div>
      </div>

      {native ? (
        <div className={'ct-dev' + (st?.ready ? ' ok' : '')}>
          {st?.ready ? <ShieldCheck size={18} /> : <Lock size={18} />}
          <div>
            <b>{st?.ready ? 'Sperren ist erlaubt' : 'Noch ein Schritt'}</b>
            <p>
              {st?.ready
                ? 'Gesperrte Apps zeigen ab jetzt deinen Sperrbildschirm – auch nach einem Neustart.'
                : nativePlatform() === 'ios'
                  ? 'Erlaube den Bildschirmzeit-Zugriff, damit Meine Liste Apps sperren kann.'
                  : 'Schalte unter „Bedienungshilfen“ den Dienst „Meine Liste – Handykontrolle“ ein. Er liest keine Inhalte.'}
            </p>
            {!st?.ready && (
              <button className="nv-btn pri" onClick={() => guard()?.requestPermission().catch(() => undefined)}>
                Sperren erlauben
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="ct-dev">
          <Download size={18} />
          <div>
            <b>Die Handy-App sperrt wirklich</b>
            <p>
              Android: App installieren, „Sperren erlauben“ – fertig. iPhone ist vorbereitet und folgt.
            </p>
            {APK_URL ? (
              <a className="nv-btn pri" href={APK_URL}>
                <Download size={16} />
                Android-App laden
              </a>
            ) : (
              <p className="ct-soon">Download-Link folgt in Kürze.</p>
            )}
          </div>
        </div>
      )}

      <div className={'ct-power' + (prefs.on ? ' on' : '')}>
        <div className="ct-power-l">
          <Power size={20} />
          <div>
            <b>{prefs.on ? 'App-Sperre ist aktiv' : 'App-Sperre ist aus'}</b>
            <small>
              {!prefs.on
                ? native
                  ? 'Wähle unten Apps und tippe auf Aktivieren.'
                  : 'Aktivieren merkt die Sperre vor – sperren tut die Handy-App.'
                : !prefs.apps.length
                  ? 'Noch keine App ausgewählt.'
                  : native && st
                    ? st.rulesOn
                      ? 'Sperrt gerade ' + prefs.apps.length + (prefs.apps.length === 1 ? ' App.' : ' Apps.')
                      : openCount === 0
                        ? 'Gerade nichts gesperrt – heute ist alles erledigt.'
                        : 'Gerade nichts gesperrt – die Regel unten greift noch nicht.'
                    : prefs.apps.length + (prefs.apps.length === 1 ? ' App' : ' Apps') + ' ausgewählt.'}
            </small>
          </div>
        </div>
        {prefs.on ? (
          <button className="nv-btn" onClick={turnOff}>
            Deaktivieren
          </button>
        ) : (
          <button className="nv-btn pri" onClick={() => onChange({ ...prefs, on: true })}>
            Aktivieren
          </button>
        )}
      </div>
      {offAsk && (
        <form
          className="ct-offask"
          onSubmit={e => {
            e.preventDefault();
            turnOff();
          }}
        >
          <p className="nv-note">Du hast „Kein Weiter“ gewählt. Zum Ausschalten deinen Notfall-Code eingeben.</p>
          <div className="nv-form">
            <input
              className="nv-in"
              type="password"
              autoComplete="off"
              placeholder="Notfall-Code"
              value={offCode}
              autoFocus
              onChange={e => setOffCode(e.target.value)}
            />
            <button className="nv-btn pri" type="submit" disabled={!offCode.trim()}>
              OK
            </button>
          </div>
          {offErr && <p className="ct-err">{offErr}</p>}
          <button
            type="button"
            className="nv-link"
            onClick={() => {
              setOffAsk(false);
              setOffCode('');
            }}
          >
            Abbrechen
          </button>
        </form>
      )}
      {savedAt > 0 && (
        <p className="ct-saved" role="status">
          <Check size={13} strokeWidth={3} />
          Gespeichert
        </p>
      )}

      <h3 className="nv-h3">Diese Apps sperren</h3>
      <div className="nv-chips">
        {all.map(a => (
          <button key={a} className="nv-chip" aria-pressed={prefs.apps.includes(a)} onClick={() => toggleApp(a)}>
            {prefs.apps.includes(a) && native && <Check size={12} />}
            {native ? nameOf(a) : a}
            {prefs.apps.includes(a) && !APPS.includes(a) && !native && <X size={12} />}
          </button>
        ))}
      </div>
      {native && installed.length > 24 && (
        <button className="nv-link" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Weniger anzeigen' : 'Alle ' + installed.length + ' Apps anzeigen'}
        </button>
      )}
      {!native && (
      <form
        className="nv-form"
        onSubmit={e => {
          e.preventDefault();
          addCustom();
        }}
      >
        <input
          className="nv-in"
          placeholder="Andere App, z. B. Pinterest"
          aria-label="Andere App"
          value={custom}
          maxLength={24}
          onChange={e => setCustom(e.target.value)}
        />
        <button className="nv-btn pri" type="submit" disabled={!custom.trim()} aria-label="App hinzufügen">
          <Plus size={16} />
        </button>
      </form>
      )}

      <h3 className="nv-h3">Weiter-Knopf</h3>
      <div className="ct-rules" role="radiogroup" aria-label="Weiter-Knopf">
        {(
          [
            ['free', 'Weiter ohne Limit', 'Sperrbildschirm erscheint, nach dem Timer kannst du immer auf „Weiter“ tippen.'],
            ['limited', 'Weiter, höchstens 3× 5 Minuten', '„Weiter“ geht dreimal am Tag für je 5 Minuten, danach bleibt es zu.'],
            ['none', 'Kein Weiter', 'Nur die Notfall-Pause: dreimal am Tag 5 Minuten – oder dein Notfall-Code.'],
          ] as ['free' | 'limited' | 'none', string, string][]
        ).map(([k, n, d]) => (
          <button
            key={k}
            role="radio"
            aria-checked={prefs.skip === k}
            className="ct-rule"
            onClick={() => onChange({ ...prefs, skip: k, strength: k === 'free' ? 1 : 2, breaks: true })}
          >
            <span className="ct-dot" />
            <span>
              {n}
              <small>{d}</small>
            </span>
          </button>
        ))}
      </div>

      <CodeSetter hash={prefs.codeHash} onSet={h => onChange({ ...prefs, codeHash: h })} />

      <h3 className="nv-h3">Wann kommt das Pop-up?</h3>
      <div className="rt-whens" role="group" aria-label="Schonfrist">
        {(
          [
            [0, 'Sofort'],
            [5, 'Nach 5 Min.'],
            [10, 'Nach 10 Min.'],
          ] as [0 | 5 | 10, string][]
        ).map(([k, n]) => (
          <button key={k} aria-pressed={prefs.grace === k} onClick={() => onChange({ ...prefs, grace: k })}>
            {n}
          </button>
        ))}
      </div>
      <p className="nv-note">
        {prefs.grace
          ? 'Die App ist erst ' + prefs.grace + ' Minuten normal nutzbar, dann kommt dein Pop-up. Höchstens einmal pro Stunde.'
          : 'Das Pop-up kommt direkt beim Öffnen.'}
      </p>
      <label className="nv-switch">
        <input type="checkbox" checked={prefs.tips} onChange={e => onChange({ ...prefs, tips: e.target.checked })} />
        Auf dem Pop-up To-dos vorschlagen („Mach doch lieber …“ und etwas Leichtes)
      </label>

      <h3 className="nv-h3">Gesperrt bis …</h3>
      <div className="ct-rules" role="radiogroup" aria-label="Regel">
        {RULES.map(([k, n, d]) => (
          <button
            key={k}
            role="radio"
            aria-checked={prefs.rule === k}
            className="ct-rule"
            onClick={() => onChange({ ...prefs, rule: k })}
          >
            <span className="ct-dot" />
            <span>
              {n}
              <small>{d}</small>
            </span>
            {k === 'proof' && <Camera size={15} />}
          </button>
        ))}
      </div>

      <h3 className="nv-h3">Sperrbildschirm</h3>
      <LockEditor s={prefs.screen} onChange={sc => onChange({ ...prefs, screen: sc })} />



      <div className={'ct-now' + (locked ? ' on' : '')}>
        <Lock size={16} />
        {!prefs.on
          ? 'Noch nicht vorgemerkt.'
          : !prefs.apps.length
            ? 'Wähle oben mindestens eine App.'
            : openCount === 0
              ? 'Heute ist alles erledigt – nichts wäre gesperrt.'
              : 'Jetzt wären ' +
                prefs.apps.slice(0, 3).map(nameOf).join(', ') +
                (prefs.apps.length > 3 ? ' …' : '') +
                ' gesperrt' +
                (prefs.rule === 'top' && topText ? ' – bis „' + topText.slice(0, 40) + '“ erledigt ist.' : '.')}
      </div>
      <p className="nv-note">
        {native
          ? 'Telefon und Notruf bleiben immer erreichbar. Das Ausschalten kann keine App verhindern – nach dem Einschalten greift die Sperre sofort wieder.'
          : 'Deine Einstellungen werden mit deinem Konto gespeichert und von der Handy-App direkt übernommen.'}
      </p>
    </>
  );
}
