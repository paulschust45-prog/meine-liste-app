import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { api } from '@appdeploy/client';

// Seite für den Zeugen eines Einsatzes (geheimer Link, ohne Anmeldung)
interface Data {
  name: string;
  summary: string;
  deadline: string;
  amount: number;
  status: string;
  witness: string;
  proofUrl: string | null;
}
const euro = (c: number) => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export default function Witness({ t }: { t: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .get('/api/witness?t=' + encodeURIComponent(t))
      .then(({ data }) => setD(data as Data))
      .catch(() => setErr('Dieser Link ist ungültig oder abgelaufen.'));
  }, [t]);
  const vote = async (verdict: 'ok' | 'no') => {
    setBusy(true);
    try {
      const { data } = await api.post('/api/witness', { t, verdict, who });
      setD(v => (v ? { ...v, witness: data.witness, status: data.status } : v));
    } catch {
      setErr('Das hat nicht geklappt. Versuch es gleich noch einmal.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wt">
      <div className="wt-card">
        <p className="wt-kicker">Meine Liste · Einsatz</p>
        {err && <p className="ct-err">{err}</p>}
        {!d && !err && <p className="nv-note">Lade …</p>}
        {d && (
          <>
            <h1>{d.name} zählt auf dich.</h1>
            <p className="wt-sum">{d.summary}</p>
            <p className="nv-note">
              Du bist Zeuge. Prüf das Beweisfoto und sag ehrlich, ob die Aufgabe erledigt ist. Es geht um {euro(d.amount)}.
            </p>
            {d.proofUrl ? (
              <img className="wt-proof" src={d.proofUrl} alt="Beweisfoto" />
            ) : (
              <p className="wt-wait">
                {d.status === 'failed' ? 'Die Frist ist vorbei – es gibt kein Beweisfoto.' : 'Noch kein Beweisfoto. Schau später noch einmal rein.'}
              </p>
            )}
            {d.witness === 'ok' || d.witness === 'no' ? (
              <p className={'wt-done ' + d.witness}>{d.witness === 'ok' ? 'Du hast bestätigt. Danke!' : 'Du hast abgelehnt. Der Einsatz gilt als verpasst.'}</p>
            ) : (
              d.proofUrl &&
              d.status === 'kept' && (
                <>
                  <label className="nv-fld">
                    Dein Name (optional)
                    <input maxLength={40} value={who} onChange={e => setWho(e.target.value)} />
                  </label>
                  <div className="wt-btns">
                    <button className="nv-btn pri" disabled={busy} onClick={() => vote('ok')}>
                      <Check size={16} />
                      Ja, erledigt
                    </button>
                    <button className="nv-btn" disabled={busy} onClick={() => vote('no')}>
                      <X size={16} />
                      Nein, nicht erledigt
                    </button>
                  </div>
                </>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
