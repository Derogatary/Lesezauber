# Konzept: Sprach-API, Video-Export und Mehrformat-Ausspielung

> **Status: weitgehend Konzept.** Stand: 16.09.2026, App-Version v0.9.0-beta;
> gegengelesen für v0.12.0-beta. Seitdem sind der **Audio-Asset-Layer** (Abschnitt 2,
> allerdings anders als hier geplant), die **KI-Stimmen** und der **Textteil des
> Kino-Modus** (Abschnitt 3, Stufe 1) umgesetzt - der eigentliche Video-**Export**
> ist weiterhin offen. Einzelne Stellen tragen deshalb einen Nachtrag.
>
> **Nachtrag (17./18.09.2026, v0.16.0-beta): Weg B ist gebaut - Teil 1 und Teil 2.**
> `js/render/cinema.js` zeichnet einen Frame zu einem Zeitpunkt t (Seitenbild mit
> Ken-Burns + Untertitel-Balken mit mitlaufender Wort-Hervorhebung, Kreuzblende
> beim Szenenwechsel), `js/actions/videoTimeline.js` legt den Zeitplan über einen
> **Seitenbereich** (inkl. Seiten-Rollen und Pausen), `js/actions/videoPreview.js`
> spielt das als "🎬 Film"-Vorschau ab, und `js/actions/videoExport.js` kodiert
> daraus mit `VideoEncoder`/`AudioEncoder` und `js/vendor/mp4muxer/` eine echte
> **MP4-Datei** - für eine Einzelseite wie fürs ganze Buch, nur bei
> `origin: 'authored'`. Stand und Entscheidungen: Abschnitt 4.7.
>
> **Zusammengeführt (Sept. 2026):** Die Video-Inhalte aus `docs/ROADMAP.md` (dort
> ursprünglich dupliziert) sind jetzt hier eingearbeitet - `ROADMAP.md` ist seitdem
> auf reine Vorlese-/Stimmen-Themen begrenzt, dieses Dokument ist die einzige
> Quelle für Video/Multiformat.
> Dieses Dokument hält fest, **was** gebaut werden könnte, **wie** es technisch aussähe und
> vor allem **warum** die Entscheidungen so und nicht anders fallen würden - damit man in
> ein paar Monaten nicht wieder bei null anfängt und dieselben Sackgassen abläuft.
> Größere Features hier brauchen laut `CLAUDE.md` erst eine Abstimmung, bevor jemand anfängt.

Inhalt:

