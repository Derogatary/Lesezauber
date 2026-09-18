# CLAUDE.md

Diese Datei gibt Claude Code Kontext für die Arbeit an diesem Projekt. Sie liegt im Repository-Root und wird automatisch gelesen.

## Projektüberblick

**LeseZauber Pro** ist eine Web-App (PWA), mit der man Kinderbuch-Seiten fotografiert/importiert (Foto, Galerie, PDF, EPUB) und sich per KI (Gemini, optional Mistral-Fallback) automatisch vorlesen, vereinfachen ("Erstleser"-Modus mit Emojis) und erklären lässt (Bildbeschreibung, Quizfragen, Vokabeltrainer).

Seit v0.10.0-beta gibt es zusätzlich den **Heft-Modus**: ein Buch kann statt einer Geschichte auch ein **Übungsheft** sein (Arbeitsblätter zur Schulvorbereitung). Dann wertet die KI die Seite als Aufgabe aus (Aufgabenstellung, kindgerechte Erklärung, Hilfeschritte, Lösung) statt als Erzähltext. Seit v0.11.0-beta kann das Kind sein bearbeitetes Blatt zusätzlich abfotografieren und bekommt eine vorgelesene Rückmeldung (`js/actions/checkWork.js`). Hintergrund und Planung dazu, inklusive offenem Generator: `docs/KONZEPT-Uebungshefte.md`.

**Zielgruppe:** Eine Familie nutzt die App privat für ihre Kinder. Der Betreiber ist technischer Laie ("kann ein bisschen HTML"), arbeitet aber regelmäßig mit Claude (Chat) und jetzt auch Claude Code an dem Projekt weiter.

**Architektur-Grundprinzip: komplett client-seitig, kein eigener Server.**
Läuft rein im Browser, gehostet auf GitHub Pages (statisches Hosting). Alle Daten (Bücher, Fotos, Profile, Vokabeln) liegen in IndexedDB auf dem jeweiligen Gerät. API-Keys (Gemini/Mistral) werden vom Nutzer selbst in den Einstellungen eingetragen und liegen im Klartext im Browser - das ist eine bekannte, akzeptierte Grenze (siehe "Bekannte Grenzen" im README), keine zu fixende Sicherheitslücke.

## Tech-Stack

- Reines HTML/CSS/JavaScript, **ES-Module** (`<script type="module">`)
- **Tailwind CSS v4** - eigener Build, KEIN CDN mehr (siehe "Kritischer Build-Schritt" unten)
- **PDF.js** (vendored, lazy-geladen) für PDF-Import
- **JSZip** (vendored, lazy-geladen als klassisches Script, kein ESM-Build verfügbar) für EPUB-Import
- **Google Gemini API** (aktuell `gemini-3.6-flash`, siehe `js/api.js`) für Bildanalyse/Text
- **Mistral API** als optionaler Fallback bei Gemini-Fehlern
- **Neuronale TTS-Anbieter** (optional, opt-in): Gemini TTS, Google Cloud Chirp 3 HD, ElevenLabs, OpenAI, Speechify - siehe `js/ttsProviders.js`
- Service Worker für PWA/Offline-Fähigkeit der App-Hülle
- Kein Build-Tool für JS nötig (reine ES-Module, kein Bundler) - NUR Tailwind braucht einen Build-Schritt

## ⚠️ Kritischer Build-Schritt: Tailwind

**Nach JEDER Änderung an Tailwind-Klassen in `index.html` oder irgendeiner `.js`-Datei muss neu gebaut werden:**

```bash
npx @tailwindcss/cli -i ./css/tailwind-input.css -o ./css/tailwind.css --minify
```

Ohne diesen Schritt fehlen neue Klassen einfach lautlos im Live-Betrieb (keine Fehlermeldung, das Element sieht nur ungestylt aus). `css/tailwind-input.css` enthält die Marken-Farben-Erweiterung (`@theme`-Block), `css/tailwind.css` ist die ausgelieferte, gebaute Datei - **niemals `tailwind.css` von Hand bearbeiten**, sie wird beim nächsten Build überschrieben.

`node_modules/`, `package.json`, `package-lock.json` sind nur fürs lokale Bauen nötig und werden NICHT deployed (liegen in `.gitignore` bzw. wurden bisher manuell aus den Uploads rausgehalten).

## Architektur: das zentrale `app`-Objekt

Der gesamte Code hängt sich an ein einziges gemeinsames Objekt `app`, definiert in `js/core.js`:

```js
export const app = {
    state: {}, settings: {}, library: {}, vocabulary: {}, personas: [],
    dbOps: {}, nav: {}, api: {}, tts: {}, ui: {}, actions: {},
    render: {}, readerUI: {}, settingsConfig: {}, utils: {}
};
```

Jede andere Datei importiert dieses eine Objekt und hängt ihre eigenen Funktionen an einen der Namespaces:

```js
import { app } from '../core.js';
Object.assign(app.actions, {
    meineNeueAktion() { ... }
});
```

**Modul-Reihenfolge ist wichtig:** `js/main.js` importiert alle Module in einer bestimmten Reihenfolge (state.js vor allem, was `app.settings`/`app.state` liest). Ein neues Modul MUSS dort ergänzt werden, sonst lädt es nie:

```js
import './actions/meineNeueDatei.js';
```

**Neue Funktion hinzufügen = neue Datei, nicht bestehende aufblähen:**
- `js/actions/<name>.js` - Nutzer-ausgelöste Aktionen (Button-Klicks etc.)
- `js/render/<name>.js` - Baut/aktualisiert DOM-Inhalt für eine Ansicht
- Beides zusammen in `main.js` importieren

## Wichtige Dateien und ihre Rolle

