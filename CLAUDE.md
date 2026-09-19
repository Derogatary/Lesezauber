# CLAUDE.md

Kontext für Claude Code an diesem Projekt. Liegt im Repo-Root, wird automatisch gelesen.

## Projektüberblick

**LeseZauber Pro** ist eine PWA: Kinderbuch-Seiten fotografieren/importieren (Foto, Galerie, PDF, EPUB) und per KI (Gemini, Mistral-Fallback) vorlesen, vereinfachen ("Erstleser"-Modus mit Emojis) und erklären lassen (Bildbeschreibung, Quiz, Vokabeltrainer).

Seit v0.10.0-beta gibt es den **Heft-Modus**: ein Buch kann statt einer Geschichte ein **Übungsheft** sein - die KI wertet die Seite dann als Aufgabe aus (Aufgabenstellung, Erklärung, Hilfeschritte, Lösung) statt als Erzähltext. Seit v0.11.0-beta kann das Kind sein bearbeitetes Blatt abfotografieren und bekommt eine vorgelesene Rückmeldung (`js/actions/checkWork.js`). Details: `docs/KONZEPT-Uebungshefte.md`.

**Zielgruppe:** eine Familie, rein privat. Der Betreiber ist technischer Laie ("kann ein bisschen HTML"), arbeitet aber regelmäßig mit Claude am Projekt weiter.

**Architektur-Grundprinzip: komplett client-seitig, kein eigener Server.** Läuft rein im Browser, gehostet auf GitHub Pages (statisch). Alle Daten (Bücher, Fotos, Profile, Vokabeln) liegen in IndexedDB auf dem Gerät. API-Keys liegen im Klartext im Browser - bekannte, akzeptierte Grenze (siehe README "Bekannte Grenzen"), keine zu fixende Sicherheitslücke.

## Tech-Stack

- HTML/CSS/JS, ES-Module (`<script type="module">`)
- Tailwind CSS v4, eigener Build - KEIN CDN (siehe Build-Schritt unten)
- PDF.js, JSZip (vendored, lazy-geladen) für PDF-/EPUB-Import
- Google Gemini API (aktuell `gemini-3.6-flash`, `js/api.js`) für Bildanalyse/Text, Mistral als optionaler Fallback
- Neuronale TTS-Anbieter (optional, opt-in): Gemini TTS, Google Cloud Chirp 3 HD, ElevenLabs, OpenAI, Speechify (`js/ttsProviders.js`)
- Service Worker für PWA/Offline-Fähigkeit
- Kein Bundler nötig (reine ES-Module) - nur Tailwind braucht einen Build-Schritt

## ⚠️ Kritischer Build-Schritt: Tailwind

**Nach JEDER Änderung an Tailwind-Klassen (`index.html` oder eine `.js`-Datei) neu bauen:**

```bash
npx @tailwindcss/cli -i ./css/tailwind-input.css -o ./css/tailwind.css --minify
```

Ohne diesen Schritt fehlen neue Klassen lautlos im Live-Betrieb (kein Fehler, das Element bleibt nur ungestylt). `css/tailwind-input.css` enthält die Marken-Farben-Erweiterung (`@theme`-Block), `css/tailwind.css` ist die ausgelieferte, gebaute Datei - **niemals von Hand bearbeiten**, sie wird beim nächsten Build überschrieben.

`node_modules/`, `package.json`, `package-lock.json` sind nur fürs lokale Bauen nötig, werden NICHT deployed.

## Architektur: das zentrale `app`-Objekt

Der gesamte Code hängt sich an ein gemeinsames Objekt `app`, definiert in `js/core.js`:

```js
export const app = {
    state: {}, settings: {}, library: {}, vocabulary: {}, personas: [],
    dbOps: {}, nav: {}, api: {}, tts: {}, ui: {}, actions: {},
    render: {}, readerUI: {}, settingsConfig: {}, utils: {}
};
```

Jede andere Datei importiert dieses eine Objekt und hängt eigene Funktionen an einen Namespace:

```js
import { app } from '../core.js';
Object.assign(app.actions, {
    meineNeueAktion() { ... }
});
```

