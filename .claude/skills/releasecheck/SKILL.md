---
name: releasecheck
description: Release-Check für LeseZauber Pro - geht die komplette Release-Checkliste durch (automatische Checks, Code-Prüfpunkte zu Sicherheit/Kinderschutz/Datenschutz/Barrierefreiheit, Browser-Test, Rechts- und Anbieter-Quellen mit Datum) und aktualisiert docs/RELEASE-CHECKLISTE.md. Verwenden bei "Release-Check", "releasecheck", "ist die App bereit zum Veröffentlichen/Hochladen?", "prüfe alles vor dem Release", vor jeder größeren Auslieferung oder nach größeren Änderungen an api.js, index.html, sw.js, Rechtstexten oder KI-Anbietern.
---

# Release-Check - LeseZauber Pro

**Datenstand dieses Skills: 23.09.2026 (App-Version v0.46.0-beta).**
Entstanden aus der Release-Prüfung vom 22./23.09.2026 (`docs/RELEASE-CHECKLISTE.md`).

> **Keine Rechtsberatung.** Die rechtlichen Punkte sagen, *was* ein Anwalt bzw. eine
> Datenschutzberatung prüfen sollte. Rechtliche Freigaben nie selbst erteilen, sondern als
> offen melden.

## 0. Vor dem Start

1. **Datum prüfen.** Liegt das heutige Datum mehr als **6 Monate** nach dem Datenstand oben, erst die
   Quellen in Abschnitt 5 neu prüfen (WebSearch/WebFetch). Anbieter-Bedingungen, Modellnamen und
   Gesetze ändern sich. Nach der Prüfung den Datenstand oben und die „geprüft am“-Spalte aktualisieren.
2. **Modus klären.** Stand 23.09.2026 hat der Betreiber entschieden: **die App bleibt privat**
   (nur die eigene Familie). Steht in `docs/WARTET-AUF-BETREIBER.md` inzwischen etwas anderes, im
   Modus **öffentlich** prüfen. Die Spalte „privat/öffentlich“ im Katalog sagt, was jeweils ein
   Blocker ist.
3. **Kontext lesen:** `CLAUDE.md`, `docs/RELEASE-CHECKLISTE.md` (letzter Stand), die obersten zwei
   Einträge in `CHANGELOG.md`, `docs/WARTET-AUF-BETREIBER.md`.

## 1. Automatische Checks (müssen grün sein)

```bash
npm install                         # bzw. npm ci
npm run check                       # 7 Sanity-Checks (Syntax, IDs, onclick, sw.js-Liste, jede JS-Datei in sw.js, Version/CACHE_NAME, CSP deckt alle fetch-Adressen ab)
npm test                            # Unit-Tests tests/*.test.mjs (Stand 23.09.2026: 34 Tests)
npm run build && git diff --exit-code css/tailwind.css   # Tailwind-Build aktuell?
```

Dieselben Schritte laufen in `.github/workflows/checks.yml` bei jedem Push. Rot = Blocker, zuerst beheben.

## 2. Code-Prüfpunkte (jeweils Befehl + erwartetes Ergebnis)

