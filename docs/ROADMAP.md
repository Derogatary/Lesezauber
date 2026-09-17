# 🗺 Roadmap & Konzepte

**Stand: v0.12.0-beta, September 2026**

Diese Datei ist der Einstiegspunkt für die nächsten größeren Schritte - sowohl für den Betreiber als auch für eine **neue Claude-Sitzung**, die hier weitermacht. Die Arbeitsteilung:

| Datei | Inhalt |
|---|---|
| `CLAUDE.md` | Regeln und Architektur - **wie** an diesem Projekt gearbeitet wird |
| `README.md` | Was die App heute kann, für Nutzer |
| `docs/ROADMAP.md` (hier) | Was als Nächstes kommt, wie es gedacht ist, welche Entscheidungen offen sind |

> Alles hier ist **Konzept, nicht beschlossen**. Nichts davon einfach drauflos bauen - erst mit dem Betreiber abstimmen (siehe "Offene Entscheidungen").

---

## Zuletzt fertig geworden

**Zusammenführung aller Entwicklungszweige (v0.12.0).** In dieser Version sind die bis dahin
getrennt entwickelten Stränge in einem Stand vereint. Damit sind mehrere Punkte erledigt,
die weiter unten früher noch als offen standen:

| Früher offen | Jetzt |
|---|---|
| Vollbild-Modus mit Text + Hervorhebung | ✅ erledigt |
| Zweiseitiges Layout für PC/Tablet | ✅ erledigt (Option in den Einstellungen) |
| Mitmachmodus (Sprechpause vor Emoji-Wörtern) | ✅ erledigt (Gerätestimme; KI-Stimmen-Weg s.u.) |
| Strukturierte Metadaten-Ansage | ✅ erledigt (Titel/Autor/Verlag/Reihe, Kapitel, Inhaltsverzeichnis) |
| Heft-Modus für Übungshefte | ✅ erledigt, inkl. Kontrolle bearbeiteter Blätter |

**KI-Stimmen (v0.10.0 - v0.10.2).** Statt der maschinellen Gerätestimme lassen sich vier neuronale Anbieter wählen (Gemini, Google Cloud Chirp 3 HD, ElevenLabs, OpenAI). Details im README-Abschnitt "Echte KI-Stimmen statt Roboterstimme", technische Regeln in `CLAUDE.md` unter "KI-Stimmen".

Wichtig für alles Folgende:
- Jede Aufnahme liegt als Datei im `ttsCache` (IndexedDB), inkl. Länge und Wort-Zeitpunkten.
- `app.ttsNeural.renderAudio()` und `renderPageSegments()` liefern genau die Bausteine, die ein Video-Export braucht.
- Die Gerätestimme kann **keine** Datei herausgeben - alles, was Audio weiterverarbeitet, setzt eine KI-Stimme voraus.

---

## Getroffene Entscheidungen

**1. Video-Export: pro Buch UND pro Seite - Schwerpunkt pro Buch.** (entschieden, Sept. 2026)

Gewünscht ist das ganze Buch als ein Film ("Hörbuch mit Bildern"). Pro Seite wird
zusätzlich angeboten, kostet aber kaum Extra-Arbeit: Der Renderer bekommt von Anfang an
einen **Seitenbereich**, pro Seite ist dann einfach der Bereich `[i, i]`. Ein eigener
zweiter Weg entsteht dadurch nicht.

Zwei Folgen, die aus dieser Entscheidung zwingend mitkommen:

- **Die Architekturfrage ist damit auch entschieden: Weg B (WebCodecs).** `MediaRecorder`
  (Weg A) nimmt in Echtzeit auf - bei einem ganzen Buch also 8-10 Minuten, in denen der Tab
  sichtbar im Vordergrund bleiben muss. Für eine einzelne Seite ist das zumutbar, für ein
  ganzes Buch nicht. Weg A bleibt allenfalls als Notnagel für Einzelseiten.
- **Pro Seite bleibt die Einheit zum Verschicken.** Ein ganzes Buch ergibt 120-240 MB
  (siehe unten) - das passt durch keinen E-Mail-Anhang. Die beiden Varianten haben damit
  verschiedene Zwecke: pro Buch zum Behalten und Abspielen, pro Seite zum Weitergeben.

Gut dazu passt, dass die App seit v0.12.0 Metadaten ansagt: Ein Buch-Film kann mit
"Der Titel des Buchs ist ... geschrieben von ..." beginnen und neue Kapitel ankündigen -
genau das, was ein durchgehender Film braucht und eine Einzelseite nicht hat.

---

**2. Emotions-Tags: automatisch je nach Anbieter, kein Bezahltarif-Vorbehalt mehr.** (entschieden, Sept. 2026)

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