| Datei | Zweck |
|---|---|
| `js/core.js` | Das `app`-Objekt selbst - Namespace-Definitionen |
| `js/state.js` | `app.state` (Laufzeit) + `app.settings` (persistiert, localStorage) - **Reihenfolge: settings vor state**, da state teils von settings liest |
| `js/db.js` | IndexedDB-Speicher-Engine (`app.library`, `app.vocabulary`, `ttsCache`, `projects`). **Version 4** - beim Hinzufügen eines neuen Object Stores `DB_VERSION` erhöhen und `onupgradeneeded` erweitern |
| `js/nav.js` | Router zwischen den `<main id="view...">`-Ansichten |
| `js/api.js` | Gemini/Mistral-Aufrufe, der komplette Analyse-Prompt lebt hier |
| `js/tts.js` | Sprachausgabe: Weiche zwischen Gerätestimme und KI-Stimme, Auto-Vorlesen, Wort-Hervorhebung (SpeechSynthesis `boundary`-Event), kombinierter Rätsel-Modus |
| `js/ttsProviders.js` | KI-Stimmen-Anbieter als Liste (`app.ttsProviders.list`) - neue Stimme/neuer Anbieter = neuer Eintrag, UI baut sich daraus automatisch auf |
| `js/ttsNeural.js` | Wiedergabe der KI-Stimmen: IndexedDB-Zwischenspeicher, eigene Wort-Hervorhebung per `requestAnimationFrame`, Vorbereitung der nächsten Seite, Rückfall auf die Gerätestimme |
| `js/profiles.js` | Lokale Profile (kein Server/Login), inkl. `__all__`-Sonderfilter |
| `js/backgroundPregen.js` | Opt-in Hintergrund-Vorbereitung fehlender Persona-Varianten/Buch-Quiz |
| `js/keyboard.js`, `js/gestures.js` | Desktop-Tastatur bzw. Touch-Wisch-Navigation im Reader |
| `js/actions/scanner.js` | Kamera, Foto-Aufnahme, Galerie-Import, **die zentrale `analyzePage()`-Funktion** |
| `js/actions/pdfImport.js`, `epubImport.js` | Datei-Import, beide nutzen lazy-geladene Vendor-Libs |
| `js/actions/workbook.js` | Heft-Modus: Buchart umschalten (inkl. Neu-Auslesen), Lösung aufdecken |
| `js/render/workbook.js` | Hilfe-/Lösungs-Karte im Reader, Art-Umschalter in Bibliothek/Buchansicht |
| `js/actions/progress.js` | `app.progress`: Erledigt-Häkchen pro Profil, Sticker, Medaillen |
| `js/actions/checkWork.js` | Kontrolle bearbeiteter Blätter (Foto → KI-Rückmeldung), nur im Heft-Modus |
| `js/render/checkWork.js` | Ergebniskarte der Kontrolle (Lob, Rückmeldung, Tipps) |
| `js/actions/workbookGenerator.js` | Heft-Generator: Formular auslesen, `app.api.generateWorksheets()` aufrufen, Blätter auf Canvas zeichnen, Heft anlegen |
| `js/render/workbookGenerator.js` | Heft-Generator: Auswahl-Ansicht (Formular bzw. Blätter-Liste zum Abwählen) |
| `js/render/progress.js` | Fortschrittsbalken, Erledigt-Knopf, Belohnungs-Banner |
| `js/render/cinema.js` | Video-Export Weg B, Teil 1: der Canvas-Renderer (`app.cinema`). Zeichnet EINEN Frame zu einem Zeitpunkt t - Seitenbild mit Ken-Burns plus Untertitel-Balken mit mitlaufender Wort-Hervorhebung. Verwaltet absichtlich keine Zeit und spielt nichts ab |
| `js/actions/videoTimeline.js` | Der Zeitplan/die "Regie" dazu (`app.cinema.buildTimeline`): welche Szene über welchem **Seitenbereich** wann läuft. Nimmt echte Sprach-Segmente aus `renderPageSegments()` entgegen, schätzt die Längen sonst aus der Textlänge |
| `js/actions/videoPreview.js` | Film-Vorschau ("🎬 Film"): spielt den Zeitplan in Echtzeit auf einem sichtbaren Canvas ab. Bewusst stumm und ohne jede Synthese - kostet also nichts |
| `js/actions/videoExport.js` | Video-Export Weg B, Teil 2: Ton aus `renderPageSegments()`, Frames per `VideoEncoder`, Ton per `AudioEncoder`, Datei per `mp4-muxer` über OPFS. Codec-Leiter statt festem Codec, Fortschritt + Abbruch, Größenschätzung vorab. **Nur bei `origin: 'authored'`** |
| `js/studio/studioCore.js` | SchreibZauber: `app.studio`-Projekt-CRUD, Stufen-Logik (Idee/Bauplan/Geschichte), Platzhalter-Aufruf pro Doppelseite |
| `js/studio/studioPrompts.js` | SchreibZauber: alle Prompt-Bausteine inkl. `guardrailsBlock()` (Veröffentlichungs-Leitplanken, siehe Entscheidung 6) |
| `js/studio/studioApi.js` | SchreibZauber: eigener Gemini/Mistral-Textaufruf fürs Manuskript (gleiche Keys wie `js/api.js`, aber getrennte Funktionen) |
| `js/studio/studioExport.js` | SchreibZauber: Projekt → normales Buch in `app.library` ("Ins Regal stellen") - fügt dabei Titel-/Rück-/Autorenseite aus `js/studio/studioMetaPages.js` ein |
| `js/studio/studioMetaPages.js` | SchreibZauber: baut Titelseite/Klappentext/Autorenseite als Canvas-Textseiten (mit Platzhaltertext für leer gelassene Felder) - `app.studio.buildMetaPages()`, wird ausschließlich von `studioExport.js` aufgerufen |
| `js/studio/imageFormats.js`, `placeholder.js`, `imageSource.js` | SchreibZauber: Bildformat-Katalog, Platzhalter-Erzeugung, Bildquellen-Adapter (`{full, thumb, meta}`) - Details `docs/KONZEPT-Bildquellen.md` |
| `js/studio/studioLayout.js`, `render/studioLayout.js` | SchreibZauber: Textposition/Schriftgröße/Silbenfarben pro Doppelseite (Wizard-Stufe 7 "Das Layout") - `buildOverlayHtml()` ist die EINE Stelle, die Manuskripttext in eine positionierte, ggf. silbengefärbte HTML-Ebene über dem Bild umwandelt, genutzt von der Vorschau UND vom Druck |
| `js/studio/studioPrint.js` | SchreibZauber: Doppelseiten-Druck/PDF-Export (eigene Funktion, orientiert an, aber getrennt von `app.actions.printBook()`) - noch NICHT KDP-fertig, siehe TEIL F in `docs/KONZEPT-SchreibZauber.md` |
| `js/render/studioLibrary.js`, `render/studioWizard.js` | SchreibZauber: Werkstatt-Übersicht bzw. die Stufen-Ansicht |
| `js/vendor/` | PDF.js, JSZip und mp4-muxer (MIT, für den Video-Export) - NIE direkt bearbeiten, nur austauschen/aktualisieren. Alle drei werden lazy geladen und stehen deshalb NICHT in der `APP_SHELL` von `sw.js` |
| `sw.js` | Service Worker - **`CACHE_NAME`-Version bei jeder Datei-Änderung hochzählen**, neue Dateien zur `APP_SHELL`-Liste hinzufügen |