| ID | Prüfung | Befehl / Vorgehen | Erwartet (Stand 23.09.2026) |
|---|---|---|---|
| A4a | Sicherheitsfilter an jedem Gemini-Aufruf | `grep -rn "generateContent" js --include=*.js \| grep -v vendor \| wc -l` mit der Zahl der `safetySettings`-Stellen in `js/api.js`, `js/studio/studioApi.js`, `js/studio/imageSource.js` vergleichen | jeder Text-/Bild-Aufruf hat `SAFETY_BOOK` oder `SAFETY_KIDS`. Ausnahme: Gemini-TTS in `js/ttsProviders.js` (nur Vorlesen, erzeugt keinen neuen Inhalt) |
| A4b | Kinder-Chat abgesichert | `answerQuestion()` in `js/api.js` lesen | feste Regeln, Frage zwischen `<<<` `>>>`, max. 300 Zeichen, `SAFETY_KIDS`, `BLOCKED_ANSWER` bei `blockReason`/`SAFETY` |
| A4c | Schutz gegen Anweisungen auf Seiten | `grep -n "INJECTION_GUARD" js/api.js` | in Einzel-, Mehrfach-Persona- und Kontroll-Analyse angehängt |
| A4d | Meldeknopf für KI-Antworten | `grep -c "reportAiContent" index.html` + `grep -n "reportChatAnswer" js/actions/reader.js` + `tests/aiReports.test.mjs` | ≥5 Knöpfe (Zwischenruf ×2, Erstleser, Bildbeschreibung, Rätsel) + Chat; gemeldete Felder über `resolvePageVariant()` überall ausgeblendet |
| A4e | Kinder-Lesemodus + Chat pro Profil | `grep -c "data-parent-only" index.html` + `tests/family.test.mjs` + Browser: Kindermodus an, ⚙️/SchreibZauber/Import unsichtbar, `app.nav.go('settings')` bleibt in der Bibliothek, Chat im Reader aus | nur freigegebene Bücher (`book.approvedForKids`), Verlassen nur über Eltern-Frage, Chat-Standard „Nur mit Eltern“ |
| C2 | Key nicht in der URL | `grep -rn "?key=" js --include=*.js \| grep -v vendor` | nur noch Google Cloud TTS (`js/ttsProviders.js`, ungetestet mit Header) |
| C3 | Backup-Import geprüft | `grep -n "cleanImportedBook" js/actions/backup.js` + `tests/import.test.mjs` | Import läuft über `cleanImportedBook()`, Tests grün |
| C3b | `sanitize()` escaped alle 5 Zeichen | `grep -n "sanitize(str)" -A8 js/utils.js` | `& < > " '` werden ersetzt |
| C3c | kein `sanitize()` in JS-Strings in `onclick` | `grep -rnE "on(click\|change)=\"[^\"]*'\\$\{app\.utils\.sanitize" js` | leer |
| C3d | neue `innerHTML`-Stellen | `git diff <letzter Release-Tag>..HEAD -- js \| grep -n "innerHTML"` und jede Interpolation von Nutzer-/KI-Text prüfen | alles über `sanitize()` oder feste Texte |
| C4 | CSP vorhanden und passend | `npm run check` (Check 7) | grün; neue Anbieter stehen in `connect-src` |
| C5 | kein stilles SW-Update | `grep -n "skipWaiting" sw.js` | nur im `message`-Handler (`SKIP_WAITING`), nicht in `install` |
| B6 | Lizenzen vollständig | `ls js/vendor/*/LICENSE*` + `lizenzen.html` | je Bibliothek eine Lizenzdatei, jede neue Bibliothek auch in `lizenzen.html` |
| B1 | Datenschutzerklärung deckt alle Anbieter ab | die Hosts aus `connect-src` (index.html) mit den Anbietern in `datenschutz.html` vergleichen | jeder Anbieter genannt (Stand: Google Gemini, Google Cloud TTS, Mistral, ElevenLabs, OpenAI, Speechify, Pollinations) |
| D8 | Speicher voll / Sicherung | `grep -n "storageErrorMessage" js/db.js` + `grep -n "backupReminder" js/render/library.js` | beides vorhanden (Sicherungs-Banner nach 14 Tagen) |
| E1 | Zoomen erlaubt | `grep -n 'name="viewport"' index.html` | kein `user-scalable=no`, kein `maximum-scale` |
| V | Versionen einheitlich | `data-app-version` in `index.html`, oberster Eintrag `CHANGELOG.md`, „Versionsstand“ in `CLAUDE.md`, Kommentar zu `CACHE_NAME` in `sw.js` | überall dieselbe Version, `CACHE_NAME` seit der letzten Auslieferung erhöht |

## 3. Browser-Test (Playwright, Chromium ist vorinstalliert)

`python3 -m http.server 8765` im Repo starten, dann mit Playwright
(`executablePath: '/opt/pw-browsers/chromium'`) `http://localhost:8765/index.html` laden und prüfen:

- keine `pageerror`-Ereignisse, keine Konsolenmeldung mit „Refused“ oder „Content Security Policy“
- `typeof window.app === 'object'` (alle Module geladen)
- `await import('/js/vendor/pdfjs/pdf.min.mjs')` klappt, JSZip lässt sich per `<script>` laden
- `navigator.serviceWorker.getRegistration()` liefert eine Registrierung
- KI-Aufrufe **nie echt** auslösen (kostet Kontingent): `window.fetch` für `generativelanguage.googleapis.com` stubben, wenn ein Ablauf getestet werden soll

## 4. Prüfkatalog (Stand 23.09.2026)

Status: ✅ erledigt · ⚠️ teilweise · ❌ offen. „Blocker?“: P = schon bei privater Nutzung, Ö = nur bei öffentlicher Veröffentlichung.

