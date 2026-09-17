# 🗺 Roadmap: Vorlesen & Stimmen

**Stand: v0.12.0-beta, September 2026**

Diese Datei ist der Einstiegspunkt für die nächsten Schritte **rund um Vorlesen und
KI-Stimmen** - sowohl für den Betreiber als auch für eine **neue Claude-Sitzung**, die
hier weitermacht. Für alles andere:

| Datei | Inhalt |
|---|---|
| `CLAUDE.md` | Regeln und Architektur - **wie** an diesem Projekt gearbeitet wird |
| `README.md` | Was die App heute kann, für Nutzer |
| `docs/TODO-GESAMT.md` | **Gesamtübersicht aller offenen Punkte**, nach Bereich & Aufwand sortiert - der eigentliche Einstieg, wenn unklar ist, wo überhaupt anzufangen ist |
| `docs/ROADMAP.md` (hier) | Vorlesen/KI-Stimmen im Detail: was als Nächstes kommt, welche Entscheidungen bereits gefallen sind |
| `docs/KONZEPT-Video.md` | Video-Export, Hörbuch, Mehrformat-Ausspielung - eigenes Dokument, hier **nicht** dupliziert |

> Was hier noch Konzept ist (nicht "Getroffene Entscheidungen"), ist **nicht
> beschlossen**. Nichts davon einfach drauflos bauen - erst mit dem Betreiber abstimmen.

---

## Zuletzt fertig geworden

**Zusammenführung aller Entwicklungszweige (v0.12.0).** In dieser Version sind die bis dahin
getrennt entwickelten Stränge in einem Stand vereint. Damit sind mehrere Punkte erledigt,
die weiter unten früher noch als offen standen: Vollbild-Modus mit Text + Hervorhebung,
Zweiseitiges Layout für PC/Tablet, Mitmachmodus (Gerätestimme), strukturierte
Metadaten-Ansage, Heft-Modus für Übungshefte. Details dazu: `docs/TODO-GESAMT.md`.

**KI-Stimmen (v0.10.0 - v0.10.2).** Statt der maschinellen Gerätestimme lassen sich neuronale Anbieter wählen (Gemini, Google Cloud Chirp 3 HD, ElevenLabs, OpenAI). Details im README-Abschnitt "Echte KI-Stimmen statt Roboterstimme", technische Regeln in `CLAUDE.md` unter "KI-Stimmen".

**Speechify als 5. Anbieter, mehr Stimmen, Tarif-Lock (Sept. 2026, siehe unten).** `js/ttsProviders.js` hat jetzt fünf Anbieter, deutlich mehr Stimmen (Gemini alle 30, OpenAI alle 13) und ein `costTier`-Feld je Anbieter mit Bestätigungsdialog beim Wechsel in eine teurere Preisstufe.

Wichtig für alles Folgende:
- Jede Aufnahme liegt als Datei im `ttsCache` (IndexedDB), inkl. Länge und Wort-Zeitpunkten.
- `app.ttsNeural.renderAudio()` und `renderPageSegments()` liefern genau die Bausteine, die ein Video-Export braucht (Details: `docs/KONZEPT-Video.md`).
- Die Gerätestimme kann **keine** Datei herausgeben - alles, was Audio weiterverarbeitet, setzt eine KI-Stimme voraus.

---

## Getroffene Entscheidungen

**1. Emotions-Tags: automatisch je nach Anbieter, kein Bezahltarif-Vorbehalt mehr.** (entschieden, Sept. 2026)

**Korrektur einer überholten Annahme:** ElevenLabs v3 ist seit März 2026 allgemein
verfügbar (nicht mehr Alpha) und kostet **genauso viel wie v2** - $0,10 je 1.000 Zeichen,
kein Aufpreis für Tags mehr, dazu 70+ statt 29 Sprachen. Die alte Aussage "nur mit
Bezahltarif" stimmt nicht mehr.

