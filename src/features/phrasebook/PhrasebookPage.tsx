import { Hand, Hash, Languages, Search, ShoppingBag, Siren, TramFront, UtensilsCrossed, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader, useTrip } from '../../components/AppShell';
import { EmptyState, Input, Segmented, Sheet, Skeleton } from '../../components/ui';
import { t } from '../../i18n';
import { LANG_NAMES, phraseLangFor } from '../../lib/phrasebook';
import { BOOKS } from './books';
import { forSpeaker, hasSpeakerForms, type GroupIcon, type Phrase, type PhraseBook, type Speaker } from './types';

const KEY = 'travio.speaker';
const ICONS: Record<GroupIcon, typeof Hand> = { hand: Hand, food: UtensilsCrossed, shopping: ShoppingBag, transport: TramFront, emergency: Siren, numbers: Hash };

function useVoice(lang: string) {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const prefix = lang.split('-')[0].toLowerCase();
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      setVoice(vs.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ?? vs.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null);
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
    return () => speechSynthesis.removeEventListener('voiceschanged', pick);
  }, [lang]);
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

export default function PhrasebookPage() {
  const { snap } = useTrip();
  if (!snap) {
    return (
      <div className="space-y-4 px-safe pt-safe">
        <Skeleton className="mt-6 h-10 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const lang = phraseLangFor(snap.trip.destinationCountry);
  if (!lang) {
    return (
      <div>
        <PageHeader title={t.phrasebook.titleGeneric} eyebrow={snap.trip.name} />
        <div className="px-safe pt-6">
          <EmptyState icon={<Languages size={26} />} title={t.phrasebook.noneTitle} text={t.phrasebook.noneText(snap.trip.destinationCountry)} />
        </div>
      </div>
    );
  }
  return <Book key={lang} book={BOOKS[lang]} />;
}

function Book({ book }: { book: PhraseBook }) {
  const [speaker, setSpeakerState] = useState<Speaker>(() => {
    try {
      return (localStorage.getItem(KEY) ?? localStorage.getItem('travio.thaiSpeaker')) === 'f' ? 'f' : 'm';
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
  const { canSpeak, speak } = useVoice(book.speech);
  const name = LANG_NAMES[book.lang];
  const nonLatin = book.lang === 'th' || book.lang === 'el';

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return book.groups;
    return book.groups
      .map((g) => ({ ...g, phrases: g.phrases.filter((p) => p.de.toLowerCase().includes(q) || p.text.toLowerCase().includes(q) || p.say.toLowerCase().includes(q)) }))
      .filter((g) => g.phrases.length);
  }, [query, book]);

  return (
    <div>
      <PageHeader title={name} eyebrow={t.phrasebook.eyebrow} />
      <div className="space-y-3 px-safe pt-5">
        {hasSpeakerForms(book) && (
          <>
            <Segmented
              label={t.phrasebook.speaker}
              value={speaker}
              onChange={setSpeaker}
              options={[
                { value: 'm', label: book.particle ? `${t.phrasebook.male} (${book.particle.m.say})` : t.phrasebook.male },
                { value: 'f', label: book.particle ? `${t.phrasebook.female} (${book.particle.f.say})` : t.phrasebook.female },
              ]}
            />
            {book.speakerHint && <p className="text-[13px] text-text-3">{book.speakerHint}</p>}
          </>
        )}
        <label className="relative block">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-3" />
          <span className="sr-only">{t.common.search}</span>
          <Input type="search" placeholder={t.phrasebook.search} value={query} onChange={(e) => setQuery(e.target.value)} className="pl-11" />
        </label>
      </div>

      <div className="px-safe">
        {groups.map((g) => {
          const Icon = ICONS[g.icon];
          return (
            <section key={g.key} aria-label={g.title}>
              <h2 className="mb-3 mt-7 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-text-3">
                <Icon size={14} className="text-accent" aria-hidden />
                {g.title}
              </h2>
              <ul className="divide-y divide-line overflow-hidden rounded-[1.5rem] border border-line bg-surface">
                {g.phrases.map((p) => {
                  const v = forSpeaker(book, p, speaker);
                  return (
                    <li key={p.de}>
                      <button type="button" onClick={() => setShown(p)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{p.de}</span>
                          {nonLatin ? (
                            <span className="block text-[14px] text-accent">{v.say}</span>
                          ) : (
                            <span lang={book.lang} className="block text-[15px] font-medium text-accent">
                              {v.text}
                            </span>
                          )}
                        </span>
                        {nonLatin && (
                          <span lang={book.lang} className="max-w-[45%] shrink-0 text-right text-[18px] font-medium">
                            {p.text}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {groups.length === 0 && <p className="py-10 text-center text-text-3">{t.explore.noResults}</p>}
        <p className="mt-6 text-[12px] text-text-3">{book.footer}</p>
      </div>

      {shown && (
        <Sheet open onClose={() => setShown(null)} title={shown.de}>
          {(() => {
            const v = forSpeaker(book, shown, speaker);
            return (
              <div className="text-center">
                <p lang={book.lang} className="py-6 text-[40px] font-semibold leading-tight">
                  {v.text}
                </p>
                <p className="text-[18px] text-text-2">
                  {t.phrasebook.pronunciation}: <span className="font-semibold text-accent">{v.say}</span>
                </p>
                {shown.hint && <p className="mt-3 text-[14px] text-text-2">{shown.hint}</p>}
                {canSpeak && (
                  <button
                    type="button"
                    onClick={() => speak(v.text)}
                    className="mx-auto mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-[16px] font-semibold text-accent-ink"
                  >
                    <Volume2 size={20} /> {t.phrasebook.listen}
                  </button>
                )}
                <p className="mt-5 text-[12px] text-text-3">{t.phrasebook.showHint}</p>
              </div>
            );
          })()}
        </Sheet>
      )}
    </div>
  );
}
