import { groups, p, type PhraseBook } from '../types';

export const tr: PhraseBook = {
  lang: 'tr',
  speech: 'tr-TR',
  footer: 'Aussprache vereinfacht für deutsche Muttersprachler. Funktioniert offline.',
  groups: groups({
    hand: [
      p('Hallo', 'Merhaba', 'merhaba'),
      p('Guten Morgen', 'Günaydın', 'günai-din'),
      p('Tschüss (wenn ihr geht)', 'Hoşça kalın', 'hosch-tscha kalin'),
      p('Danke', 'Teşekkür ederim', 'tesche-kür ederim'),
      p('Bitte', 'Lütfen', 'lütfen'),
      p('Entschuldigung', 'Affedersiniz', 'affeder-sinis'),
      p('Ja / Nein', 'Evet / Hayır', 'ewet / hajir'),
      p('Ich verstehe nicht', 'Anlamıyorum', 'anla-mijorum'),
      p('Sprechen Sie Englisch?', 'İngilizce biliyor musunuz?', 'ingilis-dsche bilijor mussunus'),
    ],
    food: [
      p('Einen Tisch für vier, bitte', 'Dört kişilik bir masa, lütfen', 'dört kischilik bir massa lütfen'),
      p('Die Karte, bitte', 'Menü, lütfen', 'menü lütfen'),
      p('Die Rechnung, bitte', 'Hesap, lütfen', 'hessap lütfen'),
      p('Wasser', 'Su', 'ssu'),
      p('Ein Bier', 'Bir bira', 'bir bira'),
      p('Ich bin Vegetarier', 'Vejetaryenim', 'weschetar-jenim'),
      p('Ich bin allergisch gegen Nüsse', 'Kuruyemişe alerjim var', 'kuru-jemische alerschim war'),
      p('Sehr lecker!', 'Çok lezzetli!', 'tschok lesset-li'),
    ],
    shopping: [
      p('Wie viel kostet das?', 'Bu ne kadar?', 'bu ne kadar'),
      p('Das ist zu teuer', 'Çok pahalı', 'tschok paha-li'),
      p('Kann ich mit Karte zahlen?', 'Kartla ödeyebilir miyim?', 'kartla ödeje-bilir mijim'),
      p('Ich nehme das', 'Bunu alıyorum', 'bunu alijorum'),
    ],
    transport: [
      p('Wo ist …?', '… nerede?', 'neredä'),
      p('Wo ist die Toilette?', 'Tuvalet nerede?', 'tuwalet neredä'),
      p('Links / Rechts', 'Sol / Sağ', 'ssol / ssaa'),
      p('Geradeaus', 'Düz', 'düs'),
      p('Zum Flughafen, bitte', 'Havalimanına, lütfen', 'hawali-manina lütfen'),
      p('Eine Fahrkarte nach …', '… için bir bilet', 'itschin bir bilet'),
    ],
    emergency: [
      p('Hilfe!', 'İmdat!', 'imdat'),
      p('Ich brauche einen Arzt', 'Doktora ihtiyacım var', 'doktora ihti-jadschim war'),
      p('Krankenhaus', 'Hastane', 'hastane'),
      p('Apotheke', 'Eczane', 'edsch-sane'),
      p('Rufen Sie die Polizei!', 'Polisi arayın!', 'polissi arajin'),
    ],
    numbers: [
      p('1', 'bir', 'bir'), p('2', 'iki', 'iki'), p('3', 'üç', 'ütsch'), p('4', 'dört', 'dört'), p('5', 'beş', 'besch'),
      p('10', 'on', 'on'), p('20', 'yirmi', 'jirmi'), p('50', 'elli', 'elli'), p('100', 'yüz', 'jüs'), p('1.000', 'bin', 'bin'),
    ],
  }),
};
