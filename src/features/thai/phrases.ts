/**
 * Small Thai phrasebook (offline). `polite: true` phrases get the polite
 * particle appended: ครับ (khráp, male speaker) or ค่ะ (khâ, female speaker).
 * Transliteration follows a simplified, German-friendly reading.
 */
export interface Phrase {
  de: string;
  th: string;
  /** Pronunciation (simplified). */
  say: string;
  polite?: boolean;
  hint?: string;
}

export interface PhraseGroup {
  key: string;
  title: string;
  icon: 'hand' | 'food' | 'shopping' | 'transport' | 'emergency' | 'numbers';
  phrases: Phrase[];
}

export const PHRASES: PhraseGroup[] = [
  {
    key: 'basics',
    title: 'Grundlagen',
    icon: 'hand',
    phrases: [
      { de: 'Hallo / Tschüss', th: 'สวัสดี', say: 'sa-wat-dii', polite: true, hint: 'Mit Wai (Hände zusammen, leichte Verbeugung).' },
      { de: 'Danke', th: 'ขอบคุณ', say: 'khop-khun', polite: true },
      { de: 'Kein Problem / Bitte schön', th: 'ไม่เป็นไร', say: 'mai pen rai', polite: true },
      { de: 'Entschuldigung', th: 'ขอโทษ', say: 'khor-thoot', polite: true },
      { de: 'Ja', th: 'ใช่', say: 'chai', polite: true },
      { de: 'Nein', th: 'ไม่', say: 'mai' },
      { de: 'Nein danke (brauche ich nicht)', th: 'ไม่เอา ขอบคุณ', say: 'mai ao, khop-khun', polite: true, hint: 'Praktisch bei Verkäufern und Taxi-Angeboten.' },
      { de: 'Ich verstehe nicht', th: 'ไม่เข้าใจ', say: 'mai khao-jai', polite: true },
      { de: 'Sprechen Sie Englisch?', th: 'พูดภาษาอังกฤษได้ไหม', say: 'phuut pha-saa ang-grit dai mai', polite: true },
    ],
  },
  {
    key: 'food',
    title: 'Essen & Trinken',
    icon: 'food',
    phrases: [
      { de: 'Nicht scharf, bitte', th: 'ไม่เผ็ด', say: 'mai phet', polite: true },
      { de: 'Ein bisschen scharf', th: 'เผ็ดนิดหน่อย', say: 'phet nit-noi', polite: true },
      { de: 'Sehr lecker!', th: 'อร่อยมาก', say: 'a-roi maak', polite: true },
      { de: 'Die Rechnung, bitte', th: 'เช็คบิล', say: 'chek bin', polite: true },
      { de: 'Wasser (ohne Kohlensäure)', th: 'น้ำเปล่า', say: 'naam plao', polite: true },
      { de: 'Ohne Eis', th: 'ไม่ใส่น้ำแข็ง', say: 'mai sai naam-khaeng', polite: true },
      { de: 'Ohne Zucker', th: 'ไม่ใส่น้ำตาล', say: 'mai sai naam-taan', polite: true },
      { de: 'Ich esse kein Fleisch', th: 'ไม่กินเนื้อสัตว์', say: 'mai gin nuea-sat', polite: true },
      { de: 'Ich bin allergisch gegen Erdnüsse', th: 'แพ้ถั่วลิสง', say: 'phae thua-li-song', polite: true },
      { de: 'Zum Mitnehmen', th: 'ใส่ถุง', say: 'sai thung', polite: true, hint: 'Wörtlich: „in die Tüte“.' },
    ],
  },
  {
    key: 'shopping',
    title: 'Einkaufen & Handeln',
    icon: 'shopping',
    phrases: [
      { de: 'Wie viel kostet das?', th: 'เท่าไหร่', say: 'thao-rai', polite: true },
      { de: 'Zu teuer', th: 'แพงไป', say: 'phaeng pai', polite: true },
      { de: 'Geht es günstiger?', th: 'ลดได้ไหม', say: 'lot dai mai', polite: true },
      { de: 'Ich nehme das', th: 'เอาอันนี้', say: 'ao an-nii', polite: true },
      { de: 'Nur schauen', th: 'ดูเฉยๆ', say: 'duu choei-choei', polite: true },
    ],
  },
  {
    key: 'transport',
    title: 'Unterwegs & Taxi',
    icon: 'transport',
    phrases: [
      { de: 'Wo ist …?', th: '… อยู่ที่ไหน', say: '… yuu thii-nai', polite: true },
      { de: 'Wo ist die Toilette?', th: 'ห้องน้ำอยู่ที่ไหน', say: 'hong-naam yuu thii-nai', polite: true },
      { de: 'Bitte mit Taxameter', th: 'ใช้มิเตอร์ได้ไหม', say: 'chai mi-toe dai mai', polite: true },
      { de: 'Bitte hier anhalten', th: 'จอดตรงนี้', say: 'jot trong-nii', polite: true },
      { de: 'Links', th: 'ซ้าย', say: 'saai' },
      { de: 'Rechts', th: 'ขวา', say: 'khwaa' },
      { de: 'Geradeaus', th: 'ตรงไป', say: 'trong pai' },
      { de: 'Langsam, bitte', th: 'ช้าๆ หน่อย', say: 'chaa-chaa noi', polite: true },
    ],
  },
  {
    key: 'emergency',
    title: 'Notfall & Gesundheit',
    icon: 'emergency',
    phrases: [
      { de: 'Hilfe!', th: 'ช่วยด้วย', say: 'chuai duai' },
      { de: 'Ich brauche einen Arzt', th: 'ต้องการหมอ', say: 'tong-gaan mor', polite: true },
      { de: 'Krankenhaus', th: 'โรงพยาบาล', say: 'rong-pha-yaa-baan' },
      { de: 'Apotheke', th: 'ร้านขายยา', say: 'raan khaai yaa' },
      { de: 'Bitte rufen Sie die Polizei', th: 'เรียกตำรวจ', say: 'riak tam-ruat', polite: true },
      { de: 'Mir geht es nicht gut', th: 'ไม่สบาย', say: 'mai sa-baai', polite: true },
    ],
  },
  {
    key: 'numbers',
    title: 'Zahlen',
    icon: 'numbers',
    phrases: [
      { de: '1', th: 'หนึ่ง', say: 'nueng' },
      { de: '2', th: 'สอง', say: 'song' },
      { de: '3', th: 'สาม', say: 'saam' },
      { de: '4', th: 'สี่', say: 'sii' },
      { de: '5', th: 'ห้า', say: 'haa' },
      { de: '10', th: 'สิบ', say: 'sip' },
      { de: '20', th: 'ยี่สิบ', say: 'yii-sip' },
      { de: '50', th: 'ห้าสิบ', say: 'haa-sip' },
      { de: '100', th: 'หนึ่งร้อย', say: 'nueng roi' },
      { de: '1.000', th: 'หนึ่งพัน', say: 'nueng phan' },
    ],
  },
];

export const PARTICLE = {
  m: { th: 'ครับ', say: 'khrap' },
  f: { th: 'ค่ะ', say: 'kha' },
} as const;

export type Speaker = keyof typeof PARTICLE;

export function withParticle(p: Phrase, speaker: Speaker): { th: string; say: string } {
  if (!p.polite) return { th: p.th, say: p.say };
  const part = PARTICLE[speaker];
  return { th: `${p.th} ${part.th}`, say: `${p.say} ${part.say}` };
}