## Datenmodell (zentral, viel hängt davon ab)

**Ein Buch** (`app.library[bookId]`):
```js
{
  id, title, author, created, profileId, lastReadIdx, lastReadAt,
  coverPageId,       // Seiten-ID (nicht Index!) des gewählten Covers (nur Anzeige, Bibliotheks-Thumbnail)
  bookType,          // 'story' (Standard) | 'workbook' - fehlt bei alten Büchern,
                     // IMMER über app.utils.resolveBookType(book) lesen
  origin,            // 'scan' (abfotografiert/importiert) | 'authored' (selbst erzeugt:
                     // SchreibZauber UND Heft-Generator - beides steckt kein fremdes
                     // Werk in das Buch) -
                     // fehlt bei alten Büchern, IMMER über app.utils.resolveBookOrigin(book)
                     // lesen. Steuert NUR den Video-Export: eine weitergegebene Videodatei
                     // eines fremden Kinderbuchs wäre eine Vervielfältigung, deshalb gilt
                     // alles ohne ausdrückliches 'authored' als 'scan' (siehe
                     // docs/KONZEPT-Video.md, Abschnitt 7)
  publisher, series, // optional: von der KI auf der Titelseite erkannt (siehe analyzePage)
  titlePageId, backCoverPageId, tocPageId, authorBioPageId,  // optional: Seiten-IDs, manuell
                     // per "Seiten-Rollen" markiert (siehe app.actions.setPageRole) - ersetzen die
                     // automatischen Annahmen (Titelseite = Seite 1) unabhängig von der
                     // Scan-Reihenfolge; leer = ignorieren
  readAuthorBioAloud, // optional bool (Default: true/undefined = vorlesen) - ob die
                     // "Über den Autor"-Seite beim automatischen Vorlesen mit angesagt wird
                     // (siehe app.actions.toggleReadAuthorBioAloud)
  bookQuiz: { questions: [{question, answer}] },  // optional, gecacht, nur bei 'story'
  pages: [ ... ]
}
```

**Eine Seite** - WICHTIG: seit der Persona-Architektur NICHT mehr flache Text-Felder, sondern:
```js
{
  id, imgUrl, thumbUrl,  // WebP, zwei Größen
  status: 'pending' | 'processing' | 'done' | 'error',  // persona-UNABHÄNGIG
  pdfSourceText,   // optional: garantiert korrekter Text aus PDF/EPUB-Textebene, kein OCR nötig
  generatedSheet,  // optional: { heading, body: [] } - nur bei vom Heft-Generator erzeugten
                   // Blättern (js/actions/workbookGenerator.js). Persona-unabhängig wie
                   // pdfSourceText: hält das Übungsfeld als echten Text fest, damit
                   // app.actions.printBook() beim Ausdrucken nicht den Umweg über das
                   // Canvas-Seitenbild (imgUrl) gehen muss.
  chapterTitle,    // optional: von der KI erkannte Kapitelüberschrift, falls diese Seite ein Kapitel beginnt
  tocEntries,      // optional: Array von Kapitelüberschriften, falls diese Seite ein Inhaltsverzeichnis ist (ohne Seitenzahlen)
  excluded,        // optional bool - Seite komplett von Analyse UND automatischem Vorlesen
                   // ausgeschlossen (Leerseiten, Impressum etc., siehe app.actions.togglePageExcluded)
                   // - manuelles Ansehen/Durchblättern bleibt trotzdem möglich
  variants: {
    // bei bookType 'story':
    [personaId]: { text, erstleserText, desc, quizQ, quizA }
    // bei bookType 'workbook' zusätzlich (quizQ/quizA sind dort null):
    //   { text: Aufgabenstellung, erstleserText: kindgerechte Erklärung,
    //     desc: Blatt-Beschreibung, taskType, materials, helpSteps: [], solution }
  },
  // NEU: Erledigt-Häkchen pro Kind-Profil (fehlt bei alten Büchern).
  // NIE direkt lesen, immer über app.progress.isPageDone(page).
  progress: { [profileId]: { done: true, doneAt, sticker } },
  // NEU: letzte Kontrolle des bearbeiteten Blattes, ebenfalls pro Profil.
  // Lesen über app.utils.resolvePageCheck(page). thumbUrl ist absichtlich
  // nur die kleine Vorschau - das volle Kontroll-Foto wird NICHT gespeichert,
  // sonst wächst jedes Heft mit jeder Kontrolle um ein großes Bild.
  check: { [profileId]: { verdict, praise, feedback, hints: [], thumbUrl, checkedAt } },
  // Alte Bücher (vor der Variants-Architektur) haben stattdessen flache
  // Felder text/erstleserText/desc/quizQ/quizA direkt auf der Seite -
  // IMMER über app.utils.resolvePageVariant()/resolveAnyVariant() lesen,
  // nie page.variants direkt, sonst bricht Rückwärtskompatibilität.
}
```

**Metadaten-Ansage:** `chapterTitle`/`tocEntries`/`publisher`/`series` sind persona-UNABHÄNGIG (wie `pdfSourceText`), da sie strukturelle Fakten sind, keine erzählte Vorlese-Variante. `app.tts._buildMetadataAnnouncements()` baut daraus die Ansage-Sätze - nur im automatischen Vorlesemodus (`_readCurrentThenAdvance`), NICHT beim einzelnen 🔊-Button (sonst nervt die Wiederholung bei jedem erneuten Antippen). Für `backCoverPageId`/`authorBioPageId` gibt es KEIN eigenes KI-Feld - die Ansage ist nur eine kurze Einleitung ("Darum geht's:"/"Über den Autor:"), der eigentliche Text wird direkt danach ganz normal als Seitentext vorgelesen. Nur `titlePageId`/`tocPageId` beeinflussen tatsächlich die KI-Anfrage (siehe `js/api.js`), deshalb löst nur deren Zuweisung in `setPageRole()` eine erneute Analyse aus.

**Die Varianten-Umrechnung liegt an EINER Stelle:** `app.utils.buildPageVariant(result, page, bookType)` baut aus der KI-Antwort den Varianten-Datensatz - genutzt von `actions/scanner.js` UND `backgroundPregen.js`. Ein neues Feld also nur dort ergänzen, nicht an beiden Aufrufstellen.