| ID | Thema | Status | Blocker? | Worum es geht |
|---|---|---|---|---|
| A1 | Gemini-Bedingungen: keine Apps für unter 18-Jährige | ❌ | Ö (streng genommen auch P) | Anbieter muss Kinder-Apps erlauben, schriftlich prüfen lassen. Alle anderen Anbieter ebenfalls auf Altersklauseln prüfen |
| A2 | EWR/CH/UK nur mit bezahltem Gemini-Zugang, unbezahlte Daten → Produktverbesserung | ❌ | Ö | Kostenmodell, bezahlter Tarif ohne Trainingsnutzung |
| A3 | Kinderdaten/DSGVO: DSFA (Art. 35), Eltern-Einwilligung (Art. 8), Drittland (Art. 44 ff.) | ❌ | Ö | Datenschutzberatung |
| A4 | Inhaltssicherheit | ⚠️ | P | Filter, Chat-Regeln, Schutzsatz, Meldeknopf ✅, „rote Liste“-Test mit echtem Key offen |
| B1 | Datenschutzerklärung vollständig | ✅ | P | bei jedem neuen Anbieter nachziehen |
| B2 | Impressum / Wohnadresse | ❌ | P (§ 18 MStV gilt schon, wenn das Angebot nicht rein familiär ist, also bei öffentlicher Erreichbarkeit) | Anschrift muss ladungsfähig sein, nicht zwingend die Wohnadresse, kein Postfach. Optionen in `docs/RELEASE-CHECKLISTE.md` |
| B3 | Haftungsklausel | ✅ | - | Ausnahmen (Vorsatz, grobe Fahrlässigkeit, Leben/Körper/Gesundheit) vorhanden |
| B4 | Urheberrecht fremder Bücher (Video-Export mit Passwort `admin`, Übersetzung = Bearbeitung) | ❌ | Ö | vor Veröffentlichung sperren/überarbeiten |
| B5 | EU-KI-Verordnung Art. 50, Transparenz seit 02.08.2026 | ❌ | Ö | KI-Inhalte kennzeichnen (Export, KDP) |
| B6 | Open-Source-Lizenzen | ✅ | P | - |
| B7 | BFSG (Barrierefreiheit, seit 28.06.2025) | ❌ | Ö (nur kommerziell) | prüfen, ob anwendbar |
| B8 | Google-Play-Regeln (Families, KI-Inhalte, Datensicherheit) | ❌ | Ö | vor dem Play-Store-Eintrag |
| C1 | API-Keys im Browser | ❌ (akzeptiert) | Ö | Backend/Proxy nötig |
| C2 | Key in der URL | ⚠️ | P | Gemini ✅, Google Cloud TTS offen |
| C3 | Import-Einschleusung + `sanitize()` | ✅ | P | - |
| C4 | CSP | ✅ | P | - |
| C5 | Update-Hinweis | ✅ | P | - |
| C6 | externe Sicherheitsprüfung/Pentest | ❌ | Ö | - |
| D1 | Tests | ⚠️ | P | Unit-Tests ✅, Browser-Tests der Hauptabläufe in CI offen |
| D2 | CI | ✅ | P | - |
| D3 | reproduzierbarer Build | ✅ | P | - |
| D4 | automatisches Deployment + Staging | ❌ | Ö | braucht Umstellung der GitHub-Pages-Quelle durch den Betreiber |
| D5 | Linter | ❌ | - | ESLint schrittweise |
| D6 | `index.html` monolithisch (~1.700 Zeilen) | ❌ | - | Ansichten auslagern |
| D7 | Fehlerprotokoll | ✅ | P | - |
| D8 | Datenverlust (Speicher voll, Sicherung) | ✅ | P | - |
| D9 | Browser-/Geräte-Matrix | ❌ | Ö | iPhone, Android, Desktop, Video-Export braucht WebCodecs |
| D10 | Anbieter-Änderungen (Modellnamen) | ❌ | P | `GEMINI_MODELS`, TTS-Modelle regelmäßig prüfen |
| E1 | Zoom | ✅ | P | - |
| E3 | Kontrast/Tastatur/Screenreader | ❌ | Ö | axe/Lighthouse + echter Screenreader |
| E4 | Onboarding ohne eigenen Key | ❌ | Ö | hängt an A1/A2/C1 |
| E5 | Support-Weg | ❌ | Ö | FAQ, Kontakt, Datenschutz-Anfragen |