**3. Stimmen-Speicher: 300 MB statt 100 MB.** (entschieden, Sept. 2026)

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

**4. Kein fest verdrahteter Familien-Standard - bleibt wählbar, Default Gerätestimme.**
(entschieden, Sept. 2026)

Es wird kein Anbieter hart als "der" Standard festgelegt. `app.settings.ttsProvider`
bleibt `'device'` (kostenlos, offline) als Voreinstellung; jede Familie/jedes Profil kann
in den Einstellungen weiterhin frei wechseln - das ist bereits heute so gebaut.

**Speechify als fünfter Anbieter vorgemerkt:** bietet wortgenaue Zeitstempel
("Speech Marks", technisch gleichwertig zu ElevenLabs), Deutsch unterstützt, aber zu
**$6-10 je 1 Mio. Zeichen statt ElevenLabs' ~$100/Mio.** - grob Faktor 10-15 günstiger,
dazu 50.000 Zeichen/Monat gratis (fünfmal mehr als ElevenLabs). Sobald an
`js/ttsProviders.js` gearbeitet wird, dort ergänzen. Andere geprüfte Kandidaten (Inworld,
Rime, Cartesia) zielen auf Echtzeit-Sprachassistenten - kein Zusatznutzen für vorab
erzeugte Vorlese-Dateien, deshalb nicht aufgenommen.

---

## Große Brocken

### 1. 🎬 Video-Export

**Ziel:** Eine Buchseite als Videodatei - Bild, KI-Stimme, mitlaufende Wort-Hervorhebung als Untertitel. Zum Verschicken an Oma, fürs Tablet ohne App, als Sicherung.

**Was schon da ist:**
```js
await app.ttsNeural.renderPageSegments(bookId, pageIdx, { includeQuiz: false })
// → { imgUrl, totalDurationSec, segments: [{ kind, text, blob, durationSec, words }] }
```
Bild, Ton, Länge und Wortzeiten liegen damit vollständig vor - ohne erneute API-Kosten, wenn die Seite schon einmal vorgelesen wurde.

**Was fehlt (der eigentliche Export):**
1. Ein `<canvas>` in Zielauflösung (Vorschlag: 1280×720), darauf das Seitenbild einpassen.
2. Untertitel: aus `segments[].words` das jeweils aktuelle Wort hervorheben - dieselbe Logik wie im Reader, nur auf Canvas gezeichnet.
3. Ton: die Segment-Blobs über die Web Audio API aneinanderhängen (`decodeAudioData` → `AudioBufferSourceNode` → `createMediaStreamDestination`).
4. Bild- und Tonspur zu einem `MediaStream` zusammenführen (`canvas.captureStream()` + Audio-Track) und mit `MediaRecorder` aufnehmen.
5. Ergebnis als Datei zum Download anbieten (wie `actions/backup.js` es beim Export schon macht).

**Stolpersteine, vorher klären:**
- `MediaRecorder` nimmt in **Echtzeit** auf: ein 10-Minuten-Buch braucht 10 Minuten Aufnahmezeit, in denen der Tab offen bleiben muss. Ein Fortschrittsbalken ist Pflicht, Abbrechen auch.
- **Format:** Chrome/Android liefert `video/webm`. iOS/Safari kann WebM nicht zuverlässig - dort ggf. MP4 prüfen oder den Export auf Desktop/Android beschränken (und das ehrlich anzeigen, statt eine kaputte Datei zu erzeugen).
- **Kein ffmpeg.wasm** ohne guten Grund: das wären ~25 MB zusätzlich, die bei einer PWA für Kinder schwer zu rechtfertigen sind. Erst den Browser-eigenen Weg ausreizen.
- Dateigröße: **15-30 MB je Minute** (2-4 Mbit/s), ein 8-Minuten-Buch also 120-240 MB.
  (Hier stand früher "1-2 MB je Minute" - das entspräche 0,13-0,27 Mbit/s und ist für
  720p um rund den Faktor 10 zu niedrig. Maßgeblich ist die Rechnung im Konzeptpapier.)

**Empfehlung für den Einstieg (angepasst an die Entscheidung oben):** den Renderer sofort
mit einem Seitenbereich bauen, aber als Erstes mit einer einzelnen Seite testen - das ist
derselbe Code mit Bereich `[i, i]` und in Sekunden statt Minuten durchgelaufen. Sobald das
sauber ist, ist das ganze Buch nur noch ein anderer Bereich. **Nicht** zuerst einen
Einzelseiten-Export bauen und das Buch später nachrüsten.

---

### 2. 🎭 Emotionen und Sprech-Anweisungen (Audio-Tags)

**Stand der Anbieter (Sept 2026):**

