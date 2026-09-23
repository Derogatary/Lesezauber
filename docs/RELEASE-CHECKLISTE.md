# 🚦 Release-Checkliste: Was fehlt bis zu einer professionellen Veröffentlichung?

**Stand: v0.39.0-beta, 23.09.2026** · Prüfung des gesamten Repos (Code, Rechtstexte, Anbieter-Bedingungen,
Build/Auslieferung). **Keine Rechtsberatung** - die rechtlichen Punkte sind Hinweise, was ein
Anwalt/Datenschutzberater prüfen sollte, keine abschließende Bewertung.

## ✅ Stand nach v0.40.0-beta (23.09.2026): Entscheidung „bleibt erstmal privat“

Der Betreiber hat entschieden: **LeseZauber bleibt vorerst ein privates Familienwerkzeug.** Damit
sind A1-A3 und die meisten B-Punkte **keine akuten Blocker**, sondern Voraussetzungen für einen
späteren öffentlichen Schritt. Alles, was ohne diese Entscheidung machbar war, ist erledigt:

| Punkt | Erledigt in v0.40.0-beta |
|---|---|
| A4 Inhaltssicherheit | ✅ (v0.41.0: **Meldeknopf 🚩** an allen KI-Texten + Liste für Eltern, Ausrichtung als Eltern-App) Sicherheitsfilter für ALLE Gemini-Aufrufe (Buchanalyse mittel, Kinder-Chat/SchreibZauber/Bilder streng), kindgerechte Regeln + abgegrenzte, längenbegrenzte Frage im „Frag den Zauberer“, freundliche Antwort statt Fehlermeldung bei blockierten Fragen, Schutzsatz gegen Anweisungen auf fotografierten Seiten. **Offen:** Test-Set „rote Liste“ mit echtem Key |
| B1 Datenschutzerklärung | ✅ Pollinations, Kontroll-Fotos, Rechtsgrundlage, USA-Übermittlung, Speicherdauer, Beschwerderecht (HmbBfDI), TDDDG statt TTDSG, Hinweis auf Trainingsnutzung im kostenlosen Gemini-Kontingent |
| B3 Haftung | ✅ **Korrektur:** der Befund war falsch - die Nutzungsbedingungen enthalten die Ausnahmen (Vorsatz, grobe Fahrlässigkeit, Leben/Körper/Gesundheit) bereits; das Zitat in der ersten Prüfung war abgeschnitten |
| B6 Lizenzen | ✅ Lizenztexte PDF.js (Apache-2.0) + JSZip neben die Bibliotheken, neue Seite `lizenzen.html` (verlinkt in den Einstellungen) |
| C2 Key in der URL | ✅ alle Gemini-Aufrufe per Header `x-goog-api-key`. **Offen:** Google Cloud TTS (ohne echten Key nicht prüfbar, ob der Header per CORS durchgeht) |
| C3 Backup-Import | ✅ `cleanImportedBook()` lässt nur sichere IDs und `data:image`-Bilder durch, mit Tests |
| C3b **neu gefunden:** `sanitize()` escapte keine Anführungszeichen | ✅ reines String-Escaping aller fünf HTML-Sonderzeichen - vorher konnte ein `"` in KI-/Nutzertext aus `value="..."`-Attributen ausbrechen |
| C4 CSP | ✅ Content-Security-Policy in `index.html`, im Browser gegen PDF.js/JSZip/Service Worker geprüft |
| C5 Update-Verhalten | ✅ Hinweis „Neue Version - Neu laden“ statt stillem Umschalten |
| D1 Tests | ✅ 17 Unit-Tests (`npm test`): Suchsel, Seitenplanung/Panorama, Import-Prüfung, Block-Parser, Buchsprache, Personas, `sanitize()`. **Offen:** Browser-Tests der Hauptabläufe in CI |
| D2 CI | ✅ `.github/workflows/checks.yml`: Sanity-Checks, Tests, „Tailwind-Build aktuell?“ bei jedem Push |
| D3 Build | ✅ `package.json` + Lockfile im Repo, `npm run build` / `npm run check` / `npm test` |
| D7 Fehlerprotokoll | ✅ „📋 Fehlerprotokoll kopieren“ in den Einstellungen - nur lokal, ohne Buchinhalte und Keys |
| D8 Datenverlust | ✅ verständliche „Speicher voll“-Meldung. **Korrektur:** eine Sicherungs-Erinnerung gab es schon (Banner nach 14 Tagen) - die zusätzliche Toast-Erinnerung wurde in v0.41.0 wieder entfernt |
| E1 Zoom | ✅ Zoomen wieder erlaubt |

