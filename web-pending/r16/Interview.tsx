import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LogIn, MessageCircleQuestion, X } from 'lucide-react';
import { api } from '@appdeploy/client';

// KI-Interview: fragt dich kurz aus, schreibt daraus To-dos und bringt sie in die beste Reihenfolge.
export interface IvTask {
  id: string;
  text: string;
  imp: boolean;
  urg: boolean;
}
export interface IvItem {
  text: string;
  imp: boolean;
  urg: boolean;
  min: number;
  why: string;
  ref: string; // ID einer vorhandenen Aufgabe oder ''
}
interface Props {
  user: string | null;
  onSignIn: () => void;
  tasks: IvTask[];
  notes: string;
  // Startet direkt mit diesem Text (z. B. aus einer Notiz) statt mit Fragen
  seed?: string;
  onApply: (items: IvItem[]) => void;
  onClose: () => void;
}

const FALLBACK_Q = [
  'Was willst du diese Woche auf jeden Fall geschafft haben?',
  'Gibt es heute feste Termine oder Fristen?',
  'Was schiebst du gerade am längsten vor dir her?',
  'Wie viel Zeit hast du heute ungefähr?',
];

export default function Interview(p: Props) {
  const [phase, setPhase] = useState<'loadq' | 'ask' | 'load' | 'show' | 'err'>(p.seed ? 'load' : 'loadq');
  const [qs, setQs] = useState<string[]>([]);
  const [ans, setAns] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [items, setItems] = useState<IvItem[]>([]);
  const [pick, setPick] = useState<boolean[]>([]);
  const [intro, setIntro] = useState('');
  const [err, setErr] = useState('');

  const ctx = { tasks: p.tasks.slice(0, 60), notes: p.notes.slice(0, 4000) };

  const plan = async (answers: { q: string; a: string }[]) => {
    setPhase('load');
    try {
      const { data } = await api.post('/api/interview', { step: 'plan', ...ctx, answers });
      const list = (data?.items || []) as IvItem[];
      if (!list.length) throw new Error('leer');
      setItems(list);
      setPick(list.map(() => true));
      setIntro(typeof data?.intro === 'string' ? data.intro : '');
      setPhase('show');
    } catch {
      setErr('Die KI ist gerade nicht erreichbar. Versuch es gleich noch einmal.');
      setPhase('err');
    }
  };

  useEffect(() => {
    if (!p.user) return;
    if (p.seed) {
      plan([{ q: 'Notiz', a: p.seed }]);
      return;
    }
    api
      .post('/api/interview', { step: 'ask', ...ctx })
      .then(({ data }) => {
        const q = Array.isArray(data?.questions) && data.questions.length ? (data.questions as string[]) : FALLBACK_Q;
        setQs(q.slice(0, 5));
        setAns(q.slice(0, 5).map(() => ''));
        setPhase('ask');
      })
      .catch(() => {
        setQs(FALLBACK_Q);
        setAns(FALLBACK_Q.map(() => ''));
        setPhase('ask');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.user]);

  const next = () => {
    if (i < qs.length - 1) setI(i + 1);
    else plan(qs.map((q, k) => ({ q, a: ans[k] || '' })).filter(x => x.a.trim()));
  };
  const textOfRef = (id: string) => p.tasks.find(t => t.id === id)?.text;

  return (
    <div className="nv-scrim center" onClick={p.onClose}>
      <div className="pl iv" role="dialog" aria-modal="true" aria-label="KI-Interview" onClick={e => e.stopPropagation()}>
        <header className="rt-head">
          <span className="rt-when">
            <MessageCircleQuestion size={16} />
            {p.seed ? 'Notiz → To-dos' : 'KI fragt dich'}
          </span>
          <button className="nv-ib" aria-label="Schließen" onClick={p.onClose}>
            <X size={18} />
          </button>
        </header>

        {!p.user ? (
          <div className="pl-gate">
            <h2 className="rt-title">Lass dich kurz ausfragen.</h2>
            <p className="rt-meta">
              Die KI stellt dir ein paar Fragen, schreibt daraus deine To-dos und sagt dir, was du zuerst machen solltest.
              Dafür brauchst du eine Anmeldung.
            </p>
            <button className="nv-btn pri" onClick={p.onSignIn}>
              <LogIn size={16} />
              Anmelden
            </button>
          </div>
        ) : phase === 'loadq' || phase === 'load' ? (
          <div className="pl-load">
            <div className="pl-dots">
              <i />
              <i />
              <i />
            </div>
            <p>{phase === 'loadq' ? 'Ich überlege mir ein paar Fragen …' : 'Ich schreibe und ordne deine To-dos …'}</p>
          </div>
        ) : phase === 'err' ? (
          <div className="pl-gate">
            <p className="rt-meta">{err}</p>
            <button className="nv-btn" onClick={() => (qs.length ? setPhase('ask') : p.onClose())}>
              Zurück
            </button>
          </div>
        ) : phase === 'ask' ? (
          <div className="iv-ask">
            <div className="iv-prog" aria-hidden="true">
              {qs.map((_, k) => (
                <i key={k} className={k <= i ? 'on' : ''} />
              ))}
            </div>
            <h2 className="rt-title iv-q">{qs[i]}</h2>
            <textarea
              className="nv-in iv-a"
              rows={4}
              autoFocus
              key={i}
              maxLength={600}
              placeholder="Schreib einfach drauflos – Stichworte reichen."
              value={ans[i] || ''}
              onChange={e => setAns(a => a.map((x, k) => (k === i ? e.target.value : x)))}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) next();
              }}
            />
            <div className="iv-nav">
              <button className="nv-ib" aria-label="Zurück" disabled={i === 0} onClick={() => setI(i - 1)}>
                <ArrowLeft size={18} />
              </button>
              {!ans[i]?.trim() ? (
                <button className="nv-link" onClick={next}>
                  Überspringen
                </button>
              ) : (
                <span />
              )}
              <button className="nv-btn pri" onClick={next}>
                {i < qs.length - 1 ? 'Weiter' : 'To-dos erstellen'}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="rt-title">So bringst du am meisten weiter</h2>
            {intro && <p className="pl-sum">{intro}</p>}
            <ol className="iv-list">
              {items.map((it, k) => (
                <li key={k}>
                  <button
                    className="iv-row"
                    aria-pressed={pick[k]}
                    onClick={() => setPick(v => v.map((x, j) => (j === k ? !x : x)))}
                  >
                    <span className="iv-n">{k + 1}</span>
                    <span className="iv-txt">
                      {it.ref ? textOfRef(it.ref) || it.text : it.text}
                      <small>
                        {it.ref ? 'schon auf deiner Liste · ' : ''}
                        {it.min ? it.min + ' Min · ' : ''}
                        {it.why}
                      </small>
                    </span>
                    <span className="iv-chk">{pick[k] && <Check size={13} strokeWidth={3} />}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="nv-ask-btns">
              <button
                className="nv-btn pri"
                disabled={!pick.some(Boolean)}
                onClick={() => {
                  p.onApply(items.filter((_, k) => pick[k]));
                  p.onClose();
                }}
              >
                Übernehmen
              </button>
              {!p.seed && (
                <button
                  className="nv-btn"
                  onClick={() => {
                    setI(0);
                    setPhase('ask');
                  }}
                >
                  Antworten ändern
                </button>
              )}
            </div>
            <p className="pl-note">Danach zeigt dir die Startseite immer nur die nächsten zwei – abhaken, dann kommen die nächsten.</p>
          </>
        )}
      </div>
    </div>
  );
}
