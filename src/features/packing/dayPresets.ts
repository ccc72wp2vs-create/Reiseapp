import type { PackingCategory } from '../../../shared/constants';

export interface DayPreset {
  key: string;
  label: string;
  icon: 'boat' | 'dive' | 'temple' | 'beach' | 'nature';
  items: [string, PackingCategory][];
}

/** Ready-made lists for day trips (all editable after creation). */
export const DAY_PRESETS: DayPreset[] = [
  {
    key: 'boat',
    label: 'Bootsausflug & Schnorcheln',
    icon: 'boat',
    items: [
      ['Badesachen', 'clothing'],
      ['Handtuch', 'other'],
      ['Riff-freundliche Sonnencreme', 'toiletries'],
      ['Sonnenbrille & Kopfbedeckung', 'clothing'],
      ['Schnorchelmaske (falls eigene)', 'other'],
      ['Wasserdichter Beutel (Dry Bag)', 'other'],
      ['Wasserdichte Handyhülle', 'electronics'],
      ['Wasser', 'other'],
      ['Bargeld (Nationalpark-Gebühr)', 'documents'],
      ['Reisetabletten', 'medication'],
      ['Wechselkleidung', 'clothing'],
    ],
  },
  {
    key: 'dive',
    label: 'Tauchen',
    icon: 'dive',
    items: [
      ['Tauchschein & Logbuch', 'documents'],
      ['Versicherungsnachweis', 'documents'],
      ['Badesachen', 'clothing'],
      ['Handtuch', 'other'],
      ['Riff-freundliche Sonnencreme', 'toiletries'],
      ['Reisetabletten', 'medication'],
      ['Wasser', 'other'],
      ['Bargeld', 'documents'],
      ['Warme Schicht für die Rückfahrt', 'clothing'],
    ],
  },
  {
    key: 'temple',
    label: 'Tempel & Stadt',
    icon: 'temple',
    items: [
      ['Schultern & Knie bedeckt (Tuch/lange Hose)', 'clothing'],
      ['Schuhe zum leichten Ausziehen', 'clothing'],
      ['Bargeld in kleinen Scheinen', 'documents'],
      ['Powerbank', 'electronics'],
      ['Wasser', 'other'],
      ['Sonnencreme', 'toiletries'],
      ['Mückenspray', 'toiletries'],
      ['Taschentücher', 'toiletries'],
    ],
  },
  {
    key: 'beach',
    label: 'Strandtag',
    icon: 'beach',
    items: [
      ['Badesachen', 'clothing'],
      ['Handtuch', 'other'],
      ['Sonnencreme', 'toiletries'],
      ['Sonnenbrille', 'clothing'],
      ['Buch / Kopfhörer', 'electronics'],
      ['Wasser & Snacks', 'other'],
      ['Bargeld', 'documents'],
    ],
  },
  {
    key: 'nature',
    label: 'Natur & Elefanten',
    icon: 'nature',
    items: [
      ['Feste Schuhe', 'clothing'],
      ['Kleidung, die schmutzig werden darf', 'clothing'],
      ['Wechselkleidung', 'clothing'],
      ['Mückenspray', 'toiletries'],
      ['Sonnencreme', 'toiletries'],
      ['Wasser', 'other'],
      ['Kamera / Handy geladen', 'electronics'],
      ['Handtuch', 'other'],
    ],
  },
];