**Weiterhin offen (bewusst, bei privater Nutzung nicht nötig oder nicht allein machbar):** A1-A3
(nur bei Veröffentlichung), B2 Impressum (siehe unten), B4/B5/B7/B8, C1, C6, D4 automatisches
Deployment (bräuchte eine Umstellung der GitHub-Pages-Einstellungen durch den Betreiber), D5 Linter,
D6 `index.html` aufteilen, D9 Geräte-Matrix, D10, E3-E5.

**Impressum bei privater Nutzung (per Websuche am 23.09.2026 nachgeprüft):** Es gibt zwei Pflichten.
§ 5 DDG gilt für „geschäftsmäßige, in der Regel gegen Entgelt angebotene digitale Dienste“ - ein
Familienwerkzeug ohne Werbung eher nicht, ein PayPal-Spendenlink kann das aber kippen. **§ 18 Abs. 1
MStV** verlangt Name und **Anschrift** aber schon von jedem Angebot, das „nicht ausschließlich
persönlichen oder familiären Zwecken“ dient - und das wird sehr eng ausgelegt. Eine frei im Netz
erreichbare Seite mit Spendenlink, Play-Store-Plänen und öffentlichem Repo ist eher nicht „rein
familiär“. **Realistisch bleibt also ein Impressum mit Anschrift nötig.** Die Wohnadresse muss es aber
nicht sein, nötig ist eine *ladungsfähige* Anschrift (dort muss Post zugestellt werden können):
Büro-/Coworking-Adresse mit Postannahme, Kanzlei mit Einverständnis, oder ein Impressums-/
Anschriften-Service mit Zustellvollmacht (verbreitet, rechtlich nicht ganz unumstritten). Ein reines
Postfach genügt nicht. Nur wenn die App wirklich nicht mehr öffentlich erreichbar ist (z.B. nur
lokal oder hinter einem Zugangsschutz), entfällt die Pflicht sicher. Im Zweifel anwaltlich klären.

## Kurzfazit

Als **privates Familienwerkzeug** ist LeseZauber Pro in erstaunlich gutem Zustand: saubere
XSS-Hygiene (alle 57 `innerHTML`-Stellen laufen über `sanitize()` oder feste Texte), kein
Tracking, keine eigenen Server, ausführliche Doku, durchdachte Fehlerrückfälle.

Für eine **öffentliche Veröffentlichung** (Web für alle, Play Store, erst recht mit Geld im Spiel)
gibt es aber **vier harte Hindernisse**, die zuerst geklärt werden müssen - drei davon sind
nicht technisch, sondern rechtlich/vertraglich. Danach folgt eine längere Liste an üblicher
"Profi-Hygiene" (Tests, CI, Datenschutz-Details, Barrierefreiheit), die in einer Organisation
selbstverständlich wäre, hier aber noch fehlt.

**Die wichtigste Frage vorab:** Soll die App wirklich öffentlich werden, oder bleibt sie ein
Werkzeug für die eigene Familie? Fast alle Blocker unten betreffen nur den öffentlichen Fall.

---

## 🛑 A. Blocker (vor jeder öffentlichen Veröffentlichung)

### A1. Gemini-Nutzungsbedingungen verbieten Apps für unter 18-Jährige
Die *Gemini API Additional Terms of Service* untersagen, die API in einer Website/App zu nutzen,
die sich an Personen unter 18 richtet oder von ihnen wahrscheinlich genutzt wird. LeseZauber ist
genau das. Das gilt unabhängig davon, ob der Key kostenlos oder bezahlt ist - und streng genommen
schon heute für die private Nutzung mit Kindern.
**Nötig:** Anbieter-Frage neu entscheiden - einen KI-Anbieter/Vertragsweg finden, dessen
Bedingungen Kinder-Anwendungen (mit Eltern-Einwilligung) ausdrücklich zulassen, und das
schriftlich prüfen lassen. Das betrifft auch Mistral, OpenAI, ElevenLabs, Speechify, Pollinations:
**jede** Anbieter-AGB muss auf Altersgrenzen und Kinder-Klauseln geprüft werden.

