# 📖 LeseZauber Pro

## 🎓 Für Einsteiger: Was ist das hier eigentlich?

LeseZauber Pro ist eine **Web-App** – eine Anwendung, die komplett im Browser läuft, sich dank **PWA** (Progressive Web App, siehe Abschnitt "Live nutzen") aber wie eine echte, installierbare App anfühlt.

Jede Webseite besteht aus drei "Zutaten": **HTML** (die Struktur – welche Buttons, Bilder, Texte gibt es), **CSS** (das Aussehen – bei uns größtenteils durch [Tailwind](#-technologie) erledigt) und **JavaScript** (das Verhalten – was passiert bei Klicks). Unser JavaScript ist **modularisiert**: viele kleine, klar benannte Dateien statt einer riesigen, die sich alle an ein gemeinsames Kernobjekt (`app`, definiert in `js/core.js`) hängen. Mehr dazu unter [Projektstruktur](#-projektstruktur).

Deine gescannten Bücher liegen in **IndexedDB**, einer im Browser eingebauten kleinen Datenbank – komplett lokal auf deinem Gerät, kein eigener Server nötig. Für die KI-Auswertung (Text erkennen, vereinfachen, Quizfragen) schickt die App ein Foto an die **Gemini-API** von Google – eine Schnittstelle, über die man ein KI-Modell aus eigenem Code heraus ansprechen kann.

Eine Web-App, mit der du Kinderbuch-Seiten mit dem Handy fotografierst (oder aus der Galerie importierst) und dir von einer KI (Google Gemini) automatisch vorlesen, vereinfachen und erklären lässt.

## ✨ Funktionen

- 📸 Buchseiten per Kamera fotografieren oder aus der Galerie importieren
- 🤖 Automatische Texterkennung, vereinfachte "Erstleser"-Version, Bildbeschreibung & Quizfrage pro Seite (Google Gemini)
- 🔊 Vorlesen per Handy-Sprachausgabe – einzeln oder automatisch Seite für Seite
- 🧙‍♂️ Chat: Fragen zum Bild stellen, die KI antwortet
- 🎭 Wählbare Erzähler-Persona (z.B. "Lustiger Papa", "Weiser Professor")
- 🔍 Suche in der Bibliothek
- ⭐ Cover selbst festlegen, Seiten per Buttons neu sortieren
- ↩️ Löschen rückgängig machen, einzelne fehlgeschlagene Seiten erneut analysieren
- ▶️ "Weiterlesen" an der zuletzt geöffneten Seite
- 📤📥 Bibliothek als Datei sichern & wiederherstellen (Export/Import)
- 💾 Speicherung in IndexedDB (deutlich höheres Speicherlimit als der Browser-Standardspeicher)
- 👤 Lokale Profile (z.B. pro Kind), rein auf dem Gerät, ohne Login
- 📥 Einzelne Bücher als Datei herunterladen (weiterhin voll bearbeitbar nach erneutem Import)
- 📲 Installierbar als App (PWA) – inkl. Offline-Zugriff auf bereits gescannte Bücher
- 🖼️ Platzsparende Bilder: WebP-Format in zwei Größen (Lesegröße + kleine Vorschau)
- 🔤 Sortierbare Bibliothek (neueste/älteste/A-Z), Profile umbenennen/löschen
- ♿ aria-labels an Icon-Buttons, Speicherplatz-Anzeige in den Einstellungen
- ♿ aria-live für Toasts, reduzierte Bewegung respektiert (prefers-reduced-motion), kontrastreicherer Text
- 🔧 Kompaktes "⋮"-Menü statt vieler Icons pro Seiten-Karte, Suche mit Debounce
- 📱 Responsive: nutzt auf Tablet/Desktop mehr Spalten und Breite statt nur im Handy-Format
- 🌙 Vollbild-Vorlese-Modus (nur Bild + Play/Pause, ideal fürs Bett)
- 🖨️ Buch drucken (einfache Druckansicht mit Bild + Text pro Seite)
- 🔥 Lese-Serie pro Profil, 👋 persönliche Begrüßung mit "Weiterlesen"-Karte
- 💾 Sanfte Erinnerung, wenn lange kein Backup mehr gemacht wurde
- 🗣️ Alle Systemstimmen wählbar (nicht nur Deutsch) - Sprache passt sich automatisch der gewählten Stimme an, z.B. für fremdsprachige Bücher
- 📄 PDF-Import: jede PDF-Seite wird automatisch als Bild gerendert und läuft durch dieselbe Analyse wie fotografierte Seiten
- ✅ Bereits auswählbarer PDF-Text wird direkt übernommen statt per OCR neu erkannt zu werden (fehlerfrei, spart aber keinen KI-Aufruf, da Bildbeschreibung/Quiz weiterhin nötig sind)
- 🔄 Optionaler Mistral-Fallback, falls Gemini mal ausfällt oder das Tageslimit erreicht ist
- ♻️ Automatischer zweiter Versuch bei kurzzeitiger Google-Server-Überlastung (503), statt den ganzen Analyse-Stapel abzubrechen
- 🎓 Vokabeltrainer: sammelt automatisch die Nomen, die durch Emojis ersetzt wurden, als Karteikarten zum Üben
- ❓ Eingebaute Hilfe-Ansicht, ⌨️ Tastatursteuerung am Desktop (Pfeiltasten, Escape)
- ✓ Zeigt im Reader an, welche Personas für die aktuelle Seite schon vorbereitet sind
- 🌙 Dark Mode (folgt automatisch der Systemeinstellung)
- 👆 Wisch-Gesten im Reader (zusätzlich zu Buttons/Pfeiltasten)
- 📚 EPUB-Import: liest den Text direkt aus (kein OCR nötig), nutzt das erste Bild pro Kapitel oder rendert den Text als Ersatzbild
- 🔤 Wort-für-Wort-Hervorhebung beim Vorlesen (Speedreader-Stil), einstellbare Vorlesegeschwindigkeit
- 🧠 Kombinierter Modus: automatisches Vorlesen inkl. Rätselfragen mit Rate-Pause
- 🎨 Farbauswahl für die Wort-Hervorhebung, mehrere Bugfixes aus dem 15.09.-Feedback (Persona-Wechsel-Erkennung bei "Alle analysieren", Seitenzahl-Aussprache entfernt, Original-Text beim Vorlesen, "Alle Profile"-Filter gegen unsichtbare Bücher, Online/Offline-Anzeige, Versionsnummer)
- 🎭 Persona beim Lesen umschaltbar (unabhängig von der Standard-Persona), wird pro Seite bei Bedarf einmalig nachgeladen und dauerhaft gespeichert
- 🎉 Verständnisfragen zum gesamten Buch am Ende (nicht nur pro Seite)
- ⚡ Eigener Tailwind-Build statt CDN (schnelleres Laden, kein Live-Compiling im Browser)
- 🌙 Optionale Hintergrund-Vorbereitung: erstellt fehlende Erzähler-Varianten und Buch-Quiz automatisch, wenn gerade nichts läuft (aus-/einschaltbar in den Einstellungen)

## 🚀 Live nutzen

Diese App läuft komplett im Browser – es gibt keinen eigenen Server, alle Daten (Bücher, Fotos) bleiben lokal auf dem jeweiligen Gerät gespeichert (IndexedDB, eine im Browser eingebaute Datenbank).

1. API-Key kostenlos holen: [Google AI Studio](https://aistudio.google.com/app/apikey)
2. App öffnen (z.B. über die GitHub-Pages-Adresse dieses Repos)
3. Unter ⚙️ Einstellungen den API-Key eintragen
4. Loslegen: Buch anlegen und erste Seite fotografieren

## ☁️ Backup über Google Drive

Die App synchronisiert nicht automatisch mit der Cloud - Export/Import unter ⚙️ Einstellungen ist der Weg dafür. So landet eine Export-Datei bequem in Google Drive:

**Am Handy (Android oder iPhone):**
1. ⚙️ Einstellungen → "📤 Exportieren" antippen - die Datei wird heruntergeladen
2. Über die normale "Teilen"-Funktion des Handys (oder die Download-Benachrichtigung) → **Google Drive** als Ziel auswählen
3. Fertig - die Datei liegt in Drive, abrufbar von jedem Gerät mit demselben Google-Konto

**Am PC/Laptop:**
1. ⚙️ Einstellungen → "📤 Exportieren" - Datei landet im Download-Ordner
2. Auf **drive.google.com** einloggen, "Neu" → "Datei-Upload" → die exportierte Datei auswählen

**Wiederherstellen** (neues Gerät oder nach Datenverlust): Datei aus Drive herunterladen, dann in LeseZauber unter ⚙️ → "📥 Importieren" auswählen - alle Bücher sind wieder da und genauso bearbeitbar wie vorher.

## 🛠 Lokal entwickeln

Der Code nutzt JavaScript-Module (`<script type="module">`), daher **funktioniert die Datei nicht per Doppelklick** (`file://`) – es braucht einen simplen lokalen Server:

```bash
# Im Projektordner ausführen:
python3 -m http.server 8000
```

Danach im Browser `http://localhost:8000` öffnen. Alternative: VS Code mit der Erweiterung "Live Server" (Rechtsklick auf `index.html` → "Open with Live Server").

> Für Kamera-Zugriff verlangt der Browser HTTPS oder `localhost` – ein normales `http://` auf einem anderen Rechner im Netzwerk funktioniert dafür nicht.

**Tailwind-CSS neu bauen** (nur nötig, wenn neue Tailwind-Klassen im Code dazukommen und sich das Aussehen dadurch ändern soll):
```bash
npm install -D tailwindcss @tailwindcss/cli
npx @tailwindcss/cli -i ./css/tailwind-input.css -o ./css/tailwind.css --minify
```
`css/tailwind-input.css` enthält die Marken-Farben-Erweiterung, `css/tailwind.css` ist die fertige, ausgelieferte Datei.

## 📁 Projektstruktur

```
index.html              Grundgerüst & Markup aller Ansichten
css/style.css           Eigene Styles (Tailwind kommt per CDN)
js/
  core.js               Zentrales app-Objekt, an das sich alle Module hängen
  config.js              Erzähler-Personas (hier neue Persona ergänzen)
  state.js               Laufzeit-Zustand & Einstellungen
  db.js                   Speichern/Laden (IndexedDB)
  profiles.js             Lokale Profile (kein Login/Server nötig)
  nav.js                  Ansichten-Router
  api.js                  Google-Gemini-Anfragen
  tts.js                  Sprachausgabe inkl. Auto-Vorlese-Modus
  ui.js                   Toast-Meldungen & Ladeanzeige
  utils.js                Hilfsfunktionen (Bildverkleinerung, Sanitizing, Cover)
  readerUI.js             Tab-Umschaltung im Reader
  settingsConfig.js       Einstellungen speichern
  actions/
    scanner.js            Kamera, Fotoaufnahme, KI-Analyse
    reader.js              Löschen, Cover setzen, Zauberer-Chat
    reorder.js             Seiten verschieben
    backup.js              Export/Import/Druck der Bibliothek
    bookQuiz.js            Verständnisfragen zum ganzen Buch
    focusMode.js           Vollbild-Vorlese-Modus, Backup-Erinnerung
    pdfImport.js           PDF-Import (rendert Seiten als Bilder)
  render/
    library.js             Bibliotheks-Ansicht + Suche
    book.js                 Buch-Detail-Ansicht
    reader.js                Lese-Ansicht
    settings.js               Einstellungen-Ansicht
  vendor/
    pdfjs/                  PDF.js (Mozilla) - wird nur bei PDF-Import nachgeladen
main.js                  Bindet alle Module zusammen und startet die App
```

**Neue Funktion hinzufügen?** In der Regel reicht eine neue Datei unter `js/actions/` oder `js/render/`, die in `js/main.js` importiert wird – der Rest des Codes muss dafür nicht angefasst werden.

## ⚠️ Bekannte Grenzen

- Alle Daten liegen im Browser des jeweiligen Geräts (IndexedDB) – kein automatischer Abgleich zwischen mehreren Geräten. Für den Umzug auf ein neues Gerät: Export/Import unter ⚙️ nutzen.
- Der Gemini-API-Key liegt im Klartext im Browser des Geräts (kein eigener Server dazwischen).
- Kein Offline-Modus (Tailwind-CSS und die KI-Analyse brauchen eine Internetverbindung).
- iOS Safari kann Website-Speicher (auch IndexedDB) nach langer Inaktivität automatisch löschen, wenn die Seite nicht zum Homescreen hinzugefügt wurde – regelmäßiger Export ist deshalb weiterhin empfehlenswert.

## 🗺 Mögliche nächste Schritte

**Bleibt komplett im Browser (kein Server nötig):**
- 🪄 **SchreibZauber** - eigener Bereich zum Schreiben und Illustrieren eigener Bilderbücher, Comics/Hefte und Kinder-Arbeitshefte. Ausführliches Konzept: [`docs/KONZEPT-SchreibZauber.md`](docs/KONZEPT-SchreibZauber.md)
- 🎨 KI-generierte Illustrationen für textlastige EPUB-Kapitel ohne eigenes Bild, optional im Comic-Stil (Gemini kann mittlerweile auch Bilder erzeugen, gleicher Key wie bisher) - Cover-Bild-Sonderfall erstmal nicht nötig
- 📱 Native App / Android-Store-Verpackung (Capacitor) - verpackt den bestehenden Code weitgehend unverändert
- 🎬 Video-Export (Seite + KI-Stimme als Videodatei) - der aufwändigste offene Punkt, braucht eine Sprach-API mit echter Audiodatei-Ausgabe (z.B. ElevenLabs)

**Bräuchte einen eigenen Server** (aktuell bewusst zurückgestellt):
- API-Key über ein Backend absichern
- Automatische Cloud-Synchronisierung (statt manuellem Export/Import)
- Echte Multi-Geräte-Accounts mit Login

## 🧑‍💻 Technologie

Reines HTML/CSS/JavaScript (ES-Module), [Tailwind CSS](https://tailwindcss.com/) (eigener Build, kein CDN), [Google Gemini API](https://ai.google.dev/) für die Bildanalyse, [PDF.js](https://mozilla.github.io/pdf.js/) für den PDF-Import, [JSZip](https://stuk.github.io/jszip/) für den EPUB-Import. Kein Server, kein Backend - läuft komplett im Browser.