**Zwei Hilfsfunktionen sind der einzig sichere Weg, Seitentext zu lesen:**
- `app.utils.resolvePageVariant(page, personaId)` - exakt diese Persona, sonst `null`
- `app.utils.resolveAnyVariant(page, preferredPersonaId)` - diese Persona, sonst IRGENDEINE vorhandene (für Fälle wie Druck/Buch-Quiz, wo der Originaltext ohnehin persona-unabhängig sein sollte)

**Wichtiges Verhalten:** Beim Scannen/Batch wird NUR die aktuell gewählte Persona generiert (1 API-Call/Seite). Andere Personas entstehen erst on-demand, wenn im Reader dorthin gewechselt wird (siehe `render/reader.js`) - das ist bewusst so (5 Personas sofort = 5x API-Kosten). NICHT eigenmächtig "alle Personas sofort generieren" umbauen, das wurde explizit mit dem Nutzer besprochen und verworfen.

## Persona-System

`js/config.js` definiert `app.personas` (Array von `{id, label, instruction, ttsStyle}`). `instruction` steuert, wie die KI den Text **schreibt**, das optionale `ttsStyle`, wie die KI-Stimme ihn **spricht** (fehlt es, dient `instruction` als Rückfall). Neue Persona = neuer Eintrag dort, taucht automatisch überall auf (Settings-Dropdown, Reader-Dropdown), keine weiteren Code-Änderungen nötig.

Die Persona färbt bei Anbietern mit `supportsStyle` (Gemini, OpenAI) auch die **Stimmlage** - über `app.ttsProviders.styleHintFor()`, abschaltbar in den Einstellungen.

`js/config.js` definiert außerdem `app.bookTypes` (Geschichte/Übungsheft). Anders als bei den Personas reicht dort ein neuer Eintrag NICHT: eine neue Buchart braucht auch einen eigenen Prompt in `js/api.js` und eine Behandlung in `js/utils.js` (`buildPageVariant`).

Zwei getrennte Persona-Konzepte, nicht verwechseln:
- `app.settings.persona` - globale Standard-Persona für neue Scans
- `app.state.readingPersonaId` - nur fürs aktuell geöffnete Buch im Reader, ändert NICHT die globale Einstellung

## Sanity-Checks vor jedem Commit

Diese Checks haben in der bisherigen Entwicklung wiederholt echte Bugs vor dem Ausliefern gefangen. Immer laufen lassen:

```bash
# 1. Syntax-Check aller eigenen JS-Dateien (vendor/ ausschließen)
for f in $(find js -name "*.js" -not -path "*/vendor/*"); do node --check "$f" || echo "FEHLER in $f"; done

# 2. Jede in JS per getElementById referenzierte ID muss im HTML existieren
grep -rohE "getElementById\('[a-zA-Z0-9]+'\)" js --include="*.js" | grep -v vendor | sed -E "s/getElementById\('([a-zA-Z0-9]+)'\)/\1/" | sort -u > /tmp/a.txt
grep -ohE 'id="[a-zA-Z0-9]+"' index.html | sed -E 's/id="([a-zA-Z0-9]+)"/\1/' | sort -u > /tmp/b.txt
comm -23 /tmp/a.txt /tmp/b.txt   # muss leer sein

# 3. Jeder im HTML per onclick aufgerufene app.x.y(...) muss irgendwo definiert sein
grep -ohE "app\.[a-zA-Z]+\.[a-zA-Z]+\(" index.html | sed -E 's/app\.//; s/\($//' | sort -u | while read call; do
  fn=$(echo $call | cut -d. -f2)
  grep -rl --include="*.js" -E "^\s*(async )?${fn}\s*\(" js/ 2>/dev/null | grep -qv vendor || echo "FEHLT: $call"
done

# 4. sw.js: alle gelisteten Dateien existieren tatsächlich
python3 -c "
import re, os
sw = open('sw.js').read()
files = re.findall(r\"'\.\/([^']+)'\", sw)
missing = [f for f in files if f and not os.path.exists(f)]
print('Fehlend:', missing if missing else 'keine')
"
```

Ein Treffer `FEHLT: actions.xyz` beim dritten Check ist ein bekannter Fehlalarm (stammt aus einem Code-Kommentar in `main.js`, kein echter Aufruf).

## Deployment

Kein CI/CD - der Nutzer lädt den kompletten Ordnerinhalt manuell über die GitHub-Weboberfläche hoch (Drag & Drop), GitHub Pages baut daraus automatisch `https://<username>.github.io/<repo>/`. Bei jeder Änderung an gecachten Dateien **`sw.js`'s `CACHE_NAME` hochzählen**, sonst bekommen wiederkehrende Nutzer alte Versionen aus dem Service-Worker-Cache ausgeliefert.

## Arbeitsschritt-Varianten bei mehreren parallelen Aufträgen (Branches/PRs)

Wenn mehrere Aufträge gleichzeitig laufen (mehrere Claude-Code-Sessions/Branches), vergleicht sich jeder Branch nur mit dem Stand von `main`, den er beim Abzweigen gesehen hat - nicht mit dem aktuellen. Zwei Branches vom selben Ausgangspunkt wissen nichts voneinander. Das führt zu zwei Arten von Kollision, wenn sie zusammengeführt werden:

- **Sichtbare Konflikte** - beide Branches ändern dieselbe Zeile, Git meldet das von selbst (z. B. `CACHE_NAME`, Versionsnummer im Header, ein eigener Absatz in dieser Datei). Unangenehm, aber ungefährlich, weil Git danach fragt.
- **Unsichtbare Brüche** - beide Branches ändern verschiedene Stellen, die inhaltlich zusammenhängen, ohne dass Git das merkt. Beispiel aus der Praxis: Ein Branch führte `book.origin` ein, ein zeitgleicher Branch legte neue Bücher an, ohne von diesem Feld zu wissen - kein Git-Konflikt, aber die neuen Bücher wären fälschlich vom Video-Export ausgeschlossen gewesen. Das findet nur ein Mensch (oder Claude) beim bewussten Draufschauen, nicht Git.

**Zwei Vorgehen, je nach Lage:**

