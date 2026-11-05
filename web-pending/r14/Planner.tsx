import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, PointerEvent as RPE, ReactNode } from 'react';
import { api, auth, image } from '@appdeploy/client';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  LayoutGrid,
  List,
  LogIn,
  LogOut,
  Moon,
  MoreHorizontal,
  Pin,
  Plus,
  Repeat,
  Lightbulb,
  Smartphone,
  Sparkles,
  Mic,
  RotateCcw,
  Settings,
  Sun,
  Tag,
  Target,
  Trash2,
  Undo2,
  X,
  Zap,
} from 'lucide-react';
import Extras from './Extras';
import Focus, { DEFAULT_FOCUS, FocusStats, normCover, normFocus, normStats } from './Focus';
import type { Cover, FocusPrefs, Stats } from './Focus';
import RitualSheet, { WhenIcon, defaultRituals, doneCount as ritualDone, normRLog, normRituals, slotNow, streakOf } from './Rituals';
import type { RLog, Ritual } from './Rituals';
import PlanAI, { DEFAULT_PLAN, normPlan } from './PlanAI';
import type { PlanItem, PlanProfile, PlanTask } from './PlanAI';
import ControlPage, { DEFAULT_CONTROL, normControl } from './Control';
import type { ControlPrefs } from './Control';
import {
  CodeDialog,
  HardBar,
  HardSetup,
  ModePicker,
  NO_BUMP,
  NO_HARD,
  ReviewSheet,
  goFullscreen,
  leaveFullscreen,
  normHard,
  normMode,
  notifyAway,
} from './Modes';
import type { HardState, Mode } from './Modes';
import { guard, packagesOf, pushLockScreen } from './native';
import { photoUrl } from './Focus';
import { ownLockImage } from './Control';
import { BackdropPicker, toneVars, useBackdrop } from './Backdrop';
import type { GuardRules } from './native';

// ---------- Typen ----------
type Rep = 'none' | 'daily' | 'weekly';
type View = 'list' | 'week' | 'matrix';
type Sync = 'local' | 'saving' | 'saved' | 'error';
type Prio = 'all' | 'imp' | 'urg';
type Page = 'main' | 'overview' | 'areas' | 'styles' | 'control' | 'settings' | 'rituals';

interface Task {
  id: string;
  text: string;
  date: string;
  time: string;
  imp: boolean;
  urg: boolean;
  rep: Rep;
  cat: string;
  done: Record<string, true>;
  pin?: Record<string, true>;
  styles?: string[];
  cover?: Cover;
  // Foto-Beweis: Aufgabe nur mit Foto abhakbar; proofs = Tage mit Foto
  proof?: boolean;
  proofs?: Record<string, true>;
  // „Später“: pro Tag nur einmal nach hinten schieben
  bump?: Record<string, true>;
  // Neustart: alte Aufgaben warten, bis die neuen erledigt sind
  parked?: boolean;
}

interface Area {
  id: string;
  name: string;
  color: string;
  kw: string[];
}

interface Style {
  id: string;
  name: string;
  kw: string[];
}

interface Meta {
  areas: Area[];
  styles: Style[];
  suggest: boolean;
  focus: FocusPrefs;
  stats: Stats;
  rituals: Ritual[];
  rlog: RLog;
  plan: PlanProfile;
  control: ControlPrefs;
  mode: Mode;
  hard: HardState;
  notes: Record<string, string>;
  fresh: { on: boolean; ids: string[]; since: string; until: string };
  v?: number;
}

// ---------- Konstanten ----------
const KEY = 'planner-v1';
const META_KEY = 'planner-meta-v1';
const COLORS = ['#5ee7ff', '#4dffb5', '#ff6ad5', '#5b8cff', '#b18cff', '#ff7a59', '#dfe6f5'];

// Eingebaute Erkennung der Standard-Bereiche
const RULES: Record<string, RegExp> = {
  Vinted:
    /vinted|paket|versand|versende|verpack|artikel|verkauf|foto|bilder|etikett|retoure|kleid|pullover|jacke|schuhe|hose|einstellen|hochladen|beschreibung|kleiderschrank/i,
  Marketing:
    /tiktok|video|content|mail|outreach|posten|posting|kunde|reel|insta|werbung|skript|shoot|schneiden|thumbnail|caption|hashtag|follower|reichweite|akquise|lead|branding|veröffentlich/i,
  Trading:
    /trading|trade|aktie|aktien|bot|depot|broker|börse|chart|etf|kurs|portfolio|dividende|krypto|bitcoin|order|backtest|signal/i,
};

const DEFAULT_AREAS: Area[] = [
  { id: 'Vinted', name: 'Vinted', color: '#4dffb5', kw: [] },
  { id: 'Marketing', name: 'Marketing', color: '#ff6ad5', kw: [] },
  { id: 'Trading', name: 'Trading', color: '#5b8cff', kw: [] },
  {
    id: 'Privat',
    name: 'Privat',
    color: '#dfe6f5',
    kw: ['müll', 'putzen', 'arzt', 'termin', 'einkauf', 'wäsche', 'geburtstag', 'familie', 'sport', 'gym', 'training', 'haushalt', 'wohnung', 'bank', 'versicherung', 'kochen', 'aufräumen'],
  },
];

const STYLE_SUGGEST: { name: string; kw: string[] }[] = [
  { name: 'Leicht', kw: [] },
  { name: 'Schwer', kw: [] },
  { name: 'Unterwegs', kw: ['anrufen', 'telefon', 'podcast', 'hören', 'whatsapp', 'nachricht', 'lesen'] },
  { name: 'Nur Handy', kw: ['tiktok', 'insta', 'whatsapp', 'foto', 'posten', 'anrufen'] },
  { name: 'Nur PC', kw: ['pc', 'laptop', 'excel', 'code', 'programm', 'schneiden', 'website', 'backtest', 'claude'] },
  { name: 'Schnell', kw: ['kurz', 'schnell'] },
  { name: 'Zuhause', kw: ['paket', 'putzen', 'wäsche', 'aufräumen', 'kochen'] },
  { name: 'Kreativ', kw: ['skript', 'idee', 'design', 'logo', 'video'] },
  { name: 'Abends ruhig', kw: ['lesen', 'tagebuch', 'journal', 'planen'] },
  { name: 'Morgens', kw: ['morgen', 'frühstück', 'sport'] },
  { name: 'Für mich', kw: ['spazieren', 'sport', 'lesen', 'meditieren', 'freunde'] },
];

// Standard-Stile (feste IDs, damit alle Geräte dieselben haben)
const DEFAULT_STYLE_DEFS: [string, string, string[]][] = [
  ['s-leicht', 'Leicht', ['kurz', 'schnell', 'mal eben', 'checken', 'beantworten']],
  ['s-schwer', 'Schwer', ['konzept', 'steuer', 'lernen', 'strategie', 'projekt']],
  ['s-unterwegs', 'Unterwegs', ['anrufen', 'telefon', 'podcast', 'hören', 'nachricht', 'whatsapp']],
  ['s-keinelust', 'Keine Lust', []],
  ['s-handy', 'Nur Handy', ['tiktok', 'insta', 'whatsapp', 'foto', 'posten']],
  ['s-pc', 'Nur PC', ['pc', 'laptop', 'excel', 'code', 'website', 'backtest', 'schneiden']],
];
const defaultStyles = (): Style[] => DEFAULT_STYLE_DEFS.map(([id, name, kw]) => ({ id, name, kw: [...kw] }));

// Beispiel-To-dos pro Stil (Schlüssel: Name klein, ohne Leerzeichen)
const EXAMPLES: Record<string, string[]> = {
  leicht: ['3 Nachrichten beantworten', 'Schreibtisch freiräumen', 'Termin für nächste Woche bestätigen', 'Wasserflasche auffüllen'],
  schwer: ['Konzept für das nächste Projekt schreiben', 'Steuerunterlagen sortieren', 'Eine Stunde am Stück lernen', 'Wochenplan aufstellen'],
  unterwegs: ['Vinted-Nachrichten beantworten', 'Sprachnachricht an jemanden schicken, den du lange nicht gehört hast', 'Podcast-Folge hören', 'Einkaufsliste schreiben'],
  keinelust: ['Nur 5 Minuten anfangen', 'Ein Glas Wasser trinken', 'Kurz rausgehen und durchatmen', 'Eine einzige Sache wegräumen', 'Lieblingssong hören, dann loslegen'],
  nurhandy: ['Fotos aussortieren', 'Kalender für morgen checken', 'Liegengebliebene Nachricht beantworten', 'Eine Content-Idee notieren'],
  nurpc: ['Desktop aufräumen', 'Rechnung schreiben', 'Backup machen', 'Lesezeichen sortieren'],
  kreativ: ['10 Ideen aufschreiben, ohne zu bewerten', 'Moodboard anlegen', 'Ein Skript skizzieren'],
  zuhause: ['Wäsche anstellen', 'Pakete packen', 'Kühlschrank checken'],
  schnell: ['Eine Mail beantworten', 'Müll rausbringen', 'Einen Anruf erledigen'],
  abendsruhig: ['Tagebuch: 3 Dinge, die heute gut waren', 'Handy weglegen, 10 Seiten lesen', 'Morgen vorbereiten: Tasche packen'],
  morgens: ['Bett machen', 'Ein Glas Wasser trinken', 'Tagesziel aufschreiben'],
  fürmich: ['20 Minuten spazieren', 'Jemanden anrufen, der dir guttut', 'Eine Pause ohne Bildschirm'],
};

// Sprichwörter und Zitate für das Verschieben
const LATER_QUOTES: [string, string][] = [
  ['Was du heute kannst besorgen, das verschiebe nicht auf morgen.', 'Sprichwort'],
  ['Morgen, morgen, nur nicht heute, sprechen immer träge Leute.', 'Christian Felix Weiße'],
  ['Es ist nicht wenig Zeit, die wir haben, sondern viel Zeit, die wir nicht nutzen.', 'Seneca'],
  ['Auch der längste Weg beginnt mit dem ersten Schritt.', 'nach Laozi'],
  ['Wer will, findet Wege. Wer nicht will, findet Gründe.', 'Sprichwort'],
];

const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const STOP = new Set([
  'und', 'oder', 'aber', 'noch', 'auch', 'dann', 'eine', 'einen', 'einem', 'einer', 'mit', 'für', 'von', 'nach', 'über', 'unter',
  'beim', 'bitte', 'machen', 'erledigen', 'checken', 'schauen', 'anschauen', 'nochmal', 'maybe', 'vielleicht', 'allgemein',
  'heute', 'morgen', 'jetzt', 'wieder', 'alle', 'allem', 'diese', 'dieser', 'dieses', 'etwas', 'sein', 'haben', 'werden',
  'sollte', 'muss', 'kann', 'durch', 'gegen', 'ohne', 'mich', 'dich', 'mein', 'meine', 'meinen', 'nicht', 'irgendwie', 'dass',
]);

// ---------- Hilfen ----------
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const mondayOf = (s: string) => addDays(s, -((parse(s).getDay() + 6) % 7));
const label = (s: string) => parse(s).getDate() + '. ' + MONTHS[parse(s).getMonth()];
const shortLabel = (s: string) => {
  const d = parse(s);
  return DAYS_SHORT[d.getDay()] + ', ' + d.getDate() + '. ' + MONTHS[d.getMonth()].slice(0, 3);
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Repariert falsch kodierte Umlaute (z. B. „StrauÃŸ“)
const fixText = (s: string) => {
  try {
    return /Ã|Â/.test(s) ? decodeURIComponent(escape(s)) : s;
  } catch {
    return s;
  }
};
const cv = (c: string) => ({ '--c': c }) as CSSProperties;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uniq = (a: string[]) => Array.from(new Set(a));
const splitKw = (s: string) =>
  uniq(
    s
      .split(',')
      .map(x => x.trim().toLowerCase())
      .filter(Boolean)
  ).slice(0, 40);

function occurs(t: Task, d: string): boolean {
  if (t.date === d) return true;
  if (d < t.date) return false;
  if (t.rep === 'daily') return true;
  if (t.rep === 'weekly') return parse(d).getDay() === parse(t.date).getDay();
  if (d > iso(new Date())) return false;
  const first = Object.keys(t.done).sort()[0];
  return !first || first >= d;
}

const score = (t: Task, d: string) => (t.pin?.[d] ? 10 : 0) + (t.imp ? 2 : 0) + (t.urg ? 1 : 0);
const sortOpen = (arr: Task[], d: string) =>
  arr
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        score(b.t, d) - score(a.t, d) ||
        (a.t.time || '99:99').localeCompare(b.t.time || '99:99') ||
        a.i - b.i
    )
    .map(x => x.t);
const ordered = (arr: Task[], d: string) => [
  ...sortOpen(arr.filter(t => !t.done[d]), d),
  ...arr.filter(t => t.done[d]),
];

function countKw(text: string, kw: string[]): number {
  let n = 0;
  for (const k of kw) {
    if (!k) continue;
    if (new RegExp('(^|[^a-zäöüß0-9])' + esc(k.toLowerCase()), 'i').test(text)) n++;
  }
  return n;
}

const fallbackId = (m: Meta) => (m.areas.find(a => a.id === 'Privat') ?? m.areas[0])?.id ?? 'Privat';

function guessArea(text: string, m: Meta): { id: string; hit: boolean } {
  let best = '';
  let top = 0;
  for (const a of m.areas) {
    let n = 0;
    const re = RULES[a.id];
    if (re) n += (text.match(new RegExp(re.source, 'gi')) || []).length;
    n += countKw(text, a.kw);
    if (a.name.length > 2 && new RegExp('(^|[^a-zäöüß])' + esc(a.name.toLowerCase()), 'i').test(text)) n += 2;
    if (n > top) {
      top = n;
      best = a.id;
    }
  }
  return { id: best || fallbackId(m), hit: top > 0 };
}

const guessStyles = (text: string, styles: Style[]) =>
  styles
    .filter(s => countKw(text, s.kw) > 0 || new RegExp('(^|[^a-zäöüß])' + esc(s.name.toLowerCase()), 'i').test(text))
    .map(s => s.id);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