| Anbieter | Möglichkeiten |
|---|---|
| Gemini 3.1 Flash TTS | Stil-Anweisung für den ganzen Text **plus** 200+ Inline-Tags (`[whispers]`, `[laughs]`, `[excited]`) |
| OpenAI | eigenes `instructions`-Feld für den ganzen Text, keine Inline-Tags |
| ElevenLabs v3 | Audio-Tags. **Nachtrag:** seit GA (März 2026) zum selben Preis wie v2 ($0,10/1.000 Zeichen) - siehe Entscheidung 2 oben. Modell wird auf `eleven_v3` umgestellt |
| Google Cloud Chirp 3 HD | keine Emotionen, nur Tempo und Pausen-Tags (eigenes `markup`-Feld, nicht `text`) |

**Was bereits wirkt:** Die Persona bringt seit v0.10.2 eine eigene Sprech-Anweisung mit (`ttsStyle` in `js/config.js`) - die Gute-Nacht-Fee wird ausdrücklich als "sehr sanft, leise, fast flüsternd" angesagt, nicht mehr nur als "sanfte Gute-Nacht-Fee" (das war eine Schreib-, keine Sprech-Anweisung).

**Konzept für Tags mitten im Satz:**
- Ein neues, **optionales** Feld je Variante, z.B. `speechText` - der Seitentext, angereichert mit Tags. Die Anzeige im Reader nutzt weiterhin `text`, sonst stünden `[lacht]`-Klammern sichtbar im Buch.
- Erzeugen lässt sich das **ohne zusätzlichen API-Aufruf**: ein weiteres Feld im Analyse-JSON in `js/api.js`.
- **Sicherheitsnetz Pflicht:** Tags nur an Anbieter schicken, die sie kennen (neues Flag `supportsTags` in `js/ttsProviders.js`), sonst herausfiltern - sonst liest die Stimme "eckige Klammer lacht" vor.
- Alte Bücher haben kein `speechText` → dann einfach `text` nehmen (gleiche Rückwärtskompatibilität wie bei `variants`).

---

### 3. 🙋 Mitmachmodus mit KI-Stimme (Rest-Aufgabe)

**Die Gerätestimme kann das seit v0.12.0** - `app.tts.speakMitmach()` zerlegt den Erstleser-Text
an den Emoji-Stellen und legt über `setTimeout` echte Rate-Pausen ein (das Emoji wird währenddessen
optisch hervorgehoben).

Offen ist nur noch der Weg für die **KI-Stimme**: Entweder Pausen-Tags mitschicken
(Gemini `[pause]`, Chirp 3 über `markup`) - eine Aufnahme, keine Mehrkosten. Oder den Text in Stücke
zerlegen - klingt gleichmäßiger, kostet aber je Stück einen Aufruf. **Tags bevorzugen.**
Aktuell läuft der Mitmachmodus bewusst immer über die Gerätestimme.

---

### 4. ✂️ Lange Texte stückeln

Aktuell gilt `MAX_NEURAL_CHARS = 4000` (in `js/ttsNeural.js`); längere Texte - praktisch nur EPUB-Kapitel - gehen an die Gerätestimme. Konzept: an Satzenden in Stücke von ~800 Zeichen zerlegen, nacheinander abspielen, Wort-Offsets je Stück verschieben. Jedes Stück wird einzeln zwischengespeichert. Aufwand mittel, Nutzen nur für EPUB-lastige Nutzung.

---

### 5. 🔤 Vorlese-Aufbereitung des erkannten Texts

Der Analyse-Prompt liefert bewusst den "exakten gedruckten Text" - richtig für die Anzeige, nicht immer ideal fürs Ohr: Trennstriche am Zeilenende, fehlende Satzzeichen, Abkürzungen. Konzept: eine Funktion neben `app.utils.stripEmojiForSpeech()`, die **nur für die Sprachausgabe** glättet (Trennstrich + Zeilenumbruch zusammenziehen, mehrfache Leerzeichen, ggf. Abkürzungen ausschreiben). Die Anzeige bleibt unangetastet. Klein, risikoarm, verbessert jede Stimme.

---

### 6. 🌙 Vollbild-Modus mit Text und Hervorhebung - ✅ erledigt (v0.12.0)

Der Vollbild-Modus blendet Bild, Text **und** die mitlaufende Wort-Hervorhebung ein
(`app.tts._currentTextElementId()` reicht dafür die ID des Vollbild-Textfelds durch).

### 7. 📖 Zweiseitiges Layout für PC/Tablet - ✅ erledigt (v0.12.0)
Bild links, Text rechts, als Option in den Einstellungen (`app.settings.twoPageLayout`).
Greift per CSS-Media-Query erst ab Tablet-Breite; auf dem Handy bleibt alles untereinander.

