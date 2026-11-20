/**
 * "Neu in TRAVIO": shown once after an update – but ONLY for new, genuinely
 * useful features. Fixes, layout tweaks and small polish get no entry, and
 * an update without an entry shows no window at all.
 * Newest first. Keep each item to one or two short sentences.
 */
export interface ChangeItem {
  icon: 'plus' | 'lightbulb' | 'bell' | 'undo' | 'language' | 'receipt' | 'wallet' | 'route' | 'sparkles';
  title: string;
  text: string;
  /** Optional in-app link ("Ansehen"). */
  to?: string;
}

export interface ChangeEntry {
  version: string;
  date: string;
  items: ChangeItem[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    version: '2.18.0',
    date: '2026-11-20',
    items: [
      { icon: 'plus', title: 'To-dos für die Gruppe', text: 'Wer erledigt was bis wann – z. B. „Fähre bestätigen“. Auch über das + anlegbar.', to: '/todos' },
      { icon: 'sparkles', title: 'Kommentare', text: 'Hinweise für alle direkt an Buchungen, Orten, Aktivitäten und Ausgaben.' },
      { icon: 'lightbulb', title: 'Suche über alles', text: 'Lupe oben auf der Startseite: findet Buchungsnummern, Notizen, Orte, Ausgaben und Kommentare – auch offline.', to: '/suche' },
      { icon: 'route', title: 'Heimreise-Check', text: 'In den letzten zwei Tagen zeigt die Startseite, was vor dem Heimflug noch offen ist.' },
    ],
  },
  {
    version: '2.16.0',
    date: '2026-11-19',
    items: [
      {
        icon: 'sparkles',
        title: 'Lage vor Ort',
        text: 'Wichtige Meldungen für eure Stationen – Unwetter, Fährausfälle, Reisehinweise des Auswärtigen Amts, Feste – kurz auf Deutsch. Dringendes auch als Push.',
      },
    ],
  },
  {
    version: '2.13.0',
    date: '2026-11-18',
    items: [
      { icon: 'plus', title: 'Ein „+“ für alles', text: 'Unten in der Mitte: Ausgabe, Beleg aufteilen, Buchung, Aktivität, Ort – plus „Nochmal erfassen“ für wiederkehrende Ausgaben.' },
      { icon: 'receipt', title: 'Ausgabe als Satz', text: 'Im „+“ einfach tippen, z. B. „Taxi 450 Baht, Lilli hat bezahlt, für alle“ – das Formular ist dann ausgefüllt.' },
      { icon: 'lightbulb', title: 'Ideen im Plan', text: '„Entdecken“ steckt jetzt im Plan unter „Ideen“. Unter jedem Tag stehen die gemerkten Orte der Station zum Einplanen.', to: '/plan?ansicht=ideen' },
      { icon: 'bell', title: 'Push-Benachrichtigungen', text: 'Check-in offen, morgen Reisetag, Restzahlung fällig, neue Ausgabe für dich. Einschalten unter Mehr → Einstellungen (iPhone: nur in der installierten App).', to: '/einstellungen' },
      { icon: 'undo', title: 'Rückgängig', text: 'Nach dem Löschen oder Ändern ein paar Sekunden lang „Rückgängig“ – nichts geht mehr aus Versehen verloren.' },
      { icon: 'wallet', title: 'Wer zahlt als Nächstes?', text: 'Die Kasse zeigt, welches Paar bisher am wenigsten vorgestreckt hat.', to: '/kasse' },
    ],
  },
];

/** -1 / 0 / 1 for "2.10.1" style versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Entries newer than `seen` and not newer than the running app version. */
export function unseenChanges(seen: string, current: string): ChangeEntry[] {
  return CHANGELOG.filter((e) => compareVersions(e.version, seen) > 0 && compareVersions(e.version, current) <= 0);
}