1. **Nacheinander mergen** - passt, wenn die Branches klar getrennte Ecken der App betreffen. PR 1 mergen, PR 2 per "Update branch" auf den neuen `main`-Stand bringen, Konflikte lösen, mergen, PR 3 genauso.
2. **Wellen mit Integrationspass** - passt besser, wenn mehrere Branches dieselben, oft angefassten Dateien berühren (bei diesem Projekt typisch: `index.html`, `sw.js`, `js/main.js`, diese Datei). Alle betroffenen Branches in einen Sammelzweig mergen, dort **einmal bewusst nach unsichtbaren Brüchen suchen** (nicht nur Git-Konflikte lösen), die Sanity-Checks laufen lassen, dann als ein geprüftes Paket nach `main`. In diesem Projekt bisher meist der richtige Weg, weil fast jedes Feature `main.js`/`sw.js`/die Versionsnummer anfasst.

**Daraus folgende Regeln:**

- Versionsnummer (`v0.X.Y-beta`) und `CACHE_NAME` **erst beim Zusammenführen** hochzählen, nicht schon in jedem einzelnen Auftrags-Branch - sonst vergeben zwei parallele Branches unabhängig voneinander dieselbe Nummer (ist schon passiert: zwei Branches beide "v0.16.0-beta").
- Nach jedem Zusammenführen mehrerer Branches gezielt prüfen, ob neu eingeführte Felder/Konzepte (wie `book.origin`) auch von den *anderen* gerade gemergten Branches korrekt gesetzt werden, nicht nur von dem, der sie eingeführt hat.
- Bereits gemergte Branches zeitnah löschen (lokal und auf GitHub), sonst sammeln sich alte Branches an und es wird unübersichtlich, welche noch echten, nicht gemergten Inhalt haben.

## Bekannte, bewusste Einschränkungen (nicht versehentlich "reparieren")

- Kein Server, keine Accounts, keine automatische Cloud-Synchronisierung - bewusst so, siehe README "Mögliche nächste Schritte"
- API-Keys im Klartext im Browser - bekannte Grenze der reinen Client-Architektur

## Offene Punkte (Stand zuletzt besprochen)

**Die vollständige, zusammengeführte Liste steht in [`docs/TODO-GESAMT.md`](docs/TODO-GESAMT.md).**
Dort ist auch aufgeführt, welche Punkte mit v0.12.0 bereits erledigt sind - vor dem Einplanen
eines Features dort nachsehen, sonst wird Fertiges doppelt gebaut.

Kurzfassung der größeren, noch nicht begonnenen Features (brauchen erst Abstimmung mit dem
Nutzer, nicht einfach lospreschen):

| Vorhaben | Konzept |
|---|---|
| 🎬 Video: praktisch fertig, nur noch höhere Bildauflösung (`videoUrl`, niedrigste Priorität) offen - Titelkarten-Ansage, Ton in der Vorschau und Quiz-Karte mit Denkpause sind seit v0.19.0-beta gebaut, siehe Abschnitt 4.7 des Konzepts | [`docs/KONZEPT-Video.md`](docs/KONZEPT-Video.md) |
| 🪄 "SchreibZauber" - Stufe 1 (Fundament), Stufe 2 (Bilder), Stufe 3 (Layout & Druck) und Stufe 4 (Arbeitsheft) sind fertig. Stufe 5 (Comic) und Stufe 6 (Politur) bleiben zurückgestellt - siehe Abschnitt "Stand nach Stufe 3" im Konzept, dort auch der verifizierte (aber noch nicht umgesetzte) KDP-Kenntnisstand | [`docs/KONZEPT-SchreibZauber.md`](docs/KONZEPT-SchreibZauber.md), [`docs/KONZEPT-Bildquellen.md`](docs/KONZEPT-Bildquellen.md) |
| 🎨 KI-generierte Illustrationen (Comic-Stil), für Text-only-EPUB-Kapitel UND als SchreibZauber-Werktyp | [`docs/KONZEPT-Comic.md`](docs/KONZEPT-Comic.md) |
| 📱 Native Android-App via Capacitor | [`docs/TODO-GESAMT.md`](docs/TODO-GESAMT.md), Bereich "App & Plattform" |

**Vor jeder Arbeit an einem dieser Themen erst das verlinkte Dokument lesen** - sonst werden
Entscheidungen neu diskutiert, die schon gefallen sind, und bereits verworfene Wege erneut probiert.

Diagnose, noch nicht reproduziert: Scroll-Verhalten am Bildschirmrand (Desktop),
Zoom/Unschärfe im Fenstermodus - braucht ggf. einen Screenshot vom Nutzer.

Bewusst zurückgestellt (bräuchten einen eigenen Server):
- API-Key-Absicherung über Backend
- Automatische Cloud-Synchronisierung
- Echte Multi-Geräte-Accounts

## Code-Konventionen

- Kommentare auf **Deutsch** (Zielgruppe: der Projektbetreiber, kein englischsprachiges Team)
- Jede neue/geänderte Codestelle mit kurzem `// NEU:` oder `// FIX:`-Kommentar, der erklärt WARUM, nicht nur was
- Immer `app.utils.sanitize()` verwenden, bevor Nutzer- oder KI-Text per `innerHTML` eingefügt wird (XSS-Schutz) - `.innerText`/`.textContent` brauchen das nicht
- Fehler nie stumm verschlucken - mindestens `console.error()`, meist zusätzlich `app.ui.toast(...)`
- Vor dem Vorlesen IMMER `app.utils.stripEmojiForSpeech()` bzw. `speak()` nutzen (nie rohen Text direkt an `SpeechSynthesisUtterance` geben) - sonst versucht der Browser, Emojis auszusprechen
- **Rückmeldungen an Kinder nie hart formulieren.** Der Kontroll-Prompt in `js/api.js` verbietet der KI ausdrücklich das Wort "falsch", schreibt "im Zweifel lieber 'fast'" vor und verlangt `verdict: "unklar"` statt einer Vermutung, wenn das Foto unklar ist. Ein Kind, dem fälschlich gesagt wird, es habe sich vertan, verliert die Lust - das ist wichtiger als eine strenge Bewertung. Beim Anfassen dieses Prompts unbedingt beibehalten.
- Die App hat **keine eigene Spracherkennung**. Gesprochene Eingabe läuft über die Mikrofon-Taste der Bildschirmtastatur (Gboard/iOS-Diktat), die ganz normal in das Textfeld schreibt - `app.actions.focusChatInput()` kann nur das Feld fokussieren und darauf hinweisen.

