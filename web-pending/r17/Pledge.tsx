import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, Eraser, HandCoins, LogIn, PenLine, X } from 'lucide-react';
import { api } from '@appdeploy/client';

// Einsatz: „Ich zahle X €, wenn ich Y nicht bis Z erledigt (und belegt) habe.“
// Testphase: Es wird nichts abgebucht, bis Zahlungen (Stripe) aktiv sind.
export interface Pledge {
  id: string;
  taskId: string;
  task: string;
  amount: number; // Cent
  deadline: string; // ISO
  proof: boolean;
  recipient: 'app' | 'charity' | 'friend';
  friend: string;
  name: string;
  summary: string;
  createdAt: number;
  status: 'active' | 'kept' | 'failed' | 'cancelled';
  resolvedAt?: number;
}
export interface PledgeTask {
  id: string;
  text: string;
}
export const CONSENT_VERSION = 'einsatz-v1-testphase';
export const euro = (c: number) => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const RECIP: Record<Pledge['recipient'], string> = {
  app: 'an Meine Liste',
  charity: 'als Spende an eine gemeinnützige Organisation',
  friend: 'an eine Person deiner Wahl',
};
const fmtDl = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const pad = (n: number) => String(n).padStart(2, '0');
const localInput = (d: Date) =>
  d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

export function summaryOf(p: Pick<Pledge, 'task' | 'amount' | 'deadline' | 'proof' | 'recipient' | 'friend'>): string {
  return (
    'Ich verpflichte mich, „' +
    p.task +
    '“ bis ' +
    fmtDl(p.deadline) +
    ' Uhr zu erledigen' +
    (p.proof ? ' und mit einem Foto in Meine Liste zu belegen' : '') +
    '. Schaffe ich das nicht, zahle ich ' +
    euro(p.amount) +
    ' ' +
    (p.recipient === 'friend' && p.friend ? 'an ' + p.friend : RECIP[p.recipient]) +
    '.'
  );
}