## 5. Quellen

| Quelle | Wofür | geprüft am |
|---|---|---|
| [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) | A1 (unter 18), A2 (EWR/CH/UK nur bezahlt, Nutzung unbezahlter Daten) | 23.09.2026 per Websuche (direkter Abruf aus der Claude-Umgebung gesperrt) |
| [Google-Entwicklerforum: „Only Paid Services“ für EWR/CH/UK](https://discuss.ai.google.dev/t/clarification-on-only-paid-services-for-eea-ch-uk/107860) | A2 | 23.09.2026 per Websuche |
| [Simon Willison zu den Gemini-Bedingungen](https://simonwillison.net/2024/Oct/17/gemini-terms-of-service/) | A1/A2 Hintergrund | 23.09.2026 per Websuche |
| [DSGVO (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2016/679/oj) | Art. 6, 8, 35, 44 ff., 77 | Adresse nicht einzeln abgerufen - beim nächsten Lauf prüfen |
| [§ 5 DDG (gesetze-im-internet.de)](https://www.gesetze-im-internet.de/ddg/__5.html) | B2 Impressum: „geschäftsmäßige, in der Regel gegen Entgelt angebotene digitale Dienste“ | Wortlaut 23.09.2026 per Websuche bestätigt |
| [§ 18 MStV (lxgesetze.de)](https://lxgesetze.de/mstv/18), [Leitfaden der Landesmedienanstalt RLP](https://medienanstalt-rlp.de/fileadmin/dateien/medienvielfalt/Medienregulierung/Merkblaetter_intern/Leitfaden_Impressum.pdf) | B2: Name + Anschrift für alle Angebote, die nicht „ausschließlich persönlichen oder familiären Zwecken“ dienen (eng ausgelegt) | 23.09.2026 per Websuche bestätigt |
| [§ 25 TDDDG (gesetze-im-internet.de)](https://www.gesetze-im-internet.de/ttdsg/__25.html) | Speicherung auf dem Gerät ohne Einwilligung (TTDSG seit 14.05.2024 in TDDDG umbenannt) | Adresse nicht einzeln abgerufen |
| [EU-KI-Verordnung 2024/1689 (EUR-Lex)](https://eur-lex.europa.eu/eli/reg/2024/1689/oj) | B5, Art. 50 Transparenzpflichten | Adresse nicht einzeln abgerufen |
| [BFSG (gesetze-im-internet.de)](https://www.gesetze-im-internet.de/bfsg/) | B7 | Adresse nicht einzeln abgerufen |
| [WCAG 2.2, 1.4.4 Resize Text](https://www.w3.org/TR/WCAG22/#resize-text) | E1 | Adresse nicht einzeln abgerufen |
| [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) | B6, PDF.js | Lizenztext am 23.09.2026 aus dem npm-Paket `pdfjs-dist@6.3.289` übernommen |
| [Hamburgischer Beauftragter für Datenschutz und Informationsfreiheit](https://datenschutz-hamburg.de/) | B1 Beschwerderecht | Adresse nicht einzeln abgerufen |

„Adresse nicht einzeln abgerufen“ heißt: aus dem Wissensstand übernommen, nicht beim Anlegen dieses
Skills live nachgeschlagen. Beim nächsten Lauf mit Internetzugang nachprüfen und die Spalte aktualisieren.

## 6. Ergebnis melden

1. In `docs/RELEASE-CHECKLISTE.md` den Abschnitt „Stand nach …“ aktualisieren: Datum, Version, was
   sich seit dem letzten Lauf geändert hat, neue Befunde. Erledigte Punkte in Abschnitt 4 dieses
   Skills auf ✅ setzen und den Datenstand oben erneuern.
2. Neue Befunde, die Claude selbst beheben kann → `docs/TODO-GESAMT.md`. Befunde, die Konto,
   Gerät, Beobachtung oder Entscheidung brauchen → `docs/WARTET-AUF-BETREIBER.md`.
3. Dem Betreiber (technischer Laie) kurz auf Deutsch antworten: zuerst das Gesamturteil
   („bereit für die private Nutzung: ja/nein“), dann die Blocker, dann den Rest. Fachbegriffe
   erklären, Quellen als Links am Ende.
4. Nichts „reparieren“, was in `CLAUDE.md` als bewusste Einschränkung steht (z.B. Keys im Browser),
   sondern nur als Befund nennen.
