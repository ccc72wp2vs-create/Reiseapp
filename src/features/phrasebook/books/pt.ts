import { groups, p, type PhraseBook } from '../types';

export const pt: PhraseBook = {
  lang: 'pt',
  speech: 'pt-PT',
  speakerHint: 'Manche Sätze ändern sich je nach Sprecher:in (z. B. „obrigado/obrigada“).',
  footer: 'Europäisches Portugiesisch, Aussprache vereinfacht. In Brasilien teils andere Wörter (siehe Hinweise). Funktioniert offline.',
  groups: groups({
    hand: [
      p('Hallo', 'Olá', 'o-la'),
      p('Guten Tag', 'Bom dia', 'bõ dia'),
      p('Tschüss / Bis später', 'Até logo', 'a-tä logu'),
      p('Danke', 'Obrigado', 'obri-gadu', { f: { text: 'Obrigada', say: 'obri-gada' }, hint: 'Männer sagen „obrigado“, Frauen „obrigada“.' }),
      p('Bitte', 'Por favor', 'pur fa-wor'),
      p('Entschuldigung', 'Desculpe', 'desch-kulp'),
      p('Ja / Nein', 'Sim / Não', 'ssim / nau'),
      p('Ich verstehe nicht', 'Não entendo', 'nau en-tendu'),
      p('Sprechen Sie Englisch?', 'Fala inglês?', 'fala in-glesch'),
    ],
    food: [
      p('Einen Tisch für vier, bitte', 'Uma mesa para quatro, por favor', 'uma mesa para kwatru'),
      p('Die Karte, bitte', 'A ementa, por favor', 'a i-menta pur fa-wor', { hint: 'Brasilien: „o cardápio“.' }),
      p('Die Rechnung, bitte', 'A conta, por favor', 'a konta pur fa-wor'),
      p('Wasser ohne Kohlensäure', 'Água sem gás', 'agwa ssem gasch'),
      p('Ein Bier', 'Uma cerveja', 'uma ser-wescha'),
      p('Ich bin Vegetarier', 'Sou vegetariano', 'sso wesche-tarjanu', { f: { text: 'Sou vegetariana', say: 'sso wesche-tarjana' } }),
      p('Ich bin allergisch gegen Nüsse', 'Sou alérgico a frutos secos', 'sso a-lerschiku a frutusch sekusch', { f: { text: 'Sou alérgica a frutos secos', say: 'sso a-lerschika a frutusch sekusch' } }),
      p('Sehr lecker!', 'Está delicioso!', 'schta deli-ssjosu'),
    ],
    shopping: [
      p('Wie viel kostet das?', 'Quanto custa?', 'kwantu kuschta'),
      p('Das ist zu teuer', 'É muito caro', 'ä muintu karu'),
      p('Kann ich mit Karte zahlen?', 'Posso pagar com cartão?', 'possu pagar kõ kar-tau'),
      p('Ich nehme das', 'Levo isto', 'läwu ischtu'),
    ],
    transport: [
      p('Wo ist …?', 'Onde fica …?', 'onde fika'),
      p('Wo ist die Toilette?', 'Onde é a casa de banho?', 'onde ä a kasa de banju', { hint: 'Brasilien: „Onde é o banheiro?“' }),
      p('Links / Rechts', 'À esquerda / À direita', 'a isch-kerda / a di-reita'),
      p('Geradeaus', 'Sempre em frente', 'ssempre ãi frent'),
      p('Zum Flughafen, bitte', 'Para o aeroporto, por favor', 'para u aero-portu pur fa-wor'),
      p('Eine Fahrkarte nach …', 'Um bilhete para …', 'um bil-jete para', { hint: 'Brasilien: „uma passagem para …“' }),
    ],
    emergency: [
      p('Hilfe!', 'Socorro!', 'su-korru'),
      p('Ich brauche einen Arzt', 'Preciso de um médico', 'pre-ssisu de um mädiku'),
      p('Krankenhaus', 'O hospital', 'u osch-pital'),
      p('Apotheke', 'A farmácia', 'a far-massja'),
      p('Rufen Sie die Polizei!', 'Chame a polícia!', 'schame a pu-lissja'),
    ],
    numbers: [
      p('1', 'um', 'um'), p('2', 'dois', 'doisch'), p('3', 'três', 'tresch'), p('4', 'quatro', 'kwatru'), p('5', 'cinco', 'ssinku'),
      p('10', 'dez', 'däsch'), p('20', 'vinte', 'winte'), p('50', 'cinquenta', 'ssin-kwenta'), p('100', 'cem', 'ssãi'), p('1.000', 'mil', 'mil'),
    ],
  }),
};