1. [Der Flaschenhals: warum ohne echte Sprach-API gar nichts geht](#1-der-flaschenhals)
2. [Das Audio-Asset: der eine Datenmodell-Schritt](#2-das-audio-asset)
3. [Video in drei Ausbaustufen](#3-video-in-drei-ausbaustufen)
4. [MP4: welche Rahmenbedingungen sich ändern müssten](#4-mp4-rahmenbedingungen)
5. [Die Pipeline-Idee: Buch → Hörbuch → Video → Comic](#5-die-pipeline-idee)
6. [Selbst geschriebene Bücher: die umgedrehte Pipeline](#6-selbst-geschriebene-bücher)
7. [Grenzen, Risiken, Rechtliches](#7-grenzen-risiken-rechtliches)
8. [Empfohlene Reihenfolge](#8-empfohlene-reihenfolge)

---

## 1. Der Flaschenhals

**Warum steht der Video-Export seit Monaten still?** Nicht wegen fehlender Zeit, sondern wegen
einer harten technischen Grenze: Die heutige Sprachausgabe läuft über die
`SpeechSynthesis`-API des Browsers (`js/tts.js`). Deren Audioausgabe geht direkt auf das
Ausgabegerät und ist **nicht abgreifbar** - es gibt keinen standardisierten Weg, sie in die
WebAudio-API oder in einen `MediaStream` zu leiten.

Konsequenz: Mit der aktuellen Architektur ist **kein Hörbuch und kein Video mit Ton möglich**.
Das ist keine Frage des Aufwands, das geht schlicht nicht.

Eine echte Sprach-API (Gemini TTS, ElevenLabs, OpenAI) liefert stattdessen **Audio-Bytes als
Datei**. Damit wird aus dem flüchtigen Vorlesen ein *Asset*, das man speichern, schneiden,
zusammenfügen und in ein Video mischen kann. Alles Weitere in diesem Dokument hängt an
diesem einen Punkt.

### Auswahlkriterium für die Sprach-API

Das wichtigste Kriterium ist **nicht** die Stimmqualität, sondern ob die API
**Wort-Zeitstempel** mitliefert (oft "alignment", "word timings" oder "speech marks" genannt).

Warum: Die heutige Wort-für-Wort-Hervorhebung beim Vorlesen hängt am `boundary`-Event von
`SpeechSynthesis` (`js/tts.js`, `utter.onboundary`). Dieses Event gibt es bei einer Audiodatei
nicht. Ohne Zeitstempel von der API verliert die App also ein bestehendes Feature - und im
Video wären keine Karaoke-Untertitel möglich. Zeitstempel nachträglich zu berechnen
(forced alignment) wäre ein eigenes, unangenehmes Projekt.

---

## 2. Das Audio-Asset

Der Datenmodell-Schritt, auf dem alles steht. Heute (siehe `CLAUDE.md`, Abschnitt
"Datenmodell") sieht eine Seitenvariante so aus:

```js
variants: {
  [personaId]: { text, erstleserText, desc, quizQ, quizA }
}
```

Ergänzung:

```js
variants: {
  [personaId]: {
    text, erstleserText, desc, quizQ, quizA,
    audio: {
      mediaKey,      // Schlüssel in den neuen media-Store, NICHT die Daten selbst
      durationMs,
      marks: [{ word, startMs }]   // Wort-Zeitstempel, siehe oben
    }
  }
}
```

Zwei Entscheidungen, die man vorher treffen sollte, weil sie später teuer zu ändern sind:

**a) Audio als Blob in einem eigenen Object Store, nicht als Data-URL.**
Die Bilder liegen heute als WebP-Data-URL direkt im Buch-Datensatz
(`app.utils.createImageVariants()`). Für Audio wäre das falsch: Base64 kostet 33 % Overhead,
und der JSON-Export in `js/actions/backup.js` (`downloadBook()`) würde unbenutzbar groß.
Also: `DB_VERSION` in `js/db.js` auf 3 erhöhen, neuer Store `media` mit
Key `${pageId}:${personaId}`, Wert = Blob. Der Buch-Datensatz enthält nur den Schlüssel.
Folge: Export/Import müssten erweitert werden (ZIP statt JSON, oder Audio bewusst
nicht mitexportieren - es lässt sich ja neu erzeugen).

**b) Audio nur on demand für die gerade gewählte Persona.**
Exakt dieselbe Regel wie heute bei den Textvarianten. Fünf Personas × jede Seite sofort
vertonen = fünffache Kosten und fünffacher Speicher. Das wurde für die Textvarianten schon
einmal bewusst so entschieden (siehe `CLAUDE.md`) und gilt hier erst recht.

**Größenordnung:** ~48 kbit/s mono ≈ 6 KB/s. Ein 30-Seiten-Buch mit 15 s pro Seite
≈ 450 s ≈ **2,7 MB pro Persona**. Unkritisch.

> **Nachtrag v0.12.0: dieser Abschnitt ist im Kern erledigt, aber anders als hier
> geplant.** Die KI-Stimmen (v0.10.0-v0.10.2) haben einen Audio-Asset-Layer gebaut -
> nicht über einen neuen generischen `media`-Store, sondern über den bereits für
> Stimmen-Zwischenspeicherung gebauten `ttsCache` (ebenfalls `DB_VERSION` 3, ebenfalls
> Blob statt Data-URL/Base64, also dieselben beiden Kernentscheidungen aus diesem
> Abschnitt - nur anders benannt und etwas anders geschnitten):
>
> - `app.ttsNeural.renderAudio(text, {personaId})` → `{ text, blob, mime, durationSec,
>   words: [{word, start, end}], exact }` - genau das Audio-Asset samt Wort-Zeitstempeln,
>   das dieser Abschnitt forderte.
> - `app.ttsNeural.renderPageSegments(bookId, pageIdx, {includeDescription, includeQuiz,
>   onProgress})` → `{ imgUrl, totalDurationSec, segments: [...] }` - Bild, Ton, Länge
>   und Wortzeiten für eine ganze Seite in einem Aufruf, Reihenfolge Text → Bildbeschreibung
>   → Quiz.
> - Gilt weiterhin **nur mit einer KI-Stimme** - die Gerätestimme (`SpeechSynthesis`) kann
>   nach wie vor keine Datei herausgeben, `renderAudio()` wirft bei `ttsProvider === 'device'`
>   deshalb einen verständlichen Fehler. Der Flaschenhals aus Abschnitt 1 bleibt also
>   bestehen - nur eben durch die KI-Stimmen bereits gelöst, nicht mehr offen.
>
> Für den Video-Export bedeutet das: **Schritt 1 der Empfohlenen Reihenfolge (Abschnitt 8)
> ist erledigt.** Der Video-Export kann direkt auf diesen Bausteinen aufbauen, ohne den
> hier beschriebenen `media`-Store separat zu bauen.

---

## 3. Video in drei Ausbaustufen

Die drei Stufen unterscheiden sich im Aufwand um Größenordnungen. Wichtig: **Stufe 1 ist für
die Kinder wahrscheinlich schon "das Video"** - eine exportierte Datei braucht man nur, wenn
man sie *weitergeben* will.

### Stufe 1 - "Kino-Modus" (live gerendert, kein Export)

Der Vollbild-Modus aus `js/actions/focusMode.js` plus:

- langsamer Zoom/Schwenk über das Bild (Ken-Burns-Effekt, reines CSS)
- Text als Untertitel unten, mit mitlaufender Wort-Hervorhebung
  (`app.utils.buildSpeechHighlightHtml()` existiert bereits)
- Kreuzblende beim Seitenwechsel statt hartem Schnitt

Aufwand: ~200 Zeilen, keine neue Abhängigkeit.

> **Nachtrag v0.12.0:** Dieser Abschnitt versprach ursprünglich, nebenbei den offenen Punkt
> "Vollbild-Modus zeigt aktuell nur das Bild, keinen Text" zu lösen. Das ist inzwischen
> unabhängig davon erledigt - der Vollbild-Modus zeigt Text samt mitlaufender
> Wort-Hervorhebung. **Von Stufe 1 bleiben damit nur noch Ken-Burns-Effekt und Kreuzblende
> übrig**, also deutlich weniger als die genannten ~200 Zeilen.
>
> **Nachtrag (Sept. 2026):** Auch Ken-Burns-Effekt und Kreuzblende sind jetzt umgesetzt
> (`css/style.css`, `app.render.focusMode()` in `js/render/reader.js`) - **Stufe 1 ist damit
> vollständig abgeschlossen**. Zwei übereinanderliegende `<img>`-Elemente wechseln sich beim
> Seitenwechsel per Opacity/z-index ab, die Zoom-Richtung variiert zyklisch nach Seitenindex
> (vier CSS-Keyframe-Varianten). Respektiert `prefers-reduced-motion` (harter Schnitt ohne
> Bewegung) und ist zusätzlich über einen Schalter in den Einstellungen abschaltbar
> (`app.settings.focusEffectsEnabled`). Reine CSS-Animation über eine eigene Klasse
> (`.focus-kenburns-img`), rührt die Wort-Hervorhebung im Untertitel-Bereich (eigenes
> Element, eigenes `requestAnimationFrame`/`boundary`-Event) nicht an. Offen für Video bleibt
> ausschließlich der eigentliche Export (Stufe 2/3), siehe unten.

### Stufe 2 - Videodatei per `MediaRecorder` (WebM oder MP4)

`canvas.captureStream()` liefert einen Video-Track, ein
`MediaStreamAudioDestinationNode` aus der WebAudio-API den Audio-Track; beide in einen
`MediaStream` und in den `MediaRecorder`.

Der entscheidende Haken: **`MediaRecorder` nimmt in Echtzeit auf.** Ein 8-Minuten-Buch
braucht 8 Minuten, der Tab muss sichtbar im Vordergrund bleiben (Hintergrund-Tabs werden
gedrosselt, das Ergebnis ruckelt oder bricht ab).

### Stufe 3 - Videodatei per WebCodecs (empfohlen, siehe nächster Abschnitt)

`VideoEncoder`/`AudioEncoder` kodieren **schneller als Echtzeit**, frameweise und
kontrolliert. Kein Echtzeit-Zwang, kein Vordergrund-Zwang, deutlich bessere Qualität bei
gleicher Dateigröße. Kostet dafür einen Muxer als zusätzliche Bibliothek.

### Die "Regie" ist die eigentliche Arbeit, nicht der Code

Ein Buch wird nicht automatisch ein gutes Video. Als Bildsprache festzulegen wäre:

- **Cover** → Titelkarte mit Titel und Autor, Erzähler kündigt an
- **Seite** → Bild mit langsamem Zoom, Richtung von Seite zu Seite abwechselnd
  (immer dieselbe Richtung wird auf Dauer unangenehm)
- **Untertitel** → Originaltext unten, mitlaufende Hervorhebung
- **Emoji-Sticker** → die im `erstleserText` durch Emojis ersetzten Nomen könnten als kleine
  Sticker aufpoppen, genau in dem Moment, in dem das Wort fällt.
  Geht **nur** mit `marks` aus Abschnitt 2.
- **Quizfrage** → eigene Karte, 4 Sekunden Denkpause, dann Antwort.
  Die Logik dafür existiert schon in `js/tts.js` (`autoReadWithQuiz`, `maybeAskQuiz`).
- **Abspann** → "Ende" plus Hinweis, womit das Buch erstellt wurde

---

## 4. MP4: Rahmenbedingungen

### 4.1 Warum überhaupt MP4 und nicht WebM?

WebM/VP8 ist der Standardausgang von `MediaRecorder` in Chrome und wäre technisch am
einfachsten. Aber: WhatsApp, iOS-Fotomediathek, Fernseher, viele Messenger und
Standard-Videoplayer nehmen WebM entweder gar nicht oder nur widerwillig an. Wenn das Video
das Gerät verlassen soll - und genau darum geht es beim "Ausrollen" - führt praktisch kein
Weg an **MP4 mit H.264 (avc1) und AAC** vorbei. Das ist der kleinste gemeinsame Nenner, den
wirklich alles abspielt.

### 4.2 Weg A - `MediaRecorder` mit MP4-MIME-Type

Die gute Nachricht: **Das geht inzwischen direkt.** Chrome/Edge unterstützen mittlerweile
den MP4-Container im `MediaRecorder` (H.264 + AAC, teilweise auch Opus), Safari kann
`video/mp4` schon seit Version 14.1 (macOS) bzw. 14.5 (iOS). **Firefox kann es nicht**
(Mozillas Standards-Position dazu ist weiterhin offen).

Mindestbedingung im Code - niemals fest verdrahten, immer prüfen:

```js
const MP4_TYPE = 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"';
if (MediaRecorder.isTypeSupported(MP4_TYPE)) { /* MP4 */ }
else { /* auf WebM zurückfallen oder Export gar nicht anbieten */ }
```

- **Aufwand:** gering, ~1 Tag.
- **Bedingung:** Chrome/Edge oder Safari. Firefox-Nutzer bekommen den Knopf nicht zu sehen.
- **Preis:** Echtzeit-Aufnahme, Tab muss vorne bleiben, Qualitätskontrolle eingeschränkt.

### 4.3 Weg B - WebCodecs + MP4-Muxer *(die empfohlene Lösung)*

`VideoEncoder` kodiert einzelne Frames nach H.264, `AudioEncoder` den Ton nach AAC.
WebCodecs **muxt aber nicht** - es liefert nur die kodierten Pakete. Den MP4-Container
schreibt eine kleine JS-Bibliothek (`mp4-muxer` oder `mp4box.js`, je wenige KB, würde nach
Projektkonvention nach `js/vendor/` und lazy geladen wie PDF.js/JSZip).

Browser-Stand: alle Chromium-Browser, Firefox ab 130 (Desktop; **Firefox für Android kann
es nicht**), Safari ab 16.4 für Video - aber `AudioEncoder` erst ab **Safari 26**. Für uns
heißt das: Video-Export auf älterem iOS/macOS-Safari geht nicht oder nur ohne Ton, was
sinnlos wäre. Also auch hier: Fähigkeiten prüfen (`VideoEncoder.isConfigSupported()`), Knopf
sonst ausblenden.

- **Aufwand:** mittel, ~3-5 Tage inkl. Regie-Logik.
- **Vorteil:** schneller als Echtzeit, Tab-Drosselung egal, saubere Bitraten-/Qualitätswahl,
  keine SharedArrayBuffer-Problematik (siehe 4.4), Bibliothek nur wenige KB.
- **Das ist der Weg, den ich nehmen würde.**

### 4.4 Weg C - ffmpeg.wasm *(nicht empfohlen - hier ist die Sackgasse)*

Naheliegend, aber auf GitHub Pages ein echtes Problem, und zwar aus einem Grund, den man
sonst erst nach einem Tag Arbeit merkt:

`ffmpeg.wasm` in der Multithread-Variante braucht `SharedArrayBuffer`. Der ist nur
verfügbar, wenn die Seite **cross-origin isolated** ist, was die HTTP-Header
`Cross-Origin-Opener-Policy: same-origin` und `Cross-Origin-Embedder-Policy: require-corp`
voraussetzt. **GitHub Pages kann keine eigenen HTTP-Header setzen** - das ist ein seit Jahren
offener Wunsch bei GitHub, ohne Termin.

Die Umgehung wäre `coi-serviceworker`: ein Service Worker, der die Header nachträglich
injiziert. Genau hier lauert der Konflikt - **das Projekt hat bereits einen Service Worker**
(`sw.js`, Cache-Strategie "cache first"). Zwei Service Worker auf demselben Scope gehen
nicht; man müsste die Header-Logik in das bestehende `sw.js` einbauen, und die Seite wird
erst nach einem Reload isoliert (der erste Aufruf schlägt fehl). Dazu kommen ~25-30 MB
zusätzlicher Download.

Bliebe die Single-Thread-Variante ohne SharedArrayBuffer - die läuft, ist aber sehr langsam.
Ein reines Umpacken (Remuxen) von WebM nach MP4 hilft übrigens nicht: VP8/VP9 in einem
MP4-Container spielt kaum ein Gerät ab, es müsste also wirklich **umkodiert** werden.

**Fazit: ffmpeg.wasm nur, wenn Weg B aus einem unerwarteten Grund scheitert.**

### 4.5 Was im Projekt selbst geändert werden müsste

Unabhängig vom gewählten Weg - das sind die Punkte, an denen der bestehende Code nicht passt:

| Bereich | Heute | Nötig für MP4 |
|---|---|---|
| **Bildauflösung** | `READING_MAX_WIDTH = 1600` in `js/utils.js`, WebP q=0.8 | Reicht für Hochkant-Seiten bei 1080p. **Zu knapp** für quer liegende Seiten/Doppelseiten (würden hochskaliert) und für Ken-Burns-Zoom (1,3× Zoom auf 1080p braucht ~1400 px im sichtbaren Ausschnitt). Für selbst erzeugte Bücher eine dritte Variante `videoUrl` mit ~2560 px anlegen, statt global alles zu vergrößern - sonst wächst die IndexedDB für alle. |
| **Seitenverhältnis** | Buchseiten sind hochkant | Video ist 16:9 quer. Entscheidung nötig: schwarze/unscharf gefüllte Ränder, oder **9:16 hochkant ausgeben** (passt zu WhatsApp-Status, YouTube Shorts, Handy-Vollbild - für den Zweck vermutlich die bessere Wahl). |
| **Untertitel** | DOM + `innerHTML` (`buildSpeechHighlightHtml`) | Im Video muss Text **auf den Canvas gezeichnet** werden. DOM-nach-Canvas (html2canvas o.ä.) ist langsam und unzuverlässig. Also ein eigener kleiner Canvas-Textrenderer mit Zeilenumbruch und Wort-Hervorhebung. Schriftart muss vor dem Rendern per `document.fonts.ready` geladen sein, sonst wird still die Fallback-Schrift gezeichnet. |
| **Bild-Dekodierung** | Data-URL → `<img>` pro Anzeige | Pro Frame neu dekodieren wäre viel zu langsam. Einmal in eine `ImageBitmap` dekodieren, dann nur noch per `drawImage()` mit Transformation zeichnen. |
| **Arbeitsspeicher** | - | Ein 1080p-Frame als RGBA = ~8 MB. Frames **niemals sammeln**, sondern sofort kodieren und die Backpressure des Encoders beachten (`encoder.encodeQueueSize`). |
| **Datei schreiben** | Blob + `a.download` (wie in `backup.js`) | Ein 8-Minuten-Video bei 2-4 Mbit/s sind **120-240 MB**. Das als Blob im Speicher zu halten ist auf dem Handy riskant. Besser: chunkweise ins OPFS (Origin Private File System, wird von allen modernen Browsern unterstützt) schreiben und am Ende als Datei übergeben. Auf Chrome-Desktop zusätzlich `showSaveFilePicker()` mit Stream. |
| **Neue Module** | - | `js/actions/audioAssets.js` (TTS holen/cachen), `js/actions/videoExport.js`, `js/render/cinema.js`, `js/vendor/mp4-muxer.js`. Alle in `js/main.js` importieren **und** in `sw.js` zur `APP_SHELL` hinzufügen. |
| **`sw.js`** | `CACHE_NAME = 'lesezauber-shell-v13'` | Bei jeder dieser Änderungen hochzählen, sonst bekommen wiederkehrende Nutzer die alte Version. |
| **Tailwind** | eigener Build | Neue Klassen in den neuen Ansichten erfordern den Build-Schritt aus `CLAUDE.md`, sonst fehlen die Styles lautlos. |
| **Herkunft des Buchs** | nicht erfasst | `book.origin: 'scan' \| 'authored'` einführen - siehe Abschnitt 7. |

### 4.6 Kurzfassung der Entscheidung

| | Weg A: MediaRecorder-MP4 | Weg B: WebCodecs + Muxer | Weg C: ffmpeg.wasm |
|---|---|---|---|
| Aufwand | gering | mittel | hoch |
| Geschwindigkeit | Echtzeit | schneller als Echtzeit | langsam (ohne SAB) |
| Zusätzlicher Download | 0 | wenige KB | 25-30 MB |
| GitHub-Pages-tauglich | ja | ja | nur mit Service-Worker-Trick |
| Firefox | nein | ab 130 (Desktop) | ja |
| Safari | ab 14.1 | Ton erst ab Safari 26 | ja |
| Empfehlung | Schnellschuss/Prototyp | **Zielarchitektur** | Notnagel |

> **Nachtrag (Sept. 2026, entschieden):** Der Export soll **das ganze Buch** als einen Film
> liefern, Einzelseiten zusätzlich. Damit ist Weg A praktisch erledigt - seine
> Echtzeit-Aufnahme hieße 8-10 Minuten mit sichtbarem Tab im Vordergrund. **Weg B ist
> gesetzt.** Der Renderer bekommt von Anfang an einen Seitenbereich; eine Einzelseite ist
> dann der Bereich `[i, i]` und braucht keinen zweiten Codeweg.
>
> Praktische Folge für die Bedienung: Ein Buch-Film liegt bei 120-240 MB und lässt sich
> nicht mehr verschicken. Der Einzelseiten-Export ist damit nicht bloß ein Testfall,
> sondern die Variante **zum Weitergeben** - beide bleiben dauerhaft sinnvoll.
>
> Gut dazu passt, dass die App seit v0.12.0 Metadaten ansagt: Ein Buch-Film kann mit
> "Der Titel des Buchs ist ... geschrieben von ..." beginnen und neue Kapitel ankündigen -
> genau das, was ein durchgehender Film braucht und eine Einzelseite nicht hat.
>
> **Empfehlung für den Einstieg:** den Renderer sofort mit dem Seitenbereich bauen, aber
> als Erstes an einer einzelnen Seite testen - das ist derselbe Code mit Bereich `[i, i]`
> und in Sekunden statt Minuten durchgelaufen. **Nicht** zuerst einen Einzelseiten-Export
> bauen und das Buch später nachrüsten, sonst entsteht doch wieder ein zweiter Codeweg.

### Der konkrete Bauplan, mit den heute schon vorhandenen Bausteinen

Direkt nutzbar (siehe Nachtrag in Abschnitt 2 - `renderPageSegments()` existiert bereits):

```js
await app.ttsNeural.renderPageSegments(bookId, pageIdx, { includeQuiz: false })
// → { imgUrl, totalDurationSec, segments: [{ kind, text, blob, durationSec, words }] }
```

Bild, Ton, Länge und Wortzeiten liegen damit vollständig vor - ohne erneute API-Kosten,
wenn die Seite schon einmal vorgelesen wurde. Für einen ganzen Buch-Film: pro Seite im
Bereich einmal aufrufen und aneinanderhängen.

**Was für den Export selbst noch fehlt (unabhängig von Weg A/B, nur die Mechanik):**
1. Ein `<canvas>` in Zielauflösung, darauf das Seitenbild einpassen.
2. Untertitel: aus `segments[].words` das jeweils aktuelle Wort hervorheben - gleiche
   Logik wie im Reader (`buildSpeechHighlightHtml()`), aber auf Canvas gezeichnet statt
   ins DOM geschrieben (siehe Glossar-Eintrag "Canvas" unten, warum das ein anderer Weg ist).
3. Ton: die Segment-Blobs über die Web Audio API aneinanderhängen (`decodeAudioData` →
   `AudioBufferSourceNode` → `createMediaStreamDestination` bei Weg A, bzw. direkt an
   `AudioEncoder` bei Weg B).
4. Bild- und Tonspur zusammenführen und aufnehmen/kodieren (siehe Weg A vs. B oben).
5. Ergebnis als Datei zum Download anbieten (wie `actions/backup.js` es beim
   Bibliotheks-Export schon macht) - bei Weg B über OPFS, siehe 4.5.

Das ist bewusst **Weg-unabhängig** formuliert: Schritte 1-3 sind für Weg A (Prototyp,
Einzelseite) und Weg B (Zielarchitektur, ganzes Buch) identisch, nur Schritt 4 unterscheidet
sich (`MediaRecorder` vs. `VideoEncoder`/`AudioEncoder` + Muxer).

### 4.7 Stand von Weg B: was gebaut ist und was dabei entschieden wurde

**Gebaut (v0.15.0-beta Teil 1, v0.16.0-beta Teil 2), vier Module plus Muxer:**

| Datei | Rolle |
|---|---|
| `js/render/cinema.js` (`app.cinema`) | Der Renderer. Kann genau eines: `drawFrame(ctx, timeline, timeSec)`. Dazu Formate, Bild-Dekodierung, Schrift-Bereitschaft, Zeilenumbruch, Ken-Burns, Kreuzblende |
| `js/actions/videoTimeline.js` (`app.cinema.buildTimeline`) | Die "Regie": welche Szene läuft wann, mit welchem Text, welchen Wort-Zeitpunkten und welcher Tonspur - über einen **Seitenbereich**, inkl. Seiten-Rollen und Pausen |
| `js/actions/videoPreview.js` (`app.actions.openVideoPreview`) | Prüfstand: spielt den Zeitplan in Echtzeit auf einem sichtbaren Canvas ab, mit Zeitbalken und Formatwechsel. Kostet nichts |
| `js/actions/videoExport.js` (`app.actions.exportVideo`) | Der Export: Ton holen, Frames kodieren, muxen, Datei ausliefern - mit Fortschritt, Abbruch und Größenschätzung vorab |
| `js/vendor/mp4muxer/mp4-muxer.mjs` | Der Muxer (mp4-muxer 5.2.2, MIT, 69 KB). Wie PDF.js/JSZip vendored und **lazy** geladen, nicht in der `APP_SHELL` - NIE bearbeiten |

**Entscheidungen, die dabei gefallen sind** (damit sie nicht neu diskutiert werden):

1. **Der Renderer verwaltet die Zeit NICHT selbst.** Er bekommt t und zeichnet.
   Nur so können Vorschau (Echtzeit, `requestAnimationFrame`) und Encoder
   (schneller als Echtzeit, frameweise) exakt dasselbe Bild erzeugen.
2. **Seitenverhältnis: hochkant 9:16 ist Standard** (1080x1920), quer 16:9 und
   quadratisch sind wählbar. Die offene Frage aus Abschnitt 4.5 ist damit
   beantwortet - und zwar wie dort vermutet.
3. **Ränder werden gefüllt, nicht geschwärzt:** dasselbe Seitenbild
   formatfüllend, unscharf und abgedunkelt im Hintergrund. Einmal pro Szene
   gerendert, nicht pro Frame - ein Weichzeichner pro Frame wäre die teuerste
   Operation im ganzen Renderer.
4. **Untertitel laufen in Blöcken** von 3-4 Zeilen (je Format) wie echte
   Untertitel, statt den ganzen Seitentext zu zeigen. Sichtbar ist immer der
   Block mit dem gerade gesprochenen Wort. Der Balken hat eine **feste** Höhe,
   sonst springt das Bild bei jedem Blockwechsel.
5. **Text steht unter dem Bild, nicht darauf.** Über einer hellen Illustration
   wäre Untertiteltext schlecht lesbar - und für ein Kind, das gerade lesen
   lernt, ist Lesbarkeit wichtiger als Bildfläche.
6. **Die Wort-Zeitpunkte kommen NICHT aus einer zweiten Rechnung.** Der
   Zeitplan nutzt `app.ttsNeural._wordStartTimes()`, also genau die
   Berechnung, die auch die Hervorhebung im Reader benutzt.
7. **Dekodierte Seitenbilder gehören dem Renderer-Zwischenspeicher, nicht der
   Szene** (höchstens 3 gleichzeitig). Eine Szene, die ihr `ImageBitmap`
   selbst festhält, zeichnet nach der Verdrängung mit einem geschlossenen
   Bild - und das bricht den Frame mit einem `InvalidStateError` ab.
8. **Titel- und Abspannkarte nur beim Buch-Film**, nicht bei der Einzelseite:
   die Einzelseite ist die Variante zum Weiterschicken und soll sofort
   losgehen.
9. **Die Vorschau synthetisiert nichts.** Sie schätzt die Längen aus der
   Textlänge (~14 Zeichen/Sekunde) und schreibt sichtbar hin, dass die Zeiten
   geschätzt sind. Eine Vorschau, die beim Öffnen Kontingent verbraucht, wäre
   beim Entwickeln unbenutzbar - und für die Familie eine Kostenfalle.

**Entscheidungen aus Teil 2 (Ton, Kodieren, Datei):**

10. **Der Zeitplan bestimmt Bild UND Ton.** Der Export legt die Tonspur jeder
    Szene exakt auf `scene.startSec` und füllt Pausen mit Stille. Dadurch ist
    Bild/Ton-Gleichlauf keine Frage von sorgfältig gepflegten Pausen-Konstanten,
    sondern strukturell gegeben - im Test sind Video- und Tonspur der fertigen
    Datei auf die Millisekunde gleich lang.
11. **Codec-Leiter statt festem Codec** (wie in 4.2 gefordert): H.264+AAC im
    MP4 (überall abspielbar) → H.264+Opus → VP9+Opus → AV1+Opus. Geprüft wird
    mit `isConfigSupported()` in der Zielauflösung. Reicht es nur für einen
    Rückfall, sagt die App das vor dem Start und noch einmal danach - eine
    Datei, die nur auf dem eigenen Rechner läuft, soll niemanden überraschen.
12. **Ausgabe über OPFS**, nicht als Blob im Arbeitsspeicher: die Datei wächst
    beim Kodieren auf die Platte (siehe Abschnitt 7 zum Speicher). Ohne OPFS
    fällt der Export auf einen Speicher-Puffer zurück. Reste eines
    abgebrochenen Durchlaufs werden beim nächsten Start weggeräumt.
13. **`fastStart: false`** (Verwaltungsdaten ans Dateiende). Die Variante mit
    reserviertem Platz am Dateianfang bräuchte eine Vorab-Schätzung der
    Päckchen-Anzahl und würde bei einer zu knappen Schätzung den ganzen Export
    verlieren. Lokale Player kommen mit Daten am Ende klar; falls sich beim
    Verschicken doch Probleme zeigen, ist das die erste Stelle zum Umstellen.
14. **Seiten-Rollen wirken als Regie** (nur beim Buch-Film, nicht bei der
    Einzelseite): die per `titlePageId` markierte Seite wird zur Titelkarte und
    läuft nicht zusätzlich als normale Seite, die per `backCoverPageId` markierte
    wandert ans Ende vor den Abspann. Wer die Rückseite zuerst fotografiert hat,
    bekäme sonst einen Film, der mit dem Klappentext anfängt.
15. **`book.origin` ist jetzt da** (`'scan' | 'authored'`, gelesen über
    `app.utils.resolveBookOrigin()`): SchreibZauber-Bücher sind `authored`,
    alles Abfotografierte/Importierte ist `scan`, und **alles ohne Feld gilt als
    `scan`** - im Zweifel kein Export. Nur die Videodatei ist gesperrt; Vorschau
    und Kino-Modus bleiben für jedes Buch offen (Vorlesen im eigenen Wohnzimmer).
16. **Ein Knopf, ein Bereich:** Der Export sitzt in der Vorschau und nimmt
    genau den Bereich und das Format, die dort zu sehen sind. Damit gibt es
    "diese Seite als Video" (Reader) und "ganzes Buch als Film" (Buch-Ansicht)
    ohne zweiten Codeweg und ohne zweite Format-Auswahl.

**Noch offen:**

- **Ton in der Vorschau.** Sie bleibt stumm (und sagt das). Der Zeitplan kann
  echten Ton, aber die Vorschau würde dafür Kontingent verbrauchen; wer den Ton
  hören will, exportiert. Wenn es doch kommen soll: Wiedergabe an
  `audio.currentTime` hängen statt an die eigene Uhr.
- **Metadaten-Ansage für die Titelkarte** (Titel/Autor, siehe
  `app.tts._buildMetadataAnnouncements()`): `renderPageSegments()` kennt sie
  nicht, die Titelkarte läuft deshalb stumm mit fester Länge.
- **`showSaveFilePicker()`** auf Chrome-Desktop (spart das Kopieren aus dem
  OPFS in den Download-Ordner). Bewusst weggelassen: der Aufruf braucht eine
  frische Nutzer-Geste, die nach der Rückfrage und dem Ton-Sammeln nicht mehr
  sicher vorhanden ist.
- **Höhere Bildauflösung** (`videoUrl`, ~2560 px) wie in 4.5 beschrieben; mit
  1600 px Vorlage und 1,12-fachem Zoom sieht 1080p bisher vertretbar aus.
- **Emoji-Sticker und Quiz-Denkpause** aus der Regie-Liste in Abschnitt 3 -
  die Rätselfrage ist als Häppchen zuschaltbar, hat aber noch keine eigene
  Karte mit Denkpause.

---

## 5. Die Pipeline-Idee

Der wichtigste konzeptionelle Punkt aus dem ganzen Dokument:

**Heute ist LeseZauber ein Konsument** - Foto rein, Analyse, Varianten raus.
**Eine Ausspielung in mehreren Formaten ist eine Produktion** - eine Quelle, viele Ausgaben.

Die gute Nachricht: **Der Buch-Datensatz IST bereits dieses Master-Format.** Der
JSON-Export aus `downloadBook()` ist fast genau das, was man braucht. Jedes Format ist dann
nur noch ein *Renderer* über demselben Master:

| Format | Renderer | Status |
|---|---|---|
| Buch (Lesen / Druck / PDF) | Reader + `printBook()` | existiert |
| Hörbuch | `app.actions.exportAudiobook()` (ohne Kapitelmarken - WAV kennt keine) | ✅ existiert |
| Video | Canvas-Renderer (Abschnitt 3/4) | neu, mittel |
| Comic | Panel-Layout + Bildgenerierung | neu, groß |

**Comic ist der einzige, der wirklich neu erzeugt statt nur neu rendert** - und er hat ein
eigenes hartes Problem: **Figurenkonsistenz.** Wenn der Fuchs auf Seite 3 anders aussieht als
auf Seite 12, ist es kein Buch, sondern eine Sammlung von Bildern. Die Lösung dafür gehört
ins Datenmodell, nicht in den Prompt:

```js
book.style = {
  characterSheet,   // Referenzbild der Figuren, einmal erzeugt und festgenagelt
  stylePrompt       // z.B. "Aquarell, warme Farben, dicke Konturen"
}
```

…und das Referenzbild wandert bei **jeder** Panel-Generierung als Bildinput mit in den
Aufruf. Das ist gleichzeitig die Vorarbeit für den in `docs/KONZEPT-Comic.md` ausführlich
behandelten Punkt "KI-generierte Illustrationen für textlastige EPUB-Kapitel" - dort auch
die konkrete Kategorien-Aufteilung, ein bereits gefundener Prompt-Fehler und die
Panel-Layout-Vorlagen-Bibliothek, die hier nicht dupliziert werden.

**Das Persona-System passt hier erstaunlich gut**: Aus Erzähl-Personas
(`js/config.js`) werden **Sprecherstimmen**. Dasselbe Buch als Video mit "Lustiger Papa" oder
mit "Gute-Nacht-Fee", ohne den Master anzufassen - ein Master, N Fassungen.

---

## 6. Selbst geschriebene Bücher

Wenn die Bücher selbst (mit KI) geschrieben werden, dreht sich die Pipeline um:
heute `Bild → Text`, dann `Text → Bild`.

**Das Datenmodell trägt das bereits.** Eine Seite eines geschriebenen Buchs ist einfach:

- `pdfSourceText` gesetzt (= garantiert korrekter Text, kein OCR nötig - das Feld existiert
  schon für PDF-/EPUB-Import)
- `imgUrl` aus einer Bildgenerierung statt aus der Kamera
- `variants` wie gehabt

Änderungsbedarf im Code: `analyzePage()` in `js/actions/scanner.js` setzt heute ein
vorhandenes Bild voraus. Es bräuchte einen zweiten Einstiegspunkt ("Seite aus Text erzeugen"),
aber **keinen Umbau des Modells**. Das ist deutlich weniger, als es klingt.

---

## 7. Grenzen, Risiken, Rechtliches

**Speicher.** Audio ist unkritisch (Abschnitt 2). Videodateien mit 120-240 MB dürfen
**niemals** in IndexedDB landen, sondern müssen direkt in den Download-Ordner bzw. ins OPFS
gestreamt werden. Auf iOS räumt Safari lokalen Speicher bei längerer Nichtnutzung ohnehin
weg - ein weiterer Grund, exportierte Videos als Wegwerf-Artefakt zu behandeln und das Buch
als das dauerhafte Gut.

**Veröffentlichen geht nicht in der App.** YouTube-Upload, Spotify, Print-on-Demand, ISBN -
das braucht Konten und einen Server. Die App kann den Master und die Dateien produzieren,
danach ist Schluss. Das ist die richtige Grenze für eine serverlose Architektur, kein Mangel.

**Urheberrecht - und das ist ein echter Design-Hinweis, kein Beiwerk.**
Ein Video-Export ist nur bei **selbst geschriebenen** Büchern unproblematisch. Bei den
abfotografierten fremden Kinderbüchern wäre ein exportiertes, weitergegebenes Video eine
Vervielfältigung und Verbreitung eines fremden Werks. Deshalb:

```js
book.origin: 'scan' | 'authored'
```

…und Video-/Comic-Export **nur bei `authored`** überhaupt anbieten. Kostet ein paar Zeilen
und verhindert, dass jemand in der Familie versehentlich ein fremdes Bilderbuch als Video
weitergibt. Der Kino-Modus (Stufe 1) bleibt davon unberührt - der ist reines Vorlesen im
eigenen Wohnzimmer und damit unkritisch.

---

## 8. Empfohlene Reihenfolge

1. ~~**Audio-Asset-Layer**~~ **✅ erledigt (v0.10.0-v0.10.2, KI-Stimmen)** - anders
   gebaut als hier ursprünglich geplant (`ttsCache` statt eigener `media`-Store), aber
   dieselbe Wirkung: Sprach-API angebunden, `DB_VERSION` 3, Wort-Zeitstempel vorhanden.
   Details: Nachtrag in Abschnitt 2.
2. ~~**Kino-Modus (Stufe 1)**~~ **✅ Textteil erledigt (v0.12.0)** - Vollbild-Modus zeigt
   Text samt Hervorhebung. Offen bleiben nur noch Ken-Burns-Effekt und Kreuzblende
   (siehe Nachtrag in Abschnitt 3).
3. ~~**Hörbuch-Export**~~ **✅ erledigt** - fast geschenkt, die Bausteine aus Schritt 1
   standen bereits bereit.
4. ~~**Video-Export via WebCodecs (Weg B)**~~ **✅ erledigt (v0.15.0/v0.16.0-beta)** -
   opt-in, mit Fähigkeitsprüfung (Codec-Leiter), nur für `origin: 'authored'`, Ausgabe
   über OPFS. Renderer, Zeitplan, Vorschau und Export: Abschnitt 4.7.
5. **Schreiben + Comic** - eigenes Projekt, eigene Abstimmung, deutlich größer als 1-4
   zusammen. Details: `KONZEPT-SchreibZauber.md`, `KONZEPT-Comic.md`.

**Aktueller Stand (Sept. 2026):** Schritte 1-3 sind erledigt (Hörbuch-Export:
`js/actions/audiobookExport.js`, ganzes Buch als eine WAV-Datei, Bild-
beschreibung/Quiz abwählbar, Seiten mit `excluded` werden übersprungen).
Die Segmente werden über `AudioContext`/`OfflineAudioContext` neu gerendert statt
per Blob-Concat zusammengefügt - Begründung dafür direkt im Code (unterschiedliche
Container/Abtastraten je Anbieter). **Stand 18.09.2026:** Auch Schritt 4 ist erledigt - der Video-Export
liefert eine MP4-Datei für eine Einzelseite wie fürs ganze Buch
(`js/actions/videoExport.js`), und er baut wie vorhergesagt vollständig auf den
KI-Stimmen-Bausteinen auf, ohne dass dort etwas geändert werden musste. Damit ist
von 1-4 alles gebaut; offen bleibt nur noch Schritt **5 (Schreiben + Comic)** plus
die Restpunkte am Ende von Abschnitt 4.7.

---

## Quellen zum Stand der Browser-Unterstützung

Stand September 2026 - vor einer Umsetzung noch einmal prüfen, das bewegt sich schnell:

- [MDN: `MediaRecorder.isTypeSupported()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)
- [Chrome Platform Status: MP4 container support for MediaRecorder](https://chromestatus.com/feature/5163469011943424)
- [Mozilla standards-positions #996 - MP4/avc1 in MediaRecorder](https://github.com/mozilla/standards-positions/issues/996)
- [MDN: WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [mp4-muxer](https://github.com/boxcast/mp4-muxer)
- [GitHub Community Discussion #13309 - COOP/COEP-Header auf GitHub Pages](https://github.com/orgs/community/discussions/13309)
- [COOP/COEP-Header auf statischem Hosting setzen (Workaround)](https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/)

---

## Anhang: kleines Glossar

Im Stil des README-Abschnitts "Für Einsteiger" - die Begriffe, die oben ohne Erklärung
vorkommen:

**DOM** (Document Object Model) - die lebende Liste aller HTML-Elemente einer Seite, so wie
der Browser sie gerade im Speicher hält. Wenn der Code `document.getElementById('readerImg')`
aufruft und daran etwas ändert, arbeitet er am DOM, und der Browser zeichnet die Änderung
selbst neu. "DOM-basiert" heißt also: **Wir beschreiben nur, was da stehen soll, und der
Browser kümmert sich um Schriftart, Zeilenumbruch und Darstellung.** Genau das macht heute die
Wort-Hervorhebung beim Vorlesen: `buildSpeechHighlightHtml()` erzeugt für jedes Wort ein
`<span>`, und das aktuell gesprochene bekommt eine Hintergrundfarbe.

**Canvas** - eine leere Zeichenfläche aus reinen Bildpunkten. Hier gibt es keine Elemente und
keine automatische Textdarstellung; man malt Pixel. Der Vergleich: DOM ist wie Schreiben in
Word (das Programm bricht Zeilen um und markiert Text für einen), Canvas ist wie Buchstaben
mit dem Pinsel auf ein Bild malen - jeder Zeilenumbruch muss selbst berechnet werden.
**Warum das für Video zählt:** Ein Videobild besteht aus Pixeln. Man kann kein HTML in ein
Video stecken. Die Untertitel müssen also gemalt statt beschrieben werden - deshalb lässt
sich `buildSpeechHighlightHtml()` dafür nicht wiederverwenden, obwohl es dieselbe Aufgabe
löst. Das ist kein Fehler im bestehenden Code, sondern ein anderer Zeichen-Weg.

**Codec / Container / Muxer** - drei Dinge, die oft verwechselt werden. Der **Codec**
(z.B. H.264 für Bild, AAC für Ton) presst die Daten klein. Der **Container** (z.B. MP4 oder
WebM) ist die Verpackung, die Bild- und Tonspur zusammen mit Zeitinformationen in einer Datei
bündelt - vergleichbar mit einem ZIP-Archiv, nur für Video. **Muxen** ist das Einpacken.
`.mp4` sagt also nur etwas über die Verpackung, nicht über den Inhalt - deshalb reicht es
nicht, eine Datei umzubenennen.

**Blob** - ein Klumpen Binärdaten im Arbeitsspeicher des Browsers (z.B. eine fertige Datei
vor dem Download). Problem bei Video: ein 200-MB-Blob belegt tatsächlich 200 MB RAM.

**OPFS** (Origin Private File System) - ein privater Dateibereich, den jede Web-App auf dem
Gerät bekommt. Unsichtbar im normalen Dateimanager, aber man kann dort stückweise
hineinschreiben, statt alles im Arbeitsspeicher zu halten.

**Echtzeit vs. schneller als Echtzeit** - `MediaRecorder` nimmt auf wie ein Camcorder:
8 Minuten Video = 8 Minuten warten, Fenster muss sichtbar bleiben. WebCodecs rechnet
stattdessen Bild für Bild so schnell das Gerät kann - unabhängig davon, wie lang das Video
am Ende ist.

**HTTP-Header / COOP / COEP** - unsichtbare Zusatzinformationen, die ein Server zu jeder
Datei mitschickt ("das ist ein Bild", "das darfst du zwischenspeichern"). Manche
Browser-Funktionen schalten sich nur frei, wenn bestimmte Header gesetzt sind. GitHub Pages
liefert nur Dateien aus und lässt einen die Header nicht selbst bestimmen - deshalb die
Sackgasse in Abschnitt 4.4.

**Branch / Pull Request** - ein **Branch** ist eine parallele Fassung des Projekts, in der man
arbeiten kann, ohne die Hauptfassung (`main`) anzufassen. Ein **Pull Request** ist auf GitHub
die Bitte "bitte diese Fassung in `main` übernehmen", mit Übersicht der Änderungen.
Solange etwas nur auf einem Branch liegt, ist es **nicht** in der Hauptfassung und landet
auch nicht in dem Ordner, den man normalerweise herunterlädt.