// Unterschrift mit Finger oder Maus
function SignPad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const k = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * k);
    c.height = Math.round(r.height * k);
    const g = c.getContext('2d');
    if (!g) return;
    g.scale(k, k);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 2.4;
    g.strokeStyle = '#1c1a17';
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.restore();
    inked.current = false;
    onChange('');
  };
  return (
    <div className="pg-sign">
      <canvas
        ref={ref}
        className="pg-canvas"
        onPointerDown={e => {
          drawing.current = true;
          last.current = pos(e);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (!drawing.current || !last.current) return;
          const g = ref.current?.getContext('2d');
          const p = pos(e);
          if (!g) return;
          g.beginPath();
          g.moveTo(last.current.x, last.current.y);
          g.lineTo(p.x, p.y);
          g.stroke();
          last.current = p;
          inked.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
          if (inked.current && ref.current) onChange(ref.current.toDataURL('image/png'));
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <span className="pg-line" aria-hidden="true">
        Unterschrift
      </span>
      <button type="button" className="nv-ib pg-clear" aria-label="Unterschrift löschen" onClick={clear}>
        <Eraser size={16} />
      </button>
    </div>
  );
}

interface Props {
  user: string | null;
  onSignIn: () => void;
  tasks: PledgeTask[];
  preset?: string; // Aufgabe vorauswählen
  // Legt bei Bedarf die Aufgabe an (oder setzt Foto-Pflicht) und gibt ihre ID zurück
  prepare: (taskId: string, text: string, proof: boolean) => string;
  onSigned: (p: Pledge) => void;
  onClose: () => void;
}

export default function PledgeSheet(p: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [taskId, setTaskId] = useState(p.preset || p.tasks[0]?.id || '');
  const [own, setOwn] = useState('');
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    if (d.getTime() < Date.now() + 60 * 60 * 1000) d.setDate(d.getDate() + 1);
    return localInput(d);
  });
  const [proof, setProof] = useState(true);
  const [recipient, setRecipient] = useState<Pledge['recipient']>('charity');
  const [friend, setFriend] = useState('');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [adult, setAdult] = useState(false);
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState<Pledge | null>(null);
  const madeId = useRef('');

  const taskText = taskId === 'own' ? own.trim() : p.tasks.find(t => t.id === taskId)?.text || '';
  const dlIso = deadline ? new Date(deadline).toISOString() : '';
  const dlOk = !!deadline && new Date(deadline).getTime() > Date.now() + 10 * 60 * 1000;
  const amt = custom ? Math.round(parseFloat(custom.replace(',', '.')) * 100) || 0 : amount;
  const amtOk = amt >= 100 && amt <= 50000;
  const ready1 = !!taskText && dlOk && amtOk && (recipient !== 'friend' || friend.trim().length > 1);
  const draft = { task: taskText, amount: amt, deadline: dlIso, proof, recipient, friend: friend.trim() };
  const summary = ready1 ? summaryOf(draft) : '';
  const ready2 = agree && adult && name.trim().length >= 3 && !!sig;

  const sign = async () => {
    setBusy(true);
    setErr('');
    try {
      // Bei erneutem Versuch keine zweite Aufgabe anlegen
      const tid = taskId === 'own' && madeId.current ? madeId.current : p.prepare(taskId, taskText, proof);
      if (taskId === 'own') madeId.current = tid;
      const { data } = await api.post('/api/pledge', {
        taskId: tid,
        ...draft,
        name: name.trim(),
        summary,
        consent: agree,
        adult,
        version: CONSENT_VERSION,
        signature: sig.split(',')[1] || '',
      });
      if (!data?.pledge) throw new Error('leer');
      setSaved(data.pledge as Pledge);
      p.onSigned(data.pledge as Pledge);
      setStep(3);
    } catch {
      setErr('Speichern hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nv-scrim center" onClick={p.onClose}>
      <div className="pl pg" role="dialog" aria-modal="true" aria-label="Einsatz" onClick={e => e.stopPropagation()}>
        <header className="rt-head">
          <span className="rt-when">
            <HandCoins size={16} />
            Einsatz {step < 3 ? '· Schritt ' + step + ' von 2' : ''}
          </span>
          <button className="nv-ib" aria-label="Schließen" onClick={p.onClose}>
            <X size={18} />
          </button>
        </header>

        {!p.user ? (
          <div className="pl-gate">
            <h2 className="rt-title">Setz etwas aufs Spiel.</h2>
            <p className="rt-meta">
              Ein Einsatz wird mit deiner Unterschrift gespeichert. Dafür brauchst du eine Anmeldung.
            </p>
            <button className="nv-btn pri" onClick={p.onSignIn}>
              <LogIn size={16} />
              Anmelden
            </button>
          </div>
        ) : step === 1 ? (
          <>
            <h2 className="rt-title">Was musst du schaffen?</h2>
            <div className="pg-opts">
              {p.tasks.slice(0, 8).map(t => (
                <button key={t.id} className="bk-row" aria-pressed={taskId === t.id} onClick={() => setTaskId(t.id)}>
                  <span className="bk-chk">{taskId === t.id && <Check size={13} strokeWidth={3} />}</span>
                  <span className="bk-txt">{t.text}</span>
                </button>
              ))}
              <button className="bk-row" aria-pressed={taskId === 'own'} onClick={() => setTaskId('own')}>
                <span className="bk-chk">{taskId === 'own' && <Check size={13} strokeWidth={3} />}</span>
                <span className="bk-txt">Etwas anderes …</span>
              </button>
              {taskId === 'own' && (
                <input
                  className="nv-in"
                  autoFocus
                  maxLength={120}
                  placeholder="z. B. 30 Minuten joggen"
                  value={own}
                  onChange={e => setOwn(e.target.value)}
                />
              )}
            </div>

            <label className="nv-fld">
              Bis wann?
              <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </label>
            {!dlOk && deadline && <p className="ct-err">Die Frist muss mindestens 10 Minuten in der Zukunft liegen.</p>}

            <p className="pl-q">Wie viel setzt du ein?</p>
            <div className="rt-whens" role="group" aria-label="Betrag">
              {[500, 1000, 2000, 5000].map(c => (
                <button
                  key={c}
                  aria-pressed={!custom && amount === c}
                  onClick={() => {
                    setAmount(c);
                    setCustom('');
                  }}
                >
                  {euro(c)}
                </button>
              ))}
            </div>
            <input
              className="nv-in pg-custom"
              inputMode="decimal"
              placeholder="Anderer Betrag in € (1–500)"
              value={custom}
              onChange={e => setCustom(e.target.value.replace(/[^\d,.]/g, '').slice(0, 7))}
            />
            {custom && !amtOk && <p className="ct-err">Bitte zwischen 1 € und 500 €.</p>}

            <p className="pl-q">Wohin geht das Geld, wenn du es nicht schaffst?</p>
            <div className="pg-opts">
              {(['charity', 'friend', 'app'] as Pledge['recipient'][]).map(k => (
                <button key={k} className="bk-row" aria-pressed={recipient === k} onClick={() => setRecipient(k)}>
                  <span className="bk-chk">{recipient === k && <Check size={13} strokeWidth={3} />}</span>
                  <span className="bk-txt">
                    {k === 'charity' ? 'Spende an eine gemeinnützige Organisation' : k === 'friend' ? 'An eine Person, die ich nenne' : 'An Meine Liste'}
                  </span>
                </button>
              ))}
              {recipient === 'friend' && (
                <input className="nv-in" maxLength={60} placeholder="Name der Person" value={friend} onChange={e => setFriend(e.target.value)} />
              )}
            </div>

            <label className="nv-switch">
              <input type="checkbox" checked={proof} onChange={e => setProof(e.target.checked)} />
              <Camera size={15} />
              Erledigt zählt nur mit Foto-Beweis
            </label>

            <div className="nv-ask-btns">
              <button className="nv-btn pri" disabled={!ready1} onClick={() => setStep(2)}>
                Weiter
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : step === 2 ? (
          <>
            <h2 className="rt-title">Zusammenfassung</h2>
            <div className="pg-sum">
              <p>{summary}</p>
              <dl>
                <dt>Aufgabe</dt>
                <dd>{taskText}</dd>
                <dt>Frist</dt>
                <dd>{fmtDl(dlIso)} Uhr</dd>
                <dt>Einsatz</dt>
                <dd>{euro(amt)}</dd>
                <dt>Beweis</dt>
                <dd>{proof ? 'Foto in Meine Liste' : 'Abhaken genügt'}</dd>
              </dl>
            </div>
            <p className="pg-test">
              <b>Testphase:</b> Es wird noch kein Geld abgebucht. Dein Einsatz wird gespeichert und ausgewertet. Sobald
              echte Zahlungen möglich sind, musst du jeden Einsatz noch einmal mit deinem Zahlungsmittel bestätigen.
            </p>

            <label className="pg-check">
              <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
              <span>
                Ich habe die Zusammenfassung gelesen und stimme ihr ausdrücklich zu. Mir ist klar, dass ich diesen Einsatz nach
                15 Minuten nicht mehr zurückziehen kann.
              </span>
            </label>
            <label className="pg-check">
              <input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} />
              <span>Ich bin mindestens 18 Jahre alt und schließe diese Vereinbarung für mich selbst ab.</span>
            </label>

            <label className="nv-fld">
              Vor- und Nachname
              <input autoComplete="name" maxLength={80} value={name} onChange={e => setName(e.target.value)} />
            </label>
            <p className="pl-q">
              <PenLine size={14} /> Hier unterschreiben
            </p>
            <SignPad onChange={setSig} />
            {err && <p className="ct-err">{err}</p>}

            <div className="nv-ask-btns">
              <button className="nv-btn pri" disabled={!ready2 || busy} onClick={sign}>
                {busy ? 'Wird gespeichert …' : 'Verbindlich unterschreiben'}
              </button>
              <button className="nv-btn" onClick={() => setStep(1)}>
                <ArrowLeft size={16} />
                Ändern
              </button>
            </div>
            <p className="pl-note">
              Gespeichert werden: Zusammenfassung, Name, Unterschrift, Zeitpunkt, IP-Adresse und Gerät – als Nachweis deiner Zustimmung.
            </p>
          </>
        ) : (
          <div className="pl-gate pg-done">
            <div className="pg-seal">
              <Check size={26} strokeWidth={3} />
            </div>
            <h2 className="rt-title">Abgemacht.</h2>
            <p className="rt-meta">{saved?.summary}</p>
            <p className="pl-note">
              Du findest den Einsatz im Menü unter „Einsatz“. Zurückziehen geht nur in den nächsten 15 Minuten.
            </p>
            <button className="nv-btn pri" onClick={p.onClose}>
              Los geht's
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