### A2. EU-Nutzer nur mit bezahltem Gemini-Zugang
Laut denselben Bedingungen dürfen API-Anwendungen für Nutzer im EWR, der Schweiz und UK nur über
**bezahlte** Dienste bereitgestellt werden. Das kostenlose Kontingent, auf dem die ganze
Tageslimit-/Modell-Rotations-Logik der App aufbaut, ist für eine öffentliche EU-App also nicht
nutzbar. Zusätzlich verwendet Google Daten aus unbezahlter Nutzung zur Produktverbesserung - bei
Fotos aus Kinderzimmern, Handschrift von Kindern (Kontroll-Funktion!) und Kinderfragen im Chat
inakzeptabel.
**Nötig:** Kostenmodell klären (wer zahlt die KI?), bezahlte Tarife mit Zusage "keine
Trainingsnutzung", Kostenschutz pro Nutzer.

### A3. Kinderdaten & DSGVO
Die App verarbeitet Daten **von Kindern** (Fotos bearbeiteter Arbeitsblätter mit Handschrift und
evtl. Namen, gesprochene/getippte Kinderfragen, Profile mit Kindernamen) und schickt sie an
Anbieter in den USA. Für eine öffentliche App bräuchte es mindestens: Rollenklärung
(wer ist Verantwortlicher, wenn jeder Nutzer seinen eigenen Key einträgt?), eine
**Datenschutz-Folgenabschätzung** (Art. 35 DSGVO - Kinder + KI + Drittland = typischer Fall),
Einwilligungs-/Elternmechanismus (Art. 8 DSGVO), Drittland-Grundlage (Art. 44 ff.), Löschkonzept.
**Nötig:** Datenschutzberatung, DSFA, überarbeitete Datenschutzerklärung (siehe B1).

### A4. Jugendschutz / Inhaltssicherheit der KI
- Kein einziger Gemini-Aufruf setzt `safetySettings` - es gelten die Standardfilter des Modells.
- "🧙 Frag den Zauberer" gibt die Kinderfrage **ohne Schutzanweisung** weiter
  (`js/api.js`, `answerQuestion()`: nur "Beantworte die Frage eines Kindes ... in einem Satz").
- Text auf fotografierten Seiten landet direkt im Prompt - eine präparierte Seite könnte die
  KI umsteuern (Prompt-Injection).
- Es gibt keine Möglichkeit, eine unpassende KI-Antwort zu **melden**. Google Play verlangt bei
  Apps mit KI-generierten Inhalten eine In-App-Meldefunktion.

**Nötig:** kindgerechte Systemanweisung + strengere `safetySettings` für alle Aufrufe,
Meldeknopf, ein fester Satz Test-Seiten/-Fragen ("rote Liste"), der vor jedem Release geprüft wird.

---

## ⚖️ B. Recht & Compliance