Damit ist es keine Frage von zwei getrennten APIs, sondern nur, welches Modell angesteuert
wird:
- `speechText` (Text mit Tags) wird **immer** mitgeneriert - kostenlos im selben
  Analyse-Aufruf, kein Zusatz-Call.
- `supportsTags`-Flag je Anbieter entscheidet, ob es genutzt wird. Bei ElevenLabs zeigt das
  Modell direkt auf `eleven_v3` statt `eleven_multilingual_v2` - **ersetzt** v2, kein
  Parallelbetrieb. Bei Gemini die eigene Tag-Syntax (siehe unten). Bei Anbietern ohne
  Unterstützung (Chirp 3, OpenAI, künftig Speechify) werden Tags automatisch herausgefiltert.
- **Vorbehalt:** Ob der kostenlose 10.000-Credits-Tarif von ElevenLabs v3 uneingeschränkt
  erlaubt, ist nicht zu 100% verifiziert (keine gegenteiligen Hinweise gefunden) - im
  Praxistest bestätigen.

**2. Stimmen-Speicher: 300 MB statt 100 MB.** (entschieden, Sept. 2026)

Faktor 3 als Mittelweg: bei Gemini (~1 MB/Seite) wächst die Reichweite von ~100 auf
~300 Seiten, bei den MP3-Anbietern (~40 KB/Seite) greift das Limit ohnehin kaum. Moderne
Browser gewähren IndexedDB großzügig Speicher - 300 MB ist auf praktisch jedem Gerät
unkritisch, sollte aber wegen der ggf. knappen Handys der Kinder nicht ohne Grund höher.

Eine Zeile Aufwand: `TTS_CACHE_MAX_BYTES` in `js/db.js`. Die Eviction-Logik (älteste
Einträge zuerst raus, sobald das Limit erreicht ist) sowie ein manueller
"Cache leeren"-Knopf existieren bereits.

**Geprüft und verworfen (fürs Erste): Audiodateien mit exportieren.** Der bestehende
Bibliotheks-Export (`backup.js`) sichert nur Bild und Text, **nicht** die TTS-Aufnahmen -
Export/Reimport würde sie also nicht mitnehmen, sie müssten neu erzeugt werden (kostet
erneut). Das wirklich umzusetzen bräuchte einen neuen Exportweg mit Audio-Blobs - technisch
machbar, aber ein eigener, größerer Punkt, kein Teil dieser Entscheidung.

**3. Kein fest verdrahteter Familien-Standard - bleibt wählbar, Default Gerätestimme.**
(entschieden, Sept. 2026)

Es wird kein Anbieter hart als "der" Standard festgelegt. `app.settings.ttsProvider`
bleibt `'device'` (kostenlos, offline) als Voreinstellung; jede Familie/jedes Profil kann
in den Einstellungen weiterhin frei wechseln - das ist bereits heute so gebaut.

**Speechify als fünfter Anbieter eingebaut (Sept. 2026):** bietet wortgenaue Zeitstempel
("Speech Marks", technisch gleichwertig zu ElevenLabs), Deutsch unterstützt (Modell
`simba-3.2`), zu **$6-10 je 1 Mio. Zeichen statt ElevenLabs' ~$100/Mio.** - grob Faktor
10-15 günstiger, dazu 50.000 Zeichen/Monat gratis (fünfmal mehr als ElevenLabs). Umgesetzt
in `js/ttsProviders.js` (`speechifySynthesize`/`fetchSpeechifyVoices`). Andere geprüfte
Kandidaten (Inworld, Rime, Cartesia) zielen auf Echtzeit-Sprachassistenten - kein
Zusatznutzen für vorab erzeugte Vorlese-Dateien, deshalb nicht aufgenommen.

---

## Offene Punkte rund ums Vorlesen

### 1. 🎭 Emotionen und Sprech-Anweisungen (Audio-Tags)

**Stand der Anbieter (Sept 2026):**

