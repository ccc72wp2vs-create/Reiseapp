import type { PhraseLang } from '../../../shared/countries';

export type Speaker = 'm' | 'f';

export interface Variant {
  text: string;
  /** Simplified pronunciation for German speakers. */
  say: string;
}

export interface Phrase extends Variant {
  de: string;
  /** Female-speaker form (e.g. „vegetariana“), when it differs. */
  f?: Variant;
  /** Thai: append the polite particle of the speaker. */
  polite?: boolean;
  hint?: string;
}

export type GroupIcon = 'hand' | 'food' | 'shopping' | 'transport' | 'emergency' | 'numbers';

export interface PhraseGroup {
  key: string;
  title: string;
  icon: GroupIcon;
  phrases: Phrase[];
}

export interface PhraseBook {
  lang: PhraseLang;
  /** BCP-47 tag for speech synthesis. */
  speech: string;
  /** Polite particles (Thai). */
  particle?: Record<Speaker, Variant>;
  /** Short explanation shown under the speaker switch. */
  speakerHint?: string;
  groups: PhraseGroup[];
  footer: string;
}

export const GROUP_TITLES: Record<GroupIcon, string> = {
  hand: 'Grundlagen',
  food: 'Essen & Trinken',
  shopping: 'Einkaufen',
  transport: 'Unterwegs',
  emergency: 'Notfall & Gesundheit',
  numbers: 'Zahlen',
};

/** Builds the six standard groups from compact lists. */
export function groups(g: Record<GroupIcon, Phrase[]>): PhraseGroup[] {
  return (Object.keys(GROUP_TITLES) as GroupIcon[]).map((k) => ({ key: k, title: GROUP_TITLES[k], icon: k, phrases: g[k] }));
}

/** The phrase as the given speaker says it. */
export function forSpeaker(book: PhraseBook, p: Phrase, speaker: Speaker): Variant {
  const base = speaker === 'f' && p.f ? p.f : { text: p.text, say: p.say };
  if (!p.polite || !book.particle) return base;
  const part = book.particle[speaker];
  return { text: `${base.text} ${part.text}`, say: `${base.say} ${part.say}` };
}

export function hasSpeakerForms(book: PhraseBook): boolean {
  return !!book.particle || book.groups.some((g) => g.phrases.some((p) => p.f));
}

/** Short helper: [de, text, say, extra?] */
export const p = (de: string, text: string, say: string, extra: Partial<Phrase> = {}): Phrase => ({ de, text, say, ...extra });
