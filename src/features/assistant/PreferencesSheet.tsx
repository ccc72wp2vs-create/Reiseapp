import { useEffect, useState, type ReactNode } from 'react';
import { PREFERENCE_INTERESTS, type AssistantPreferences } from '../../../shared/assistant';
import { toast } from '../../components/toast';
import { Button, cx, Sheet, TextField } from '../../components/ui';
import { errorMessage, http } from '../../lib/api';

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx('h-10 rounded-full border px-4 text-[14px] font-semibold transition active:scale-[0.97]', on ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-surface text-text-2')}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-text-3">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** A handful of optional preferences – used for day plans and place suggestions. */
export function PreferencesSheet({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [p, setP] = useState<AssistantPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    http
      .get<{ preferences: AssistantPreferences }>(`/trips/${tripId}/assistant/preferences`)
      .then((r) => setP(r.preferences))
      .catch(() => setP({}));
  }, [tripId]);
  const set = <K extends keyof AssistantPreferences>(k: K, v: AssistantPreferences[K]) => setP((x) => ({ ...x, [k]: v }));
  const toggle = <K extends 'budget' | 'vibe' | 'rhythm' | 'maxTravelMinutes'>(k: K, v: NonNullable<AssistantPreferences[K]>) =>
    setP((x) => ({ ...x, [k]: x?.[k] === v ? null : v }));

  async function save() {
    if (!p) return;
    setBusy(true);
    try {
      await http.put(`/trips/${tripId}/assistant/preferences`, { ...p, cuisine: p.cuisine?.trim() || null });
      toast('Vorlieben gespeichert');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Reisevorlieben"
      footer={
        <Button block onClick={save} loading={busy} disabled={!p}>
          Speichern
        </Button>
      }
    >
      <p className="text-[14px] text-text-2">Optional. TRAVIO berücksichtigt das bei Tagesplänen und Ortsvorschlägen.</p>
      {p && (
        <div className="mt-5 space-y-5">
          <Group label="Was mögt ihr?">
            {PREFERENCE_INTERESTS.map((i) => (
              <Chip key={i} on={!!p.interests?.includes(i)} onClick={() => set('interests', p.interests?.includes(i) ? p.interests.filter((x) => x !== i) : [...(p.interests ?? []), i])}>
                {i}
              </Chip>
            ))}
          </Group>
          <Group label="Budget">
            <Chip on={p.budget === 'low'} onClick={() => toggle('budget', 'low')}>Günstig</Chip>
            <Chip on={p.budget === 'mid'} onClick={() => toggle('budget', 'mid')}>Mittel</Chip>
            <Chip on={p.budget === 'high'} onClick={() => toggle('budget', 'high')}>Gehoben</Chip>
          </Group>
          <Group label="Maximale Fahrtzeit">
            {[15, 30, 60].map((m) => (
              <Chip key={m} on={p.maxTravelMinutes === m} onClick={() => toggle('maxTravelMinutes', m)}>
                {m} Min.
              </Chip>
            ))}
          </Group>
          <Group label="Atmosphäre">
            <Chip on={p.vibe === 'quiet'} onClick={() => toggle('vibe', 'quiet')}>Ruhig</Chip>
            <Chip on={p.vibe === 'lively'} onClick={() => toggle('vibe', 'lively')}>Lebhaft</Chip>
          </Group>
          <Group label="Tagesrhythmus">
            <Chip on={p.rhythm === 'early'} onClick={() => toggle('rhythm', 'early')}>Früh los</Chip>
            <Chip on={p.rhythm === 'late'} onClick={() => toggle('rhythm', 'late')}>Ausschlafen</Chip>
          </Group>
          <TextField label="Lieblingsküche" optional placeholder="z. B. Thai, Seafood, vegetarisch" value={p.cuisine ?? ''} maxLength={80} onChange={(e) => set('cuisine', e.target.value)} />
        </div>
      )}
    </Sheet>
  );
}