| Anbieter | Möglichkeiten |
|---|---|
| Gemini 3.1 Flash TTS | Stil-Anweisung für den ganzen Text **plus** 200+ Inline-Tags (`[whispers]`, `[laughs]`, `[excited]`) |
| OpenAI | eigenes `instructions`-Feld für den ganzen Text, keine Inline-Tags |
| ElevenLabs v3 | Audio-Tags. Seit GA (März 2026) zum selben Preis wie v2 ($0,10/1.000 Zeichen) - siehe Entscheidung 1 oben. Modell wird auf `eleven_v3` umgestellt |
| Google Cloud Chirp 3 HD | keine Emotionen, nur Tempo und Pausen-Tags (eigenes `markup`-Feld, nicht `text`) |

**Was bereits wirkt:** Die Persona bringt seit v0.10.2 eine eigene Sprech-Anweisung mit (`ttsStyle` in `js/config.js`) - die Gute-Nacht-Fee wird ausdrücklich als "sehr sanft, leise, fast flüsternd" angesagt, nicht mehr nur als "sanfte Gute-Nacht-Fee" (das war eine Schreib-, keine Sprech-Anweisung).

**Konzept für Tags mitten im Satz:**
- Ein neues, **optionales** Feld je Variante, z.B. `speechText` - der Seitentext, angereichert mit Tags. Die Anzeige im Reader nutzt weiterhin `text`, sonst stünden `[lacht]`-Klammern sichtbar im Buch.
- Erzeugen lässt sich das **ohne zusätzlichen API-Aufruf**: ein weiteres Feld im Analyse-JSON in `js/api.js`.
- **Sicherheitsnetz Pflicht:** Tags nur an Anbieter schicken, die sie kennen (neues Flag `supportsTags` in `js/ttsProviders.js`), sonst herausfiltern - sonst liest die Stimme "eckige Klammer lacht" vor.
- Alte Bücher haben kein `speechText` → dann einfach `text` nehmen (gleiche Rückwärtskompatibilität wie bei `variants`).

### 2. 🙋 Mitmachmodus mit KI-Stimme (Rest-Aufgabe)

**Die Gerätestimme kann das seit v0.12.0** - `app.tts.speakMitmach()` zerlegt den Erstleser-Text
an den Emoji-Stellen und legt über `setTimeout` echte Rate-Pausen ein (das Emoji wird währenddessen
optisch hervorgehoben).

Offen ist nur noch der Weg für die **KI-Stimme**: Entweder Pausen-Tags mitschicken
(Gemini `[pause]`, Chirp 3 über `markup`) - eine Aufnahme, keine Mehrkosten. Oder den Text in Stücke
zerlegen - klingt gleichmäßiger, kostet aber je Stück einen Aufruf. **Tags bevorzugen.**
Aktuell läuft der Mitmachmodus bewusst immer über die Gerätestimme.

### 3. ✂️ Lange Texte stückeln

Aktuell gilt `MAX_NEURAL_CHARS = 4000` (in `js/ttsNeural.js`); längere Texte - praktisch nur EPUB-Kapitel - gehen an die Gerätestimme. Konzept: an Satzenden in Stücke von ~800 Zeichen zerlegen, nacheinander abspielen, Wort-Offsets je Stück verschieben. Jedes Stück wird einzeln zwischengespeichert. Aufwand mittel, Nutzen nur für EPUB-lastige Nutzung.

### 4. 🔤 Vorlese-Aufbereitung des erkannten Texts

Der Analyse-Prompt liefert bewusst den "exakten gedruckten Text" - richtig für die Anzeige, nicht immer ideal fürs Ohr: Trennstriche am Zeilenende, fehlende Satzzeichen, Abkürzungen. Konzept: eine Funktion neben `app.utils.stripEmojiForSpeech()`, die **nur für die Sprachausgabe** glättet (Trennstrich + Zeilenumbruch zusammenziehen, mehrfache Leerzeichen, ggf. Abkürzungen ausschreiben). Die Anzeige bleibt unangetastet. Klein, risikoarm, verbessert jede Stimme.