**Modul-Reihenfolge ist wichtig:** `js/main.js` importiert alle Module in fester Reihenfolge (state.js zuerst, da es teils von settings liest). Ein neues Modul MUSS dort ergänzt werden, sonst lädt es nie:

```js
import './actions/meineNeueDatei.js';
```

**Neue Funktion hinzufügen = neue Datei, nicht bestehende aufblähen:**
- `js/actions/<name>.js` - Nutzer-ausgelöste Aktionen (Button-Klicks etc.)
- `js/render/<name>.js` - baut/aktualisiert DOM-Inhalt für eine Ansicht
- beides zusammen in `main.js` importieren

## Wichtige Dateien und ihre Rolle

| Datei | Zweck |
|---|---|
| `js/core.js` | Das `app`-Objekt selbst - Namespace-Definitionen |
| `js/state.js` | `app.state` (Laufzeit) + `app.settings` (persistiert, localStorage) - **Reihenfolge: settings vor state**, da state teils von settings liest |
| `js/db.js` | IndexedDB-Speicher-Engine (`app.library`, `app.vocabulary`, `ttsCache`, `projects`). **Version 4** - neuer Object Store: `DB_VERSION` erhöhen und `onupgradeneeded` erweitern |
| `js/nav.js` | Router zwischen den `<main id="view...">`-Ansichten |
| `js/api.js` | Gemini/Mistral-Aufrufe, der komplette Analyse-Prompt lebt hier |
| `js/tts.js` | Sprachausgabe: Weiche Gerätestimme/KI-Stimme, Auto-Vorlesen, Wort-Hervorhebung (SpeechSynthesis `boundary`-Event), Rätsel-Modus |
| `js/ttsProviders.js` | KI-Stimmen-Anbieter als Liste (`app.ttsProviders.list`) - neuer Anbieter = neuer Eintrag, UI baut sich automatisch auf |
| `js/ttsNeural.js` | Wiedergabe der KI-Stimmen: IndexedDB-Zwischenspeicher, eigene Wort-Hervorhebung per `requestAnimationFrame`, Vorbereitung der nächsten Seite, Rückfall auf Gerätestimme |
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
| `js/render/cinema.js` | Video-Export Teil 1: Canvas-Renderer (`app.cinema`) - zeichnet EINEN Frame zum Zeitpunkt t (Seitenbild + Ken-Burns + Untertitel mit Wort-Hervorhebung), verwaltet bewusst keine Zeit und spielt nichts ab |
| `js/actions/videoTimeline.js` | Zeitplan/"Regie" dazu (`app.cinema.buildTimeline`): welche Szene über welchem **Seitenbereich** wann läuft - nutzt echte Segmente aus `renderPageSegments()`, sonst Längen-Schätzung aus dem Text |
| `js/actions/videoPreview.js` | Film-Vorschau ("🎬 Film"): spielt den Zeitplan live auf sichtbarem Canvas ab, bewusst stumm/ohne Synthese - kostet also nichts |
| `js/actions/videoExport.js` | Video-Export Teil 2: Ton aus `renderPageSegments()`, Frames per `VideoEncoder`, Ton per `AudioEncoder`, Datei per `mp4-muxer` über OPFS. Codec-Leiter statt festem Codec, Fortschritt+Abbruch, Größenschätzung vorab. **Nur bei `origin: 'authored'`** |
| `js/studio/studioCore.js` | SchreibZauber: `app.studio`-Projekt-CRUD, Stufen-Logik (Idee/Bauplan/Geschichte), Platzhalter-Aufruf pro Doppelseite |
| `js/studio/studioPrompts.js` | SchreibZauber: alle Prompt-Bausteine inkl. `guardrailsBlock()` (Veröffentlichungs-Leitplanken, Entscheidung 6) |
| `js/studio/studioApi.js` | SchreibZauber: eigener Gemini/Mistral-Textaufruf fürs Manuskript (gleiche Keys wie `js/api.js`, getrennte Funktionen) |
| `js/studio/studioExport.js` | SchreibZauber: Projekt → normales Buch in `app.library` ("Ins Regal stellen") - fügt Titel-/Rück-/Autorenseite aus `studioMetaPages.js` ein |
| `js/studio/studioMetaPages.js` | SchreibZauber: Titelseite/Klappentext/Autorenseite als Canvas-Textseiten (Platzhaltertext bei leeren Feldern) - `app.studio.buildMetaPages()`, nur von `studioExport.js` aufgerufen |
| `js/studio/imageFormats.js`, `placeholder.js`, `imageSource.js` | SchreibZauber: Bildformat-Katalog, Platzhalter-Erzeugung, Bildquellen-Adapter (`{full, thumb, meta}`) - Details `docs/KONZEPT-Bildquellen.md` |
| `js/studio/studioLayout.js`, `render/studioLayout.js` | SchreibZauber: Textposition/Schriftgröße/Silbenfarben pro Doppelseite (Stufe 7 "Das Layout") - `buildOverlayHtml()` ist die EINE Stelle, die Manuskripttext in eine positionierte HTML-Ebene über dem Bild umwandelt, genutzt von Vorschau UND Druck |
| `js/studio/studioBalloons.js` | SchreibZauber Comic: Sprechblasen-CRUD (`addBalloon()`/`updateBalloon()`/`deleteBalloon()`, PRO PANEL) + `buildBalloonsHtml()` als HTML-Vorschau-Ebene (Prozent-Koordinaten relativ zum Panel) |
| `js/studio/studioComicPanels.js` | SchreibZauber Comic: Panel-Layout-Vorlagen (1-4/Seite), `compositePage()` setzt Panel-Bilder per Canvas zu einer "sauberen" Seite zusammen, `bakePageWithBalloons()` brennt Sprechblasen (immer) + Geräuschwörter (optional, `project.comicShowSoundEffects`) zusätzlich ein - Export liefert BEIDE Fassungen, Reader schaltet um (`app.utils.resolveDisplayImageUrl()`) |
| `js/studio/studioPrint.js` | SchreibZauber: Doppelseiten-Druck/PDF-Export (eigene Funktion, getrennt von `app.actions.printBook()`) - seit v0.28.0-beta comicfähig, seit v0.29.0-beta zusätzlich `printSpreadsKdp()` (echter KDP-Innenteil-Export: Bleed+Sicherheitsabstand, nur A5/A4 hoch, KEIN Umschlag) - Details CHANGELOG.md, TEIL F in `docs/KONZEPT-SchreibZauber.md` |
| `js/render/studioLibrary.js`, `render/studioWizard.js` | SchreibZauber: Werkstatt-Übersicht bzw. Stufen-Ansicht |
| `js/vendor/` | PDF.js, JSZip, mp4-muxer (MIT) - NIE direkt bearbeiten, nur austauschen/aktualisieren. Lazy geladen, deshalb NICHT in der `APP_SHELL` von `sw.js` |
| `sw.js` | Service Worker - **`CACHE_NAME` bei jeder Datei-Änderung hochzählen**, neue Dateien zur `APP_SHELL`-Liste hinzufügen |

