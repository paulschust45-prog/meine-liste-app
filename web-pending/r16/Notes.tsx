import { useState } from 'react';
import { ListChecks, Pin, Plus, Sparkles, Trash2 } from 'lucide-react';

// Notizen: alles aufschreiben, später daraus To-dos machen
export interface Note {
  id: string;
  body: string;
  ts: number;
  pin?: boolean;
}
export function normMemo(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is Note => !!n && typeof (n as Note).id === 'string' && typeof (n as Note).body === 'string')
    .slice(0, 300)
    .map(n => ({ id: n.id, body: n.body.slice(0, 8000), ts: typeof n.ts === 'number' ? n.ts : Date.now(), pin: !!n.pin }));
}
const fmt = (ts: number) => {
  const d = new Date(ts);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  return same
    ? 'Heute, ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
};

interface Props {
  notes: Note[];
  onChange: (n: Note[]) => void;
  onAiTasks: (n: Note) => void;
  onLineTasks: (n: Note) => void;
}

export default function NotesPage({ notes, onChange, onAiTasks, onLineTasks }: Props) {
  const [draft, setDraft] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const add = () => {
    const b = draft.trim();
    if (!b) return;
    const n: Note = { id: 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), body: b, ts: Date.now() };
    onChange([n, ...notes]);
    setDraft('');
  };
  const upd = (id: string, patch: Partial<Note>) =>
    onChange(notes.map(n => (n.id === id ? { ...n, ...patch, ts: patch.body !== undefined ? Date.now() : n.ts } : n)));
  const list = notes
    .filter(n => !q.trim() || n.body.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(!!b.pin) - Number(!!a.pin) || b.ts - a.ts);

  return (
    <>
      <section className="nv-sec">
        <textarea
          className="nv-in nt-new"
          rows={3}
          placeholder="Was geht dir durch den Kopf? Ideen, Gedanken, alles."
          value={draft}
          maxLength={8000}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add();
          }}
        />
        <button className="nv-btn pri nv-planbig" disabled={!draft.trim()} onClick={add}>
          <Plus size={16} />
          Notiz speichern
        </button>
      </section>

      <section className="nv-sec">
        {notes.length > 4 && (
          <input className="nv-in nt-search" placeholder="Notizen durchsuchen" value={q} onChange={e => setQ(e.target.value)} />
        )}
        {!notes.length && <p className="nv-note">Noch keine Notizen. Schreib oben einfach los – aus jeder Notiz kann die KI dir To-dos machen.</p>}
        <div className="nt-list">
          {list.map(n => {
            const open = openId === n.id;
            const [first, ...rest] = n.body.split('\n');
            return (
              <article key={n.id} className={'nt-card' + (open ? ' open' : '') + (n.pin ? ' pin' : '')}>
                {open ? (
                  <textarea
                    className="nt-edit"
                    autoFocus
                    rows={Math.min(14, Math.max(4, n.body.split('\n').length + 1))}
                    value={n.body}
                    maxLength={8000}
                    onChange={e => upd(n.id, { body: e.target.value })}
                  />
                ) : (
                  <button className="nt-prev" onClick={() => setOpenId(n.id)}>
                    <b>{first || 'Notiz'}</b>
                    {rest.join(' ').trim() && <span>{rest.join(' ').trim()}</span>}
                    <small>{fmt(n.ts)}</small>
                  </button>
                )}
                {open && (
                  <div className="nt-acts">
                    <button className="nv-btn pri" onClick={() => onAiTasks(n)}>
                      <Sparkles size={15} />
                      KI macht To-dos
                    </button>
                    <button className="nv-btn" onClick={() => onLineTasks(n)} title="Jede Zeile wird eine Aufgabe">
                      <ListChecks size={15} />
                      Zeilen als To-dos
                    </button>
                    <button className="nv-ib" aria-label={n.pin ? 'Lösen' : 'Anheften'} aria-pressed={!!n.pin} onClick={() => upd(n.id, { pin: !n.pin })}>
                      <Pin size={16} />
                    </button>
                    <button
                      className="nv-ib"
                      aria-label="Notiz löschen"
                      onClick={() => {
                        onChange(notes.filter(x => x.id !== n.id));
                        setOpenId(null);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                    <button className="nv-link" onClick={() => setOpenId(null)}>
                      Fertig
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
