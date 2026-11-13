import { groups, p, type PhraseBook } from '../types';

export const el: PhraseBook = {
  lang: 'el',
  speech: 'el-GR',
  footer: 'Aussprache vereinfacht. Achtung: „ne“ (ναι) heißt Ja! Funktioniert offline.',
  groups: groups({
    hand: [
      p('Hallo / Tschüss', 'Γεια σας', 'ja sas', { hint: 'Locker unter Freunden: „Γεια σου“ (ja ssu).' }),
      p('Guten Morgen', 'Καλημέρα', 'kali-mera'),
      p('Danke', 'Ευχαριστώ', 'ef-chari-sto'),
      p('Bitte / Gern geschehen', 'Παρακαλώ', 'para-kalo'),
      p('Entschuldigung', 'Συγγνώμη', 'ssig-nomi'),
      p('Ja', 'Ναι', 'ne'),
      p('Nein', 'Όχι', 'ochi'),
      p('Ich verstehe nicht', 'Δεν καταλαβαίνω', 'den kata-lawäno'),
      p('Sprechen Sie Englisch?', 'Μιλάτε αγγλικά;', 'milate angli-ka'),
    ],
    food: [
      p('Einen Tisch für vier, bitte', 'Ένα τραπέζι για τέσσερις, παρακαλώ', 'ena tra-pesi ja tesseris'),
      p('Die Karte, bitte', 'Τον κατάλογο, παρακαλώ', 'ton ka-talogo para-kalo'),
      p('Die Rechnung, bitte', 'Τον λογαριασμό, παρακαλώ', 'ton logarias-mo para-kalo'),
      p('Wasser', 'Νερό', 'nero'),
      p('Ein Bier', 'Μία μπύρα', 'mia bira'),
      p('Ich bin Vegetarier', 'Είμαι χορτοφάγος', 'ime chorto-fagos'),
      p('Ich bin allergisch gegen Nüsse', 'Έχω αλλεργία στους ξηρούς καρπούς', 'echo aler-gia stus xirus karpus'),
      p('Sehr lecker!', 'Πολύ νόστιμο!', 'poli nostimo'),
    ],
    shopping: [
      p('Wie viel kostet das?', 'Πόσο κάνει;', 'posso kani'),
      p('Das ist zu teuer', 'Είναι πολύ ακριβό', 'ine poli akri-wo'),
      p('Kann ich mit Karte zahlen?', 'Μπορώ να πληρώσω με κάρτα;', 'boro na plirosso me karta'),
      p('Ich nehme das', 'Θα πάρω αυτό', 'tha paro afto'),
    ],
    transport: [
      p('Wo ist …?', 'Πού είναι …;', 'pu ine'),
      p('Wo ist die Toilette?', 'Πού είναι η τουαλέτα;', 'pu ine i tua-leta'),
      p('Links / Rechts', 'Αριστερά / Δεξιά', 'aris-tera / dex-ja'),
      p('Geradeaus', 'Ευθεία', 'ef-thia'),
      p('Zum Flughafen, bitte', 'Στο αεροδρόμιο, παρακαλώ', 'sto aero-dromio para-kalo'),
      p('Eine Fahrkarte nach …', 'Ένα εισιτήριο για …', 'ena issi-tirio ja'),
    ],
    emergency: [
      p('Hilfe!', 'Βοήθεια!', 'wo-ithia'),
      p('Ich brauche einen Arzt', 'Χρειάζομαι γιατρό', 'chri-asome ja-tro'),
      p('Krankenhaus', 'Νοσοκομείο', 'nosso-komio'),
      p('Apotheke', 'Φαρμακείο', 'farma-kio'),
      p('Rufen Sie die Polizei!', 'Καλέστε την αστυνομία!', 'ka-leste tin astino-mia'),
    ],
    numbers: [
      p('1', 'ένα', 'ena'), p('2', 'δύο', 'dio'), p('3', 'τρία', 'tria'), p('4', 'τέσσερα', 'tessera'), p('5', 'πέντε', 'pende'),
      p('10', 'δέκα', 'deka'), p('20', 'είκοσι', 'ikossi'), p('50', 'πενήντα', 'pe-ninda'), p('100', 'εκατό', 'eka-to'), p('1.000', 'χίλια', 'chilja'),
    ],
  }),
};