## Datenmodell (zentral, viel hängt davon ab)

**Ein Buch** (`app.library[bookId]`):
```js
{
  id, title, author, created, profileId, lastReadIdx, lastReadAt,
  coverPageId,       // Seiten-ID (nicht Index!) des gewählten Covers (nur Anzeige)
  bookType,          // 'story' (Standard) | 'workbook' - fehlt bei alten Büchern,
                     // IMMER über app.utils.resolveBookType(book) lesen
  origin,            // 'scan' (fotografiert/importiert) | 'authored' (SchreibZauber ODER
                     // Heft-Generator - kein fremdes Werk im Buch) - fehlt bei alten Büchern,
                     // IMMER über app.utils.resolveBookOrigin(book) lesen. Steuert NUR den
                     // Video-Export (eine weitergegebene Videodatei eines fremden
                     // Kinderbuchs wäre eine Vervielfältigung) - siehe docs/KONZEPT-Video.md
                     // Abschnitt 7
  publisher, series, // optional: von der KI auf der Titelseite erkannt (analyzePage)
  titlePageId, backCoverPageId, tocPageId, authorBioPageId,  // optional: Seiten-IDs, manuell
                     // per "Seiten-Rollen" markiert (app.actions.setPageRole) - überschreiben
                     // die automatische Annahme (Titelseite = Seite 1); leer = ignorieren
  readAuthorBioAloud, // optional bool (Default: true = vorlesen) - ob die "Über den Autor"-
                     // Seite beim automatischen Vorlesen angesagt wird (toggleReadAuthorBioAloud)
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
  generatedSheet,  // optional: { heading, body: [] } - nur bei Heft-Generator-Blättern,
                   // persona-unabhängig wie pdfSourceText, damit printBook() den Text direkt
                   // drucken kann statt über das Canvas-Seitenbild (imgUrl)
  chapterTitle,    // optional: von der KI erkannte Kapitelüberschrift
  tocEntries,      // optional: Array von Kapitelüberschriften, falls Inhaltsverzeichnis-Seite
  excluded,        // optional bool - Seite komplett von Analyse UND Auto-Vorlesen ausgeschlossen
                   // (Leerseiten, Impressum etc., togglePageExcluded) - manuelles Ansehen bleibt möglich
  variants: {
    // bei bookType 'story':
    [personaId]: { text, erstleserText, desc, quizQ, quizA }
    // bei bookType 'workbook' zusätzlich (quizQ/quizA dort null):
    //   { text: Aufgabenstellung, erstleserText: kindgerechte Erklärung,
    //     desc: Blatt-Beschreibung, taskType, materials, helpSteps: [], solution }
  },
  // Erledigt-Häkchen pro Kind-Profil (fehlt bei alten Büchern). NIE direkt lesen,
  // immer über app.progress.isPageDone(page).
  progress: { [profileId]: { done: true, doneAt, sticker } },
  // Letzte Kontrolle des bearbeiteten Blattes, pro Profil - lesen über
  // app.utils.resolvePageCheck(page). thumbUrl ist absichtlich nur die kleine Vorschau,
  // das volle Kontroll-Foto wird NICHT gespeichert (sonst wächst jedes Heft pro Kontrolle).
  check: { [profileId]: { verdict, praise, feedback, hints: [], thumbUrl, checkedAt } },
  // Alte Bücher (vor der Variants-Architektur) haben stattdessen flache Felder
  // text/erstleserText/desc/quizQ/quizA direkt auf der Seite - IMMER über
  // app.utils.resolvePageVariant()/resolveAnyVariant() lesen, nie page.variants direkt.
}
```

