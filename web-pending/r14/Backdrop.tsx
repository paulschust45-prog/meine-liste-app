import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus } from 'lucide-react';
import { photoUrl } from './Focus';

// Hintergrund der Startseite: Tageszeit-Verlauf, Motivationsbild oder eigenes Foto.
// Gerätebezogen (localStorage), damit jedes Handy sein eigenes Bild haben kann.
export const BG_CHOICES: { id: string; name: string }[] = [
  { id: 'mo-gym', name: 'Training' },
  { id: 'mo-run', name: 'Morgenlauf' },
  { id: 'mo-work', name: 'Am Arbeiten' },
  { id: 'mo-climb', name: 'Gipfel' },
  { id: 'mo-box', name: 'Vor dem Kampf' },
  { id: 'mo-study', name: 'Lernen' },
  { id: 'ph-gipfel', name: 'Berge' },
  { id: 'ph-meer', name: 'Weite' },
  { id: 'ph-wald', name: 'Lichtung' },
  { id: 'ph-weg', name: 'Der Weg' },
  { id: 'ph-duene', name: 'Düne' },
  { id: 'ph-stadt', name: 'Früh wach' },
];
// Grundton je Bild (falls sich die Farbe nicht aus dem Bild lesen lässt): Farbton, Sättigung
const TONE_FALLBACK: Record<string, [number, number]> = {
  'mo-gym': [24, 30],
  'mo-run': [28, 40],
  'mo-work': [30, 28],
  'mo-climb': [205, 35],
  'mo-box': [10, 32],
  'mo-study': [34, 35],
  'ph-gipfel': [210, 30],
  'ph-meer': [196, 35],
  'ph-wald': [105, 28],
  'ph-weg': [200, 14],
  'ph-duene': [30, 42],
  'ph-stadt': [215, 28],
  own: [30, 20],
};
export type Tone = [number, number]; // Farbton 0–360, Sättigung 0–100

// Vorherrschenden Farbton aus dem Bild lesen (nach Sättigung gewichtet)
function readTone(url: string): Promise<Tone | null> {
  return new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 32;
        const g = c.getContext('2d');
        if (!g) return res(null);
        g.drawImage(img, 0, 0, 32, 32);
        const d = g.getImageData(0, 0, 32, 32).data;
        let x = 0;
        let y = 0;
        let wsum = 0;
        let ssum = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255;
          const gg = d[i + 1] / 255;
          const b = d[i + 2] / 255;
          const mx = Math.max(r, gg, b);
          const mn = Math.min(r, gg, b);
          const l = (mx + mn) / 2;
          const ch = mx - mn;
          if (ch < 0.02) continue;
          const sat = ch / (1 - Math.abs(2 * l - 1) || 1);
          let h = mx === r ? ((gg - b) / ch) % 6 : mx === gg ? (b - r) / ch + 2 : (r - gg) / ch + 4;
          h *= 60;
          const w = sat * (1 - Math.abs(l - 0.5));
          x += Math.cos((h * Math.PI) / 180) * w;
          y += Math.sin((h * Math.PI) / 180) * w;
          wsum += w;
          ssum += sat * w;
        }
        if (wsum < 1) return res(null);
        const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
        const coh = Math.hypot(x, y) / wsum; // wie einheitlich der Farbton ist
        res([Math.round(hue), Math.round(Math.min(55, (ssum / wsum) * 100 * (0.4 + coh * 0.6)))]);
      } catch {
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

// Farben der App passend zum Hintergrund
export function toneVars(t: Tone, dark: boolean): Record<string, string> {
  const [h, s0] = t;
  const s = Math.max(8, Math.min(48, s0));
  const hs = (sat: number, l: number) => 'hsl(' + h + ' ' + Math.round(sat) + '% ' + l + '%)';
  if (dark)
    return {
      '--bg': hs(s * 0.25, 10),
      '--bg2': hs(s * 0.25, 13),
      '--glass': hs(s * 0.28, 16),
      '--glass2': hs(s * 0.28, 19),
      '--ink': hs(s * 0.3, 93),
      '--soft': hs(s * 0.2, 68),
      '--acc': hs(s * 0.9, 70),
      '--on-acc': hs(s * 0.4, 10),
      '--bd-shade': 'hsl(' + h + ' ' + Math.round(s * 0.4) + '% 6% / 0.55)',
    };
  return {
    '--bg': hs(s * 0.32, 91),
    '--bg2': hs(s * 0.32, 95.5),
    '--glass': hs(s * 0.35, 94),
    '--glass2': hs(s * 0.3, 97.5),
    '--ink': hs(s * 0.55, 15),
    '--soft': hs(s * 0.25, 42),
    '--acc': hs(s * 0.9, 34),
    '--on-acc': hs(s * 0.3, 97),
    '--bd-shade': 'hsl(' + h + ' ' + Math.round(s * 0.45) + '% 8% / 0.5)',
  };
}

const KEY = 'ml-bg';
const OWN = 'ml-bg-own';
const read = (k: string) => {
  try {
    return localStorage.getItem(k) || '';
  } catch {
    return '';
  }
};
const write = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
};

