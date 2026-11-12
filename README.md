# TRAVIO – Persönlicher Reisebegleiter

TRAVIO ist eine private, mobile-first Progressive Web App für Reiseplanung, Reiseziele, Tagesplanung, Buchungen, eine gemeinsame Reisekasse und Packlisten – optimiert für das iPhone, offline nutzbar und gehostet auf **Cloudflare Workers** mit **D1**.

Die Oberfläche ist vollständig deutsch (zentrale Übersetzungsarchitektur in `src/i18n/`, Englisch kann später ergänzt werden). Datumsformat `TT.MM.JJJJ`, deutsche Zahlenformatierung, Euro als Auswertungswährung.

---

## Inhalt

1. [Architektur](#architektur)
2. [Funktionsumfang V1](#funktionsumfang-v1)
3. [Lokale Entwicklung](#lokale-entwicklung)
4. [Tests & Qualität](#tests--qualität)
5. [Deployment auf Cloudflare](#deployment-auf-cloudflare)
6. [Mit GitHub verbinden](#mit-github-verbinden)
7. [Auf dem iPhone installieren](#auf-dem-iphone-installieren)
8. [Datenimport „Thailand 2026“ & Demo-Daten](#datenimport-thailand-2026--demo-daten)
9. [Kostenlogik](#kostenlogik)
10. [Sicherheit & Datenschutz](#sicherheit--datenschutz)
11. [Offline & Synchronisierung](#offline--synchronisierung)
12. [Kartenanbieter](#kartenanbieter)
13. [Erweiterungspunkte](#erweiterungspunkte)
14. [Was noch nicht verifiziert ist](#was-noch-nicht-verifiziert-ist)

---

## Architektur

| Schicht | Technik | Ort |
| --- | --- | --- |
| UI | React 19, TypeScript, Vite 8, Tailwind CSS 4, React Router, Lucide | `src/` |
| Gemeinsame Domäne | Typen, Zod-Schemas, Geld-/Split-/Ausgleichslogik, Reiselogik | `shared/` |
| API | Hono auf Cloudflare Workers, versioniert unter `/api/v1/` | `worker/` |
| Datenbank | Cloudflare D1 (SQLite), versionierte Migrationen | `migrations/` |
| Hosting | Workers Static Assets (SPA) + Worker (nur `/api/*`) | `wrangler.jsonc` |
| Offline | Service Worker (App-Shell-Precache) + IndexedDB + Sync-Queue | `sw/`, `src/lib/store.ts` |

Wichtige Entscheidungen:

- **Ein Worker, ein Deployment** über das offizielle `@cloudflare/vite-plugin`. Statische Dateien werden direkt von Workers Static Assets ausgeliefert, nur `/api/*` startet den Worker (`run_worker_first`).
- **Eigene, kleine Bausteine statt schwerer Bibliotheken:** Drag & Drop, IndexedDB-Wrapper, Service Worker und State-Store sind dependency-frei. Laufzeit-Abhängigkeiten: `react`, `react-dom`, `react-router`, `hono`, `zod`, `lucide-react`, `leaflet` (nur lazy auf Kartenseiten).
- **Geld ausschließlich in ganzzahligen Minor Units**, Kursumrechnung mit `BigInt` (keine Fließkommazahlen in Abrechnungen).
- **Gemeinsame Validierung:** dieselben Zod-Schemas prüfen REST-Aufrufe und Offline-Sync-Operationen.
- **Optimistisches Locking** (`version`-Spalte) für alle gemeinsam bearbeiteten Einträge – niemals stilles Überschreiben.

```
src/            Frontend (features/, components/, lib/, i18n/, styles/)
shared/         Typen, Schemas, money.ts, finance.ts, costs.ts, trip.ts
worker/         api/ auth/ db/ middleware/ services/ (inkl. Seed-Daten)
migrations/     D1-Migrationen
public/         Manifest, Icons, _headers (Sicherheits-Header)
sw/             Service-Worker-Vorlage (Precache-Liste wird beim Build erzeugt)
tests/          unit/ integration/ (echte API + Migrationen auf SQLite) e2e/ (Playwright)
scripts/        Icon-Generator, E2E-Server
```

## Funktionsumfang V1

- **Reisen:** anlegen, bearbeiten, archivieren, löschen (mit Bestätigung), wechseln, Export als JSON.
- **Reiseziele:** Ankunft/Abreise, Zeitzone, Unterkunft, Koordinaten, Notizen, Titelbild; Reihenfolge per Drag & Drop oder Pfeiltasten; Hinweise auf Überschneidungen, Lücken und unpassende Hotelbuchungen (es wird nie automatisch etwas verschoben).
- **Startseite:** aktuelles Ziel, Reisetag, verbleibende Tage, heutige Aktivitäten & Buchungen, aktuelle Unterkunft, nächster Ortswechsel/Transport, offene Punkte, Reisekasse, Buchungskosten, Schnellaktionen. **Gut sichtbare Erinnerung**, wenn ein Transfer nicht bestätigt ist (z. B. „Transfer Phuket → Koh Lanta noch nicht bestätigt.“).
- **Reiseroute:** Karte mit Markierungen, chronologische Verbindungslinien (Flug, Boot, Landweg, offen), Detailkarte je Ziel (Unterkunft, Aufenthaltsdauer, Aktivitäten) und Timeline.
- **Tagesplan:** Tagesleiste, Aktivitäten anlegen/bearbeiten/löschen/duplizieren/erledigen, Drag & Drop (Touch) + „Nach oben/unten“, Tag ändern, Verknüpfung mit gespeicherten Orten, Apple Karten / Google Maps, Zeitkonflikte, Buchungen des Tages.
- **Entdecken:** gespeicherte Orte als Liste und Karte, Suche, Kategorien, Favoriten, „Zum Tagesplan“, optionaler einmaliger Standortabruf.
- **Reisekasse:** Ausgaben (gleich / Beträge / Prozent), mehrere Währungen mit manuellem oder gespeichertem Kurs (Quelle + Stichtag sichtbar), Rückzahlungen, Salden, Ausgleichsvorschläge, Verlauf mit Filtern, Auswertung nach Kategorie und Person, Währungsrechner.
- **Buchungen:** Flug, Unterkunft, Fähre, Zug, Bus, Mietwagen, Aktivität, Sonstiges – mit Zeitzonen, Buchungs- *und* Zahlungsstatus, Betragsart, Personenbezug, Klärungshinweisen; Übernahme in die Reisekasse höchstens einmal.
- **Packlisten:** private und gemeinsame Listen, Kategorien, Mengen, Fortschritt, Vorlagen.
- **Mehrbenutzer:** Inhaber:in/Bearbeiter:in/Leser:in, einmalige, ablaufende Einladungslinks, serverseitige Berechtigungsprüfung bei jeder Anfrage.
- **PWA:** installierbar, App-Shell offline, Update-Hinweis, Offline-Anzeige, Konfliktauflösung.

Geplante Erweiterungen sind in der App unter **Mehr → In Vorbereitung** klar als „Geplant“ gekennzeichnet.

## Lokale Entwicklung

Voraussetzungen: **Node.js ≥ 22.22** und npm.

```bash
# 1. Abhängigkeiten
npm install            # .npmrc setzt legacy-peer-deps (vitest-Peer-Range)

# 2. Lokale Secrets
cp .dev.vars.example .dev.vars
#    → SETUP_TOKEN auf einen langen Zufallswert setzen, z. B.:
#      openssl rand -base64 32

# 3. Lokale D1-Datenbank migrieren
npm run db:migrate:local

# 4. Starten (Vite + Worker in workerd, lokale D1)
npm run dev
```

Öffne `http://localhost:5173`. Beim ersten Start leitet TRAVIO zur **Einrichtung** weiter: Einrichtungs-Code (`SETUP_TOKEN`), Name, E-Mail und Passwort eingeben → erstes Inhaber-Konto. Danach ist die Einrichtung dauerhaft gesperrt; weitere Personen kommen nur über Einladungen hinzu.

Optionale Frontend-Konfiguration (öffentlich, landet im Bundle): `.env.example` → `.env`.

## Tests & Qualität

```bash
npm run typecheck   # TypeScript (App, Worker, Tests)
npm run lint        # ESLint
npm test            # Vitest: Unit- + Integrationstests
npm run build       # Produktions-Build
npm run test:e2e    # Playwright (startet isolierte lokale Vorschau mit eigener D1)
npm run check       # typecheck + lint + test + build
```

- **Unit-Tests** (`tests/unit`): gleiche/ungleiche/prozentuale Aufteilung, mehrere Währungen, Rundung, Ausgleich, Teilrückzahlungen, Parsing deutscher Beträge, Reiselogik (Reisetag, Zeitzonen, Route, Erinnerungen, Konflikte), Kostenlogik.
- **Integrationstests** (`tests/integration`): die echte Hono-API läuft mit den echten Migrationen gegen SQLite (`node:sqlite`, D1-kompatibler Adapter). Geprüft werden u. a. Einrichtung, Login, Rate-Limit, CSRF, Rollen, Objekt-Autorisierung, Einladungen (einmalig/ablaufend), optimistisches Locking, Offline-Sync (Idempotenz, Konflikte, private Listen), **Thailand-Import (keine Duplikate, alle Kostenvarianten, Status)**, Ausgaben anlegen/bearbeiten/löschen, historische Kurse, Rückzahlungen, Doppelzählungs-Schutz.
- **E2E** (`tests/e2e`): iPhone 15 Pro und iPhone SE – Einrichtung/Login, Import, Dashboard-Erinnerung, Buchungsstatus, Tagesplan inkl. Umsortieren, Offline-Bearbeitung + Sync, Reisekasse, Route, kein horizontales Scrollen, PWA-Dateien.

## Deployment auf Cloudflare

Einmalig (Cloudflare-Konto erforderlich, Befehle im Projektordner):

```bash
# 1. Anmelden
npx wrangler login

# 2. D1-Datenbank anlegen
npx wrangler d1 create travio
#    → die ausgegebene "database_id" in wrangler.jsonc bei
#      d1_databases[0].database_id eintragen (ersetzt REPLACE_WITH_YOUR_D1_DATABASE_ID)

# 3. Migrationen auf die Produktions-DB anwenden
npm run db:migrate:remote

# 4. Secret für die Ersteinrichtung setzen (langer Zufallswert)
npx wrangler secret put SETUP_TOKEN

# 5. Bauen und deployen
npm run deploy
```

Wrangler gibt die URL aus (`https://travio.<dein-subdomain>.workers.dev`). Öffne sie, richte das erste Konto mit dem `SETUP_TOKEN` ein. Danach kannst du das Secret entfernen (`npx wrangler secret delete SETUP_TOKEN`) – die Einrichtung ist ohnehin gesperrt, sobald ein Konto existiert.

Optional:
- **Eigene Domain:** Cloudflare Dashboard → Workers & Pages → `travio` → Settings → Domains & Routes.
- **Kartenanbieter** per `.env` (siehe unten) vor dem Build setzen.
- **R2 für Dokumente (später):** `npx wrangler r2 bucket create travio-documents` und den auskommentierten Block in `wrangler.jsonc` aktivieren. Der Bucket bleibt privat; Dateien werden nur über den authentifizierten Worker ausgeliefert.
- **Zusätzlicher Schutz:** Cloudflare Rate Limiting Rules / Cloudflare Access vor die Domain schalten.

Neue Migrationen: Datei `migrations/000X_beschreibung.sql` anlegen, dann `npm run db:migrate:local` bzw. `npm run db:migrate:remote`. Bestehende Migrationen werden nie verändert.

## Mit GitHub verbinden

```bash
git remote add origin git@github.com:<user>/<repo>.git   # falls noch nicht verbunden
git push -u origin main
```

Automatisches Deployment: Cloudflare Dashboard → Workers & Pages → `travio` → Settings → **Builds** → Repository verbinden. Build-Befehl `npm run build`, Deploy-Befehl `npx wrangler deploy`. Secrets (`SETUP_TOKEN`) werden im Dashboard bzw. per `wrangler secret` verwaltet – **nie** im Repository.

## Auf dem iPhone installieren

1. Die TRAVIO-URL in **Safari** öffnen und anmelden.
2. Unten auf **Teilen** tippen (Quadrat mit Pfeil nach oben).
3. **„Zum Home-Bildschirm“** wählen.
4. Mit **„Hinzufügen“** bestätigen.

TRAVIO startet danach im Vollbild (standalone), mit eigenem Icon, Safe-Area-Unterstützung und Offline-App-Shell. Die Anleitung findet sich auch in der App unter **Mehr → App installieren**.

## Datenimport „Thailand 2026“ & Demo-Daten

- **„Thailand 2026“** (`worker/services/seedData.ts`) ist ein einmalig importierbarer Datensatz. Er wird über die App (Startseite oder *Meine Reisen*) bzw. `POST /api/v1/imports/thailand-2026` in **D1** geschrieben – atomar in einem Batch, geschützt durch einen eindeutigen Index `(created_by, import_key)`. Ein zweiter Import erzeugt **keine Duplikate**, sondern liefert die bestehende Reise.
- Die Reise enthält nur die tatsächlich bekannten Angaben. Unbekanntes (Fluggesellschaft, Flugnummern, Uhrzeiten, Abflughäfen, Unterkunftsnamen, Personenbezug) bleibt leer bzw. ist als **„Zu klären“** markiert. Der Rückflug-Abflughafen wird **nicht** auf DMK gesetzt. Der Hinflug hat keinen angegebenen Buchungsstatus und ist daher als „Geplant“ mit Klärungshinweis erfasst.
- Nach dem Import ist alles vollständig bearbeitbar (Reise, Ziele, Unterkünfte, Transporte, Status, Kosten, Reisegruppe, Notizen). Die Reisenden heißen zunächst „Reisende:r 2–4“ und können umbenannt bzw. per Einladung mit Konten verknüpft werden.
- **Demo-Daten** („DEMO · Thailand-Rundreise“) sind eine separate, deutlich gekennzeichnete Reise mit Beispielaktivitäten, Orten, Buchungen und THB-Ausgaben. Laden und Löschen unter **Mehr → Demo-Daten**. Echte Reisen bleiben unberührt.

## Kostenlogik

Strikt getrennt werden:

| Begriff | Bedeutung |
| --- | --- |
| **Gebucht** | Buchungsstatus `booked` – heißt **nicht** bezahlt |
| **Bezahlt** | Zahlungsstatus `paid` (unabhängig vom Buchungsstatus) |
| **Geplant** | Buchungsstatus `planned` |
| **Noch nicht bestätigt** | Buchungsstatus `unconfirmed` |
| **Storniert** | Buchungsstatus `cancelled` |

Jeder Betrag hat Währung, Gesamtbetrag, optional Personenanzahl, **Betragsart** (`Fester Preis`, `Schätzung`, `Budgetgrenze`), Buchungs- und Zahlungsstatus, optional tatsächliche:n Zahler:in und Notizen. Schätzungen und Budgetgrenzen erscheinen nie als bezahlt. Buchungskosten sind **keine** Ausgaben der Reisekasse; eine bezahlte Buchung mit festem Preis kann höchstens **einmal** übernommen werden (eindeutiger Fremdschlüssel). Ist der Personenbezug unklar, wird nichts automatisch aufgeteilt und die Buchung zur Klärung markiert.

Reisekasse: Originalbetrag + Originalwährung werden gespeichert, ebenso der verwendete Kurs, seine Quelle (`Basiswährung`, `Manuell`, `Gespeicherter Kurs`, `Kursanbieter`) und sein Stichtag. Spätere Kursänderungen verändern keine bestehenden Ausgaben. Aufteilungen ergeben durch das Largest-Remainder-Verfahren immer exakt den Gesamtbetrag – in Original- und Basiswährung.

## Sicherheit & Datenschutz

- Passwörter: PBKDF2-HMAC-SHA256 (100 000 Iterationen, Maximum in Workers), zufälliges Salt, zeitkonstanter Vergleich.
- Sitzungen: 256-Bit-Zufallstoken im `HttpOnly`-, `Secure`-, `SameSite=Lax`-Cookie (`__Host-`-Präfix); in D1 wird nur der SHA-256-Hash gespeichert. 30 Tage gleitender Ablauf. Keine Tokens im `localStorage`.
- CSRF: Pflicht-Header `X-Travio-Csrf` + Origin-/`Sec-Fetch-Site`-Prüfung für alle schreibenden Anfragen.
- Missbrauchsschutz: D1-basierte Limits für Login (IP und E-Mail), Einrichtung und Einladungen.
- Keine öffentliche Registrierung; Ersteinrichtung nur mit `SETUP_TOKEN`.
- Autorisierung bei jeder API-Operation; Nicht-Mitglieder erhalten `404` (Reise-IDs sind nicht erratbar, zufällige UUIDs). Verknüpfte IDs (Orte, Reisende, Ziele) müssen zur selben Reise gehören.
- Alle Eingaben werden mit Zod validiert, SQL ausschließlich parametrisiert, Request-Größe begrenzt, strukturierte Logs ohne personenbezogene Daten.
- Sicherheits-Header inkl. Content-Security-Policy (`public/_headers`).
- Standort nur auf ausdrücklichen Wunsch, einmalig, nie im Hintergrund.
- Export aller eigenen Daten (JSON) und Kontolöschung in den Einstellungen; „Lokale Offline-Daten löschen“ entfernt den Gerätespeicher.

## Offline & Synchronisierung

- Der Service Worker cached die App-Shell und alle Build-Dateien; die App startet offline.
- Reisedaten liegen als Snapshot in **IndexedDB** (zuletzt synchronisierter Stand).
- **Offline bearbeitbar:** Tagesplan, gespeicherte Orte, Packlisten. Änderungen landen in einer Warteschlange mit stabilen Operations-IDs und werden bei Verbindung an `POST /api/v1/trips/:id/sync` gesendet. Der Server verarbeitet jede Operation **idempotent**.
- **Konflikte:** jede Änderung trägt die Basisversion. Hat jemand anderes den Eintrag inzwischen geändert, wird nichts überschrieben – die App zeigt beide Versionen und du entscheidest.
- **Nur online:** Ausgaben, Buchungen, Reiseziele, Reisen, Anmeldung, Einladungen, Karten (Kacheln aus dem Internet) und externe Navigation. Die App zeigt das jeweils deutlich an.

## Kartenanbieter

Standard sind die OpenStreetMap-Standardkacheln – laut [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) nur für **geringe Nutzung** geeignet (für eine private App mit wenigen Personen vertretbar). Für mehr Nutzung einen Anbieter mit passenden Bedingungen konfigurieren, z. B. MapTiler, Stadia Maps oder Thunderforest (Schlüssel dort auf die eigene Domain beschränken – Kachel-Schlüssel sind öffentlich sichtbar):

```bash
# .env
VITE_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=DEIN_SCHLUESSEL
VITE_MAP_ATTRIBUTION=&copy; MapTiler &copy; OpenStreetMap contributors
```

Ist der Kartenanbieter nicht erreichbar, bleibt die Ortsliste vollständig nutzbar.

## Erweiterungspunkte

- **Wechselkurse:** `fx_source = 'provider'` ist im Datenmodell und UI vorgesehen; ein Anbieter wird serverseitig ergänzt (aktuell bewusst abgelehnt, solange keiner konfiguriert ist).
- **Dokumente:** Spalte `bookings.document_key` + R2-Binding `DOCUMENTS` (privat) vorbereitet.
- **Wetter, Ortssuche, Routing, KI-Assistent, E-Mail-Import, Benachrichtigungen:** werden als eigene Services unter `worker/services/` mit eigenen Endpunkten ergänzt; die Startseite blendet entsprechende Widgets erst ein, wenn echte Daten vorliegen (keine erfundenen Werte).
- **Englisch:** `src/i18n/en.ts` mit Typ `Dictionary` anlegen und in `src/i18n/index.ts` registrieren.

## Was noch nicht verifiziert ist

In der Entwicklungsumgebung wurden Typprüfung, Lint, Unit-/Integrationstests, Produktions-Build sowie E2E-Tests gegen die lokale Vorschau (Worker + lokale D1 in workerd, Chromium mit iPhone-Viewports) ausgeführt. **Nicht** verifiziert werden konnten:

- ein echtes Deployment auf Cloudflare (kein Konto/keine Zugangsdaten in der Umgebung) und damit die Remote-D1-Migration,
- Installation und Verhalten auf einem echten iPhone/in Safari (WebKit-Eigenheiten, Safe-Areas auf echter Hardware),
- das Laden der Kartenkacheln (externer Netzwerkzugriff war in der Testumgebung blockiert; der Fehlerhinweis der Karte wurde dabei geprüft).