**Metadaten-Ansage:** `chapterTitle`/`tocEntries`/`publisher`/`series` sind persona-UNABHÄNGIG (strukturelle Fakten, keine erzählte Variante). `app.tts._buildMetadataAnnouncements()` baut daraus die Ansage-Sätze - nur im automatischen Vorlesemodus, NICHT beim einzelnen 🔊-Button (sonst nervt die Wiederholung). `backCoverPageId`/`authorBioPageId` haben KEIN eigenes KI-Feld - nur eine kurze Ansage-Einleitung, der Text folgt als normaler Seitentext. Nur `titlePageId`/`tocPageId` beeinflussen die KI-Anfrage (`js/api.js`), deshalb löst nur deren Zuweisung in `setPageRole()` eine erneute Analyse aus.

**Die Varianten-Umrechnung liegt an EINER Stelle:** `app.utils.buildPageVariant(result, page, bookType)` - genutzt von `actions/scanner.js` UND `backgroundPregen.js`. Neues Feld nur dort ergänzen.

**Zwei Hilfsfunktionen sind der einzig sichere Weg, Seitentext zu lesen:**
- `app.utils.resolvePageVariant(page, personaId)` - exakt diese Persona, sonst `null`
- `app.utils.resolveAnyVariant(page, preferredPersonaId)` - diese Persona, sonst IRGENDEINE vorhandene (Druck/Buch-Quiz, wo der Text ohnehin persona-unabhängig sein sollte)

**Wichtiges Verhalten:** Beim Scannen/Batch wird NUR die aktuell gewählte Persona generiert (1 API-Call/Seite) - andere Personas entstehen erst on-demand im Reader (5 Personas sofort = 5x Kosten). NICHT eigenmächtig "alle Personas sofort generieren" umbauen - explizit besprochen und verworfen.

## Persona-System