export function useBackdrop() {
  const [choice, setChoiceS] = useState(() => read(KEY) || 'tod');
  const [url, setUrl] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let live = true;
    setUrl(null);
    setTone(null);
    if (choice === 'tod') return;
    const cacheKey = 'ml-bg-tone-' + choice;
    const cached = choice === 'own' ? '' : read(cacheKey);
    if (cached) {
      const [h, s] = cached.split(',').map(Number);
      if (!isNaN(h) && !isNaN(s)) setTone([h, s]);
    }
    const apply = (u: string | null) => {
      if (!live) return;
      setUrl(u);
      if (!u) return;
      readTone(u).then(t => {
        if (!live) return;
        const fin = t || TONE_FALLBACK[choice] || TONE_FALLBACK.own;
        setTone(fin);
        if (t && choice !== 'own') write(cacheKey, t.join(','));
      });
    };
    if (choice === 'own') apply(read(OWN) || null);
    else photoUrl(choice).then(apply);
    return () => {
      live = false;
    };
  }, [choice, rev]);
  const setChoice = (id: string) => {
    write(KEY, id === 'tod' ? '' : id);
    if (id === choice) setRev(r => r + 1);
    setChoiceS(id);
  };
  return [choice, setChoice, url, url ? tone : null] as const;
}

// Foto verkleinern, damit es in den Gerätespeicher passt
function shrink(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1400;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      rej(new Error('Bild nicht lesbar'));
    };
    img.src = u;
  });
}

function Thumb({ id, name, on, onPick }: { id: string; name: string; on: boolean; onPick: () => void }) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    photoUrl(id).then(x => live && setU(x));
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <button className="bd-th" aria-pressed={on} onClick={onPick} title={name}>
      <span className="bd-img" style={u ? { backgroundImage: 'url("' + u + '")' } : undefined} />
      <small>{name}</small>
      {on && (
        <i className="bd-ok">
          <Check size={12} strokeWidth={3} />
        </i>
      )}
    </button>
  );
}

export function BackdropPicker({ choice, onPick }: { choice: string; onPick: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [own, setOwn] = useState(() => read(OWN));
  const [err, setErr] = useState('');
  return (
    <div className="bd-pick">
      <div className="bd-grid">
        <button className="bd-th" aria-pressed={choice === 'tod'} onClick={() => onPick('tod')} title="Ruhig">
          <span className="bd-img bd-tod" />
          <small>Ruhig</small>
          {choice === 'tod' && (
            <i className="bd-ok">
              <Check size={12} strokeWidth={3} />
            </i>
          )}
        </button>
        {BG_CHOICES.map(c => (
          <Thumb key={c.id} id={c.id} name={c.name} on={choice === c.id} onPick={() => onPick(c.id)} />
        ))}
        <button
          className="bd-th"
          aria-pressed={choice === 'own'}
          onClick={() => (own && choice !== 'own' ? onPick('own') : fileRef.current?.click())}
          title="Eigenes Foto"
        >
          <span className="bd-img bd-own" style={own ? { backgroundImage: 'url("' + own + '")' } : undefined}>
            {!own && <ImagePlus size={18} />}
          </span>
          <small>{own ? 'Dein Foto' : 'Eigenes'}</small>
          {choice === 'own' && (
            <i className="bd-ok">
              <Check size={12} strokeWidth={3} />
            </i>
          )}
        </button>
      </div>
      {own && (
        <button className="nv-link bd-new" onClick={() => fileRef.current?.click()}>
          Anderes Foto wählen
        </button>
      )}
      {err && <p className="nv-note">{err}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const d = await shrink(f);
            if (!write(OWN, d)) {
              setErr('Das Foto ist zu groß für den Speicher. Probier ein kleineres.');
              return;
            }
            setErr('');
            setOwn(d);
            onPick('own');
          } catch {
            setErr('Das Bild konnte nicht gelesen werden.');
          }
        }}
      />
    </div>
  );
}
