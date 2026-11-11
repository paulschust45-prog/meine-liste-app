import { useEffect, useState } from 'react';
import { Copy, Crown, LogIn, Plus, Share2, Users } from 'lucide-react';
import { api } from '@appdeploy/client';

// Challenge-Räume: Freunde per Code, Live-Rangliste des Tages
interface Member {
  me: boolean;
  name: string;
  pts: number;
  done: number;
  min: number;
}
interface Room {
  code: string;
  name: string;
  members: Member[];
}
interface Props {
  user: string | null;
  display: string;
  today: string;
  joinCode?: string;
  onSignIn: () => void;
  onRooms: (n: number) => void;
}

export const joinLink = (code: string) => location.origin + location.pathname + '?join=' + code;

export default function RoomsPage(p: Props) {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState(p.joinCode || '');
  const [me, setMe] = useState(p.display);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  const load = () =>
    api
      .get('/api/rooms?day=' + p.today)
      .then(({ data }) => {
        const r = (data?.rooms || []) as Room[];
        setRooms(r);
        p.onRooms(r.length);
      })
      .catch(() => setRooms(v => v || []));
  useEffect(() => {
    if (!p.user) return;
    load();
    const h = window.setInterval(load, 20000);
    return () => window.clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.user]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/room', { ...body, display: me.trim() || p.display });
      setCode('');
      setName('');
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setErr(msg || 'Hat nicht geklappt. Prüf den Code und versuch es noch einmal.');
    } finally {
      setBusy(false);
    }
  };
  const share = async (r: Room) => {
    const url = joinLink(r.code);
    const text = 'Komm in meine Challenge „' + r.name + '“ bei Meine Liste – Code ' + r.code;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Meine Liste Challenge', text, url });
        return;
      }
    } catch {
      /* abgebrochen */
    }
    try {
      await navigator.clipboard.writeText(text + ': ' + url);
      setCopied(r.code);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      setErr('Link: ' + url);
    }
  };

  if (!p.user)
    return (
      <section className="nv-sec">
        <p className="nv-note">Mit Freunden um die Wette erledigen: Ihr seht live, wer heute wie viel geschafft hat. Dafür brauchst du eine Anmeldung.</p>
        <button className="nv-btn pri nv-planbig" onClick={p.onSignIn}>
          <LogIn size={16} />
          Anmelden
        </button>
      </section>
    );

  return (
    <>
      <section className="nv-sec">
        <p className="nv-note">
          Punkte gibt es für jede erledigte Aufgabe (wichtig und mit Foto zählt mehr) und für jede Minute im Fokus. Jeden Tag
          beginnt es neu.
        </p>
        <label className="nv-fld">
          Dein Name in der Rangliste
          <input maxLength={24} value={me} onChange={e => setMe(e.target.value)} />
        </label>
      </section>

      {rooms === null && <p className="nv-note">Lade …</p>}
      {rooms?.map(r => (
        <section className="nv-sec rm-room" key={r.code}>
          <div className="rm-head">
            <h3>{r.name}</h3>
            <button className="nv-ib" aria-label="Einladen" onClick={() => share(r)}>
              {copied === r.code ? <Copy size={16} /> : <Share2 size={16} />}
            </button>
          </div>
          <p className="rm-code">
            Code <b>{r.code}</b>
            {copied === r.code && <span> · kopiert</span>}
          </p>
          <ol className="rm-board">
            {r.members.map((m, i) => (
              <li key={i} className={(m.me ? 'me ' : '') + (i === 0 && m.pts > 0 ? 'top' : '')}>
                <span className="rm-rank">{i === 0 && m.pts > 0 ? <Crown size={14} /> : i + 1}</span>
                <span className="rm-name">
                  {m.name}
                  {m.me && <small> (du)</small>}
                  <small>
                    {m.done} erledigt · {m.min} Min. Fokus
                  </small>
                </span>
                <b className="rm-pts">{m.pts}</b>
              </li>
            ))}
          </ol>
          <button className="nv-link" disabled={busy} onClick={() => act({ action: 'leave', code: r.code })}>
            Raum verlassen
          </button>
        </section>
      ))}

      <section className="nv-sec">
        <h3>Beitreten</h3>
        <form
          className="nv-form"
          onSubmit={e => {
            e.preventDefault();
            if (code.trim()) act({ action: 'join', code });
          }}
        >
          <input
            className="nv-in rm-codein"
            placeholder="CODE"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <button className="nv-btn pri" type="submit" disabled={busy || code.length !== 6}>
            <Users size={16} />
          </button>
        </form>
        <h3>Neue Challenge</h3>
        <form
          className="nv-form"
          onSubmit={e => {
            e.preventDefault();
            act({ action: 'create', name });
          }}
        >
          <input className="nv-in" placeholder="z. B. Lernwoche, Gym-Crew" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
          <button className="nv-btn pri" type="submit" disabled={busy}>
            <Plus size={16} />
          </button>
        </form>
        {err && <p className="ct-err">{err}</p>}
      </section>
    </>
  );
}