`js/config.js` definiert `app.personas` (`{id, label, instruction, ttsStyle}`). `instruction` steuert, wie die KI **schreibt**, das optionale `ttsStyle`, wie die KI-Stimme **spricht** (fehlt es, dient `instruction` als Rückfall). Neue Persona = neuer Eintrag, taucht automatisch überall auf (Settings/Reader-Dropdown).

Die Persona färbt bei Anbietern mit `supportsStyle` (Gemini, OpenAI) auch die Stimmlage - `app.ttsProviders.styleHintFor()`, abschaltbar in den Einstellungen.

`js/config.js` definiert außerdem `app.bookTypes` (Geschichte/Übungsheft) - hier reicht ein neuer Eintrag NICHT: eine neue Buchart braucht auch einen eigenen Prompt (`js/api.js`) und eine Behandlung in `buildPageVariant` (`js/utils.js`).

Zwei getrennte Konzepte, nicht verwechseln:
- `app.settings.persona` - globale Standard-Persona für neue Scans
- `app.state.readingPersonaId` - nur fürs aktuell geöffnete Buch im Reader, ändert NICHT die globale Einstellung

## Sanity-Checks vor jedem Commit

Diese Checks haben wiederholt echte Bugs vor dem Ausliefern gefangen. Immer laufen lassen:

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

Kein CI/CD - der Nutzer lädt den Ordnerinhalt manuell über die GitHub-Weboberfläche hoch (Drag & Drop), GitHub Pages baut daraus `https://<username>.github.io/<repo>/`. Bei jeder Änderung an gecachten Dateien **`sw.js`'s `CACHE_NAME` hochzählen**, sonst bekommen wiederkehrende Nutzer alte Versionen aus dem Service-Worker-Cache.

## Arbeitsschritt-Varianten bei mehreren parallelen Aufträgen (Branches/PRs)

Mehrere gleichzeitige Claude-Code-Sessions/Branches vergleichen sich nur mit dem `main`-Stand beim Abzweigen, nicht mit dem aktuellen - zwei Branches vom selben Ausgangspunkt wissen nichts voneinander. Beim Zusammenführen entstehen zwei Arten von Kollision:

- **Sichtbare Konflikte** - beide Branches ändern dieselbe Zeile (z.B. `CACHE_NAME`, Versionsnummer), Git meldet das von selbst. Unangenehm, aber ungefährlich.
- **Unsichtbare Brüche** - beide Branches ändern verschiedene, inhaltlich zusammenhängende Stellen, ohne dass Git das merkt. Beispiel: ein Branch führte `book.origin` ein, ein zeitgleicher Branch legte neue Bücher an, ohne davon zu wissen - kein Git-Konflikt, aber die neuen Bücher wären fälschlich vom Video-Export ausgeschlossen gewesen. Das findet nur ein Mensch (oder Claude) beim bewussten Draufschauen, nicht Git.

**Zwei Vorgehen, je nach Lage:**
1. **Nacheinander mergen** - bei klar getrennten Ecken der App: PR 1 mergen, PR 2 per "Update branch" nachziehen, Konflikte lösen, mergen, usw.
2. **Wellen mit Integrationspass** - bei mehreren Branches auf denselben oft angefassten Dateien (`index.html`, `sw.js`, `js/main.js`, diese Datei): alle in einen Sammelzweig mergen, dort **bewusst nach unsichtbaren Brüchen suchen** (nicht nur Konflikte lösen), Sanity-Checks laufen lassen, dann als ein geprüftes Paket nach `main`. In diesem Projekt meist der richtige Weg.

**Regeln:**
- Versionsnummer und `CACHE_NAME` **erst beim Zusammenführen** hochzählen, nicht in jedem Auftrags-Branch (sonst vergeben zwei Branches unabhängig dieselbe Nummer - schon passiert).
- Nach jedem Zusammenführen prüfen, ob neue Felder/Konzepte (wie `book.origin`) auch von den *anderen* gemergten Branches korrekt gesetzt werden.
- Gemergte Branches zeitnah löschen (lokal und auf GitHub).

## Bekannte, bewusste Einschränkungen (nicht versehentlich "reparieren")

- Kein Server, keine Accounts, keine automatische Cloud-Synchronisierung - siehe README "Mögliche nächste Schritte"
- API-Keys im Klartext im Browser - bekannte Grenze der reinen Client-Architektur

