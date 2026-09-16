# CLAUDE.md

Diese Datei gibt Claude Code Kontext für die Arbeit an diesem Projekt. Sie liegt im Repository-Root und wird automatisch gelesen.

## Projektüberblick

**LeseZauber Pro** ist eine Web-App (PWA), mit der man Kinderbuch-Seiten fotografiert/importiert (Foto, Galerie, PDF, EPUB) und sich per KI (Gemini, optional Mistral-Fallback) automatisch vorlesen, vereinfachen ("Erstleser"-Modus mit Emojis) und erklären lässt (Bildbeschreibung, Quizfragen, Vokabeltrainer).

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
| `js/db.js` | IndexedDB-Speicher-Engine (`app.library`, `app.vocabulary`). **Version 2** - beim Hinzufügen eines neuen Object Stores `DB_VERSION` erhöhen und `onupgradeneeded` erweitern |
| `js/nav.js` | Router zwischen den `<main id="view...">`-Ansichten |
| `js/api.js` | Gemini/Mistral-Aufrufe, der komplette Analyse-Prompt lebt hier |
| `js/tts.js` | Sprachausgabe: Auto-Vorlesen, Wort-Hervorhebung (SpeechSynthesis `boundary`-Event), kombinierter Rätsel-Modus |
| `js/profiles.js` | Lokale Profile (kein Server/Login), inkl. `__all__`-Sonderfilter |
| `js/backgroundPregen.js` | Opt-in Hintergrund-Vorbereitung fehlender Persona-Varianten/Buch-Quiz |
| `js/keyboard.js`, `js/gestures.js` | Desktop-Tastatur bzw. Touch-Wisch-Navigation im Reader |
| `js/actions/scanner.js` | Kamera, Foto-Aufnahme, Galerie-Import, **die zentrale `analyzePage()`-Funktion** |
| `js/actions/pdfImport.js`, `epubImport.js` | Datei-Import, beide nutzen lazy-geladene Vendor-Libs |
| `js/vendor/` | PDF.js und JSZip - NIE direkt bearbeiten, nur austauschen/aktualisieren |
| `sw.js` | Service Worker - **`CACHE_NAME`-Version bei jeder Datei-Änderung hochzählen**, neue Dateien zur `APP_SHELL`-Liste hinzufügen |

## Datenmodell (zentral, viel hängt davon ab)

**Ein Buch** (`app.library[bookId]`):
```js
{
  id, title, author, created, profileId, lastReadIdx, lastReadAt,
  coverPageId,       // Seiten-ID (nicht Index!) des gewählten Covers
  bookQuiz: { questions: [{question, answer}] },  // optional, gecacht
  pages: [ ... ]
}
```

**Eine Seite** - WICHTIG: seit der Persona-Architektur NICHT mehr flache Text-Felder, sondern:
```js
{
  id, imgUrl, thumbUrl,  // WebP, zwei Größen
  status: 'pending' | 'processing' | 'done' | 'error',  // persona-UNABHÄNGIG
  pdfSourceText,   // optional: garantiert korrekter Text aus PDF/EPUB-Textebene, kein OCR nötig
  variants: {
    [personaId]: { text, erstleserText, desc, quizQ, quizA }
  },
  // Alte Bücher (vor der Variants-Architektur) haben stattdessen flache
  // Felder text/erstleserText/desc/quizQ/quizA direkt auf der Seite -
  // IMMER über app.utils.resolvePageVariant()/resolveAnyVariant() lesen,
  // nie page.variants direkt, sonst bricht Rückwärtskompatibilität.
}
```

**Zwei Hilfsfunktionen sind der einzig sichere Weg, Seitentext zu lesen:**
- `app.utils.resolvePageVariant(page, personaId)` - exakt diese Persona, sonst `null`
- `app.utils.resolveAnyVariant(page, preferredPersonaId)` - diese Persona, sonst IRGENDEINE vorhandene (für Fälle wie Druck/Buch-Quiz, wo der Originaltext ohnehin persona-unabhängig sein sollte)

**Wichtiges Verhalten:** Beim Scannen/Batch wird NUR die aktuell gewählte Persona generiert (1 API-Call/Seite). Andere Personas entstehen erst on-demand, wenn im Reader dorthin gewechselt wird (siehe `render/reader.js`) - das ist bewusst so (5 Personas sofort = 5x API-Kosten). NICHT eigenmächtig "alle Personas sofort generieren" umbauen, das wurde explizit mit dem Nutzer besprochen und verworfen.

## Persona-System

`js/config.js` definiert `app.personas` (Array von `{id, label, instruction}`). Neue Persona = neuer Eintrag dort, taucht automatisch überall auf (Settings-Dropdown, Reader-Dropdown), keine weiteren Code-Änderungen nötig.

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

## Bekannte, bewusste Einschränkungen (nicht versehentlich "reparieren")

- Kein Server, keine Accounts, keine automatische Cloud-Synchronisierung - bewusst so, siehe README "Mögliche nächste Schritte"
- API-Keys im Klartext im Browser - bekannte Grenze der reinen Client-Architektur
- Vollbild-Vorlese-Modus zeigt aktuell nur das Bild, keinen Text (offener Punkt, kein Bug)
- Zweiseitiges Desktop-Layout (Bild links/Text rechts) noch nicht umgesetzt

## Offene Punkte (Stand zuletzt besprochen)

Größere, noch nicht begonnene Features (brauchen erst Abstimmung mit dem Nutzer, nicht einfach lospreschen):
- Vollbild-Modus: Text + Hervorhebung ergänzen
- Zweiseitiges Buch-Layout für PC/Tablet
- "Mitmachmodus": Sprechpause vor jedem durch Emoji ersetzten Wort
- Strukturierte Metadaten-Ansage (Titel/Autor/Verlag/Kapitel vom Erzähler angekündigt)
- KI-generierte Illustrationen (Comic-Stil) für Text-only-EPUB-Kapitel via Gemini-Bildgenerierung
- "SchreibZauber": eigener Schreib-/Generierungs-Bereich für selbst erstellte Bilderbücher, Comics/Hefte und Arbeitshefte - Konzept liegt fertig unter `docs/KONZEPT-SchreibZauber.md` (inkl. Entscheidung Tab vs. eigene App, Datenmodell, Ausbaustufen, offene Fragen)
- Native Android-App via Capacitor (Play Store, ggf. Samsung/Amazon Store)
- Diagnose: Scroll-Verhalten am Bildschirmrand (Desktop), Zoom/Unschärfe im Fenstermodus - noch nicht reproduziert, braucht ggf. Screenshot vom Nutzer

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

## Versionsstand

Aktuell `v0.9.0-beta` (Anzeige im App-Header) - noch nicht veröffentlicht, aktiv in Entwicklung mit einer echten Nutzerfamilie als Testgruppe. Zähl die Version bei größeren Änderungen entsprechend hoch (Semantic Versioning: `MAJOR.MINOR.PATCH`, `-beta`-Suffix bis zur ersten öffentlichen Veröffentlichung).