## KI-Stimmen (neuronale TTS)

`app.settings.ttsProvider` entscheidet, wie vorgelesen wird - Standard ist `'device'` (Gerätestimme wie bisher). **Alles im Code ruft weiterhin nur `app.tts.speak(text, onEnd, highlightElementId)` auf**; die Weiche zwischen Gerät und KI-Stimme sitzt ausschließlich in `js/tts.js`.

Feste Regeln dabei:
- **Nie ohne Ton enden:** Jeder Fehler (Key falsch, Limit, CORS, offline) fällt auf `app.tts.speakWithDevice()` zurück. Endgültige Fehler setzen `app.ttsNeural._disabledReason`, damit nicht jede Seite erneut in dieselbe Wartezeit läuft.
- **Jede Aufnahme kostet Geld/Kontingent:** Ohne triftigen Grund keine zusätzlichen Synthese-Aufrufe einbauen. Der IndexedDB-Zwischenspeicher (`ttsCache`) ist Absicht, nicht Optimierung.
- **`_token`-Zähler beachten:** `stop()` erhöht ihn; jede asynchrone Fortsetzung muss vorher prüfen, ob sie noch aktuell ist - sonst spricht eine abgebrochene Seite verspätet doch noch los.
- Ein einziges `<audio>`-Element für die ganze App (iOS erlaubt Wiedergabe nur bei einem Element, das schon per Fingertipp gestartet wurde).

**Bausteine für den Video-Export** (bewusst getrennt vom Abspielen):
- `app.ttsNeural.renderAudio(text, {personaId})` → `{ text, blob, mime, durationSec, words: [{word, start, end}], exact }`
- `app.ttsNeural.renderPageSegments(bookId, pageIdx, {includeDescription, includeQuiz, onProgress})` → `{ imgUrl, totalDurationSec, segments: [...] }` (Reihenfolge: Text → Bildbeschreibung → Quiz)
- Beide gehen zuerst in den `ttsCache`; Cache-Einträge tragen seit v0.10.1 `mime` und `durationSec`. Ältere Einträge messen ihre Länge beim ersten Export einmalig nach.
- Die Wort-Zeitpunkte kommen aus derselben `_wordStartTimes()`-Berechnung wie die Hervorhebung im Reader (exakt bei ElevenLabs, sonst über die Textlänge geschätzt) - nicht duplizieren.
- **Mit der Gerätestimme unmöglich:** SpeechSynthesis gibt keine Datei heraus. `renderAudio()` wirft deshalb bei `ttsProvider === 'device'` einen verständlichen Fehler.

## Versionsstand

Aktuell `v0.23.0-beta` (Anzeige im App-Header) - noch nicht veröffentlicht, aktiv in Entwicklung mit einer echten Nutzerfamilie als Testgruppe. Zähl die Version bei größeren Änderungen entsprechend hoch (Semantic Versioning: `MAJOR.MINOR.PATCH`, `-beta`-Suffix bis zur ersten öffentlichen Veröffentlichung).

Mit v0.23.0-beta gibt es einen "Master-Prompt" fürs Komplett-Setup (Bugreport: "Es fehlt eine Funktion, um alle Eingabefelder strukturiert vorzubefüllen"): der Knopf "📋 Master-Prompt kopieren" oben in Stufe 1 (Idee) kopiert einen Prompt, der in einem beliebigen KI-Chat (z.B. Google AI Studio) fertige Vorschläge für Titel/Thema/Ton/Botschaft/Autoren-Steckbrief/Verlag/Klappentext liefert - je Feld ein eigener Codeblock zum manuellen Zurückkopieren, kein API-Aufruf, kostet also nichts (`app.studio.prompts.buildMasterSetupPrompt()`, gleicher "Prompt kopieren/Ergebnis zurückholen"-Weg wie schon bei Bildern ohne aktivierte Bild-API). Bewusst NUR Stufe 1: der Bauplan ist eine Format-/Zahlenentscheidung, keine Kreativaufgabe, und die Geschichte selbst hat mit "✨ Von der KI schreiben lassen" längst einen eigenen, direkten Ein-Klick-Weg mit der App-eigenen API - ein externer Copy-Paste-Umweg über Dutzende Doppelseiten wäre dort nur umständlicher. Damit ist die ursprüngliche Bugreport-Liste zur Werkstatt vollständig abgearbeitet.

Mit v0.22.0-beta bekommt SchreibZauber eine Reihen-Zugehörigkeit (Bugreport: "Serien-Datenbank... für Tags bei Büchern und eine Auswahl beim Erstellen"): ein neues optionales Feld `studioSeriesName` in Stufe 1 (Idee), mit `<datalist>`-Vorschlägen aus `app.studio.listSeriesNames()` - bewusst KEIN eigener Objektspeicher/DB_VERSION-Sprung, sondern nur die Liste bereits benutzter Reihennamen über alle Werkstatt-Projekte UND die normale Bibliothek hinweg (dedupliziert). Wählt man in Stufe 1 den Namen einer bestehenden Reihe UND die Sitzung hat selbst noch keine eigene Stilkarte/Figuren, übernimmt `saveBrief()` (`js/studio/studioCore.js`) automatisch Stilkarte und Figuren-Bibel des jüngsten Geschwister-Projekts derselben Reihe - die eigentliche "Konsistenz-Verknüpfung" aus dem Bugreport. Beim Export landet der Name in `book.series` (genau das bereits vorhandene Feld gescannter Bücher) und erscheint als 📚-Chip auf der Bücherkarte (`js/render/library.js`) - die Bibliothekssuche durchsucht `book.series` bereits seit längerem mit.

Mit v0.21.0-beta bekommt ein "ins Regal gestelltes" SchreibZauber-Werk jetzt automatisch Titelseite, Klappentext (Rückseite) und Autorenseite (Bugreport: "fehlende Meta-Seiten") - alle drei werden von `js/studio/studioMetaPages.js` als einfache Canvas-Textseiten gezeichnet und über `book.titlePageId`/`backCoverPageId`/`authorBioPageId` genauso eingebunden wie bei einem gescannten Buch mit Seiten-Rollen (siehe Datenmodell) - Vorlesen, Ansage-Sätze und Druck funktionieren dadurch ohne jede Sonderbehandlung. Drei neue optionale Felder in Stufe 1 (Idee): Autoren-Steckbrief, Verlag, Klappentext (`project.meta`) - alle drei dürfen leer bleiben, dann greift ein freundlicher Platzhaltertext (z.B. "Im Selbstverlag mit LeseZauber Pro erstellt."). `book.publisher` wird bewusst NUR bei einer wirklich eingetragenen Verlagsangabe gesetzt, sonst würde die automatische Vorlese-Ansage (`_buildBookIntro()`) unschön "Aus dem Selbstverlag-Verlag" sagen - der Selbstverlags-Hinweis steht stattdessen nur als Text auf der Autorenseite. Bisher nur für den Bilderbuch-Pfad (nicht für Arbeitshefte, die haben einen eigenen Export in `js/studio/worksheet.js`).

