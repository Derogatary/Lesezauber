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

## Offene Entscheidungen (blockieren den nächsten Schritt)

1. **Video-Export: ein Video pro Seite oder eins pro Buch?**
   Pro Seite = kleine Dateien, einfach zu teilen, kein Kapitelsprung. Pro Buch = ein fertiges "Hörbuch mit Bildern", aber je nach Länge 100+ MB und lange Wartezeit.
2. **ElevenLabs v3 (bezahlt) für Emotions-Tags?**
   Nur damit gibt es `[lacht]`, `[flüstert]` usw. bei ElevenLabs. Ohne Bezahltarif bleibt es bei `eleven_multilingual_v2`.
3. **Reicht der Stimmen-Speicher mit 100 MB?**
   Bei Gemini (unkomprimiert, ~1 MB/Seite) sind das rund 100 Seiten, bei den MP3-Anbietern mehrere tausend. Höher setzen heißt: weniger Platz für Bücher.
4. **Welcher Anbieter wird der Familien-Standard?**
   Davon hängt ab, ob sich Arbeit an exakten Wort-Zeitstempeln (nur ElevenLabs) oder an Emotions-Tags (Gemini) lohnt.

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
- Dateigröße: grob 1-2 MB je Minute bei 720p.

**Empfehlung für den Einstieg:** eine einzelne Seite exportieren (Knopf im "⋮"-Menü der Seitenkarte), erst danach das ganze Buch.

---

### 2. 🎭 Emotionen und Sprech-Anweisungen (Audio-Tags)

**Stand der Anbieter (Sept 2026):**

| Anbieter | Möglichkeiten |
|---|---|
| Gemini 3.1 Flash TTS | Stil-Anweisung für den ganzen Text **plus** 200+ Inline-Tags (`[whispers]`, `[laughs]`, `[excited]`) |
| OpenAI | eigenes `instructions`-Feld für den ganzen Text, keine Inline-Tags |
| ElevenLabs v3 | Audio-Tags - aber **nur in bezahlten Tarifen**; wir nutzen derzeit `eleven_multilingual_v2` ohne Tags |
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

### 10. 🔒 Bewusst zurückgestellt (bräuchte einen eigenen Server)
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
| Gerätestimme | unbegrenzt | – | offline, klingt maschinell |
| Gemini TTS | Free Tier, wenige Anfragen/Tag | – | nutzt den vorhandenen Gemini-Key |
| Google Cloud Chirp 3 HD | 1 Mio. Zeichen/Monat | ~30 $/Mio. Zeichen | braucht Cloud-Projekt mit Zahlungsart |
| ElevenLabs | 10.000 Zeichen/Monat (privat) | ab ~5 $/Monat | einzige exakte Wort-Zeitstempel |
| OpenAI | – | ~1,3 ct/Minute Audio | Persona als Sprechanweisung |

Preise und Limits ändern sich häufig - die Links dazu stehen direkt in der App unter ⚙️ → Vorlese-Stimme.