---

## Kleine Ideen (jeweils unter einer Stunde)

- ~~**Mehr Stimmen freischalten**~~ **erledigt (Sept. 2026):** `js/ttsProviders.js` hat jetzt alle 30 Gemini- und alle 13 OpenAI-Stimmen, bewährte zuerst.
- **Stimme pro Profil:** Jedes Kind bekommt seine eigene Vorlese-Stimme - `app.settings.ttsVoices` müsste dafür pro Profil gespeichert werden.
- **"Buch hörfertig machen":** Ein Knopf, der alle Seiten eines Buches vorab in den Stimmen-Speicher legt - danach läuft das Vorlesen ohne Wartezeit und offline.
- **Kosten-Anzeige:** Mitzählen, wie viele Zeichen im Monat an den Anbieter gingen (rein lokal geschätzt).
- ~~**Tarif-Lock**~~ **erledigt (Sept. 2026):** Jeder Anbieter in `js/ttsProviders.js` hat jetzt
  ein `costTier`-Feld (`free`/`cheap`/`expensive`); beim Wechsel auf eine teurere Stufe als die
  aktuell gewählte erscheint ein Bestätigungsdialog (`app.ttsProviders.isCostUpgrade()` in
  `js/settingsConfig.js`) statt eines stillen Wechsels - schützt vor versehentlichem
  Umschalten in eine teurere Preisstufe, nicht vor Absicht. Der Betrag selbst wird
  weiterhin persönlich beim Anbieter gedeckelt, nicht in der App.

---

## Kostenübersicht KI-Stimmen (Stand September 2026, ohne Gewähr)

| Anbieter | Gratis | Danach | Besonderheit |
|---|---|---|---|
| Gerätestimme | unbegrenzt | – | offline, klingt maschinell. **Bleibt der Standard (Entscheidung 3)** |
| Gemini TTS | Free Tier, wenige Anfragen/Tag | – | nutzt den vorhandenen Gemini-Key |
| Google Cloud Chirp 3 HD | 1 Mio. Zeichen/Monat | ~30 $/Mio. Zeichen | braucht Cloud-Projekt mit Zahlungsart |
| ElevenLabs | 10.000 Zeichen/Monat (privat) ≈ 13-15 Min. Sprache | ~100 $/Mio. Zeichen | exakte Wort-Zeitstempel; seit v3 auch Emotions-Tags zum gleichen Preis |
| OpenAI | – | ~1,3 ct/Minute Audio | Persona als Sprechanweisung |
| Speechify | 50.000 Zeichen/Monat | 6-10 $/Mio. Zeichen | ebenfalls exakte Wort-Zeitstempel, **10-15× günstiger als ElevenLabs** - siehe Entscheidung 3 |

10.000 Zeichen (ElevenLabs-Gratistarif) entsprechen grob 6-10 neu vorgelesenen Bilderbüchern
im Monat - danach ist alles gecacht und kostet beim erneuten Vorlesen nichts mehr.

Preise und Limits ändern sich häufig - die Links dazu stehen direkt in der App unter ⚙️ → Vorlese-Stimme.

---

## Was NICHT mehr hier steht (September 2026 aufgeräumt)

Diese Datei war zuvor ein Sammelbecken für alles Größere, nicht nur Vorlesen. Beim
Zusammenführen der Konzeptpapiere wurde das getrennt - hier nachgeschlagen wird jetzt:

| Thema | Steht jetzt in |
|---|---|
| Video-Export, Hörbuch, Mehrformat | `docs/KONZEPT-Video.md` (vorher hier dupliziert) |
| KI-generierte Illustrationen (Comic-Stil) | `docs/KONZEPT-Comic.md` |
| Native App via Capacitor, Kinder-/Elternbereich (Profil-Rollen), Server-Punkte (bewusst zurückgestellt) | `docs/TODO-GESAMT.md`, Bereich "App & Plattform" |
