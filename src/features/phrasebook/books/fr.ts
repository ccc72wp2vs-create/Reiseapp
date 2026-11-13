import { groups, p, type PhraseBook } from '../types';

export const fr: PhraseBook = {
  lang: 'fr',
  speech: 'fr-FR',
  speakerHint: 'Manche Sätze ändern sich je nach Sprecher:in (z. B. „végétarien/végétarienne“).',
  footer: 'Aussprache vereinfacht – nasale Laute nur angedeutet. Funktioniert offline.',
  groups: groups({
    hand: [
      p('Hallo / Guten Tag', 'Bonjour', 'bon-schur'),
      p('Guten Abend', 'Bonsoir', 'bon-swar'),
      p('Auf Wiedersehen', 'Au revoir', 'o rö-wwar'),
      p('Danke', 'Merci', 'mär-ssi'),
      p('Bitte', "S'il vous plaît", 'ssil wu plä'),
      p('Entschuldigung', 'Excusez-moi', 'ex-küse mwa'),
      p('Ja / Nein', 'Oui / Non', 'wi / non'),
      p('Ich verstehe nicht', 'Je ne comprends pas', 'schö nö kom-pran pa'),
      p('Sprechen Sie Englisch?', 'Vous parlez anglais ?', 'wu parle ang-glä'),
    ],
    food: [
      p('Einen Tisch für vier, bitte', "Une table pour quatre, s'il vous plaît", 'ün tabl pur katr'),
      p('Die Karte, bitte', "La carte, s'il vous plaît", 'la kart ssil wu plä'),
      p('Die Rechnung, bitte', "L'addition, s'il vous plaît", 'la-di-ssjon ssil wu plä'),
      p('Eine Karaffe Leitungswasser', "Une carafe d'eau", 'ün ka-raf do', { hint: 'Im Restaurant meist kostenlos.' }),
      p('Ein Bier', 'Une bière', 'ün bjär'),
      p('Ich bin Vegetarier', 'Je suis végétarien', 'schö süi we-sche-ta-rjän', { f: { text: 'Je suis végétarienne', say: 'schö süi we-sche-ta-rjänn' } }),
      p('Ich bin allergisch gegen Nüsse', 'Je suis allergique aux noix', 'schö süi aler-schik o nwa'),
      p('Sehr lecker!', "C'est délicieux !", 'ssä deli-ssjö'),
    ],
    shopping: [
      p('Wie viel kostet das?', "C'est combien ?", 'ssä kom-bjän'),
      p('Das ist zu teuer', "C'est trop cher", 'ssä tro schär'),
      p('Kann ich mit Karte zahlen?', 'Je peux payer par carte ?', 'schö pö pä-je par kart'),
      p('Ich nehme das', 'Je prends ça', 'schö pran ssa'),
    ],
    transport: [
      p('Wo ist …?', 'Où est … ?', 'u ä'),
      p('Wo ist die Toilette?', 'Où sont les toilettes ?', 'u ssõ le twa-lett'),
      p('Links / Rechts', 'À gauche / À droite', 'a gosch / a drwat'),
      p('Geradeaus', 'Tout droit', 'tu drwa'),
      p('Zum Flughafen, bitte', "À l'aéroport, s'il vous plaît", 'a la-ero-por ssil wu plä'),
      p('Eine Fahrkarte nach …', 'Un billet pour …', 'än bi-jä pur'),
    ],
    emergency: [
      p('Hilfe!', 'Au secours !', 'o ssö-kur'),
      p('Ich brauche einen Arzt', "J'ai besoin d'un médecin", 'schä bö-swän dän med-ssän'),
      p('Krankenhaus', "L'hôpital", 'lo-pi-tal'),
      p('Apotheke', 'La pharmacie', 'la far-ma-ssi'),
      p('Rufen Sie die Polizei!', 'Appelez la police !', 'ap-le la po-liss'),
    ],
    numbers: [
      p('1', 'un', 'än'), p('2', 'deux', 'dö'), p('3', 'trois', 'trwa'), p('4', 'quatre', 'katr'), p('5', 'cinq', 'ssänk'),
      p('10', 'dix', 'diss'), p('20', 'vingt', 'wän'), p('50', 'cinquante', 'ssän-kant'), p('100', 'cent', 'ssan'), p('1.000', 'mille', 'mil'),
    ],
  }),
};