## Offene Punkte (Stand zuletzt besprochen)

**Die vollständige, zusammengeführte Liste steht in [`docs/TODO-GESAMT.md`](docs/TODO-GESAMT.md)** (inkl. was mit v0.12.0 schon erledigt ist) - vor dem Einplanen eines Features dort nachsehen.

Größere, noch nicht begonnene Features (brauchen erst Abstimmung mit dem Nutzer):

| Vorhaben | Konzept |
|---|---|
| 🎬 Video: praktisch fertig, nur noch höhere Bildauflösung (`videoUrl`, niedrigste Priorität) offen - Rest seit v0.19.0-beta gebaut, siehe Konzept Abschnitt 4.7 | [`docs/KONZEPT-Video.md`](docs/KONZEPT-Video.md) |
| 🪄 "SchreibZauber" - Stufe 1-6 fertig. Die zweite Einstiegsseite/eigenes Manifest wird laut Nutzerentscheid (Sept. 2026) **nicht gebraucht** - endgültig verworfen, kein offener Punkt mehr (siehe CHANGELOG.md v0.25.0-beta für die ursprüngliche Abwägung) | [`docs/KONZEPT-SchreibZauber.md`](docs/KONZEPT-SchreibZauber.md), [`docs/KONZEPT-Bildquellen.md`](docs/KONZEPT-Bildquellen.md), [`docs/KONZEPT-Comic.md`](docs/KONZEPT-Comic.md) |
| 🎨 KI-Illustrationen (Comic-Stil) für Text-only-EPUB-Kapitel (TEIL A - separates lokales Werkzeug, nicht Teil der PWA). Der SchreibZauber-Comic-Werktyp (TEIL B) ist seit Ausbaustufe 5 fertig | [`docs/KONZEPT-Comic.md`](docs/KONZEPT-Comic.md) |
| 📱 Native Android-App - TWA-Weg gewählt (Paket-ID `app.lesezauber.pro`, Signierschlüssel erzeugt+übergeben, `.well-known/assetlinks.json`/`.nojekyll` im Repo). Noch offen: `bubblewrap init`/`build` tatsächlich ausführen (braucht volle Internetverbindung), Play-Console-Konto einrichten - siehe CHANGELOG.md v0.30.3-beta | [`docs/TODO-GESAMT.md`](docs/TODO-GESAMT.md), Bereich "App & Plattform" |
| 🌍 Mehrsprachigkeit - Buch-Übersetzung in eine Zielsprache + Birkenbihl-Methode (Interlinear-Text, zwei Sprachen übereinander). Noch kein Konzeptpapier, nur aus dem Chat übernommen (Sept. 2026), kein Code | [`docs/TODO-GESAMT.md`](docs/TODO-GESAMT.md), Bereich "Mehrsprachigkeit / Übersetzung" |

**Vor jeder Arbeit an einem dieser Themen erst das verlinkte Dokument lesen** - sonst werden bereits gefallene Entscheidungen neu diskutiert und verworfene Wege erneut probiert.

Diagnose, noch nicht reproduziert: Scroll-Verhalten am Bildschirmrand (Desktop), Zoom/Unschärfe im Fenstermodus - braucht ggf. einen Screenshot vom Nutzer.

Bewusst zurückgestellt (bräuchten einen eigenen Server): API-Key-Absicherung über Backend, automatische Cloud-Synchronisierung, echte Multi-Geräte-Accounts.

## Code-Konventionen

