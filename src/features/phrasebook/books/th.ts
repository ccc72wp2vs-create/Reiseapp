import { groups, p, type PhraseBook } from '../types';

const P = { polite: true };

export const th: PhraseBook = {
  lang: 'th',
  speech: 'th-TH',
  particle: { m: { text: 'ครับ', say: 'khrap' }, f: { text: 'ค่ะ', say: 'kha' } },
  speakerHint: 'Höfliche Sätze enden je nach Sprecher:in mit „khrap“ oder „kha“ – das wird automatisch angehängt.',
  footer: 'Aussprache vereinfacht – Thai ist eine Tonsprache, Zeigen klappt immer. Funktioniert offline.',
  groups: groups({
    hand: [
      p('Hallo / Tschüss', 'สวัสดี', 'sa-wat-dii', { ...P, hint: 'Mit Wai (Hände zusammen, leichte Verbeugung).' }),
      p('Danke', 'ขอบคุณ', 'khop-khun', P),
      p('Kein Problem / Bitte schön', 'ไม่เป็นไร', 'mai pen rai', P),
      p('Entschuldigung', 'ขอโทษ', 'khor-thoot', P),
      p('Ja', 'ใช่', 'chai', P),
      p('Nein', 'ไม่', 'mai'),
      p('Nein danke (brauche ich nicht)', 'ไม่เอา ขอบคุณ', 'mai ao, khop-khun', { ...P, hint: 'Praktisch bei Verkäufern und Taxi-Angeboten.' }),
      p('Ich verstehe nicht', 'ไม่เข้าใจ', 'mai khao-jai', P),
      p('Sprechen Sie Englisch?', 'พูดภาษาอังกฤษได้ไหม', 'phuut pha-saa ang-grit dai mai', P),
    ],
    food: [
      p('Nicht scharf, bitte', 'ไม่เผ็ด', 'mai phet', P),
      p('Ein bisschen scharf', 'เผ็ดนิดหน่อย', 'phet nit-noi', P),
      p('Sehr lecker!', 'อร่อยมาก', 'a-roi maak', P),
      p('Die Rechnung, bitte', 'เช็คบิล', 'chek bin', P),
      p('Wasser (ohne Kohlensäure)', 'น้ำเปล่า', 'naam plao', P),
      p('Ohne Eis', 'ไม่ใส่น้ำแข็ง', 'mai sai naam-khaeng', P),
      p('Ohne Zucker', 'ไม่ใส่น้ำตาล', 'mai sai naam-taan', P),
      p('Ich esse kein Fleisch', 'ไม่กินเนื้อสัตว์', 'mai gin nuea-sat', P),
      p('Ich bin allergisch gegen Erdnüsse', 'แพ้ถั่วลิสง', 'phae thua-li-song', P),
      p('Zum Mitnehmen', 'ใส่ถุง', 'sai thung', { ...P, hint: 'Wörtlich: „in die Tüte“.' }),
    ],
    shopping: [
      p('Wie viel kostet das?', 'เท่าไหร่', 'thao-rai', P),
      p('Zu teuer', 'แพงไป', 'phaeng pai', P),
      p('Geht es günstiger?', 'ลดได้ไหม', 'lot dai mai', P),
      p('Ich nehme das', 'เอาอันนี้', 'ao an-nii', P),
      p('Nur schauen', 'ดูเฉยๆ', 'duu choei-choei', P),
    ],
    transport: [
      p('Wo ist …?', '… อยู่ที่ไหน', '… yuu thii-nai', P),
      p('Wo ist die Toilette?', 'ห้องน้ำอยู่ที่ไหน', 'hong-naam yuu thii-nai', P),
      p('Bitte mit Taxameter', 'ใช้มิเตอร์ได้ไหม', 'chai mi-toe dai mai', P),
      p('Bitte hier anhalten', 'จอดตรงนี้', 'jot trong-nii', P),
      p('Links', 'ซ้าย', 'saai'),
      p('Rechts', 'ขวา', 'khwaa'),
      p('Geradeaus', 'ตรงไป', 'trong pai'),
      p('Langsam, bitte', 'ช้าๆ หน่อย', 'chaa-chaa noi', P),
    ],
    emergency: [
      p('Hilfe!', 'ช่วยด้วย', 'chuai duai'),
      p('Ich brauche einen Arzt', 'ต้องการหมอ', 'tong-gaan mor', P),
      p('Krankenhaus', 'โรงพยาบาล', 'rong-pha-yaa-baan'),
      p('Apotheke', 'ร้านขายยา', 'raan khaai yaa'),
      p('Bitte rufen Sie die Polizei', 'เรียกตำรวจ', 'riak tam-ruat', P),
      p('Mir geht es nicht gut', 'ไม่สบาย', 'mai sa-baai', P),
    ],
    numbers: [
      p('1', 'หนึ่ง', 'nueng'), p('2', 'สอง', 'song'), p('3', 'สาม', 'saam'), p('4', 'สี่', 'sii'), p('5', 'ห้า', 'haa'),
      p('10', 'สิบ', 'sip'), p('20', 'ยี่สิบ', 'yii-sip'), p('50', 'ห้าสิบ', 'haa-sip'), p('100', 'หนึ่งร้อย', 'nueng roi'), p('1.000', 'หนึ่งพัน', 'nueng phan'),
    ],
  }),
};