| # | Punkt | Befund | Aufwand |
|---|---|---|---|
| B1 | **Datenschutzerklärung** | Fehlt: Pollinations (seit v0.37.0), Rechtsgrundlagen (Art. 6), Drittlandübermittlung USA, Beschwerderecht bei der Aufsichtsbehörde (Art. 77), Speicherdauer. Verweist noch auf das **TTDSG** - heißt seit Mai 2024 **TDDDG**. Kontroll-Fotos von Kindern nicht erwähnt | S |
| B2 | **Impressum** | Nennt die private Wohnadresse. Bei rein privater, nicht geschäftsmäßiger Seite evtl. gar nicht nötig - mit PayPal-Spendenlink/KDP-Veröffentlichung wird "geschäftsmäßig" aber wahrscheinlicher. Klären lassen, ggf. Impressums-Service/Postanschrift | S |
| B3 | **Nutzungsbedingungen** | "Eine Haftung für Schäden ist ausgeschlossen" - ein pauschaler Ausschluss ist in Deutschland nur eingeschränkt wirksam (Vorsatz/grobe Fahrlässigkeit, Leben/Körper/Gesundheit). Anwaltlich formulieren lassen | S |
| B4 | **Urheberrecht fremder Bücher** | Abfotografieren für den Privatgebrauch ist gedeckt. Heikel für eine öffentliche App: **Video-Export** fremder Bücher ist nur durch das fest verdrahtete Passwort `admin` gebremst (für Release entfernen oder sperren), **Übersetzung** eines fremden Buchs ist eine Bearbeitung - nur privat unkritisch. Hinweistexte und Sperren überarbeiten | S-M |
| B5 | **EU-KI-Verordnung, Art. 50** (Transparenzpflichten, gelten seit 02.08.2026) | KI-erzeugte Bilder/Texte (SchreibZauber, Heft-Generator) sollten als KI-generiert erkennbar sein - im Export, im KDP-Innenteil, in Metadaten. KDP selbst verlangt beim Einreichen eine Angabe zu KI-Inhalten | M |
| B6 | **Open-Source-Lizenzen** | Eigene MIT-Lizenz vorhanden. Im Vendor-Ordner liegt nur die Lizenz von mp4-muxer - **PDF.js (Apache-2.0) und JSZip** fehlen. Apache-2.0 verlangt die Weitergabe von Lizenz/NOTICE. Zusätzlich eine "Lizenzen"-Seite in der App | S |
| B7 | **Barrierefreiheit (BFSG)** | Das Barrierefreiheitsstärkungsgesetz gilt seit 28.06.2025 u.a. für E-Book-Software gegenüber Verbrauchern, Kleinstunternehmen sind teils ausgenommen. Bei rein privater Nutzung irrelevant, bei kommerziellem Angebot prüfen. Technisch siehe D | - |
| B8 | **App-Store-Regeln** | Google Play: Families-Richtlinie (Zielgruppe Kinder → strengere Regeln), Datensicherheits-Formular, Richtlinie für KI-generierte Inhalte (Meldefunktion, siehe A4) | M |

---

## 🔐 C. Sicherheit

| # | Befund | Empfehlung | Aufwand |
|---|---|---|---|
| C1 | API-Keys im Klartext im Browser | Bekannte, akzeptierte Grenze der Architektur. Für eine öffentliche App mit bezahlten Keys (A2) nicht mehr haltbar → Backend/Proxy, siehe `WARTET-AUF-BETREIBER.md` "Bewusst zurückgestellt" | XL |
| C2 | Gemini-Key steht an 10 Stellen **in der URL** (`?key=...`) statt im Header - landet in Proxy-Logs, Browser-Verlauf von Entwicklertools usw. | Header `x-goog-api-key` verwenden | S |
| C3 | **Backup-Import prüft nur `id` + `pages`** (`js/actions/backup.js`). Seiten-IDs werden aber ungeprüft in `onclick="app.actions.setCover(${p.id})"` eingesetzt, Bild-URLs ungeprüft in `src="..."` → eine manipulierte Backup-Datei kann Code ausführen | Beim Import Typen prüfen (IDs Zahl/einfacher String, `imgUrl` nur `data:image/...`), besser keine Inline-`onclick` mit Daten | S |
| C4 | Keine **Content-Security-Policy** | CSP per `<meta>`: Skripte nur von eigener Herkunft, `connect-src` nur zu den bekannten KI-Anbietern - begrenzt den Schaden jeder künftigen XSS-Lücke | S |
| C5 | Service Worker ruft sofort `skipWaiting()` - eine offene Seite kann beim Update mit gemischten alten/neuen Dateien weiterlaufen | "Neue Version verfügbar - neu laden?"-Hinweis statt stillem Wechsel | S |
| C6 | Kein Sicherheits-Review/Pentest | Vor öffentlicher Veröffentlichung einmal extern prüfen lassen | M |

---

## 🧪 D. Qualität, Technik & Betrieb