- Kommentare auf **Deutsch** (Zielgruppe: der Projektbetreiber, kein englischsprachiges Team)
- Jede neue/geänderte Codestelle mit kurzem `// NEU:` oder `// FIX:`-Kommentar, der WARUM erklärt, nicht nur was
- Immer `app.utils.sanitize()` verwenden, bevor Nutzer-/KI-Text per `innerHTML` eingefügt wird (XSS-Schutz) - `.innerText`/`.textContent` brauchen das nicht
- Fehler nie stumm verschlucken - mindestens `console.error()`, meist zusätzlich `app.ui.toast(...)`
- Vor dem Vorlesen IMMER `app.utils.stripEmojiForSpeech()` bzw. `speak()` nutzen (nie rohen Text direkt an `SpeechSynthesisUtterance`) - sonst versucht der Browser, Emojis auszusprechen
- **Rückmeldungen an Kinder nie hart formulieren.** Der Kontroll-Prompt (`js/api.js`) verbietet der KI das Wort "falsch", verlangt im Zweifel "fast" bzw. `verdict: "unklar"` bei unklarem Foto - ein Kind, dem fälschlich gesagt wird, es habe sich vertan, verliert die Lust. Beim Anfassen dieses Prompts unbedingt beibehalten.
- Die App hat **keine eigene Spracherkennung** - gesprochene Eingabe läuft über die Mikrofon-Taste der Bildschirmtastatur (Gboard/iOS-Diktat); `app.actions.focusChatInput()` fokussiert nur das Feld und weist darauf hin.

## KI-Stimmen (neuronale TTS)

`app.settings.ttsProvider` entscheidet, wie vorgelesen wird - Standard `'device'` (Gerätestimme). **Alles im Code ruft weiterhin nur `app.tts.speak(text, onEnd, highlightElementId)` auf** - die Weiche zwischen Gerät und KI-Stimme sitzt ausschließlich in `js/tts.js`.

Feste Regeln:
- **Nie ohne Ton enden:** jeder Fehler (Key falsch, Limit, CORS, offline) fällt auf `app.tts.speakWithDevice()` zurück. Endgültige Fehler setzen `app.ttsNeural._disabledReason`, damit nicht jede Seite erneut in dieselbe Wartezeit läuft.
- **Jede Aufnahme kostet Geld/Kontingent:** keine zusätzlichen Synthese-Aufrufe ohne triftigen Grund - der IndexedDB-Zwischenspeicher (`ttsCache`) ist Absicht, nicht Optimierung.
- **`_token`-Zähler beachten:** `stop()` erhöht ihn; jede asynchrone Fortsetzung muss vorher prüfen, ob sie noch aktuell ist - sonst spricht eine abgebrochene Seite verspätet doch noch los.
- Ein einziges `<audio>`-Element für die ganze App (iOS erlaubt Wiedergabe nur bei einem per Fingertipp gestarteten Element).

**Bausteine für den Video-Export** (bewusst getrennt vom Abspielen):
- `app.ttsNeural.renderAudio(text, {personaId})` → `{ text, blob, mime, durationSec, words: [{word, start, end}], exact }`
- `app.ttsNeural.renderPageSegments(bookId, pageIdx, {includeDescription, includeQuiz, onProgress})` → `{ imgUrl, totalDurationSec, segments: [...] }` (Reihenfolge: Text → Bildbeschreibung → Quiz)
- Beide gehen zuerst in den `ttsCache`; Einträge tragen seit v0.10.1 `mime`/`durationSec`, ältere messen die Länge beim ersten Export nach.
- Wort-Zeitpunkte kommen aus derselben `_wordStartTimes()`-Berechnung wie die Reader-Hervorhebung (exakt bei ElevenLabs, sonst über Textlänge geschätzt) - nicht duplizieren.
- **Mit der Gerätestimme unmöglich:** SpeechSynthesis liefert keine Datei - `renderAudio()` wirft bei `ttsProvider === 'device'` einen verständlichen Fehler.

## Versionsstand

Aktuell `v0.30.7-beta` (Anzeige im App-Header) - noch nicht veröffentlicht, aktiv in Entwicklung mit einer echten Nutzerfamilie als Testgruppe. Version bei größeren Änderungen hochzählen (Semantic Versioning: `MAJOR.MINOR.PATCH`, `-beta`-Suffix bis zur ersten öffentlichen Veröffentlichung).

**Die vollständige Versionshistorie (was mit welcher Version kam, inkl. aller Entscheidungen) steht in [`CHANGELOG.md`](CHANGELOG.md), neueste Version zuerst.** Vor dem Einplanen eines Features dort nachsehen, sonst werden bereits gefallene Entscheidungen neu diskutiert. Neuer Eintrag bei jeder Versionserhöhung: oben in `CHANGELOG.md` ergänzen, nicht hier.
