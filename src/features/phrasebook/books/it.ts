import { groups, p, type PhraseBook } from '../types';

export const it: PhraseBook = {
  lang: 'it',
  speech: 'it-IT',
  speakerHint: 'Manche Sätze ändern sich je nach Sprecher:in (z. B. „vegetariano/vegetariana“).',
  footer: 'Aussprache vereinfacht für deutsche Muttersprachler. Funktioniert offline.',
  groups: groups({
    hand: [
      p('Hallo / Tschüss (locker)', 'Ciao', 'tschau'),
      p('Guten Tag', 'Buongiorno', 'buon-dschorno'),
      p('Auf Wiedersehen', 'Arrivederci', 'arri-we-dertschi'),
      p('Danke', 'Grazie', 'grazje'),
      p('Bitte', 'Per favore', 'per fa-wore'),
      p('Entschuldigung', 'Scusi', 'skusi'),
      p('Ja / Nein', 'Sì / No', 'ssi / no'),
      p('Ich verstehe nicht', 'Non capisco', 'non ka-pisko'),
      p('Sprechen Sie Englisch?', 'Parla inglese?', 'parla in-gleze'),
    ],
    food: [
      p('Einen Tisch für vier, bitte', 'Un tavolo per quattro, per favore', 'un tawolo per kwattro'),
      p('Die Karte, bitte', 'Il menù, per favore', 'il menu per fa-wore'),
      p('Die Rechnung, bitte', 'Il conto, per favore', 'il konto per fa-wore'),
      p('Stilles Wasser', 'Acqua naturale', 'akwa natu-rale'),
      p('Ein Bier', 'Una birra', 'una birra'),
      p('Ich bin Vegetarier', 'Sono vegetariano', 'sono wedsche-tarjano', { f: { text: 'Sono vegetariana', say: 'sono wedsche-tarjana' } }),
      p('Ich bin allergisch gegen Nüsse', 'Sono allergico alla frutta secca', 'sono al-lerdschiko alla frutta sekka', { f: { text: 'Sono allergica alla frutta secca', say: 'sono al-lerdschika alla frutta sekka' } }),
      p('Sehr lecker!', 'Buonissimo!', 'buo-nissimo'),
    ],
    shopping: [
      p('Wie viel kostet das?', 'Quanto costa?', 'kwanto kosta'),
      p('Das ist zu teuer', 'È troppo caro', 'ä troppo karo'),
      p('Kann ich mit Karte zahlen?', 'Posso pagare con la carta?', 'posso pa-gare kon la karta'),
      p('Ich nehme das', 'Prendo questo', 'prendo kwesto'),
    ],
    transport: [
      p('Wo ist …?', "Dov'è …?", 'dowä'),
      p('Wo ist die Toilette?', "Dov'è il bagno?", 'dowä il banjo'),
      p('Links / Rechts', 'A sinistra / A destra', 'a si-nistra / a destra'),
      p('Geradeaus', 'Sempre dritto', 'sempre dritto'),
      p('Zum Flughafen, bitte', "All'aeroporto, per favore", 'all aero-porto per fa-wore'),
      p('Eine Fahrkarte nach …', 'Un biglietto per …', 'un bil-jetto per'),
    ],
    emergency: [
      p('Hilfe!', 'Aiuto!', 'a-juto'),
      p('Ich brauche einen Arzt', 'Ho bisogno di un medico', 'o bi-sonjo di un mediko'),
      p('Krankenhaus', "L'ospedale", 'lospe-dale'),
      p('Apotheke', 'La farmacia', 'la farma-tschia'),
      p('Rufen Sie die Polizei!', 'Chiami la polizia!', 'kjami la poli-zia'),
    ],
    numbers: [
      p('1', 'uno', 'uno'), p('2', 'due', 'due'), p('3', 'tre', 'tre'), p('4', 'quattro', 'kwattro'), p('5', 'cinque', 'tschinkwe'),
      p('10', 'dieci', 'djetschi'), p('20', 'venti', 'wenti'), p('50', 'cinquanta', 'tschin-kwanta'), p('100', 'cento', 'tschento'), p('1.000', 'mille', 'mille'),
    ],
  }),
};
