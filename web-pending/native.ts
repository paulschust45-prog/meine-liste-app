// ---------- Brücke zur Handy-App (Android jetzt, iPhone vorbereitet) ----------
// In der Website gibt es kein Capacitor – dann sind alle Aufrufe stille No-ops.

export interface GuardStatus {
  platform: 'android' | 'ios';
  ready: boolean;
  rulesOn: boolean;
  focusOn: boolean;
  apps: string[];
  pausesLeft: number;
}
export interface GuardRules {
  on: boolean;
  apps: string[];
  level: 1 | 2 | 3;
  pause: boolean;
  skip: 'free' | 'limited' | 'none';
  hash: string;
  message: string;
}
interface GuardPluginApi {
  status(): Promise<GuardStatus>;
  requestPermission(): Promise<void>;
  listApps(): Promise<{ apps: { id: string; name: string }[]; picker?: boolean }>;
  setRules(r: GuardRules): Promise<void>;
  startFocus(o: { task: string; until: number; hash: string; level: number }): Promise<void>;
  stopFocus(o: { hash: string }): Promise<void>;
  setScreen(o: { image: string; imageUrl: string; quote: string; wait: number; time: boolean; until: string }): Promise<void>;
}
interface CapWindow {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: { Guard?: GuardPluginApi };
  };
}

const cap = () => (window as unknown as CapWindow).Capacitor;
export const isNative = () => !!cap()?.isNativePlatform?.();
export const nativePlatform = () => (isNative() ? cap()?.getPlatform?.() || 'web' : 'web');
export const guard = (): GuardPluginApi | null => (isNative() ? cap()?.Plugins?.Guard || null : null);

// Bekannte Apps → Android-Paketnamen
export const KNOWN_APPS: Record<string, string[]> = {
  Instagram: ['com.instagram.android'],
  TikTok: ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'],
  YouTube: ['com.google.android.youtube'],
  Snapchat: ['com.snapchat.android'],
  X: ['com.twitter.android'],
  Reddit: ['com.reddit.frontpage'],
  Netflix: ['com.netflix.mediaclient'],
  Facebook: ['com.facebook.katana'],
  Pinterest: ['com.pinterest'],
  Twitch: ['tv.twitch.android.app'],
  Spiele: [],
};
export const packagesOf = (apps: string[]) =>
  Array.from(new Set(apps.flatMap(a => KNOWN_APPS[a] || (a.includes('.') ? [a] : []))));

// Fokus-Sperre (nur Meine Liste erlaubt)
export function focusLockStart(task: string, ms: number) {
  const g = guard();
  if (!g) return;
  g.startFocus({ task, until: ms > 0 ? Date.now() + ms : 0, hash: '', level: 2 }).catch(() => undefined);
}
export function focusLockStop() {
  guard()?.stopFocus({ hash: '' }).catch(() => undefined);
}

// Sperrbildschirm aufs Gerät übertragen. Eigenes Foto als Base64,
// Motivationsbilder lädt das Handy selbst herunter (kein CORS-Problem, danach offline).
export async function pushLockScreen(
  s: { img: string; quote: string; wait: number; time: boolean },
  imgUrl: string | null,
  until: string
) {
  const g = guard();
  if (!g) return;
  const data = imgUrl && imgUrl.startsWith('data:') ? imgUrl.split(',')[1] || '' : '';
  const url = imgUrl && !imgUrl.startsWith('data:') ? imgUrl : '';
  await g
    .setScreen({ image: data, imageUrl: url, quote: s.quote, wait: s.wait, time: s.time, until })
    .catch(() => undefined);
}
