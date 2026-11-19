/**
 * Push notifications for this device: switch on (asks for permission),
 * choose what to get, switch off. On iPhone this only works once TRAVIO is
 * installed on the home screen (iOS 16.4+).
 */
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '../../components/toast';
import { Button, Card, Toggle } from '../../components/ui';
import { t } from '../../i18n';
import { errorMessage, http } from '../../lib/api';

type Kind = 'checkin' | 'travelday' | 'payment' | 'expense' | 'news';
const KINDS: Kind[] = ['checkin', 'travelday', 'payment', 'expense', 'news'];

const b64ToBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export function PushSettings() {
  const [cfg, setCfg] = useState<{ publicKey: string | null; enabled: boolean } | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [prefs, setPrefs] = useState<Record<Kind, boolean>>({ checkin: true, travelday: true, payment: true, expense: true, news: true });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void http.get<{ publicKey: string | null; enabled: boolean }>('/push/config').then(setCfg).catch(() => setCfg({ publicKey: null, enabled: false }));
    if (!supported()) return;
    void navigator.serviceWorker.ready.then(async (reg) => {
      const s = await reg.pushManager.getSubscription();
      setSub(s);
      if (s) {
        const r = await http.post<{ subscribed: boolean; prefs: Record<Kind, boolean> | null }>('/push/status', { endpoint: s.endpoint }).catch(() => null);
        if (r?.prefs) setPrefs((p) => ({ ...p, ...r.prefs }));
      }
    });
  }, []);

  async function enable() {
    if (!cfg?.publicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast(t.push.denied, 'error');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.publicKey) }));
      const json = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await http.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys, prefs });
      setSub(s);
      toast(t.push.enabled);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!sub) return;
    setBusy(true);
    try {
      await http.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
      setSub(null);
      toast(t.push.disabled);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(k: Kind, v: boolean) {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    if (sub) await http.put('/push/prefs', { endpoint: sub.endpoint, prefs: next }).catch((e) => toast.error(e));
  }

  if (cfg && !cfg.enabled) return null;
  const needsInstall = isIos() && !standalone();

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">{sub ? <Bell size={20} /> : <BellOff size={20} />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{sub ? t.push.onTitle : t.push.offTitle}</p>
          <p className="mt-0.5 text-[13px] text-text-3">{t.push.intro}</p>
        </div>
      </div>
      {!supported() || needsInstall ? (
        <p className="mt-4 rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">{needsInstall ? t.push.installFirst : t.push.unsupported}</p>
      ) : sub ? (
        <>
          <div className="mt-4 space-y-3">
            {KINDS.map((k) => (
              <Toggle key={k} label={t.push.kinds[k]} checked={prefs[k]} onChange={(v) => void toggle(k, v)} />
            ))}
          </div>
          <Button className="mt-4" size="sm" variant="secondary" loading={busy} onClick={disable}>
            {t.push.turnOff}
          </Button>
        </>
      ) : (
        <Button className="mt-4" icon={<Bell size={16} />} loading={busy} disabled={!cfg?.publicKey} onClick={enable}>
          {t.push.turnOn}
        </Button>
      )}
    </Card>
  );
}