| # | Befund | Empfehlung | Aufwand |
|---|---|---|---|
| D1 | **Keine automatisierten Tests** bei ~19.000 Zeilen eigenem JavaScript. Absicherung heute: 4 Sanity-Skripte + manuelles Ausprobieren | Unit-Tests für die Logik (Varianten-Umrechnung, Parser, Suchsel, Seitenplanung, Übersetzung), Playwright-Tests für die Hauptabläufe (Scan → Lesen → Vorlesen, Export) mit simulierten KI-Antworten | M-L |
| D2 | **Keine CI** - nichts läuft automatisch bei einer Änderung | GitHub Actions: Syntax-/Sanity-Checks, Tests, Tailwind-Build bei jedem PR | S |
| D3 | **Build nicht reproduzierbar**: `package.json`/`package-lock.json` stehen in `.gitignore`, die Tailwind-Version ist nirgends festgehalten (in dieser Sitzung musste Tailwind erst nachinstalliert werden) | `package.json` + Lockfile einchecken, Build über `npm run build` | S |
| D4 | **Deployment per Drag & Drop** in der GitHub-Weboberfläche | Automatisches Deployment aus `main` (GitHub Actions → Pages), Staging-Umgebung zum Testen | S |
| D5 | Kein Linter/Formatter | ESLint + Prettier, schrittweise einführen | S |
| D6 | `index.html` ist ein Monolith (1.672 Zeilen, 146 KB) mit allen Ansichten | Ansichten nach und nach in eigene Dateien/Templates auslagern - erleichtert Tests und parallele Arbeit | M |
| D7 | **Kein Fehler-Monitoring** - Fehler bei Nutzern sieht niemand (121 `console`-Ausgaben verschwinden im Gerät) | Opt-in-Fehlerbericht ("Fehlerbericht senden"-Knopf mit kopierbarem Text) statt Tracking-Tool - passt zum Datenschutzversprechen | S-M |
| D8 | **Datenverlust-Risiko**: alle Daten nur in IndexedDB. Speicher voll (`QuotaExceededError`) wird nirgends abgefangen; Safari löscht Daten nicht installierter Web-Apps nach längerer Nichtnutzung; Backup nur manuell | Speicher-voll-Fehler abfangen und erklären, Backup-Erinnerung, Hinweis "als App installieren" auf iOS | S-M |
| D9 | **Browser-Matrix** nicht dokumentiert/getestet - Video-Export braucht WebCodecs (Safari nur teilweise), Sprachausgabe unterscheidet sich stark je Gerät | Unterstützte Browser festlegen, vor jedem Release auf echten Geräten (iPhone, Android, Desktop) prüfen | M |
| D10 | Abhängigkeit von Anbieter-Änderungen (Modelle werden umbenannt/abgeschaltet - schon mehrfach passiert) | Regelmäßiger Check der Modellnamen, verständliche Fehlermeldung "Anbieter hat etwas geändert" | S |

---

## ♿ E. Barrierefreiheit & UX

| # | Befund | Empfehlung | Aufwand |
|---|---|---|---|
| E1 | `user-scalable=no, maximum-scale=1.0` im Viewport - **Zoomen ist gesperrt** (WCAG 1.4.4 verletzt, gerade für sehschwache Eltern/Großeltern) | Entfernen | S |
| E2 | Positiv: alle `<img>` haben `alt`, Symbol-Knöpfe haben `aria-label`, `lang="de"` gesetzt | - | - |
| E3 | Nicht geprüft: Kontraste, Tastaturbedienung, Screenreader, "Bewegung reduzieren" | Einmal mit axe/Lighthouse + echtem Screenreader durchgehen | M |
| E4 | **Einstieg für Laien**: Wer die App öffentlich findet, muss erst einen Gemini-API-Key besorgen und eintragen - für die meisten Eltern eine unüberwindbare Hürde | Geführter Erststart ("Onboarding") oder - realistisch für eine öffentliche App - ein Anbieter-Modell ohne eigenen Key (hängt an A1/A2/C1) | M-XL |
| E5 | Kein Support-Weg außer E-Mail im Impressum | FAQ, Kontaktweg, Umgang mit Datenschutz-Anfragen festlegen | S |

---

## 🏢 F. Wie liefe das in einer Organisation ab?

In einem Unternehmen würde niemand "einfach veröffentlichen" - ein Release durchläuft feste
**Rollen**, **Stationen** und **Freigaben** ("Gates"). Übertragen auf LeseZauber:

### Rollen
| Rolle | Aufgabe | Heute bei LeseZauber |
|---|---|---|
| Product Owner | entscheidet Umfang, Zielgruppe, Prioritäten | du |
| Entwicklung | baut, schreibt Tests | Claude |
| Code-Review | zweites Paar Augen auf jede Änderung | fehlt (Claude prüft sich selbst) |
| QA / Test | testet systematisch auf echten Geräten | fehlt (Familie testet nebenbei) |
| Security | Sicherheitsprüfung, Pentest | fehlt |
| Datenschutzbeauftragte:r | DSFA, Datenschutzerklärung, Anbieter-Verträge | fehlt |
| Recht | AGB, Urheberrecht, KI-Verordnung, Store-Regeln | fehlt |
| UX / Barrierefreiheit | Nutzertests, WCAG-Prüfung | fehlt |
| Support / Betrieb | Anfragen, Störungen, Monitoring | fehlt |

