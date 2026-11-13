import { groups, p, type PhraseBook } from '../types';

export const es: PhraseBook = {
  lang: 'es',
  speech: 'es-ES',
  speakerHint: 'Manche Sätze ändern sich je nach Sprecher:in (z. B. „vegetariano/vegetariana“).',
  footer: 'Aussprache vereinfacht für deutsche Muttersprachler. In Lateinamerika teils andere Wörter. Funktioniert offline.',
  groups: groups({
    hand: [
      p('Hallo', 'Hola', 'ola'),
      p('Guten Tag', 'Buenos días', 'buenos dias'),
      p('Tschüss', 'Adiós', 'adjos'),
      p('Danke', 'Gracias', 'gra-thjas'),
      p('Bitte', 'Por favor', 'por fa-wor'),
      p('Entschuldigung', 'Perdón', 'per-don'),
      p('Ja / Nein', 'Sí / No', 'ssi / no'),
      p('Ich verstehe nicht', 'No entiendo', 'no en-tjendo'),
      p('Sprechen Sie Englisch?', '¿Habla inglés?', 'abla ingles'),
    ],
    food: [
      p('Einen Tisch für vier, bitte', 'Una mesa para cuatro, por favor', 'una messa para kuatro'),
      p('Die Karte, bitte', 'La carta, por favor', 'la karta por fa-wor'),
      p('Die Rechnung, bitte', 'La cuenta, por favor', 'la kuenta por fa-wor'),
      p('Wasser ohne Kohlensäure', 'Agua sin gas', 'agua sin gas'),
      p('Ein Bier', 'Una cerveza', 'una ther-wetha'),
      p('Ich bin Vegetarier', 'Soy vegetariano', 'soi we-che-tarjano', { f: { text: 'Soy vegetariana', say: 'soi we-che-tarjana' } }),
      p('Ich bin allergisch gegen Nüsse', 'Soy alérgico a los frutos secos', 'soi a-ler-chiko a los frutos sekos', { f: { text: 'Soy alérgica a los frutos secos', say: 'soi a-ler-chika a los frutos sekos' } }),
      p('Sehr lecker!', '¡Está buenísimo!', 'esta bue-nissimo'),
    ],
    shopping: [
      p('Wie viel kostet das?', '¿Cuánto cuesta?', 'kuanto kuesta'),
      p('Das ist zu teuer', 'Es demasiado caro', 'es dema-sjado karo'),
      p('Kann ich mit Karte zahlen?', '¿Puedo pagar con tarjeta?', 'puedo pagar kon tar-cheta'),
      p('Ich nehme das', 'Me llevo esto', 'me jewo esto'),
    ],
    transport: [
      p('Wo ist …?', '¿Dónde está …?', 'donde esta'),
      p('Wo ist die Toilette?', '¿Dónde está el baño?', 'donde esta el banjo'),
      p('Links / Rechts', 'A la izquierda / A la derecha', 'a la ith-kjerda / a la de-retscha'),
      p('Geradeaus', 'Todo recto', 'todo rekto'),
      p('Zum Flughafen, bitte', 'Al aeropuerto, por favor', 'al aero-puerto por fa-wor'),
      p('Eine Fahrkarte nach …', 'Un billete a …', 'un bi-jete a'),
    ],
    emergency: [
      p('Hilfe!', '¡Ayuda!', 'a-juda'),
      p('Ich brauche einen Arzt', 'Necesito un médico', 'nethe-ssito un mediko'),
      p('Krankenhaus', 'El hospital', 'el ospital'),
      p('Apotheke', 'La farmacia', 'la far-mathja'),
      p('Rufen Sie die Polizei!', '¡Llame a la policía!', 'jame a la poli-thia'),
    ],
    numbers: [
      p('1', 'uno', 'uno'), p('2', 'dos', 'dos'), p('3', 'tres', 'tres'), p('4', 'cuatro', 'kuatro'), p('5', 'cinco', 'thinko'),
      p('10', 'diez', 'djeth'), p('20', 'veinte', 'weinte'), p('50', 'cincuenta', 'thin-kuenta'), p('100', 'cien', 'thjen'), p('1.000', 'mil', 'mil'),
    ],
  }),
};