### 8. 🎨 KI-generierte Illustrationen
Für textlastige EPUB-Kapitel ohne eigenes Bild, Comic-Stil, über die Bildgenerierung von Gemini (gleicher Key). Zusammen mit dem Video-Export besonders interessant: Kapitel ohne Bild hätten sonst nichts zu zeigen.

### 9. 📱 Native App via Capacitor
Verpackt den bestehenden Code weitgehend unverändert. Nebeneffekt: Ein natives Paket könnte Audio im Hintergrund abspielen - im Browser hört das Vorlesen beim Sperren des Bildschirms auf.

### 10. 🔐 Kinder-/Elternbereich (Profil-Rollen) - neu, Sept. 2026

Aus der Diskussion um den Anbieter-Standard (Entscheidung 4) entstanden: Profile speichern
heute nur `{id, name}`, es gibt **keine** Rolle/Rechte-Unterscheidung. Ein Kind kann also
schon jetzt aus Neugier einen kostenpflichtigen TTS-Anbieter anklicken oder einen API-Key
sehen.

**Konzept:**
- Profil bekommt ein neues Feld `role: 'child' | 'adult'`, Default `'child'` - ein
  bestehendes Profil ohne Migration bleibt damit sicher restriktiv, nicht versehentlich offen.
- Bestimmte Einstellungen (TTS-Anbieter wechseln, API-Keys eintragen, später:
  kostenpflichtige SchreibZauber-Bildgenerierung auslösen) sind nur sichtbar/bedienbar,
  wenn ein Erwachsenen-Profil aktiv ist.
- Rein clientseitige Beschränkung - kein Schutz vor einem technisch versierten Kind mit
  Entwicklerkonsole, aber genau richtig gegen "aus Versehen/Neugier teuer".

Aufwand **mittel** (neues Datenfeld, DB-Migration, mehrere UI-Stellen die jetzt prüfen
müssen). Lohnt sich schon **vor** SchreibZauber Stufe 6, nicht erst danach.

### 11. 🔒 Bewusst zurückgestellt (bräuchte einen eigenen Server)
API-Keys über ein Backend absichern · automatische Cloud-Synchronisierung · echte Multi-Geräte-Accounts. Gilt seit den KI-Stimmen für **mehr** Keys als vorher - die Abwägung bleibt aber dieselbe.

---

## Kleine Ideen (jeweils unter einer Stunde)

- **Mehr Stimmen freischalten:** In `js/ttsProviders.js` ist nur eine Vorauswahl eingetragen (Gemini hat 30, OpenAI 11+). Eine Zeile je Stimme.
- **Stimme pro Profil:** Jedes Kind bekommt seine eigene Vorlese-Stimme - `app.settings.ttsVoices` müsste dafür pro Profil gespeichert werden.
- **"Buch hörfertig machen":** Ein Knopf, der alle Seiten eines Buches vorab in den Stimmen-Speicher legt - danach läuft das Vorlesen ohne Wartezeit und offline.
- **Kosten-Anzeige:** Mitzählen, wie viele Zeichen im Monat an den Anbieter gingen (rein lokal geschätzt).

---

## Kostenübersicht KI-Stimmen (Stand September 2026, ohne Gewähr)

| Anbieter | Gratis | Danach | Besonderheit |
|---|---|---|---|
| Gerätestimme | unbegrenzt | – | offline, klingt maschinell. **Bleibt der Standard (Entscheidung 4)** |
| Gemini TTS | Free Tier, wenige Anfragen/Tag | – | nutzt den vorhandenen Gemini-Key |
| Google Cloud Chirp 3 HD | 1 Mio. Zeichen/Monat | ~30 $/Mio. Zeichen | braucht Cloud-Projekt mit Zahlungsart |
| ElevenLabs | 10.000 Zeichen/Monat (privat) ≈ 13-15 Min. Sprache | ~100 $/Mio. Zeichen | exakte Wort-Zeitstempel; seit v3 auch Emotions-Tags zum gleichen Preis |
| OpenAI | – | ~1,3 ct/Minute Audio | Persona als Sprechanweisung |
| Speechify *(vorgemerkt, noch nicht eingebaut)* | 50.000 Zeichen/Monat | 6-10 $/Mio. Zeichen | ebenfalls exakte Wort-Zeitstempel, **10-15× günstiger als ElevenLabs** - siehe Entscheidung 4 |

10.000 Zeichen (ElevenLabs-Gratistarif) entsprechen grob 6-10 neu vorgelesenen Bilderbüchern
im Monat - danach ist alles gecacht und kostet beim erneuten Vorlesen nichts mehr.

Preise und Limits ändern sich häufig - die Links dazu stehen direkt in der App unter ⚙️ → Vorlese-Stimme.