function parseInput(raw: string, m: Meta) {
  let s = raw;
  let time = '';
  const tm = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (tm) {
    time = tm[1].padStart(2, '0') + ':' + tm[2];
    s = s.replace(tm[0], ' ');
  }
  // #bereich oder #stil
  let tagArea: string | undefined;
  const tagStyles: string[] = [];
  s = s.replace(/#([^\s#]+)/g, (_all, tag: string) => {
    const t = norm(tag);
    const a = m.areas.find(x => norm(x.name).startsWith(t));
    if (a && !tagArea) {
      tagArea = a.id;
      return ' ';
    }
    const st = m.styles.find(x => norm(x.name).startsWith(t));
    if (st) {
      tagStyles.push(st.id);
      return ' ';
    }
    return ' ' + tag + ' ';
  });
  const urg = /\bdringend\b|sofort|asap|eilig|überfällig|deadline|frist/i.test(s);
  const imp = /\bwichtig\b|steuer|rechnung|vertrag|kündig/i.test(s);
  s = s.replace(/\b(dringend|wichtig)\b/gi, ' ');
  let rep: Rep = 'none';
  if (/täglich/i.test(s)) rep = 'daily';
  else if (/wöchentlich/i.test(s)) rep = 'weekly';
  s = s.replace(/täglich|wöchentlich/gi, ' ');
  return { text: s.replace(/\s+/g, ' ').trim(), time, urg, imp, rep, tagArea, tagStyles };
}

function suggestName(text: string): string {
  const words = (text.toLowerCase().match(/[a-zäöüß]{4,}/g) || []).filter(w => !STOP.has(w));
  const w = words.sort((a, b) => b.length - a.length)[0];
  if (!w) return 'Neu';
  const n = w.length > 14 ? w.slice(0, 14) : w;
  return n.charAt(0).toUpperCase() + n.slice(1);
}
const wordCount = (s: string) => (s.match(/[a-zäöüß]{3,}/gi) || []).length;

// ---------- Speicher ----------
function load(): { tasks: Task[]; rev: number } {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r && Array.isArray(r.tasks)) return { tasks: r.tasks, rev: r.rev || 0 };
  } catch {
    /* leer */
  }
  return { tasks: [], rev: 0 };
}

function store(tasks: Task[], rev: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tasks, rev }));
  } catch {
    /* ignorieren */
  }
}

const defaultMeta = (): Meta => ({
  areas: DEFAULT_AREAS.map(a => ({ ...a, kw: [...a.kw] })),
  styles: defaultStyles(),
  suggest: true,
  focus: { ...DEFAULT_FOCUS },
  stats: {},
  rituals: defaultRituals(),
  rlog: {},
  plan: { ...DEFAULT_PLAN },
  control: { ...DEFAULT_CONTROL, apps: [] },
  mode: 'normal',
  hard: { ...NO_HARD, ids: [], addedProof: [] },
  notes: {},
  fresh: { on: false, ids: [], since: '', until: '' },
  v: 4,
});

function normFresh(raw: unknown): { on: boolean; ids: string[]; since: string; until: string } {
  if (!raw || typeof raw !== 'object') return { on: false, ids: [], since: '', until: '' };
  const r = raw as Record<string, unknown>;
  return {
    on: r.on === true,
    ids: Array.isArray(r.ids) ? r.ids.filter((x): x is string => typeof x === 'string').slice(0, 100) : [],
    since: typeof r.since === 'string' ? r.since : '',
    until: typeof r.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.until) ? r.until : '',
  };
}

// Mehrere Aufgaben in einem Satz: „Milch kaufen, Oma anrufen und Steuer machen“
function splitTasks(s: string): string[] {
  return s
    .split(/\s*(?:[,;]|\bund dann\b|\bdanach\b|\baußerdem\b)\s*/i)
    .flatMap(p => {
      const u = p.split(/\s+und\s+/i);
      return u.length > 1 && u.every(x => x.trim().split(/\s+/).length >= 2) ? u : [p];
    })
    .map(x => x.trim())
    .filter(x => x.length > 1);
}

// Vorschläge für einen Neustart (bewusst wenige)
const FRESH_IDEAS = ['Die eine wichtigste Sache für heute', '10 Minuten aufräumen', 'Eine liegengebliebene Nachricht beantworten'];

// Spracheingabe (Web Speech API, nur Typen die wir brauchen)
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

// Nächster Freitag (heute Freitag → nächste Woche)
function nextFriday(d: string): string {
  const [y, m, dd] = d.split('-').map(Number);
  const x = new Date(y, m - 1, dd);
  const add = ((5 - x.getDay() + 7) % 7) || 7;
  x.setDate(x.getDate() + add);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

function normNotes(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  const keys = Object.keys(raw as object)
    .filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort()
    .slice(-60);
  for (const k of keys) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) out[k] = v.slice(0, 280);
  }
  return out;
}

function normMeta(raw: unknown): Meta | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { areas?: unknown; styles?: unknown; suggest?: unknown };
  if (!Array.isArray(r.areas)) return null;
  const areas: Area[] = r.areas
    .filter(
      (a): a is Area =>
        !!a && typeof (a as Area).id === 'string' && typeof (a as Area).name === 'string'
    )
    .map(a => ({
      id: a.id,
      name: a.name.slice(0, 30),
      color: typeof a.color === 'string' ? a.color : COLORS[0],
      kw: Array.isArray(a.kw) ? a.kw.filter(k => typeof k === 'string') : [],
    }));
  if (!areas.length) return null;
  let styles: Style[] = Array.isArray(r.styles)
    ? r.styles
        .filter(
          (s): s is Style =>
            !!s && typeof (s as Style).id === 'string' && typeof (s as Style).name === 'string'
        )
        .map(s => ({
          id: s.id,
          name: s.name.slice(0, 30),
          kw: Array.isArray(s.kw) ? s.kw.filter(k => typeof k === 'string') : [],
        }))
    : [];
  // Einmalig die Standard-Stile ergänzen (ältere Daten ohne Version)
  const ver = (raw as { v?: unknown }).v;
  // Rituale: einmalig Morgen- und Abendroutine anlegen
  let rituals = normRituals((raw as { rituals?: unknown }).rituals);
  if ((typeof ver !== 'number' || ver < 4) && !rituals.length) rituals = defaultRituals();
  if (typeof ver !== 'number' || ver < 3) {
    const have = new Set(styles.map(s => s.name.toLowerCase()));
    styles = [...styles, ...defaultStyles().filter(s => !have.has(s.name.toLowerCase()))];
  }
  return {
    areas,
    styles,
    suggest: r.suggest !== false,
    focus: normFocus((raw as { focus?: unknown }).focus),
    stats: normStats((raw as { stats?: unknown }).stats),
    rituals,
    rlog: normRLog((raw as { rlog?: unknown }).rlog),
    plan: normPlan((raw as { plan?: unknown }).plan),
    control: normControl((raw as { control?: unknown }).control),
    mode: normMode((raw as { mode?: unknown }).mode),
    hard: normHard((raw as { hard?: unknown }).hard),
    notes: normNotes((raw as { notes?: unknown }).notes),
    fresh: normFresh((raw as { fresh?: unknown }).fresh),
    v: 4,
  };
}

function loadMeta(): Meta {
  try {
    const m = normMeta(JSON.parse(localStorage.getItem(META_KEY) || 'null'));
    if (m) return m;
  } catch {
    /* leer */
  }
  return defaultMeta();
}

function storeMeta(m: Meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignorieren */
  }
}

// Einmaliger Import der ursprünglichen Liste
const SEEDKEY = 'planner-seed-v2';
const SEED_DAY = '2026-11-01';
const SEED_ROWS: [string, string, boolean, boolean, boolean][] = [
  ['Vinted', 'neuer ebay account und maybe da diese telefonnummern ausprobieren + auch nochmal vinted versuchen', true, false, false],
  ['Vinted', 'neue verkaufsapps aus buch mal checken und da hochladen maybe', true, false, false],
  ['Vinted', 'pakete versenden', true, false, false],
  ['Marketing', 'auf jeden fall allgemien vor claude abo erstmal mit funktionen beschäftigen + alle info videos bei aaledieter transpripieren lassen', false, false, false],
  ['Marketing', 'dieser marketing typ von tiktok -> da alle videos anschauen und lernen', false, false, false],
  ['Trading', 'mit geesamten bots und allem was dazu gehört intensiv beschäftigen', false, false, false],
  ['Privat', 'mit apify beschärfiten', true, false, false],
  ['Privat', 'eine app entwickeln mit to dos und einwilligung geld zu bezahlen wenn man nicht alle erledigt', false, false, false],
  ['Privat', 'claude abwägen', false, true, true],
];

function seedInit(): { tasks: Task[]; rev: number } {
  const cur = load();
  try {
    if (localStorage.getItem(SEEDKEY)) return cur;
  } catch {
    return cur;
  }
  const day = SEED_DAY;
  const have = new Set(cur.tasks.map(t => t.text));
  const add = SEED_ROWS.filter(r => !have.has(r[1])).map(
    (r, i): Task => ({
      id: 'seed-' + i,
      text: r[1],
      date: day,
      time: '',
      imp: r[2],
      urg: r[3],
      rep: 'none',
      cat: r[0],
      done: r[4] ? { [day]: true as const } : {},
    })
  );
  const moved = cur.tasks.map(t => (t.id.startsWith('seed-') ? { ...t, date: SEED_DAY } : t));
  const tasks = [...moved, ...add];
  const rev = cur.tasks.length ? Date.now() : 0;
  store(tasks, rev);
  try {
    localStorage.setItem(SEEDKEY, '1');
  } catch {
    /* ignorieren */
  }
  return { tasks, rev };
}