Mit v0.20.3-beta bekommt jede Doppelseite beim Anlegen automatisch eine von vier Textzonen (unten/oben/links/rechts, `pickAutoTextPos()` in `js/studio/studioCore.js`, gewichtet zugunsten der volltextbreiten oben/unten) statt immer derselben festen Zone - Bugreport: "es wäre ein bisschen langweilig, wenn jede Seite gleich gestaltet ist". Die gewählte Zone wandert jetzt auch als tatsächliche "hier bitte Platz lassen"-Anweisung in den Bild-Prompt (`js/studio/imageFormats.js` `textZones`, `js/studio/imageSource.js` `buildPrompt()`) - Bild und Textebene fragen dadurch garantiert nach derselben freien Fläche, statt dass die Textbox blind über ein Bild gelegt wird, das für eine andere Zone freigehalten wurde. Einmal gesetzt bleibt die Zone stabil (auch über eine erneute Bild-Generierung hinweg), bis der Nutzer sie in Stufe 7 (Layout) von Hand ändert. Echte, nachträgliche Bildinhaltsanalyse (z.B. per Vision-Aufruf, welche Fläche im fertigen Bild tatsächlich leer ist) wäre der nächste Ausbauschritt, ist aber ein zusätzlicher kostenpflichtiger API-Aufruf und deshalb bewusst noch nicht gebaut.

Mit v0.20.2-beta wurden die Veröffentlichungs-Leitplanken (`guardrailsBlock()` in `js/studio/studioPrompts.js`, Entscheidung 6) für **gemeinfreie Figuren** geöffnet. Bisher verbot der Block AUSNAHMSLOS jede bekannte Figur - das hatte einen echten Bug ausgelöst: eine gewünschte biblische Figur ("Samuel") wurde von der KI eigenmächtig in eine erfundene ("Mio") umbenannt. Jetzt gilt: urheber-/markenrechtlich geschützte Figuren/Werke (aktuelle Bücher, Filme, Marken) bleiben verboten, aber klassische Volksmärchen, Sagen, Mythologie und biblische/religiöse Geschichten dürfen beim Namen bleiben, wenn das Thema sie nennt - inkl. der ausdrücklichen Regel, einen im Thema genannten Namen NIE eigenmächtig zu ändern. Historische Persönlichkeiten dürfen sachlich vorkommen, wenn das Thema ausdrücklich von ihnen handelt (z.B. eine Biografie), nicht als beliebige Nebenfigur. Lebende Personen bleiben weiterhin ausnahmslos tabu.

Mit v0.20.1-beta drei Bugfixes aus echtem Nutzer-Testfeedback (Testbasis: Stand kurz vor der Stufe-3-Zusammenführung), alle drei bestätigt reproduziert, bevor sie behoben wurden:

- **Browser-"Zurück" verließ die App.** `app.nav.go()` fasste den Browser-Verlauf bisher nie an - es lag also nichts zum Zurückgehen im Verlauf, "Zurück" ging deshalb zur vorherigen externen Seite. `js/nav.js` legt jetzt bei jedem echten Ansichtswechsel (bewusst NICHT pro Seiten-/Blatt-Blättern im Reader, das würde den Verlauf fluten) einen `history.pushState()`-Eintrag an (inkl. `bookId`/`pageIdx`/`studioProjectId`, damit "Zurück" auch das richtige Buch wieder zeigt) und hört per `popstate` darauf.
- **Leere Werkstatt-Karteikarte blieb liegen.** `app.studio.newProject()` schrieb bisher sofort per `app.dbOps.saveProject()` in die Datenbank - ein Klick auf "Bilderbuch/Arbeitsheft erstellen" gefolgt von "Zurück" hinterließ dadurch dauerhaft ein leeres Projekt in der Werkstatt-Übersicht. Neu angelegte Projekte bekommen jetzt erst `_draft: true` und leben nur im Speicher; der erste echte Speichervorgang ist `saveBrief()`/`saveWorksheetGoal()` beim ersten "Weiter" (löscht dabei `_draft` wieder). Verlässt `app.nav.go()` die Wizard-Ansicht, während `_draft` noch gesetzt ist, wird das Projekt verworfen statt liegen zu bleiben.
- **Dark Mode: unlesbarer Text in Formularfeldern.** Alle Text-Eingabefelder der App (SchreibZauber, Arbeitsheft-Wizard, Heft-Generator, aber auch Bibliothekssuche/-sortierung, Seiten-Rollen, API-Key-Felder u.a. - 34 Stellen in `index.html`) hatten keine explizite Textfarbklasse. Im hellen Modus unsichtbar, weil einfach Browser-Standardschwarz auf `bg-white`; im dunklen Modus überschreibt `css/style.css` aber NUR `bg-white`/`bg-slate-50` zu dunklen Tönen, die Schrift blieb dabei (mangels passender Klasse) schwarz - schwarz auf dunkelblau. Fix: `text-slate-900` ergänzt (dieselbe Klasse, die `css/style.css` für den Dark-Mode-Kontrast bereits kennt).

Mit v0.20.0-beta ist **SchreibZauber Ausbaustufe 3 (Layout & Druck)** dazugekommen: Wizard-Stufe 7 "Das Layout" macht `spread.layout` (`textPos`/`fontScale`/`syllableColors`, existierte als Datenfeld schon seit Stufe 1) erstmals editierbar, der Manuskripttext wird darüber als absolut positionierte, sanitierte HTML-Ebene über dem Bild dargestellt (nie ins Bild gebrannt) - inklusive einer einfachen Silbentrennungs-Heuristik für die Silbenmethode und automatischen Sinnschritt-Zeilen bei `readingLevel: 'erstleser'`. Dazu ein eigener Doppelseiten-Druck (`app.studio.printSpreads()`, `js/studio/studioPrint.js`) mit Papierformat aus dem Bauplan (A5 quer/hoch, A4 hoch) und Wahl zwischen randabfallendem Bild und weißem Rand. Vor dem Bau wurde der aktuelle Amazon-KDP-Kenntnisstand recherchiert (siehe `docs/KONZEPT-SchreibZauber.md`, TEIL F) - der jetzige Druck-Export ist bewusst NUR für den eigenen Drucker/"als PDF speichern", noch nicht KDP-fertig (kein echter 3mm-Bleed-Übermaßzuschlag, keine Aufteilung einer Doppelseite in zwei KDP-Einzelseiten, keine ISBN-Platzierung) - das bleibt ein offener, dokumentierter Punkt.

