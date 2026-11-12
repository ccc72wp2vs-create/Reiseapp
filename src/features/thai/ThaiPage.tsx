import { Hand, Hash, Search, ShoppingBag, Siren, TramFront, UtensilsCrossed, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/AppShell';
import { Input, Segmented, Sheet } from '../../components/ui';
import { t } from '../../i18n';
import { PHRASES, withParticle, type Phrase, type Speaker } from './phrases';

const KEY = 'travio.thaiSpeaker';

const ICONS = { hand: Hand, food: UtensilsCrossed, shopping: ShoppingBag, transport: TramFront, emergency: Siren, numbers: Hash } as const;

function useThaiVoice() {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const pick = () => setVoice(speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('th')) ?? null);
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
    return () => speechSynthesis.removeEventListener('voiceschanged', pick);
  }, []);
  const speak = (text: string) => {
    if (!voice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.8;
    speechSynthesis.speak(u);
  };
  return { canSpeak: !!voice, speak };
}

export default function ThaiPage() {
  const [speaker, setSpeakerState] = useState<Speaker>(() => {
    try {
      return localStorage.getItem(KEY) === 'f' ? 'f' : 'm';
    } catch {
      return 'm';
    }
  });
  const setSpeaker = (s: Speaker) => {
    setSpeakerState(s);
    try {
      localStorage.setItem(KEY, s);
    } catch {
      /* ignore */
    }
  };
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<Phrase | null>(null);
  const { canSpeak, speak } = useThaiVoice();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PHRASES;
    return PHRASES.map((g) => ({ ...g, phrases: g.phrases.filter((p) => p.de.toLowerCase().includes(q) || p.say.toLowerCase().includes(q)) })).filter((g) => g.phrases.length);
  }, [query]);

  return (
    <div>
      <PageHeader title={t.thai.title} eyebrow={t.thai.eyebrow} />
      <div className="space-y-3 px-safe pt-5">
        <Segmented
          label={t.thai.speaker}
          value={speaker}
          onChange={setSpeaker}
          options={[
            { value: 'm', label: t.thai.male },
            { value: 'f', label: t.thai.female },
          ]}
        />
        <p className="text-[13px] text-text-3">{t.thai.particleHint}</p>
        <label className="relative block">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
          <span className="sr-only">{t.common.search}</span>
          <Input type="search" placeholder={t.thai.search} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-11" />
        </label>
      </div>

      <div className="px-safe">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.title}>
            <h2 className="mb-3 mt-7 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">
              {(() => {
                const Icon = ICONS[g.icon];
                return <Icon size={14} className="text-accent" aria-hidden />;
              })()}
              {g.title}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-[1.5rem] border border-line bg-surface">
              {g.phrases.map((p) => {
                const v = withParticle(p, speaker);
                return (
                  <li key={p.de}>
                    <button type="button" onClick={() => setShown(p)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{p.de}</span>
                        <span className="block text-[14px] text-accent">{v.say}</span>
                      </span>
                      <span lang="th" className="shrink-0 text-right text-[18px] font-medium">
                        {p.th}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="py-10 text-center text-text-3">{t.explore.noResults}</p>}
        <p className="mt-6 text-[12px] text-text-3">{t.thai.footer}</p>
      </div>

      {shown && (
        <Sheet open onClose={() => setShown(null)} title={shown.de}>
          {(() => {
            const v = withParticle(shown, speaker);
            return (
              <div className="text-center">
                <p lang="th" className="py-6 text-[44px] font-semibold leading-tight">
                  {v.th}
                </p>
                <p className="text-[20px] font-semibold text-accent">{v.say}</p>
                {shown.hint && <p className="mt-3 text-[14px] text-text-2">{shown.hint}</p>}
                {canSpeak && (
                  <button
                    type="button"
                    onClick={() => speak(v.th)}
                    className="mx-auto mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[16px] font-semibold text-accent-ink"
                  >
                    <Volume2 size={20} /> {t.thai.listen}
                  </button>
                )}
                <p className="mt-5 text-[12px] text-text-3">{t.thai.showHint}</p>
              </div>
            );
          })()}
        </Sheet>
      )}
    </div>
  );
}
