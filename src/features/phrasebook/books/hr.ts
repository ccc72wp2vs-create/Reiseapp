import { groups, p, type PhraseBook } from '../types';

export const hr: PhraseBook = {
  lang: 'hr',
  speech: 'hr-HR',
  speakerHint: 'Manche Sätze ändern sich je nach Sprecher:in (z. B. „vegetarijanac/vegetarijanka“).',
  footer: 'Aussprache vereinfacht für deutsche Muttersprachler. Funktioniert offline.',
  groups: groups({
    hand: [
      p('Guten Tag', 'Dobar dan', 'dobar dan'),
      p('Hallo / Tschüss (locker)', 'Bok', 'bok'),
      p('Auf Wiedersehen', 'Doviđenja', 'dowi-dschenja'),
      p('Danke', 'Hvala', 'hwala'),
      p('Bitte', 'Molim', 'molim'),
      p('Entschuldigung', 'Oprostite', 'opros-tite'),
      p('Ja / Nein', 'Da / Ne', 'da / ne'),
      p('Ich verstehe nicht', 'Ne razumijem', 'ne rasu-mijem'),
      p('Sprechen Sie Englisch?', 'Govorite li engleski?', 'gowo-rite li engleski'),
    ],
    food: [
      p('Einen Tisch für vier, bitte', 'Stol za četvero, molim', 'stol sa tschet-wero molim'),
      p('Die Karte, bitte', 'Jelovnik, molim', 'jelow-nik molim'),
      p('Die Rechnung, bitte', 'Račun, molim', 'ratschun molim'),
      p('Stilles Wasser', 'Negazirana voda', 'nega-sirana woda'),
      p('Ein Bier', 'Jedno pivo', 'jedno piwo'),
      p('Ich bin Vegetarier', 'Ja sam vegetarijanac', 'ja sam wegetari-janaz', { f: { text: 'Ja sam vegetarijanka', say: 'ja sam wegetari-janka' } }),
      p('Ich bin allergisch gegen Nüsse', 'Alergičan sam na orašaste plodove', 'aler-gitschan sam na ora-schaste plodowe', { f: { text: 'Alergična sam na orašaste plodove', say: 'aler-gitschna sam na ora-schaste plodowe' } }),
      p('Sehr lecker!', 'Vrlo ukusno!', 'wrlo ukusno'),
    ],
    shopping: [
      p('Wie viel kostet das?', 'Koliko košta?', 'koliko koschta'),
      p('Das ist zu teuer', 'Preskupo je', 'pre-skupo je'),
      p('Kann ich mit Karte zahlen?', 'Mogu li platiti karticom?', 'mogu li platiti karti-zom'),
      p('Ich nehme das', 'Uzet ću ovo', 'usett tschu owo'),
    ],
    transport: [
      p('Wo ist …?', 'Gdje je …?', 'gdje je'),
      p('Wo ist die Toilette?', 'Gdje je WC?', 'gdje je we-ze'),
      p('Links / Rechts', 'Lijevo / Desno', 'lijewo / desno'),
      p('Geradeaus', 'Ravno', 'rawno'),
      p('Zum Flughafen, bitte', 'Do zračne luke, molim', 'do sratschne luke molim'),
      p('Eine Fahrkarte nach …', 'Jednu kartu za …', 'jednu kartu sa'),
    ],
    emergency: [
      p('Hilfe!', 'Upomoć!', 'upo-motsch'),
      p('Ich brauche einen Arzt', 'Trebam liječnika', 'trebam lijetsch-nika'),
      p('Krankenhaus', 'Bolnica', 'bolniza'),
      p('Apotheke', 'Ljekarna', 'ljekarna'),
      p('Rufen Sie die Polizei!', 'Zovite policiju!', 'sowite poli-ziju'),
    ],
    numbers: [
      p('1', 'jedan', 'jedan'), p('2', 'dva', 'dwa'), p('3', 'tri', 'tri'), p('4', 'četiri', 'tschetiri'), p('5', 'pet', 'pet'),
      p('10', 'deset', 'desset'), p('20', 'dvadeset', 'dwa-desset'), p('50', 'pedeset', 'pe-desset'), p('100', 'sto', 'sto'), p('1.000', 'tisuća', 'tissu-tscha'),
    ],
  }),
};