// ---------- Komponente ----------
export default function Planner() {
  const today = iso(new Date());
  const init = useRef(seedInit());
  const [tasks, setTasks] = useState<Task[]>(init.current.tasks);
  const [meta, setMeta] = useState<Meta>(loadMeta);
  const tasksRef = useRef(tasks);
  const metaRef = useRef(meta);
  tasksRef.current = tasks;
  metaRef.current = meta;
  const revRef = useRef(init.current.rev);
  const signedIn = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const [user, setUser] = useState<string | null>(null);
  const [sync, setSync] = useState<Sync>('local');
  const [date, setDate] = useState(today);
  const [fArea, setFArea] = useState('all');
  const [fStyle, setFStyle] = useState('all');
  const [fPrio, setFPrio] = useState<Prio>('all');

  // Eingabe
  const [text, setText] = useState('');
  const [impOv, setImpOv] = useState<boolean | null>(null);
  const [urgOv, setUrgOv] = useState<boolean | null>(null);
  const [areaPick, setAreaPick] = useState('auto');
  const [styleOn, setStyleOn] = useState<string[]>([]);
  const [styleOff, setStyleOff] = useState<string[]>([]);

  const [edit, setEdit] = useState<Task | null>(null);
  const [sheet, setSheet] = useState<Page | null>(null);
  const [view, setView] = useState<View>('list');
  const [leaving, setLeaving] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ kind: 'done' | 'later' | 'wipe'; id: string; d: string; prev?: string } | null>(null);
  // Rad: zuletzt erledigte Aufgaben (bleiben blass oberhalb stehen)
  const [trail, setTrail] = useState<{ d: string; ids: string[] }>({ d: '', ids: [] });
  const [proofFor, setProofFor] = useState<Task | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [aiInfo, setAiInfo] = useState<string[] | null>(null);
  const hardOnRef = useRef(false);
  const [hardSetup, setHardSetup] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [bumpNo, setBumpNo] = useState<{ t: Task; q: number } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  // Wischen: rechts = auf morgen, links = später
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const dragRef = useRef<{ id: string; x0: number; y0: number; axis: '' | 'x' | 'y' } | null>(null);
  const suppress = useRef(false);
  const [swipes, setSwipes] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('planner-swipes2') || '0');
    } catch {
      return 0;
    }
  });
  // Eingabe im Plus-Knopf, Stile eingeklappt, Alles löschen
  const [composeOpen, setComposeOpen] = useState(false); // per Klick festgehalten
  const [composeHover, setComposeHover] = useState(false); // Maus/Finger am Plus
  const [composeFocus, setComposeFocus] = useState(false);
  const hoverRef = useRef(false);
  hoverRef.current = composeHover;
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const recRef = useRef<SpeechRec | null>(null);
  const [listening, setListening] = useState(false);
  const [freshAsk, setFreshAsk] = useState<false | 'info' | 'expired'>(false);
  const [freshSetup, setFreshSetup] = useState(false);
  const [clearing, setClearing] = useState(false);
  const composeRef = useRef<HTMLInputElement>(null);
  const [moodsOpen, setMoodsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [wipeAsk, setWipeAsk] = useState(false);
  const wiped = useRef<Task[]>([]);
  const [flash, setFlash] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusMin, setFocusMin] = useState<number | undefined>(undefined);
  const [askLater, setAskLater] = useState<{ t: Task; q: number } | null>(null);
  const [ritualId, setRitualId] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [sugg, setSugg] = useState<{ taskId: string; name: string; color: string; edited: boolean } | null>(null);
  const [newArea, setNewArea] = useState('');
  const [newStyle, setNewStyle] = useState('');
  const [bgChoice, setBgChoice, bgUrl, bgTone] = useBackdrop();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('planner-theme-v2') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('planner-theme-v2', theme);
    } catch {
      /* ignorieren */
    }
  }, [theme]);

  // Speichern (lokal + Sync)
  const persist = useCallback((nextTasks: Task[], nextMeta: Meta) => {
    setTasks(nextTasks);
    setMeta(nextMeta);
    tasksRef.current = nextTasks;
    metaRef.current = nextMeta;
    revRef.current = Date.now();
    store(nextTasks, revRef.current);
    storeMeta(nextMeta);
    if (!signedIn.current) return;
    setSync('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api
        .put('/api/tasks', { tasks: tasksRef.current, meta: metaRef.current })
        .then(() => setSync('saved'))
        .catch(() => setSync('error'));
    }, 600);
  }, []);
  const commit = (next: Task[]) => persist(next, metaRef.current);
  const commitMeta = (m: Meta) => persist(tasksRef.current, m);

  // Anmeldung + erster Abgleich
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const u = await auth.getUser();
        if (!live || !u) return;
        signedIn.current = true;
        setUser(fixText(u.name || u.email || 'Angemeldet'));
        setSync('saving');
        const { data } = await api.get('/api/tasks');
        if (!live) return;
        const remote: Task[] = Array.isArray(data.tasks) ? data.tasks : [];
        const rmeta = normMeta(data.meta);
        if ((data.rev || 0) > revRef.current) {
          setTasks(remote);
          tasksRef.current = remote;
          revRef.current = data.rev;
          store(remote, data.rev);
          if (rmeta) {
            setMeta(rmeta);
            metaRef.current = rmeta;
            storeMeta(rmeta);
          }
        } else if (tasksRef.current.length) {
          await api.put('/api/tasks', { tasks: tasksRef.current, meta: metaRef.current });
        }
        setSync('saved');
      } catch {
        if (live) setSync('error');
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Escape schließt Fenster
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (edit) setEdit(null);
      else if (ritualId) setRitualId(null);
      else if (sheet) setSheet(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [edit, sheet, ritualId]);

  // Kurzer Hinweis ausblenden
  useEffect(() => {
    if (!flash) return;
    const h = window.setTimeout(() => setFlash(''), 3000);
    return () => window.clearTimeout(h);
  }, [flash]);

  // Rückgängig-Hinweis ausblenden
  useEffect(() => {
    if (!undo) return;
    const h = window.setTimeout(() => setUndo(null), undo.kind === 'wipe' ? 12000 : 5000);
    return () => window.clearTimeout(h);
  }, [undo]);

  const signIn = () => {
    auth.signInWithRedirect().catch(() => setSync('error'));
  };
  const signOut = async () => {
    await auth.signOut();
    signedIn.current = false;
    setUser(null);
    setSync('local');
  };

  // ---------- Bereiche & Stile ----------
  const areaOf = (t: Task): Area =>
    meta.areas.find(a => a.id === t.cat) ?? { id: t.cat, name: t.cat || 'Ohne', color: '#8b94a9', kw: [] };
  const styleName = (id: string) => meta.styles.find(s => s.id === id)?.name;
  const nextColor = (m: Meta) =>
    COLORS.find(c => !m.areas.some(a => a.color === c)) ?? COLORS[m.areas.length % COLORS.length];

  const updArea = (id: string, patch: Partial<Area>) => {
    const m = metaRef.current;
    commitMeta({ ...m, areas: m.areas.map(a => (a.id === id ? { ...a, ...patch } : a)) });
  };
  const addArea = (name: string) => {
    const n = name.trim().slice(0, 30);
    if (!n) return;
    const m = metaRef.current;
    if (m.areas.some(a => a.name.toLowerCase() === n.toLowerCase())) return;
    commitMeta({ ...m, areas: [...m.areas, { id: 'a-' + uid(), name: n, color: nextColor(m), kw: [n.toLowerCase()] }] });
  };
  const delArea = (a: Area) => {
    const m = metaRef.current;
    if (m.areas.length <= 1) {
      window.alert('Mindestens ein Bereich muss bleiben.');
      return;
    }
    const rest = m.areas.filter(x => x.id !== a.id);
    const fb = rest.find(x => x.id === 'Privat') ?? rest[0];
    const n = tasksRef.current.filter(t => t.cat === a.id).length;
    if (!window.confirm('Bereich „' + a.name + '“ löschen?' + (n ? ' ' + n + ' Aufgaben wandern nach „' + fb.name + '“.' : ''))) return;
    persist(
      tasksRef.current.map(t => (t.cat === a.id ? { ...t, cat: fb.id } : t)),
      { ...m, areas: rest }
    );
    if (fArea === a.id) setFArea('all');
  };

  const updStyle = (id: string, patch: Partial<Style>) => {
    const m = metaRef.current;
    commitMeta({ ...m, styles: m.styles.map(s => (s.id === id ? { ...s, ...patch } : s)) });
  };
  const addStyle = (name: string, kw: string[] = []) => {
    const n = name.trim().slice(0, 30);
    if (!n) return;
    const m = metaRef.current;
    if (m.styles.some(s => s.name.toLowerCase() === n.toLowerCase())) return;
    commitMeta({ ...m, styles: [...m.styles, { id: 's-' + uid(), name: n, kw }] });
  };
  const delStyle = (s: Style) => {
    if (!window.confirm('Stil „' + s.name + '“ löschen?')) return;
    const m = metaRef.current;
    persist(
      tasksRef.current.map(t => (t.styles?.includes(s.id) ? { ...t, styles: t.styles.filter(x => x !== s.id) } : t)),
      { ...m, styles: m.styles.filter(x => x.id !== s.id) }
    );
    if (fStyle === s.id) setFStyle('all');
  };

  // ---------- Eingabe-Vorschau ----------
  const parsed = parseInput(text, meta);
  const auto = guessArea(parsed.text, meta);
  const areaId = areaPick !== 'auto' ? areaPick : parsed.tagArea ?? auto.id;
  const autoStyles = guessStyles(parsed.text, meta.styles);
  const pvStyles = uniq([...autoStyles.filter(id => !styleOff.includes(id)), ...styleOn, ...parsed.tagStyles]).filter(
    id => meta.styles.some(s => s.id === id)
  );
  const pvImp = impOv ?? parsed.imp;
  const pvUrg = urgOv ?? parsed.urg;
  const canAdd = parsed.text.length > 0;
  const pvArea = meta.areas.find(a => a.id === areaId);

  const toggleComposeStyle = (id: string) => {
    if (pvStyles.includes(id)) {
      setStyleOn(on => on.filter(x => x !== id));
      setStyleOff(off => uniq([...off, id]));
    } else {
      setStyleOn(on => uniq([...on, id]));
      setStyleOff(off => off.filter(x => x !== id));
    }
  };

  const resetCompose = () => {
    setText('');
    setImpOv(null);
    setUrgOv(null);
    setAreaPick('auto');
    setStyleOn([]);
    setStyleOff([]);
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    const id = uid();
    const t: Task = {
      id,
      text: parsed.text,
      date,
      time: parsed.time,
      imp: pvImp,
      urg: pvUrg,
      rep: parsed.rep,
      cat: areaId,
      done: {},
      styles: pvStyles,
    };
    commit([...tasksRef.current, t]);
    noteFresh(id);
    resetCompose();
    // Vorschlag für einen neuen Bereich
    const m = metaRef.current;
    if (areaPick === 'auto' && !parsed.tagArea && !auto.hit && m.suggest && wordCount(t.text) >= 2) {
      // Kein Nachfragen mehr: passt die Aufgabe zu einem Bereich, wird sie still zugeordnet
      if (signedIn.current) {
        api
          .post('/api/suggest-area', { text: t.text, areas: m.areas.map(a => a.name) })
          .then(({ data }) => {
            const fitName = String(data?.fits || '').toLowerCase();
            const fit = metaRef.current.areas.find(a => a.name.toLowerCase() === fitName);
            if (fit) {
              commit(tasksRef.current.map(x => (x.id === id ? { ...x, cat: fit.id } : x)));
              setSugg(s => (s && s.taskId === id ? null : s));
            } else if (data?.newArea) {
              setSugg(s =>
                s && s.taskId === id && !s.edited ? { ...s, name: String(data.newArea).slice(0, 24) } : s
              );
            }
          })
          .catch(() => undefined);
      }
    }
  };

  const acceptSugg = () => {
    if (!sugg) return;
    const name = sugg.name.trim().slice(0, 30);
    if (!name) return;
    const m = metaRef.current;
    const existing = m.areas.find(a => a.name.toLowerCase() === name.toLowerCase());
    const task = tasksRef.current.find(t => t.id === sugg.taskId);
    const area: Area = existing ?? {
      id: 'a-' + uid(),
      name,
      color: sugg.color,
      kw: uniq([name.toLowerCase(), suggestName(task?.text || '').toLowerCase()]).filter(k => k !== 'neu'),
    };
    persist(
      tasksRef.current.map(t => (t.id === sugg.taskId ? { ...t, cat: area.id } : t)),
      existing ? m : { ...m, areas: [...m.areas, area] }
    );
    setSugg(null);
  };

  // Fokuszeit speichern (pro Tag, die letzten 120 Tage)
  const logFocus = (ms: number, session: boolean, doneOne = false) => {
    const day = iso(new Date());
    const m = metaRef.current;
    const st: Stats = { ...m.stats };
    const cur = st[day] || { s: 0, n: 0, d: 0 };
    st[day] = { s: cur.s + Math.round(ms / 1000), n: cur.n + (session ? 1 : 0), d: cur.d + (doneOne ? 1 : 0) };
    const keys = Object.keys(st).sort();
    while (keys.length > 120) delete st[keys.shift() as string];
    commitMeta({ ...m, stats: st });
  };

  // ---------- Aktionen ----------
  // Abhaken: Aufgaben mit Foto-Beweis fragen erst nach dem Foto
  const complete = (t: Task) => {
    if (leaving.includes(t.id)) return;
    if (t.proof && !t.proofs?.[date]) {
      setProofFor(t);
      return;
    }
    finish(t);
  };
  const finish = (t: Task, extra: Partial<Task> = {}) => {
    if (leaving.includes(t.id)) return;
    const d = date;
    try {
      navigator.vibrate?.(12);
    } catch {
      /* egal */
    }
    // Rad: erledigte Aufgabe dreht nach oben und bleibt blass stehen
    setTrail(tr => ({ d, ids: [...(tr.d === d ? tr.ids : []).filter(x => x !== t.id), t.id].slice(-3) }));
    setLeaving(l => [...l, t.id]);
    window.setTimeout(() => {
      commit(
        tasksRef.current.map(x => (x.id === t.id ? { ...x, ...extra, done: { ...x.done, [d]: true as const } } : x))
      );
      setLeaving(l => l.filter(id => id !== t.id));
      setUndo({ kind: 'done', id: t.id, d });
    }, 520);
  };
  const submitProof = async (f: File | undefined) => {
    const t = proofFor;
    if (!t || !f) return;
    const d = date;
    setProofBusy(true);
    try {
      if (user) {
        const img = await image.resizeIfNeeded(f, { maxDimension: 1280, quality: 0.75, mimeType: 'image/jpeg' });
        await api.post('/api/proof', { taskId: t.id, day: d, data: img.data, mimeType: img.mimeType });
      }
      setProofFor(null);
      finish(t, { proofs: { ...(t.proofs || {}), [d]: true } });
      if (!user) setFlash('Foto geprüft. Gespeichert wird es erst, wenn du angemeldet bist.');
    } catch {
      setFlash('Foto konnte nicht hochgeladen werden. Versuch es noch einmal.');
    } finally {
      setProofBusy(false);
    }
  };

  // Auf morgen verschieben
  const later = (t: Task) => {
    if (leaving.includes(t.id)) return;
    if (t.rep !== 'none') {
      setFlash('Wiederholungen lassen sich nicht verschieben.');
      return;
    }
    const d = date;
    const prev = t.date;
    setLeaving(l => [...l, t.id]);
    window.setTimeout(() => {
      commit(
        tasksRef.current.map(x => {
          if (x.id !== t.id) return x;
          const pin = { ...(x.pin || {}) };
          delete pin[d];
          return { ...x, date: addDays(d, 1), pin };
        })
      );
      setLeaving(l => l.filter(id => id !== t.id));
      setUndo({ kind: 'later', id: t.id, d, prev });
    }, 480);
  };

  // „Später“: einmal pro Tag hinter die nächste Aufgabe
  const bump = (t: Task) => {
    if (t.bump?.[date]) {
      setBumpNo({ t, q: Math.floor(Math.random() * NO_BUMP.length) });
      return;
    }
    commit(tasksRef.current.map(x => (x.id === t.id ? { ...x, bump: { ...(x.bump || {}), [date]: true as const } } : x)));
    setFlash('Einmal nach hinten. Danach ist es dran.');
  };

  // Wischen auf der obersten Karte
  const swipeDown = (t: Task) => (e: RPE) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragRef.current = { id: t.id, x0: e.clientX, y0: e.clientY, axis: '' };
  };
  const swipeMove = (e: RPE) => {
    const g = dragRef.current;
    if (!g) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.axis) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        g.axis = 'x';
        try {
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } catch {
          /* egal */
        }
      } else if (Math.abs(dy) > 8) {
        dragRef.current = null;
        return;
      } else return;
    }
    setDrag({ id: g.id, dx: hardOnRef.current ? Math.min(0, dx) : dx });
  };
  const swipeUp = (t: Task) => (e: RPE) => {
    const g = dragRef.current;
    dragRef.current = null;
    if (!g || g.axis !== 'x') return;
    const dx = e.clientX - g.x0;
    const w = (e.currentTarget as HTMLElement).offsetWidth || 300;
    const lim = Math.min(110, w * 0.3);
    setDrag(null);
    suppress.current = true;
    window.setTimeout(() => {
      suppress.current = false;
    }, 80);
    if (dx > lim && !hardOnRef.current) askPostpone(t);
    else if (dx < -lim) bump(t);
    else return;
    const n = swipes + 1;
    setSwipes(n);
    try {
      localStorage.setItem('planner-swipes2', String(n));
    } catch {
      /* egal */
    }
  };
  const swipeCancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  // Spracheingabe: langes Drücken auf +
  const startVoice = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const C = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!C) {
      setFlash('Spracheingabe geht in diesem Browser leider nicht. In Chrome oder Safari klappt es.');
      return;
    }
    try {
      navigator.vibrate?.(25);
    } catch {
      /* egal */
    }
    const r = new C();
    r.lang = 'de-DE';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = ev => {
      let out = '';
      for (let i = 0; i < ev.results.length; i++) out += ev.results[i][0].transcript;
      setText(out.slice(0, 200));
    };
    r.onend = () => {
      setListening(false);
      recRef.current = null;
      window.setTimeout(() => composeRef.current?.focus(), 30);
    };
    r.onerror = () => {
      setListening(false);
      recRef.current = null;
      setFlash('Nicht verstanden. Halte + gedrückt und sprich noch einmal.');
    };
    recRef.current = r;
    setComposeOpen(true);
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  };
  const pressStart = () => {
    longPressed.current = false;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      startVoice();
    }, 550);
  };
  const pressEnd = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  // Neustart: alte Aufgaben parken, neue zuerst
  const startFresh = (until: string) => {
    setFreshSetup(false);
    setSheet(null);
    setClearing(true);
    window.setTimeout(() => {
      commit(tasksRef.current.map(t => (Object.keys(t.done).length && t.rep === 'none' ? t : { ...t, parked: true })));
      commitMeta({ ...metaRef.current, fresh: { on: true, ids: [], since: today, until } });
      setClearing(false);
      setTrail({ d: '', ids: [] });
      setFlash('Frische Liste. Die alten Aufgaben warten, bis du die neuen geschafft hast.');
      setComposeOpen(true);
      window.setTimeout(() => composeRef.current?.focus(), 60);
    }, 700);
  };
  const endFresh = (won: boolean) => {
    commit(
      tasksRef.current.map(t => {
        if (!t.parked) return t;
        const c = { ...t };
        delete c.parked;
        return c;
      })
    );
    commitMeta({ ...metaRef.current, fresh: { on: false, ids: [], since: '', until: '' } });
    setFreshAsk(false);
    setFlash(won ? 'Stark. Deine alten Aufgaben sind wieder da.' : 'Die alten Aufgaben sind zurück.');
  };
  const noteFresh = (id: string) => {
    const m = metaRef.current;
    if (m.fresh.on) commitMeta({ ...m, fresh: { ...m.fresh, ids: [...m.fresh.ids, id] } });
  };
  const addMany = (parts: string[]) => {
    const m = metaRef.current;
    const made: Task[] = parts.map(part => {
      const p = parseInput(part, m);
      return {
        id: uid(),
        text: p.text,
        date,
        time: p.time,
        imp: p.imp,
        urg: p.urg,
        rep: p.rep,
        cat: p.tagArea ?? guessArea(p.text, m).id,
        done: {},
        styles: uniq([...guessStyles(p.text, m.styles), ...p.tagStyles]),
      };
    });
    commit([...tasksRef.current, ...made]);
    if (m.fresh.on) commitMeta({ ...m, fresh: { ...m.fresh, ids: [...m.fresh.ids, ...made.map(t => t.id)] } });
    resetCompose();
    setFlash(made.length + ' Aufgaben eingetragen.');
  };
  const addFresh = (txt: string) => {
    const t: Task = {
      id: uid(),
      text: txt,
      date: today,
      time: '',
      imp: false,
      urg: false,
      rep: 'none',
      cat: guessArea(txt, metaRef.current).id,
      done: {},
    };
    commit([...tasksRef.current, t]);
    noteFresh(t.id);
  };

  // Alle Aufgaben löschen (mit Rückgängig)
  const wipeAll = () => {
    wiped.current = tasksRef.current;
    commit([]);
    setWipeAsk(false);
    setSheet(null);
    setUndo({ kind: 'wipe', id: '', d: '' });
  };

  // Mehrere Aufgaben auf morgen (Tagesrückblick)
  const moveTomorrow = (ids: string[]) => {
    const d = date;
    commit(
      tasksRef.current.map(x => {
        if (!ids.includes(x.id) || x.rep !== 'none') return x;
        const pin = { ...(x.pin || {}) };
        delete pin[d];
        return { ...x, date: addDays(d, 1), pin };
      })
    );
    setFlash(ids.length === 1 ? 'Auf morgen verschoben.' : ids.length + ' Aufgaben auf morgen verschoben.');
  };

  // Hardcore
  const startHard = (h: { ids: string[]; until: string; level: 1 | 2 | 3; hash: string }) => {
    const added = tasksRef.current.filter(t => h.ids.includes(t.id) && !t.proof).map(t => t.id);
    commit(tasksRef.current.map(t => (added.includes(t.id) ? { ...t, proof: true } : t)));
    commitMeta({
      ...metaRef.current,
      mode: 'hardcore',
      hard: { on: true, day: today, ids: h.ids, until: h.until, level: h.level, hash: h.hash, leaves: 0, started: Date.now(), addedProof: added },
    });
    setHardSetup(false);
    setSheet(null);
    setDate(today);
    if (h.level >= 2) goFullscreen();
  };
  const endHard = (won: boolean) => {
    const h = metaRef.current.hard;
    commit(tasksRef.current.map(t => (h.addedProof.includes(t.id) ? { ...t, proof: false } : t)));
    commitMeta({ ...metaRef.current, mode: 'normal', hard: { ...NO_HARD, ids: [], addedProof: [] } });
    leaveFullscreen();
    setFlash(won ? 'Geschafft. Alles erledigt und belegt.' : 'Strenge „Hart“ beendet.');
  };
  const pickMode = (m: Mode) => {
    const cur = metaRef.current;
    if (cur.mode === 'hardcore' && cur.hard.on) {
      if (m !== 'hardcore') setCodeOpen(true);
      return;
    }
    if (m === 'hardcore') {
      setSheet(null);
      setHardSetup(true);
      return;
    }
    commitMeta({ ...cur, mode: m });
    setFlash(m === 'fokus' ? 'Fokussiert: Start heißt ab jetzt nur noch diese Aufgabe.' : 'Locker.');
  };

  // Welche KI-Reserven sind hinterlegt? (nur Namen, nie Schlüssel)
  useEffect(() => {
    if (!user || sheet !== 'settings' || aiInfo) return;
    api
      .get('/api/ai-status')
      .then(r => setAiInfo(Array.isArray(r.data?.fallbacks) ? r.data.fallbacks : []))
      .catch(() => setAiInfo([]));
  }, [user, sheet, aiInfo]);

  // Am Handy: mit dem Finger an das Plus wischen öffnet das Feld
  useEffect(() => {
    const inside = (x: number, y: number, el: Element | null, pad: number) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const form = document.querySelector('.nv-compose');
      const on = inside(t.clientX, t.clientY, form, 14);
      if (on !== hoverRef.current) setComposeHover(on);
    };
    const onEnd = (e: TouchEvent) => {
      if (!hoverRef.current) return;
      const t = e.changedTouches[0];
      const inp = composeRef.current;
      if (t && inp && inside(t.clientX, t.clientY, inp, 10)) {
        setComposeOpen(true);
        inp.focus();
      }
      setComposeHover(false);
    };
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, []);

  // Taste „/“ springt ins Eingabefeld
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== '/' || /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      e.preventDefault();
      setComposeOpen(true);
      window.setTimeout(() => composeRef.current?.focus(), 30);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // KI-Planer: Aufgaben für den Zeitraum und Übernahme des Plans
  const planPool = (mode: 'day' | 'week', d: string): PlanTask[] => {
    const end = mode === 'week' ? addDays(d, 6) : d;
    const list =
      mode === 'day'
        ? tasksRef.current.filter(t => occurs(t, d) && !t.done[d])
        : tasksRef.current.filter(t => t.rep === 'none' && !Object.keys(t.done).length && t.date <= end);
    return list.slice(0, 60).map(t => ({
      id: t.id,
      text: t.text,
      imp: t.imp,
      urg: t.urg,
      time: t.time,
      area: areaOf(t).name,
      styles: (t.styles || []).map(id => styleName(id) || '').filter(Boolean),
      overdue: t.date < d ? Math.round((parse(d).getTime() - parse(t.date).getTime()) / 86400000) : 0,
      rep: t.rep,
    }));
  };
  const applyPlan = (items: PlanItem[]) => {
    const map = new Map(items.map(i => [i.id, i]));
    commit(
      tasksRef.current.map(t => {
        const it = map.get(t.id);
        if (!it) return t;
        return { ...t, time: it.start, date: t.rep === 'none' ? it.date : t.date };
      })
    );
    setFlash('Plan übernommen. Erinnerungen kommen zu den neuen Uhrzeiten.');
  };

  // Rituale
  const toggleStep = (rid: string, sid: string) => {
    const day = iso(new Date());
    const m = metaRef.current;
    const dayLog = { ...(m.rlog[day] || {}) };
    const cur = dayLog[rid] || [];
    dayLog[rid] = cur.includes(sid) ? cur.filter(x => x !== sid) : [...cur, sid];
    const rlog: RLog = { ...m.rlog, [day]: dayLog };
    const keys = Object.keys(rlog).sort();
    while (keys.length > 120) delete rlog[keys.shift() as string];
    commitMeta({ ...m, rlog });
  };
  const updRitual = (r: Ritual) => {
    const m = metaRef.current;
    commitMeta({ ...m, rituals: m.rituals.map(x => (x.id === r.id ? r : x)) });
  };
  const addRitual = () => {
    const m = metaRef.current;
    const r: Ritual = { id: 'r-' + uid(), name: 'Neues Ritual', when: 'any', steps: [] };
    commitMeta({ ...m, rituals: [...m.rituals, r] });
    setSheet(null);
    setRitualId(r.id);
  };
  const delRitual = (id: string) => {
    const m = metaRef.current;
    commitMeta({ ...m, rituals: m.rituals.filter(x => x.id !== id) });
    setRitualId(null);
  };

  // Vor dem Verschieben kurz nachfragen
  const askPostpone = (t: Task) => {
    if (t.rep !== 'none') {
      setFlash('Wiederholungen lassen sich nicht verschieben.');
      return;
    }
    setAskLater({ t, q: Math.floor(Math.random() * LATER_QUOTES.length) });
  };

  // Beispiel-To-do übernehmen
  const addExample = (text: string, styleId: string) => {
    const t: Task = {
      id: uid(),
      text,
      date,
      time: '',
      imp: false,
      urg: false,
      rep: 'none',
      cat: guessArea(text, metaRef.current).id,
      done: {},
      styles: [styleId],
    };
    commit([...tasksRef.current, t]);
  };

  const doUndo = () => {
    if (!undo) return;
    if (undo.kind === 'wipe') {
      commit([...wiped.current, ...tasksRef.current]);
      wiped.current = [];
      setUndo(null);
      return;
    }
    commit(
      tasksRef.current.map(x => {
        if (x.id !== undo.id) return x;
        if (undo.kind === 'later') return { ...x, date: undo.prev || x.date };
        const done = { ...x.done };
        delete done[undo.d];
        return { ...x, done };
      })
    );
    setUndo(null);
  };

  const toggle = (id: string, d: string) =>
    commit(
      tasksRef.current.map(t => {
        if (t.id !== id) return t;
        const done = { ...t.done };
        if (done[d]) delete done[d];
        else done[d] = true;
        return { ...t, done };
      })
    );

  const togglePin = (id: string, d: string) => {
    const t0 = tasksRef.current.find(t => t.id === id);
    if (!t0) return;
    if (!t0.pin?.[d]) {
      const pinned = tasksRef.current.filter(t => occurs(t, d) && t.pin?.[d] && !t.done[d]).length;
      if (pinned >= 3) {
        window.alert('Schon 3 Aufgaben nach oben geholt. Löse erst eine davon.');
        return;
      }
    }
    commit(
      tasksRef.current.map(t => {
        if (t.id !== id) return t;
        const pin = { ...(t.pin || {}) };
        if (pin[d]) delete pin[d];
        else pin[d] = true;
        return { ...t, pin };
      })
    );
  };

  const remove = (t: Task) => {
    const msg = t.rep !== 'none' ? 'Diese Wiederholung für alle Tage löschen?' : 'Aufgabe löschen?';
    if (!window.confirm(msg)) return false;
    commit(tasksRef.current.filter(x => x.id !== t.id));
    return true;
  };

  const saveEdit = (e: FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    const txt = edit.text.trim();
    if (!txt) return;
    commit(
      tasksRef.current.map(t =>
        t.id === edit.id
          ? { ...edit, text: txt, date: edit.date || t.date, time: /^\d\d:\d\d$/.test(edit.time) ? edit.time : '' }
          : t
      )
    );
    setEdit(null);
  };

  // ---------- Ableitungen ----------
  const matches = (t: Task) =>
    (fArea === 'all' || t.cat === fArea) &&
    (fStyle === 'all' || (t.styles || []).includes(fStyle)) &&
    (fPrio === 'all' || (fPrio === 'imp' ? t.imp : t.urg));
  const dayList = (d: string) => tasks.filter(t => !t.parked && occurs(t, d)).filter(matches);

  const all = dayList(date);
  const hardOn = meta.mode === 'hardcore' && meta.hard.on;
  hardOnRef.current = hardOn;
  const sorted = sortOpen(all.filter(t => !t.done[date]), date).filter(t => !hardOn || meta.hard.ids.includes(t.id));
  // Später: geschobene Aufgabe rutscht hinter die nächste
  const open = [...sorted];
  for (let i = 0; i < open.length - 1; i++) {
    if (open[i].bump?.[date] && !open[i + 1].bump?.[date]) {
      [open[i], open[i + 1]] = [open[i + 1], open[i]];
      i++;
    }
  }
  const trailIds = trail.d === date ? trail.ids : [];
  const pastRows = trailIds
    .map(id => tasks.find(t => t.id === id))
    .filter((t): t is Task => !!t && (!!t.done[date] || leaving.includes(t.id)))
    .slice(-2);
  const live = open.filter(t => !(leaving.includes(t.id) && trailIds.includes(t.id)));
  const laterOut = live.filter(t => leaving.includes(t.id)).length;
  const stair = live.slice(0, 4 + laterOut);
  let k = 0;
  const steps = stair.map(t => (leaving.includes(t.id) ? { t, s: -1 } : { t, s: k++ }));
  const topTask = steps.find(x => x.s === 0)?.t;
  const dxOf = (t: Task) => (drag && drag.id === t.id ? drag.dx : 0);
  const restCount = Math.max(0, open.length - leaving.length - 3);
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Gute Nacht' : hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : hour < 22 ? 'Guten Abend' : 'Gute Nacht';
  const firstName = user && !user.includes('@') ? user.split(' ')[0] : '';
  const slot = slotNow(hour);
  const nowRitual =
    date === today && slot
      ? meta.rituals.find(r => r.when === slot && r.steps.length > 0 && ritualDone(r, meta.rlog, today) < r.steps.length)
      : undefined;
  const openRitual = ritualId ? meta.rituals.find(r => r.id === ritualId) : undefined;
  const ideas =
    fStyle !== 'all'
      ? (EXAMPLES[norm(styleName(fStyle) || '')] || []).filter(x => !tasks.some(t => t.text === x)).slice(0, 4)
      : [];
  const focusTask = focusId ? tasks.find(t => t.id === focusId) : undefined;
  const focusNext = open.find(t => t.id !== focusId && !leaving.includes(t.id));
  const doneCount = all.filter(t => t.done[date]).length;
  const total = all.length;
  const shown = composeOpen || composeHover || composeFocus || !!text || listening;
  const hourNow = new Date().getHours();
  // Neustart: sind alle neuen erledigt, kommen die alten zurück
  const parkedCount = tasks.filter(t => t.parked).length;
  const freshAllDone =
    meta.fresh.on &&
    meta.fresh.ids.length > 0 &&
    meta.fresh.ids.every(id => {
      const t = tasks.find(x => x.id === id);
      return !t || Object.keys(t.done).length > 0;
    });
  const freshExpired = meta.fresh.on && !!meta.fresh.until && today > meta.fresh.until;
  useEffect(() => {
    if (freshExpired && !freshAsk) setFreshAsk('expired');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshExpired]);
  const multi = text.length > 6 ? splitTasks(text) : [];
  const tod = hourNow < 5 ? 'night' : hourNow < 11 ? 'morning' : hourNow < 17 ? 'day' : hourNow < 22 ? 'evening' : 'night';
  useEffect(() => {
    if (freshAllDone && leaving.length === 0) endFresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshAllDone, leaving.length]);
  // Hardcore: Fortschritt, automatisches Ende, Verlassen bemerken
  const hardTasks = hardOn ? tasks.filter(t => meta.hard.ids.includes(t.id)) : [];
  const hardDone = hardTasks.filter(t => t.done[meta.hard.day]).length;
  useEffect(() => {
    if (hardOn && hardTasks.length > 0 && hardDone >= hardTasks.length && leaving.length === 0) endHard(true);
    if (hardOn && hardTasks.length === 0) endHard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardOn, hardDone, hardTasks.length, leaving.length]);
  useEffect(() => {
    if (!hardOn) return;
    const h = () => {
      if (document.visibilityState !== 'hidden') return;
      const m = metaRef.current;
      commitMeta({ ...m, hard: { ...m.hard, leaves: m.hard.leaves + 1 } });
      notifyAway('Hardcore läuft', 'Noch ' + (hardTasks.length - hardDone) + ' offen. Zurück und erledigen.');
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardOn, hardDone, hardTasks.length]);

  // Handy-App: Sperr-Regeln an das Gerät geben (nur in der Android-/iPhone-App aktiv)
  const guardHash = useRef('');
  const doneTodayN = tasks.filter(t => !t.parked && occurs(t, today) && t.done[today]).length;
  const openTodayN = tasks.filter(t => !t.parked && occurs(t, today) && !t.done[today]).length;
  const proofToday = tasks.some(t => t.proofs?.[today]);
  const guardKey = JSON.stringify([meta.control, hardOn, meta.hard.level, meta.hard.hash, hardTasks.length - hardDone, openTodayN, doneTodayN, proofToday]);
  useEffect(() => {
    const g = guard();
    if (!g) return;
    const c = meta.control;
    const pk = packagesOf(c.apps);
    let r: GuardRules;
    if (hardOn) {
      r = {
        on: pk.length > 0,
        apps: pk,
        level: meta.hard.level,
        pause: false,
        skip: 'none',
        hash: meta.hard.hash,
        message: 'Hardcore läuft: noch ' + (hardTasks.length - hardDone) + ' Aufgaben bis ' + meta.hard.until + '.',
      };
    } else {
      const locked =
        c.on &&
        pk.length > 0 &&
        openTodayN > 0 &&
        (c.rule === 'all' ? true : c.rule === 'top' ? doneTodayN === 0 : !proofToday);
      r = {
        on: locked,
        apps: pk,
        level: c.skip === 'free' ? 1 : 2,
        pause: c.skip !== 'free',
        skip: c.skip,
        hash: c.codeHash,
        message:
          c.rule === 'all'
            ? 'Noch ' + openTodayN + ' Aufgaben offen. Erst die, dann das Handy.'
            : c.rule === 'proof'
              ? 'Erst eine Aufgabe mit Foto bestätigen.'
              : 'Erst die erste Aufgabe des Tages erledigen.',
      };
    }
    const off = { ...r, on: false, hash: guardHash.current };
    g.setRules(r.on ? r : off).catch(() => undefined);
    guardHash.current = r.on ? r.hash : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardKey]);

  // Handy-App: eigenen Sperrbildschirm übertragen
  const screenKey = JSON.stringify([meta.control.screen, hardOn ? meta.hard.until : '']);
  useEffect(() => {
    if (!guard()) return;
    const sc = meta.control.screen;
    const until = hardOn ? meta.hard.until : '';
    const go = async () => {
      const url = sc.img === 'own' ? ownLockImage() : sc.img.startsWith('mo-') ? await photoUrl(sc.img) : null;
      await pushLockScreen(sc, url, until);
    };
    const h = window.setTimeout(go, 600);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  // Offene Aufgaben im Tab-Titel
  const openToday = tasks.filter(t => occurs(t, today) && !t.done[today]).length;
  useEffect(() => {
    document.title = openToday ? openToday + ' offen · Meine Liste' : 'Meine Liste';
  }, [openToday]);
  const pct = total ? doneCount / total : 0;
  const cnt = (p: 'imp' | 'urg') =>
    tasks.filter(t => occurs(t, date) && !t.done[date] && (p === 'imp' ? t.imp : t.urg)).length;
  const relName = (d: string) =>
    d === today ? 'Heute' : d === addDays(today, 1) ? 'Morgen' : d === addDays(today, -1) ? 'Gestern' : DAYS[parse(d).getDay()];
  const syncText =
    sync === 'saving' ? 'Speichert …' : sync === 'error' ? 'Sync-Fehler' : sync === 'saved' ? 'Synchronisiert' : '';

  // ---------- Bausteine ----------
  const tags = (t: Task, d: string, withArea: boolean) => {
    const a = areaOf(t);
    return (
      <div className="nv-cmeta">
        {withArea && (
          <span className="nv-area" style={cv(a.color)}>
            <i />
            {a.name}
          </span>
        )}
        {t.imp && (
          <span className="nv-tag imp">
            <Zap size={12} />
            wichtig
          </span>
        )}
        {t.urg && (
          <span className="nv-tag urg">
            <Flame size={12} />
            dringend
          </span>
        )}
        {t.time && (
          <span className="nv-tag">
            <Clock size={12} />
            {t.time}
          </span>
        )}
        {t.rep === 'none' && t.date < d && !t.done[d] && <span className="nv-tag late">seit {label(t.date)}</span>}
        {t.rep !== 'none' && (
          <span className="nv-tag">
            <Repeat size={12} />
            {t.rep === 'daily' ? 'täglich' : 'wöchentlich'}
          </span>
        )}
        {(t.styles || []).map(id =>
          styleName(id) ? (
            <span className="nv-tag sty" key={id}>
              {styleName(id)}
            </span>
          ) : null
        )}
        {t.proof && (
          <span className={'nv-tag' + (t.proofs?.[d] ? ' pin' : '')}>
            <Camera size={12} />
            {t.proofs?.[d] ? 'Foto ✓' : 'Foto'}
          </span>
        )}
        {t.pin?.[d] && (
          <span className="nv-tag pin">
            <Pin size={11} />
          </span>
        )}
      </div>
    );
  };

  const row = (t: Task, d: string, withArea = false) => {
    const done = !!t.done[d];
    return (
      <div className={'nv-rt' + (done ? ' done' : '')} key={t.id + d}>
        <button
          className="nv-mini"
          role="checkbox"
          aria-checked={done}
          aria-label={t.text + (done ? ' wieder öffnen' : ' abhaken')}
          onClick={() => toggle(t.id, d)}
        >
          <Check size={14} strokeWidth={3.5} />
        </button>
        <div className="nv-rt-body" onClick={() => setEdit({ ...t })}>
          <span className="nv-rt-text">{t.text}</span>
          {tags(t, d, withArea)}
        </div>
        {!done && (
          <button
            className={'nv-pinb' + (t.pin?.[d] ? ' on' : '')}
            aria-label={t.text + (t.pin?.[d] ? ' nicht mehr oben halten' : ' nach oben holen')}
            aria-pressed={!!t.pin?.[d]}
            onClick={() => togglePin(t.id, d)}
          >
            <Pin size={16} />
          </button>
        )}
      </div>
    );
  };

  const fchip = (on: boolean, onClick: () => void, children: ReactNode, cls = '', color?: string) => (
    <button className={'nv-fchip ' + cls} aria-pressed={on} onClick={onClick} style={color ? cv(color) : undefined}>
      {children}
    </button>
  );

  const step = view === 'week' ? 7 : 1;
  const monday = mondayOf(date);
  const quadrants: [string, string, (t: Task) => boolean][] = [
    ['Jetzt', 'wichtig + dringend', t => t.urg && t.imp],
    ['Planen', 'wichtig, nicht dringend', t => t.imp && !t.urg],
    ['Schnell erledigen', 'dringend, nicht wichtig', t => t.urg && !t.imp],
    ['Später', 'weder noch', t => !t.urg && !t.imp],
  ];
  const areaIds = new Set(meta.areas.map(a => a.id));

  const sheetTitle: Record<Page, string> = {
    main: 'Menü',
    overview: 'Übersicht',
    areas: 'Bereiche',
    styles: 'Stile',
    control: 'Handykontrolle',
    settings: 'Einstellungen',
    rituals: 'Routinen',
  };
  const sheetBack: Record<Page, Page> = {
    main: 'main',
    overview: 'main',
    rituals: 'main',
    settings: 'main',
    areas: 'settings',
    styles: 'settings',
    control: 'settings',
  };

  // ---------- Darstellung ----------
  return (
    <div
      className={'nv tod-' + tod + (hardOn ? ' hc' : '') + (meta.mode === 'fokus' ? ' mf' : '') + (bgUrl ? ' has-photo' : '')}
      style={bgTone ? (toneVars(bgTone, theme === 'dark') as CSSProperties) : undefined}
    >
      <div className="nv-bg" aria-hidden="true" style={bgUrl ? { backgroundImage: 'url("' + bgUrl + '")' } : undefined} />

      <header className="nv-top">
        <div className="nv-ctx">
          {meta.fresh.on && parkedCount > 0 && (
            <button className="nv-pill fresh" onClick={() => setFreshAsk('info')}>
              <RotateCcw size={13} />
              {parkedCount} warten
              {meta.fresh.until ? ' · bis ' + shortLabel(meta.fresh.until) : ''}
            </button>
          )}
          {date !== today && (
            <button className="nv-pill" onClick={() => setDate(today)} aria-label="Zurück zu heute">
              {shortLabel(date)}
              <X size={14} />
            </button>
          )}
          {fPrio !== 'all' && (
            <button className="nv-pill" onClick={() => setFPrio('all')} aria-label="Filter entfernen">
              {fPrio === 'imp' ? 'Wichtig' : 'Dringend'}
              <X size={14} />
            </button>
          )}
          {fArea !== 'all' && (
            <button
              className="nv-pill"
              style={cv(meta.areas.find(a => a.id === fArea)?.color || '#8b94a9')}
              onClick={() => setFArea('all')}
              aria-label="Filter entfernen"
            >
              <i />
              {meta.areas.find(a => a.id === fArea)?.name}
              <X size={14} />
            </button>
          )}
          {fStyle !== 'all' && (
            <button className="nv-pill" onClick={() => setFStyle('all')} aria-label="Filter entfernen">
              {styleName(fStyle)}
              <X size={14} />
            </button>
          )}
        </div>
        <button className="nv-dots" aria-label="Menü" aria-expanded={!!sheet} onClick={() => setSheet('main')}>
          <MoreHorizontal size={22} />
        </button>
      </header>

      <main className="nv-main">
        <div className={'nv-headrow' + (shown ? ' open' : '')}>
        {hardOn ? (
          <HardBar hard={meta.hard} done={hardDone} total={hardTasks.length} onEnd={() => setCodeOpen(true)} />
        ) : (
        <div className="nv-hello">
          <h1>
            {greet}
            {firstName ? ', ' + firstName : ''}.
          </h1>
          <p>
            {DAYS[parse(today).getDay()]}, {label(today)}
            {total > 0 && date === today ? ' · ' + (total - doneCount) + ' offen' : ''}
            {meta.mode === 'fokus' ? ' · fokussiert' : ''}
          </p>
        </div>
        )}
        {!hardOn && (
        <form
          className={'nv-compose' + (shown ? ' open' : ' shut') + (listening ? ' rec' : '')}
          onSubmit={add}
          onPointerEnter={e => {
            if (e.pointerType === 'mouse') setComposeHover(true);
          }}
          onPointerLeave={e => {
            if (e.pointerType === 'mouse') setComposeHover(false);
          }}
        >
          <div className="nv-field">
            <input
              ref={composeRef}
              aria-label="Neue Aufgabe"
              placeholder={listening ? 'Ich höre zu …' : 'Was steht an?'}
              maxLength={200}
              value={text}
              tabIndex={shown ? 0 : -1}
              onChange={e => setText(e.target.value)}
              onFocus={() => setComposeFocus(true)}
              onBlur={() => setComposeFocus(false)}
              enterKeyHint="done"
            />
            <button
              className="nv-add"
              type="submit"
              aria-label={canAdd ? 'Hinzufügen' : 'Neue Aufgabe (lange drücken: sprechen)'}
              aria-expanded={shown}
              title="Lange drücken: per Sprache eintragen"
              onPointerDown={pressStart}
              onPointerUp={pressEnd}
              onPointerLeave={pressEnd}
              onPointerCancel={pressEnd}
              onContextMenu={e => e.preventDefault()}
              onClick={e => {
                if (longPressed.current) {
                  longPressed.current = false;
                  e.preventDefault();
                  return;
                }
                if (listening) {
                  e.preventDefault();
                  recRef.current?.stop();
                  return;
                }
                if (canAdd) return;
                e.preventDefault();
                if (composeOpen) {
                  setComposeOpen(false);
                  setComposeHover(false);
                  composeRef.current?.blur();
                } else {
                  setComposeOpen(true);
                  window.setTimeout(() => composeRef.current?.focus(), 30);
                }
              }}
            >
              {listening ? <Mic size={22} /> : <Plus size={24} strokeWidth={2.4} />}
            </button>
            <span
              className="nv-prog"
              style={{ transform: 'scaleX(' + pct + ')' }}
              aria-label={doneCount + ' von ' + total + ' erledigt'}
            />
          </div>

          {text && (
            <div className="nv-opts">
              {multi.length > 1 && (
                <button type="button" className="nv-multi" onClick={() => addMany(multi)}>
                  <Plus size={15} />
                  Als {multi.length} Aufgaben eintragen
                  <small>{multi.join(' · ')}</small>
                </button>
              )}
              <button
                type="button"
                className="nv-flag imp"
                aria-pressed={pvImp}
                onClick={() => setImpOv(!pvImp)}
              >
                <Zap size={16} />
                Wichtig
              </button>
              <button
                type="button"
                className="nv-flag urg"
                aria-pressed={pvUrg}
                onClick={() => setUrgOv(!pvUrg)}
              >
                <Flame size={16} />
                Dringend
              </button>
              <label className="nv-sel" style={cv(pvArea?.color || '#8b94a9')}>
                <i />
                <select aria-label="Bereich" value={areaPick} onChange={e => setAreaPick(e.target.value)}>
                  <option value="auto">{(pvArea?.name || 'Bereich') + ' · auto'}</option>
                  {meta.areas.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {meta.styles.map(s => (
                <button
                  type="button"
                  key={s.id}
                  className="nv-chip"
                  aria-pressed={pvStyles.includes(s.id)}
                  onClick={() => toggleComposeStyle(s.id)}
                >
                  {s.name}
                </button>
              ))}
              {parsed.time && (
                <span className="nv-pv">
                  <Clock size={13} />
                  {parsed.time}
                </span>
              )}
              {parsed.rep !== 'none' && (
                <span className="nv-pv">
                  <Repeat size={13} />
                  {parsed.rep === 'daily' ? 'täglich' : 'wöchentlich'}
                </span>
              )}
            </div>
          )}
        </form>
        )}
        </div>

        <section className={'nv-stair' + (clearing ? ' clearing' : '')} aria-label="Nächste Aufgaben">
          {pastRows.map((t, i) => (
            <div
              key={t.id}
              className={'nv-step ' + (i === pastRows.length - 1 ? 'spast' : 'sgone')}
              aria-hidden="true"
            >
              <div className="nv-step-in">
                <article className="nv-card">
                  <span className="nv-check on">
                    <Check size={14} strokeWidth={3} />
                  </span>
                  <div className="nv-cbody">
                    <p className="nv-ctext">{t.text}</p>
                  </div>
                </article>
              </div>
            </div>
          ))}
          {steps.map(({ t, s }) => (
            <div
              key={t.id}
              className={'nv-step ' + (s < 0 ? 'sout l' : 's' + Math.min(s, 3))}
              aria-hidden={s > 1 || s < 0}
            >
              <div className="nv-step-in">
                <div className="nv-swipe">
                  {s === 0 && (
                    <div className="nv-under" aria-hidden="true">
                      <span className="tm" style={{ opacity: Math.min(1, Math.max(0, dxOf(t)) / 90) }}>
                        Auf morgen
                        <ArrowRight size={16} />
                      </span>
                      <span className="lt" style={{ opacity: Math.min(1, Math.max(0, -dxOf(t)) / 90) }}>
                        <Undo2 size={16} />
                        Später
                      </span>
                    </div>
                  )}
                  <article
                    className={'nv-card' + (t.imp ? ' imp' : '') + (t.urg ? ' urg' : '') + (dxOf(t) ? ' drag' : '')}
                    style={{
                      ...cv(areaOf(t).color),
                      transform: dxOf(t) ? 'translateX(' + dxOf(t) + 'px) rotate(' + dxOf(t) / 45 + 'deg)' : undefined,
                    }}
                    onPointerDown={s === 0 ? swipeDown(t) : undefined}
                    onPointerMove={s === 0 ? swipeMove : undefined}
                    onPointerUp={s === 0 ? swipeUp(t) : undefined}
                    onPointerCancel={s === 0 ? swipeCancel : undefined}
                  >
                    <button
                      className="nv-check"
                      aria-label={t.text + (t.proof ? ' mit Foto erledigen' : ' erledigen')}
                      onClick={() => {
                        if (!suppress.current) complete(t);
                      }}
                      tabIndex={s === 0 || s === 1 ? 0 : -1}
                    >
                      {t.proof ? <Camera size={14} /> : <Check size={14} strokeWidth={3} />}
                    </button>
                    <div
                      className="nv-cbody"
                      onClick={() => {
                        if (!suppress.current) setEdit({ ...t });
                      }}
                    >
                      <p className="nv-ctext">{t.text}</p>
                      {tags(t, date, true)}
                    </div>
                    {s === 0 && (
                      <button
                        className="nv-focusbtn"
                        aria-label={'Fokus-Modus für ' + t.text}
                        title="Fokus"
                        onClick={() => {
                          if (!suppress.current) setFocusId(t.id);
                        }}
                      >
                        <Target size={17} />
                      </button>
                    )}
                  </article>
                </div>
                {s === 0 && meta.mode !== 'normal' && (
                  <div className="nv-cfoot strict">
                    <button className="go" onClick={() => setFocusId(t.id)}>
                      <Target size={13} />
                      Jetzt starten
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}


          {open.length === 0 && (
            <div className="nv-empty">
              <div className="nv-orb" />
              {total > 0 ? (
                <>
                  <b>Alles erledigt.</b>
                  {doneCount} geschafft. Feierabend.
                </>
              ) : meta.fresh.on ? (
                <>
                  <b>Frisch anfangen.</b>
                  Was ist jetzt wirklich wichtig? Tipp auf + oder nimm eins davon:
                  <span className="nv-fresh-ideas">
                    {FRESH_IDEAS.map(x => (
                      <button key={x} className="nv-idea" onClick={() => addFresh(x)}>
                        <Plus size={13} />
                        {x}
                      </button>
                    ))}
                  </span>
                </>
              ) : (
                <>
                  <b>{fStyle !== 'all' ? 'Noch nichts hier.' : 'Freie Bahn.'}</b>
                  {fStyle !== 'all' ? 'Unten findest du ein paar Ideen.' : 'Tipp oben auf +, um etwas einzutragen.'}
                </>
              )}
            </div>
          )}

          {restCount > 0 && (
            <button
              className="nv-more"
              onClick={() => {
                setView('list');
                setSheet('overview');
              }}
            >
              + {restCount} weitere
            </button>
          )}
        </section>

        {!hardOn && fStyle !== 'all' && meta.styles.length > 0 && (
          <section className="nv-moods" aria-label="Stile">
            <button
              className="nv-moods-q"
              aria-expanded={moodsOpen || fStyle !== 'all'}
              onClick={() => setMoodsOpen(v => !v)}
            >
              Wonach ist dir gerade?
              <ChevronRight size={15} className="nv-moods-ch" />
            </button>
            {(moodsOpen || fStyle !== 'all') && (
            <div className="nv-mood-row">
              {meta.styles.map(s => {
                const n = tasks.filter(
                  t => occurs(t, date) && !t.done[date] && (t.styles || []).includes(s.id)
                ).length;
                return (
                  <button
                    key={s.id}
                    className="nv-mood"
                    aria-pressed={fStyle === s.id}
                    onClick={() => setFStyle(fStyle === s.id ? 'all' : s.id)}
                  >
                    {s.name}
                    {n > 0 && <em>{n}</em>}
                  </button>
                );
              })}
            </div>
            )}
            {fStyle !== 'all' && ideas.length > 0 && (
              <div className="nv-ideas">
                <p>Ideen für „{styleName(fStyle)}“</p>
                {ideas.map(x => (
                  <button key={x} className="nv-idea" onClick={() => addExample(x, fStyle)}>
                    <Plus size={15} />
                    {x}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Hinweise unten */}
      <div className="nv-toasts">
        {sugg && (
          <div className="nv-toast nv-sugg" role="dialog" aria-label="Neuer Bereich">
            <div className="nv-sugg-top">
              <Lightbulb size={16} />
              <p>Passt in keinen Bereich. Neuen anlegen?</p>
              <button className="nv-ib sm" aria-label="Schließen" onClick={() => setSugg(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="nv-form">
              <span className="nv-dot" style={cv(sugg.color)} />
              <input
                className="nv-in"
                aria-label="Name des neuen Bereichs"
                value={sugg.name}
                maxLength={30}
                onChange={e => setSugg({ ...sugg, name: e.target.value, edited: true })}
              />
              <button className="nv-btn pri" onClick={acceptSugg} disabled={!sugg.name.trim()}>
                Anlegen
              </button>
            </div>
            <div className="nv-colors">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={'nv-color' + (sugg.color === c ? ' on' : '')}
                  style={cv(c)}
                  aria-label="Farbe wählen"
                  onClick={() => setSugg({ ...sugg, color: c })}
                />
              ))}
            </div>
          </div>
        )}
        {flash && (
          <div className="nv-toast" role="status">
            <p>{flash}</p>
          </div>
        )}
        {undo && (
          <div className="nv-toast" role="status">
            {undo.kind === 'done' ? (
              <Check size={16} className="nv-ok" />
            ) : undo.kind === 'wipe' ? (
              <Trash2 size={16} className="nv-later" />
            ) : (
              <ArrowRight size={16} className="nv-later" />
            )}
            <p>{undo.kind === 'done' ? 'Erledigt' : undo.kind === 'wipe' ? 'Alle Aufgaben gelöscht' : 'Auf morgen verschoben'}</p>
            <button className="nv-btn" onClick={doUndo}>
              <Undo2 size={15} />
              Rückgängig
            </button>
          </div>
        )}
      </div>

      {/* Menü */}
      {sheet && (
        <div className="nv-scrim" onClick={() => setSheet(null)}>
          <aside className="nv-sheet" role="dialog" aria-modal="true" aria-label={sheetTitle[sheet]} onClick={e => e.stopPropagation()}>
            <header className="nv-sh-head">
              {sheet !== 'main' ? (
                <button className="nv-ib" aria-label="Zurück" onClick={() => setSheet(sheetBack[sheet])}>
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <span />
              )}
              <h2>{sheetTitle[sheet]}</h2>
              <button className="nv-ib" aria-label="Schließen" onClick={() => setSheet(null)}>
                <X size={18} />
              </button>
            </header>

            <div className="nv-sh-body">
              {sheet === 'main' && (
                <>
                  <section className="nv-sec nv-quick">
                    {nowRitual && (
                      <button
                        className="nv-navrow hi"
                        onClick={() => {
                          setSheet(null);
                          setRitualId(nowRitual.id);
                        }}
                      >
                        <WhenIcon when={nowRitual.when} size={18} />
                        <span>{nowRitual.name}</span>
                        <em>
                          {ritualDone(nowRitual, meta.rlog, today)}/{nowRitual.steps.length}
                        </em>
                        <ChevronRight size={18} />
                      </button>
                    )}
                    <button
                      className="nv-btn pri nv-planbig"
                      disabled={hardOn}
                      onClick={() => {
                        setSheet(null);
                        setPlanOpen(true);
                      }}
                    >
                      <Sparkles size={16} />
                      Tag oder Woche planen
                    </button>
                    <button
                      className="nv-navrow"
                      onClick={() => {
                        setView('list');
                        setSheet('overview');
                      }}
                    >
                      <List size={18} />
                      <span>Alle Aufgaben</span>
                      <em>{openToday} offen</em>
                      <ChevronRight size={18} />
                    </button>
                    <button
                      className="nv-navrow"
                      disabled={!open.length}
                      onClick={() => {
                        if (!open.length) return;
                        setSheet(null);
                        setFocusId(open[0].id);
                      }}
                    >
                      <Target size={18} />
                      <span>Fokus starten</span>
                      <ChevronRight size={18} />
                    </button>
                    <button className="nv-navrow" onClick={() => setSheet('rituals')}>
                      <Sun size={18} />
                      <span>Routinen</span>
                      <em>{meta.rituals.length}</em>
                      <ChevronRight size={18} />
                    </button>
                    <button
                      className="nv-navrow"
                      onClick={() => {
                        setSheet(null);
                        setReviewOpen(true);
                      }}
                    >
                      <Moon size={18} />
                      <span>Tagesrückblick</span>
                      <ChevronRight size={18} />
                    </button>
                  </section>
                  <section className="nv-sec">
                    <button className="nv-navrow" onClick={() => setSheet('settings')}>
                      <Settings size={18} />
                      <span>
                        Einstellungen
                        <small className="nv-rowsub">Strenge, Handykontrolle, Aussehen, Konto</small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    {!user && <p className="nv-note">Nicht angemeldet – die Liste ist nur auf diesem Gerät.</p>}
                  </section>
                </>
              )}

              {sheet === 'rituals' && (
                <>
                  <section className="nv-sec">
                    <h3>Deine Routinen</h3>
                    {meta.rituals.map(r => {
                      const st = streakOf(r, meta.rlog);
                      return (
                        <button
                          key={r.id}
                          className="nv-navrow"
                          onClick={() => {
                            setSheet(null);
                            setRitualId(r.id);
                          }}
                        >
                          <WhenIcon when={r.when} size={18} />
                          <span>{r.name}</span>
                          <em>
                            {ritualDone(r, meta.rlog, today)}/{r.steps.length}
                            {st > 0 ? ' · ' + st + ' T.' : ''}
                          </em>
                          <ChevronRight size={18} />
                        </button>
                      );
                    })}
                    <button className="nv-link left" onClick={addRitual}>
                      + Ritual anlegen
                    </button>
                  </section>
                </>
              )}

              {sheet === 'settings' && (
                <>
                  <section className="nv-sec">
                    <h3>Strenge</h3>
                    <ModePicker mode={meta.mode} onPick={pickMode} />
                    {hardOn && <p className="nv-note">„Hart“ läuft. Wechseln geht nur mit deinem Codewort.</p>}
                    <button className="nv-navrow" onClick={() => setSheet('control')}>
                      <Smartphone size={18} />
                      <span>
                        Apps sperren
                        <small className="nv-rowsub">Handykontrolle mit Sperrbildschirm</small>
                      </span>
                      <em>{meta.control.on ? 'an' : 'aus'}</em>
                      <ChevronRight size={18} />
                    </button>
                  </section>
                  <section className="nv-sec">
                    <h3>Aussehen</h3>
                    <div className="nv-chips">
                      {fchip(
                        theme === 'dark',
                        () => setTheme('dark'),
                        <>
                          <Moon size={14} />
                          Abend
                        </>
                      )}
                      {fchip(
                        theme === 'light',
                        () => setTheme('light'),
                        <>
                          <Sun size={14} />
                          Tag
                        </>
                      )}
                    </div>
                    <p className="nv-note bd-label">Hintergrund</p>
                    <BackdropPicker choice={bgChoice} onPick={setBgChoice} />
                  </section>
                  <section className="nv-sec">
                    <h3>Konto</h3>
                    {user ? (
                      <>
                        <p className="nv-note">
                          {user}
                          {syncText ? ' · ' + syncText : ''}
                        </p>
                        <button className="nv-btn" onClick={signOut}>
                          <LogOut size={16} />
                          Abmelden
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="nv-note">Ohne Anmeldung bleibt die Liste nur auf diesem Gerät.</p>
                        <button className="nv-btn pri" onClick={signIn}>
                          <LogIn size={16} />
                          Anmelden und synchronisieren
                        </button>
                      </>
                    )}
                  </section>
                  <section className="nv-sec">
                    <button className="nv-more-toggle" aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)}>
                      Mehr Funktionen
                      <ChevronRight size={16} />
                    </button>
                  </section>
                  {moreOpen && (
                    <>
                    <section className="nv-sec">
                      <h3>Tag</h3>
                      <div className="nv-daynav">
                        <button className="nv-ib" aria-label="Vorheriger Tag" onClick={() => setDate(addDays(date, -1))}>
                          <ChevronLeft size={20} />
                        </button>
                        <div className="nv-daylabel">
                          <b>{relName(date)}</b>
                          <span>{label(date) + ' ' + parse(date).getFullYear()}</span>
                        </div>
                        <button className="nv-ib" aria-label="Nächster Tag" onClick={() => setDate(addDays(date, 1))}>
                          <ChevronRight size={20} />
                        </button>
                      </div>
                      <div className="nv-meter">
                        <span style={{ width: Math.round(pct * 100) + '%' }} />
                      </div>
                      <p className="nv-meta-line">
                        {doneCount} von {total} erledigt
                      </p>
                      {date !== today && (
                        <button className="nv-link" onClick={() => setDate(today)}>
                          Zu heute
                        </button>
                      )}
                    </section>
                    <section className="nv-sec">
                      <h3>Ansicht</h3>
                      <div className="nv-tiles">
                        {(
                          [
                            ['list', 'Liste', <List size={22} key="l" />],
                            ['week', 'Woche', <CalendarRange size={22} key="w" />],
                            ['matrix', 'Matrix', <LayoutGrid size={22} key="m" />],
                          ] as [View, string, ReactNode][]
                        ).map(([v, name, icon]) => (
                          <button
                            key={v}
                            className="nv-tile"
                            onClick={() => {
                              setView(v);
                              setSheet('overview');
                            }}
                          >
                            {icon}
                            {name}
                          </button>
                        ))}
                      </div>
                    </section>
                    <section className="nv-sec">
                      <h3>Filter</h3>
                      <div className="nv-chips">
                        {fchip(fPrio === 'all', () => setFPrio('all'), 'Alle')}
                        {fchip(
                          fPrio === 'imp',
                          () => setFPrio(fPrio === 'imp' ? 'all' : 'imp'),
                          <>
                            <Zap size={14} />
                            Wichtig <em>{cnt('imp')}</em>
                          </>,
                          'imp'
                        )}
                        {fchip(
                          fPrio === 'urg',
                          () => setFPrio(fPrio === 'urg' ? 'all' : 'urg'),
                          <>
                            <Flame size={14} />
                            Dringend <em>{cnt('urg')}</em>
                          </>,
                          'urg'
                        )}
                      </div>
                      <p className="nv-sub">Bereich</p>
                      <div className="nv-chips">
                        {fchip(fArea === 'all', () => setFArea('all'), 'Alle')}
                        {meta.areas.map(a => (
                          <span key={a.id}>
                            {fchip(
                              fArea === a.id,
                              () => setFArea(fArea === a.id ? 'all' : a.id),
                              <>
                                <i />
                                {a.name}
                              </>,
                              '',
                              a.color
                            )}
                          </span>
                        ))}
                      </div>
                      {meta.styles.length > 0 && (
                        <>
                          <p className="nv-sub">Stil</p>
                          <div className="nv-chips">
                            {fchip(fStyle === 'all', () => setFStyle('all'), 'Alle')}
                            {meta.styles.map(s => (
                              <span key={s.id}>
                                {fchip(fStyle === s.id, () => setFStyle(fStyle === s.id ? 'all' : s.id), s.name, 'sty')}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                      <p className="nv-note">Filter gelten auch für die Startseite.</p>
                    </section>
                    <section className="nv-sec">
                      <h3>Ordnen</h3>
                      <button className="nv-navrow" onClick={() => setSheet('areas')}>
                        <Layers size={18} />
                        <span>Bereiche</span>
                        <em>{meta.areas.length}</em>
                        <ChevronRight size={18} />
                      </button>
                      <button className="nv-navrow" onClick={() => setSheet('styles')}>
                        <Tag size={18} />
                        <span>Stile</span>
                        <em>{meta.styles.length}</em>
                        <ChevronRight size={18} />
                      </button>
                    </section>
                    <section className="nv-sec">
                      <h3>Fokus-Zeit</h3>
                      <FocusStats stats={meta.stats} />
                    </section>
                    <section className="nv-sec">
                      <h3>Neu anfangen</h3>
                      {meta.fresh.on ? (
                        <button className="nv-btn" onClick={() => endFresh(false)}>
                          <RotateCcw size={16} />
                          Alte Aufgaben zurückholen ({parkedCount})
                        </button>
                      ) : (
                        <button className="nv-btn pri nv-fresh-btn" disabled={!tasks.length || hardOn} onClick={() => {
                            setSheet(null);
                            setFreshSetup(true);
                          }}
                        >
                          <Sparkles size={16} />
                          <span>
                            Komplett neue To-dos
                            <small>(erinnere mich später an die alten)</small>
                          </span>
                        </button>
                      )}
                      <p className="nv-note">
                        Neustart: Deine alten Aufgaben warten, bis du die neuen geschafft hast – dann kommen sie von selbst
                        zurück. Löschen: alles weg, Bereiche, Stile und Rituale bleiben.
                      </p>
                      <button className="nv-btn danger" disabled={!tasks.length || hardOn} onClick={() => setWipeAsk(true)}>
                        <Trash2 size={16} />
                        Alle Aufgaben löschen
                      </button>
                    </section>
                    <section className="nv-sec">
                      <h3>KI-Planer</h3>
                      {aiInfo && (
                        <p className="nv-note">
                          KI: AppDeploy
                          {aiInfo.length ? ' · Reserve: ' + aiInfo.join(', ') : ' · noch keine Reserve hinterlegt'}
                        </p>
                      )}
                      <p className="nv-note">Der Planer ordnet offene Aufgaben mit Uhrzeiten und Pausen in deinen Tag – erst als Vorschau.</p>
                    </section>
                    <section className="nv-sec">
                      <Extras
                        user={user}
                        tasks={tasks}
                        meta={meta}
                        onImport={(list, m) => {
                          const nm = normMeta(m);
                          persist(list as Task[], nm ?? metaRef.current);
                        }}
                      />
                      <p className="nv-note">Unerledigte Aufgaben wandern automatisch auf den nächsten Tag.</p>
                    </section>
                    </>
                  )}
                </>
              )}

              {sheet === 'overview' && (
                <>
                  <div className="nv-seg" role="group" aria-label="Ansicht">
                    {(
                      [
                        ['list', 'Liste'],
                        ['week', 'Woche'],
                        ['matrix', 'Matrix'],
                      ] as [View, string][]
                    ).map(([v, name]) => (
                      <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                        {name}
                      </button>
                    ))}
                  </div>
                  <div className="nv-daynav sm">
                    <button className="nv-ib" aria-label="Zurück" onClick={() => setDate(addDays(date, -step))}>
                      <ChevronLeft size={18} />
                    </button>
                    <div className="nv-daylabel">
                      <b>{view === 'week' ? 'Woche' : relName(date)}</b>
                      <span>
                        {view === 'week' ? label(monday) + ' – ' + label(addDays(monday, 6)) : label(date)}
                      </span>
                    </div>
                    <button className="nv-ib" aria-label="Weiter" onClick={() => setDate(addDays(date, step))}>
                      <ChevronRight size={18} />
                    </button>
                  </div>

                  {view === 'list' &&
                    (all.length === 0 ? (
                      <p className="nv-none">Keine Aufgaben an diesem Tag.</p>
                    ) : (
                      <>
                        {meta.areas.map(a => {
                          const g = ordered(all.filter(t => t.cat === a.id), date);
                          if (!g.length) return null;
                          return (
                            <div className="nv-group" key={a.id} style={cv(a.color)}>
                              <h4>
                                <i />
                                {a.name}
                              </h4>
                              {g.map(t => row(t, date))}
                            </div>
                          );
                        })}
                        {(() => {
                          const g = ordered(all.filter(t => !areaIds.has(t.cat)), date);
                          if (!g.length) return null;
                          return (
                            <div className="nv-group" style={cv('#8b94a9')}>
                              <h4>
                                <i />
                                Ohne Bereich
                              </h4>
                              {g.map(t => row(t, date))}
                            </div>
                          );
                        })()}
                      </>
                    ))}

                  {view === 'week' &&
                    Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map(d => {
                      const l = ordered(dayList(d), d);
                      const openN = l.filter(t => !t.done[d]).length;
                      return (
                        <section className={'nv-day' + (d === today ? ' today' : '')} key={d}>
                          <button
                            className="nv-dayhead"
                            onClick={() => {
                              setDate(d);
                              setView('list');
                            }}
                          >
                            <b>{DAYS[parse(d).getDay()]}</b>
                            <span>{label(d)}</span>
                            <em>{openN} offen</em>
                          </button>
                          {l.length === 0 ? <p className="nv-none">frei</p> : l.map(t => row(t, d, true))}
                        </section>
                      );
                    })}

                  {view === 'matrix' &&
                    quadrants.map(([name, hint, fn]) => {
                      const g = ordered(all.filter(fn), date);
                      return (
                        <section className="nv-day nv-quad" key={name}>
                          <div className="nv-qhead">
                            <b>{name}</b>
                            <span>{hint}</span>
                          </div>
                          {g.length === 0 ? <p className="nv-none">leer</p> : g.map(t => row(t, date, true))}
                        </section>
                      );
                    })}
                </>
              )}

              {sheet === 'areas' && (
                <>
                  <p className="nv-note top">
                    Neue Aufgaben landen automatisch im passenden Bereich – über Stichwörter. Mit #Name beim Eintippen
                    wählst du ihn direkt.
                  </p>
                  {meta.areas.map(a => (
                    <div className="nv-item" key={a.id} style={cv(a.color)}>
                      <div className="nv-item-head">
                        <span className="nv-dot" />
                        <input
                          className="nv-in name"
                          aria-label="Name des Bereichs"
                          defaultValue={a.name}
                          maxLength={30}
                          onBlur={e => {
                            const v = e.target.value.trim();
                            if (v && v !== a.name) updArea(a.id, { name: v });
                            else e.target.value = a.name;
                          }}
                        />
                        <span className="nv-count">{tasks.filter(t => t.cat === a.id && !t.done[today]).length}</span>
                        <button className="nv-ib danger" aria-label={a.name + ' löschen'} onClick={() => delArea(a)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="nv-colors">
                        {COLORS.map(c => (
                          <button
                            key={c}
                            className={'nv-color' + (a.color === c ? ' on' : '')}
                            style={cv(c)}
                            aria-label="Farbe wählen"
                            onClick={() => updArea(a.id, { color: c })}
                          />
                        ))}
                      </div>
                      <input
                        className="nv-in kw"
                        aria-label={'Stichwörter für ' + a.name}
                        placeholder={RULES[a.id] ? 'Weitere Stichwörter' : 'Stichwörter, mit Komma getrennt'}
                        defaultValue={a.kw.join(', ')}
                        onBlur={e => updArea(a.id, { kw: splitKw(e.target.value) })}
                      />
                    </div>
                  ))}
                  <form
                    className="nv-form spaced"
                    onSubmit={e => {
                      e.preventDefault();
                      addArea(newArea);
                      setNewArea('');
                    }}
                  >
                    <input
                      className="nv-in"
                      placeholder="Neuer Bereich, z. B. eBay"
                      aria-label="Neuer Bereich"
                      value={newArea}
                      maxLength={30}
                      onChange={e => setNewArea(e.target.value)}
                    />
                    <button className="nv-btn pri" type="submit" disabled={!newArea.trim()}>
                      <Plus size={16} />
                      Anlegen
                    </button>
                  </form>
                  <label className="nv-switch">
                    <input
                      type="checkbox"
                      checked={meta.suggest}
                      onChange={e => commitMeta({ ...metaRef.current, suggest: e.target.checked })}
                    />
                    Neuen Bereich vorschlagen, wenn eine Aufgabe nirgends passt
                  </label>
                </>
              )}

              {sheet === 'control' && (
                <ControlPage
                  prefs={meta.control}
                  onChange={c => commitMeta({ ...metaRef.current, control: c })}
                  openCount={date === today ? open.length : dayList(today).filter(t => !t.done[today]).length}
                  topText={topTask?.text || ''}
                />
              )}

              {sheet === 'styles' && (
                <>
                  <p className="nv-note top">
                    Stile beschreiben, wie oder wo du etwas erledigst. Filtere danach, z. B. alles für unterwegs. Mit
                    #Name beim Eintippen setzt du einen Stil direkt.
                  </p>
                  <h3 className="nv-h3">Deine Stile</h3>
                  {meta.styles.length === 0 && (
                    <p className="nv-none">Noch keine. Übernimm unten einen Vorschlag oder leg einen eigenen an.</p>
                  )}
                  {meta.styles.map(s => (
                    <div className="nv-item" key={s.id}>
                      <div className="nv-item-head">
                        <Tag size={16} className="nv-ico" />
                        <input
                          className="nv-in name"
                          aria-label="Name des Stils"
                          defaultValue={s.name}
                          maxLength={30}
                          onBlur={e => {
                            const v = e.target.value.trim();
                            if (v && v !== s.name) updStyle(s.id, { name: v });
                            else e.target.value = s.name;
                          }}
                        />
                        <span className="nv-count">{tasks.filter(t => t.styles?.includes(s.id)).length}</span>
                        <button className="nv-ib danger" aria-label={s.name + ' löschen'} onClick={() => delStyle(s)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <input
                        className="nv-in kw"
                        aria-label={'Stichwörter für ' + s.name}
                        placeholder="Stichwörter für automatische Erkennung"
                        defaultValue={s.kw.join(', ')}
                        onBlur={e => updStyle(s.id, { kw: splitKw(e.target.value) })}
                      />
                    </div>
                  ))}
                  <form
                    className="nv-form spaced"
                    onSubmit={e => {
                      e.preventDefault();
                      addStyle(newStyle);
                      setNewStyle('');
                    }}
                  >
                    <input
                      className="nv-in"
                      placeholder="Eigener Stil, z. B. Mit Kunde"
                      aria-label="Eigener Stil"
                      value={newStyle}
                      maxLength={30}
                      onChange={e => setNewStyle(e.target.value)}
                    />
                    <button className="nv-btn pri" type="submit" disabled={!newStyle.trim()}>
                      <Plus size={16} />
                      Anlegen
                    </button>
                  </form>
                  {STYLE_SUGGEST.some(x => !meta.styles.some(s => s.name.toLowerCase() === x.name.toLowerCase())) && (
                    <>
                      <h3 className="nv-h3">Vorschläge</h3>
                      <div className="nv-chips">
                        {STYLE_SUGGEST.filter(x => !meta.styles.some(s => s.name.toLowerCase() === x.name.toLowerCase())).map(
                          x => (
                            <button key={x.name} className="nv-chip" aria-pressed={false} onClick={() => addStyle(x.name, x.kw)}>
                              <Plus size={13} />
                              {x.name}
                            </button>
                          )
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* KI-Planer */}
      {planOpen && (
        <PlanAI
          user={user}
          onSignIn={signIn}
          today={today}
          profile={meta.plan}
          onProfile={pr => commitMeta({ ...metaRef.current, plan: pr })}
          pool={planPool}
          dayLabel={d => DAYS[parse(d).getDay()] + ', ' + label(d)}
          textOf={id => tasksRef.current.find(t => t.id === id)?.text || '–'}
          onApply={applyPlan}
          onClose={() => setPlanOpen(false)}
        />
      )}

      {/* Ritual */}
      {openRitual && (
        <RitualSheet
          key={openRitual.id}
          ritual={openRitual}
          done={meta.rlog[today]?.[openRitual.id] || []}
          streak={streakOf(openRitual, meta.rlog)}
          onToggle={sid => toggleStep(openRitual.id, sid)}
          onChange={updRitual}
          onDelete={() => delRitual(openRitual.id)}
          onClose={() => setRitualId(null)}
        />
      )}

      {/* Neustart: alte schon zurückholen? */}
      {freshAsk && (
        <div className="nv-scrim center" onClick={() => setFreshAsk(false)}>
          <div className="nv-ask" role="dialog" aria-modal="true" aria-label="Alte Aufgaben zurückholen?" onClick={e => e.stopPropagation()}>
            {freshAsk === 'expired' ? (
              <>
                <p className="nv-ask-h">Dein Neustart ist abgelaufen.</p>
                <p className="nv-ask-task">{parkedCount} alte Aufgaben warten. Sollen sie zurückkommen?</p>
                <div className="nv-ask-btns">
                  <button className="nv-btn pri" onClick={() => endFresh(false)}>
                    <RotateCcw size={16} />
                    Ja, zurückholen
                  </button>
                  <button
                    className="nv-btn"
                    onClick={() => {
                      commitMeta({ ...metaRef.current, fresh: { ...metaRef.current.fresh, until: today } });
                      setFreshAsk(false);
                    }}
                  >
                    Noch bis heute Abend
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="nv-ask-h">{parkedCount} alte Aufgaben warten.</p>
                <p className="nv-ask-task">
                  Sie kommen von selbst zurück, sobald du die neuen erledigt hast
                  {meta.fresh.until ? ' – spätestens nach ' + shortLabel(meta.fresh.until) : ''}.
                </p>
                <div className="nv-ask-btns">
                  <button className="nv-btn pri" onClick={() => setFreshAsk(false)}>
                    Erst die neuen schaffen
                  </button>
                  <button className="nv-btn" onClick={() => endFresh(false)}>
                    <RotateCcw size={16} />
                    Jetzt zurückholen
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Neustart: wie lange? */}
      {freshSetup && (
        <div className="nv-scrim center" onClick={() => setFreshSetup(false)}>
          <div className="nv-ask" role="dialog" aria-modal="true" aria-label="Neustart" onClick={e => e.stopPropagation()}>
            <p className="nv-ask-h">Komplett neu anfangen</p>
            <p className="nv-ask-task">Deine {tasks.filter(t => !Object.keys(t.done).length || t.rep !== 'none').length} alten Aufgaben warten. Wann sollen sie zurückkommen?</p>
            <div className="nv-fresh-opts">
              {(
                [
                  ['', 'Wenn die neuen erledigt sind'],
                  [addDays(today, 1), 'Spätestens morgen'],
                  [nextFriday(today), 'Spätestens Freitag'],
                  [addDays(today, 7), 'Spätestens in einer Woche'],
                ] as [string, string][]
              ).map(([u, n], i) => (
                <button key={n} className={'nv-btn' + (i === 0 ? ' pri' : '')} onClick={() => startFresh(u)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Alles löschen? */}
      {wipeAsk && (
        <div className="nv-scrim center" onClick={() => setWipeAsk(false)}>
          <div className="nv-ask" role="dialog" aria-modal="true" aria-label="Alle Aufgaben löschen?" onClick={e => e.stopPropagation()}>
            <p className="nv-ask-h">Wirklich alle {tasks.length} Aufgaben löschen?</p>
            <p className="nv-ask-task">
              Auch Wiederholungen und Erledigtes. Danach hast du ein paar Sekunden Zeit, es rückgängig zu machen.
            </p>
            <div className="nv-ask-btns">
              <button className="nv-btn pri" onClick={() => setWipeAsk(false)}>
                Nein, behalten
              </button>
              <button className="nv-btn danger" onClick={wipeAll}>
                <Trash2 size={16} />
                Ja, alles löschen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hardcore */}
      {hardSetup && (
        <HardSetup
          tasks={dayList(today)
            .filter(t => !t.done[today])
            .map(t => ({ id: t.id, text: t.text }))}
          onStart={startHard}
          onClose={() => setHardSetup(false)}
        />
      )}
      {codeOpen && (
        <CodeDialog
          hash={meta.hard.hash}
          onOk={() => {
            setCodeOpen(false);
            endHard(false);
          }}
          onClose={() => setCodeOpen(false)}
        />
      )}

      {/* Zweites Mal „Später“ */}
      {bumpNo && (
        <div className="nv-scrim center" onClick={() => setBumpNo(null)}>
          <div className="nv-ask" role="dialog" aria-modal="true" aria-label="Nicht nochmal" onClick={e => e.stopPropagation()}>
            <p className="nv-ask-h">{NO_BUMP[bumpNo.q]}</p>
            <p className="nv-ask-task">{bumpNo.t.text}</p>
            <div className="nv-ask-btns">
              <button
                className="nv-btn pri"
                onClick={() => {
                  const t = bumpNo.t;
                  setBumpNo(null);
                  setFocusMin(5);
                  setFocusId(t.id);
                }}
              >
                <Target size={16} />
                Jetzt 5 Minuten anfangen
              </button>
              <button className="nv-btn" onClick={() => setBumpNo(null)}>
                Okay, mach ich
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tagesrückblick */}
      {reviewOpen && (
        <ReviewSheet
          dayLabel={DAYS[parse(date).getDay()] + ', ' + label(date)}
          done={dayList(date)
            .filter(t => t.done[date])
            .map(t => ({ id: t.id, text: t.text }))}
          open={dayList(date)
            .filter(t => !t.done[date])
            .map(t => ({ id: t.id, text: t.text, movable: t.rep === 'none' }))}
          focusMin={Math.round((meta.stats[date]?.s || 0) / 60)}
          note={meta.notes[date] || ''}
          onNote={n => {
            const m = metaRef.current;
            const notes = { ...m.notes };
            if (n) notes[date] = n;
            else delete notes[date];
            commitMeta({ ...m, notes });
          }}
          onLater={id => moveTomorrow([id])}
          onAllLater={() =>
            moveTomorrow(
              dayList(date)
                .filter(t => !t.done[date] && t.rep === 'none')
                .map(t => t.id)
            )
          }
          onClose={() => setReviewOpen(false)}
        />
      )}

      {/* Foto-Beweis */}
      {proofFor && (
        <div className="nv-scrim center" onClick={() => !proofBusy && setProofFor(null)}>
          <div className="nv-ask" role="dialog" aria-modal="true" aria-label="Mit Foto bestätigen" onClick={e => e.stopPropagation()}>
            <p className="nv-ask-h">Zeig, dass es erledigt ist.</p>
            <p className="nv-ask-task">{proofFor.text}</p>
            <div className="nv-ask-btns">
              <label className={'nv-btn pri' + (proofBusy ? ' busy' : '')}>
                <Camera size={16} />
                {proofBusy ? 'Lädt …' : 'Foto aufnehmen'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  disabled={proofBusy}
                  onChange={e => submitProof(e.target.files?.[0])}
                />
              </label>
              <button className="nv-btn" disabled={proofBusy} onClick={() => setProofFor(null)}>
                Noch nicht
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verschieben? */}
      {askLater && (
        <div className="nv-scrim center" onClick={() => setAskLater(null)}>
          <div
            className="nv-ask"
            role="dialog"
            aria-modal="true"
            aria-label="Wirklich auf morgen verschieben?"
            onClick={e => e.stopPropagation()}
          >
            <p className="nv-ask-h">Wirklich auf morgen?</p>
            <blockquote>
              „{LATER_QUOTES[askLater.q][0]}“
              <cite>{LATER_QUOTES[askLater.q][1]}</cite>
            </blockquote>
            <p className="nv-ask-task">{askLater.t.text}</p>
            <div className="nv-ask-btns">
              <button
                className="nv-btn pri"
                onClick={() => {
                  const t = askLater.t;
                  setAskLater(null);
                  setFocusMin(5);
                  setFocusId(t.id);
                }}
              >
                <Target size={16} />
                Lieber 5 Minuten anfangen
              </button>
              <button
                className="nv-btn"
                onClick={() => {
                  const t = askLater.t;
                  setAskLater(null);
                  later(t);
                }}
              >
                Trotzdem auf morgen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fokus */}
      {focusTask && (
        <Focus
          key={focusTask.id}
          text={focusTask.text}
          imp={focusTask.imp}
          urg={focusTask.urg}
          areaName={areaOf(focusTask).name}
          areaColor={areaOf(focusTask).color}
          taskCover={normCover(focusTask.cover)}
          prefs={meta.focus}
          signedIn={!!user}
          nextText={focusNext?.text}
          todaySec={meta.stats[today]?.s || 0}
          onLog={(ms, session) => logFocus(ms, session)}
          onPrefs={f => commitMeta({ ...metaRef.current, focus: f })}
          onTaskCover={c =>
            commit(tasksRef.current.map(x => (x.id === focusTask.id ? { ...x, cover: c } : x)))
          }
          strict={meta.mode !== 'normal'}
          onDone={() => {
            if (focusTask.proof && !focusTask.proofs?.[date]) {
              setFocusId(null);
              setProofFor(focusTask);
              return false;
            }
            logFocus(0, false, true);
            commit(
              tasksRef.current.map(x =>
                x.id === focusTask.id ? { ...x, done: { ...x.done, [date]: true as const } } : x
              )
            );
          }}
          startMin={focusMin}
          onNext={() => {
            setFocusMin(undefined);
            setFocusId(focusNext ? focusNext.id : null);
          }}
          onClose={() => {
            setFocusMin(undefined);
            setFocusId(null);
          }}
        />
      )}

      {/* Bearbeiten */}
      {edit && (
        <div className="nv-scrim center" onClick={() => setEdit(null)}>
          <form
            className="nv-edit"
            role="dialog"
            aria-modal="true"
            aria-label="Aufgabe bearbeiten"
            onClick={e => e.stopPropagation()}
            onSubmit={saveEdit}
          >
            <header className="nv-edit-head">
              <h2>Aufgabe</h2>
              <button type="button" className="nv-ib" aria-label="Schließen" onClick={() => setEdit(null)}>
                <X size={18} />
              </button>
            </header>
            <textarea
              aria-label="Text"
              value={edit.text}
              maxLength={200}
              onChange={e => setEdit({ ...edit, text: e.target.value })}
            />
            <div className="nv-opts flat">
              <button type="button" className="nv-flag imp" aria-pressed={edit.imp} onClick={() => setEdit({ ...edit, imp: !edit.imp })}>
                <Zap size={16} />
                Wichtig
              </button>
              <button type="button" className="nv-flag urg" aria-pressed={edit.urg} onClick={() => setEdit({ ...edit, urg: !edit.urg })}>
                <Flame size={16} />
                Dringend
              </button>
              <button
                type="button"
                className="nv-flag"
                aria-pressed={!!edit.pin?.[date]}
                onClick={() => {
                  const pin = { ...(edit.pin || {}) };
                  if (pin[date]) delete pin[date];
                  else pin[date] = true;
                  setEdit({ ...edit, pin });
                }}
              >
                <Pin size={16} />
                Ganz oben
              </button>
              <button
                type="button"
                className="nv-flag"
                onClick={() => {
                  setFocusId(edit.id);
                  setEdit(null);
                }}
              >
                <Target size={16} />
                Fokus
              </button>
            </div>
            <label className="nv-fld">
              Bereich
              <select value={edit.cat} onChange={e => setEdit({ ...edit, cat: e.target.value })}>
                {!areaIds.has(edit.cat) && <option value={edit.cat}>{edit.cat || 'Ohne'}</option>}
                {meta.areas.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {meta.styles.length > 0 && (
              <div className="nv-fld">
                Stile
                <div className="nv-chips">
                  {meta.styles.map(s => {
                    const on = (edit.styles || []).includes(s.id);
                    return (
                      <button
                        type="button"
                        key={s.id}
                        className="nv-chip"
                        aria-pressed={on}
                        onClick={() =>
                          setEdit({
                            ...edit,
                            styles: on ? (edit.styles || []).filter(x => x !== s.id) : [...(edit.styles || []), s.id],
                          })
                        }
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="nv-grid2">
              <label className="nv-fld">
                Datum
                <input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} />
              </label>
              <label className="nv-fld">
                Uhrzeit
                <input type="time" value={edit.time} onChange={e => setEdit({ ...edit, time: e.target.value })} />
              </label>
            </div>
            <label className="nv-fld">
              Wiederholung
              <select value={edit.rep} onChange={e => setEdit({ ...edit, rep: e.target.value as Rep })}>
                <option value="none">einmalig</option>
                <option value="daily">täglich</option>
                <option value="weekly">wöchentlich</option>
              </select>
            </label>
            <label className="nv-switch">
              <input type="checkbox" checked={!!edit.proof} onChange={e => setEdit({ ...edit, proof: e.target.checked })} />
              <Camera size={15} />
              Nur mit Foto abhaken
            </label>
            <div className="nv-acts">
              <button
                type="button"
                className="nv-btn danger"
                onClick={() => {
                  const orig = tasksRef.current.find(x => x.id === edit.id);
                  if (orig && remove(orig)) setEdit(null);
                }}
              >
                <Trash2 size={16} />
                Löschen
              </button>
              <button type="button" className="nv-btn" onClick={() => setEdit(null)}>
                Abbrechen
              </button>
              <button type="submit" className="nv-btn pri">
                Speichern
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