Mit v0.19.0-beta ist Welle 5 zusammengeführt: **SchreibZauber Stufe 2** (Bilder: Stilkarte, Figuren-Bibel, Storyboard, Bildgenerierung, Kostenzähler) und **Ausbaustufe 4** (Arbeitsheft: Lernziel, Progression, Aufgabenbaukasten, Lösungsteil) liefen als zwei parallele, unabhängige Sitzungen auf demselben `main`-Stand, dazu unabhängig davon die **Video-Restpunkte** (Titelkarten-Ansage, Ton in der Vorschau aus dem Cache, Quiz-Karte mit Denkpause). Details zu Stufe 2/4: `docs/KONZEPT-SchreibZauber.md`, Abschnitte „Stand nach Stufe 2"/„Stand nach Stufe 4". Beim Zusammenführen gefunden und behoben: beide SchreibZauber-Sitzungen hatten unabhängig voneinander dieselbe Gemini-zuerst-Mistral-Fallback-Hilfsfunktion in `js/studio/studioApi.js` erfunden - auf eine gemeinsame Fassung vereinheitlicht. Sonst nur mechanische Konflikte (Imports, `sw.js`-Dateiliste, die Verschachtelung der beiden Werktyp-Container in `index.html`), keine weiteren unsichtbaren Brüche gefunden.

Mit v0.18.0-beta sind der Heft-Generator (vorher v0.16.0/v0.17.0-beta) und der Video-Export (vorher parallel als v0.15.0/v0.16.0-beta entwickelt) in einem Integrationspass zusammengeführt. Die beiden Zweige sind unabhängig voneinander entstanden und hatten deshalb dieselben Versionsnummern doppelt vergeben - maßgeblich ist ab hier nur noch diese Datei. Beim Zusammenführen gefunden und behoben: vom Heft-Generator erzeugte Hefte bekommen jetzt `origin: 'authored'` - der Zweig entstand ohne Kenntnis dieses Feldes, dadurch wären sie als 'scan' durchgegangen und vom Video-Export ausgeschlossen gewesen, obwohl in ihnen kein fremdes Werk steckt.

Seit v0.15.0/v0.16.0-beta ist der **Video-Export** gebaut (Weg B, Teil 1 + 2):
`js/render/cinema.js` + `js/actions/videoTimeline.js` + `js/actions/videoPreview.js` +
`js/actions/videoExport.js`, eigener `app.cinema`-Namespace, Muxer in
`js/vendor/mp4muxer/`. Sichtbar als "🎬 Film"-Vorschau in der Buch-Ansicht bzw.
"🎬 Film-Vorschau dieser Seite" im Reader; darin der Knopf "🎞️ Als Videodatei
speichern" (nur bei `origin: 'authored'`). Alle dabei gefallenen Entscheidungen
(9:16 als Standard, Untertitel in Blöcken, wer die dekodierten Bilder besitzt, warum
die Vorschau stumm bleibt, Codec-Leiter, OPFS, Seiten-Rollen als Regie) stehen in
`docs/KONZEPT-Video.md`, Abschnitt 4.7 - **vor jeder Arbeit daran dort nachlesen.**

Seit v0.17.0-beta druckt `app.actions.printBook()` (`js/actions/backup.js`) vom Heft-Generator erzeugte Blätter als echten Text statt über den Umweg des Canvas-Seitenbildes - schärfer auf Papier. Dafür merkt sich die Seite zusätzlich `generatedSheet: { heading, body }` (persona-unabhängig, wie `pdfSourceText`). Das war der im Konzept ausdrücklich benannte Folgeschritt („Druckqualität") aus v0.16.0-beta.

Seit v0.16.0-beta ist der **Heft-Generator** fertig (Teil 2 aus `docs/KONZEPT-Uebungshefte.md`): über "📝 Heft erstellen lassen" in der Bibliothek (`js/render/workbookGenerator.js`, `js/actions/workbookGenerator.js`) schlägt die KI zu Thema + Lernziel fertige Übungsblätter vor, die einzeln abgewählt werden können, bevor daraus ein ganz normales Übungsheft entsteht. Jedes Blatt wird auf Canvas gezeichnet (gleiche Technik wie `renderTextAsImageCanvas()` in `epubImport.js`) und bekommt seine Variante direkt aus der KI-Antwort mit - kein zweiter Auslese-Aufruf nötig.

Seit v0.15.0-beta werden auch sehr lange Texte (v.a. EPUB-Kapitel) mit KI-Stimme vorgelesen: ab `MAX_NEURAL_CHARS` (`js/ttsNeural.js`) wird an Satzenden in ~800-Zeichen-Stücke zerlegt (`app.utils.splitTextIntoChunks()`) und nacheinander abgespielt, statt wie vorher auf die Gerätestimme umzuschalten. Der Mitmachmodus (Emoji-Ratepausen) funktioniert jetzt auch mit KI-Stimme, über eine `[pause]`-Sprechanweisung statt vieler Kleinst-Aufrufe (`app.ttsNeural.speakMitmach()`) - nur bei Anbietern mit `supportsTags`, sonst weiterhin Gerätestimme.

Seit v0.14.0-beta gibt es zusätzlich den **SchreibZauber**-Bereich (`js/studio/*`, `js/render/studio*.js`, eigener `app.studio`-Namespace, Object Store `projects` in `js/db.js`): eine Werkstatt, um eigene Kinderbuch-Werke von der KI schreiben zu lassen und als normales Buch "ins Regal zu stellen". Stufe 1 (Fundament: Idee → Bauplan → Geschichte, nur Platzhalter-Bilder, kein einziger Bildaufruf) ist gebaut - Hintergrund, Datenmodell und wo die nächsten Ausbaustufen andocken: `docs/KONZEPT-SchreibZauber.md`.