### Ablauf eines Releases
1. **Anforderung** - Ticket mit Ziel und Abnahmekriterien ("Definition of Done").
2. **Design-Review** - Architektur, Datenschutz ("Privacy by Design") und Sicherheit schon *vor*
   dem Bauen prüfen.
3. **Entwicklung** auf eigenem Branch, **Pull Request** mit Beschreibung.
4. **Automatische Prüfung (CI)** - Lint, Tests, Build müssen grün sein, sonst kein Merge.
5. **Code-Review** durch eine zweite Person.
6. **Staging** - die Version läuft auf einer Testumgebung, QA testet nach Testplan auf echten Geräten.
7. **Release-Kandidat einfrieren** ("Feature Freeze"), nur noch Fehlerbehebungen.
8. **Freigaben (Gates)** - Security, Datenschutz, Recht, Barrierefreiheit zeichnen jeweils ab.
9. **Beta** - geschlossene Testgruppe (z.B. Play-Store "interner Test"), Rückmeldungen sammeln.
10. **Gestaffelter Rollout** - erst 5-10 % der Nutzer, bei stabilen Fehlerzahlen alle.
11. **Betrieb** - Monitoring, Support, Notfallplan (Rollback auf die Vorversion), regelmäßige Updates.
12. **Rückblick** - was lief gut, was nicht, was ändern wir am Prozess.

Typische **Dokumente** dabei: Release-Notes/Changelog (✅ gibt es), Testplan und Testprotokoll,
Datenschutz-Folgenabschätzung, Verzeichnis der Verarbeitungstätigkeiten, Auftragsverarbeitungs-
Verträge mit Anbietern, Lizenz-Übersicht (SBOM), Rollback-Plan, Support-Handbuch.

### Was davon ist für ein Ein-Personen-Projekt sinnvoll?
Nicht alles - eine Firma bezahlt für jede Rolle Menschen. Realistisch und mit Claude machbar:
CI + Tests (ersetzt einen Teil von QA/Review), Staging-Umgebung, feste Release-Checkliste,
Beta-Gruppe (andere Familien). **Nicht ersetzbar** durch Claude: rechtliche Freigabe (A1-A3, B),
Tests auf echten Geräten, Entscheidung über Anbieter und Kosten.

---

## 🗺️ G. Empfohlene Reihenfolge

| Phase | Inhalt | Wer |
|---|---|---|
| **0. Grundsatzentscheidung** | Privat bleiben oder öffentlich? Wenn öffentlich: wer zahlt die KI, welcher Anbieter darf Kinder-Apps? (A1, A2) | du (+ Beratung) |
| **1. Sofort machbar, unabhängig von der Entscheidung** | Zoom freigeben (E1), Key in Header (C2), Import-Prüfung (C3), CSP (C4), Lizenzdateien (B6), Datenschutzerklärung aktualisieren - Pollinations, TDDDG (B1 teilweise), `safetySettings` + kindgerechte Anweisung im Chat (A4 teilweise), `package.json` einchecken (D3), Speicher-voll-Meldung (D8) | Claude, ~1-2 Sitzungen |
| **2. Profi-Fundament** | CI (D2), Tests (D1), Linter (D5), automatisches Deployment + Staging (D4), Update-Hinweis (C5), Fehlerbericht-Knopf (D7), Meldeknopf für KI-Antworten (A4) | Claude, mehrere Sitzungen |
| **3. Nur bei öffentlichem Release** | Datenschutzberatung + DSFA (A3), Anwaltsprüfung (B2-B5), KI-Kennzeichnung (B5), Backend/Proxy für Keys (C1), Onboarding (E4), Store-Anforderungen (B8), Pentest (C6), Barrierefreiheits-Prüfung (E3), Geräte-Testmatrix (D9) | du + Fachleute + Claude |

## Quellen

- [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) - Altersklausel,
  unbezahlte Dienste, EWR/CH/UK nur bezahlt (Stand der Websuche 23.09.2026)
- [Diskussion "Only Paid Services" für EWR/CH/UK im Google-Entwicklerforum](https://discuss.ai.google.dev/t/clarification-on-only-paid-services-for-eea-ch-uk/107860)
