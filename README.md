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
- 🌙 Vollbild-Vorlese-Modus (Bild, Text mit Wort-Hervorhebung + Play/Pause, ideal fürs Bett)
- 🙌 Mitmachmodus: liest den Erstleser-Text vor und pausiert vor jedem durch ein Emoji ersetzten Wort zum Mitraten
- 📖 Zweiseitiges Layout (Option in den Einstellungen): Bild links, Text rechts wie ein aufgeschlagenes Buch - ab Tablet-Breite, auf dem Handy bleibt es immer untereinander
- 📢 Metadaten-Ansage beim automatischen Vorlesen: erkennt Titel/Autor/Verlag/Reihe, Kapitelüberschriften und Inhaltsverzeichnisse (ohne Seitenzahlen) und sagt sie mit kurzer Pause an
- 🏷️ Seiten-Rollen (optional): Titelseite/Rückseite-Klappentext/Inhaltsverzeichnis/Über-den-Autor einer Seite manuell zuordnen, unabhängig von der Scan-Reihenfolge - macht die Metadaten-Ansage zuverlässiger, "Über den Autor" lässt sich vom Vorlesen ausnehmen
- 🚫 Einzelne Seiten (Leerseiten, Impressum etc.) von Analyse UND automatischem Vorlesen ausschließen - spart KI-Anfragen und Vorlese-Zeit
- 🔍 Bibliothekssuche findet jetzt auch nach Verlag/Reihe, nicht nur Titel/Autor
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
- 🗣️ **Echte KI-Vorlese-Stimmen** statt der maschinellen Gerätestimme - wahlweise Gemini (Free Tier), Google Cloud Chirp 3 HD, ElevenLabs oder OpenAI, mit Probe-Anhören, Zwischenspeicher und automatischem Rückfall auf die Gerätestimme (siehe eigenen Abschnitt unten)
- 🌙 Optionale Hintergrund-Vorbereitung: erstellt fehlende Erzähler-Varianten und Buch-Quiz automatisch, wenn gerade nichts läuft (aus-/einschaltbar in den Einstellungen)
- 📝 **Übungsheft-Modus:** Arbeitsblätter statt Geschichten - die KI liest die Aufgabenstellung aus, erklärt sie kindgerecht, gibt eine Schritt-für-Schritt-Hilfe und zeigt auf Wunsch die Lösung. Vorlesen bleibt danach stehen, statt weiterzublättern (das Kind hat ja zu tun). Gedacht für die Schulvorbereitung zu Hause, siehe `docs/uebungshefte-konzept.md`
- 📷 **Blatt kontrollieren lassen:** das Kind fotografiert sein ausgefülltes Übungsblatt, die KI vergleicht es mit Aufgabe und Lösung und gibt eine vorgelesene Rückmeldung (Lob zuerst, dann Tipps - nie "falsch"). Ist alles richtig, wird die Aufgabe automatisch abgehakt; erkennt die KI das Foto nicht sicher, sagt sie das, statt zu raten
- 🎤 **Fragen sprechen statt tippen:** der 🎤-Knopf öffnet die Tastatur, deren Mikrofon-Taste schreibt die gesprochene Frage ins Feld (keine eigene Spracherkennung nötig - funktioniert mit Gboard und iOS-Diktat)
- ✅ **Fortschritt & Belohnung:** jede Seite bzw. Aufgabe abhaken, Sticker dazu, Pokal für ein komplett geschafftes Buch/Heft - getrennt pro Kind-Profil, wandert mit Export/Import mit

## 🗣️ Echte KI-Stimmen statt Roboterstimme

Die eingebaute Handy-Stimme (`SpeechSynthesis`) setzt Sprache aus Silbenbausteinen zusammen - sie klingt deshalb flach und "abgehackt". Unter ⚙️ → **Vorlese-Stimme** lässt sich stattdessen eine neuronale KI-Stimme wählen, die den Text als echte Audiodatei einspricht.

Alles läuft weiterhin ohne eigenen Server: Die App holt die Audiodatei direkt beim Anbieter und spielt sie ab.

### Welcher Anbieter?

| Anbieter | Kosten | Wann sinnvoll? | Key |
|---|---|---|---|
| **Gerätestimme** | kostenlos, offline | Standard. Wenn kein Internet da ist oder nichts extra eingerichtet werden soll. | – |
| **Gemini KI-Stimme** | **Free Tier** (kostenlos, aber wenige Anfragen/Tag) | Zum Ausprobieren ohne neues Konto - nutzt denselben Key wie die Seitenanalyse. | vorhandener Gemini-Key |
| **Google Cloud Chirp 3 HD** | 1 Mio. Zeichen/Monat gratis, danach ca. 30 $/Mio. Zeichen | Der Alltags-Tipp fürs ganze Buch: 1 Mio. Zeichen sind grob mehrere tausend Buchseiten. Braucht ein Google-Cloud-Projekt mit hinterlegter Zahlungsart. | eigener API-Key |
| **ElevenLabs** | 10.000 Zeichen/Monat gratis (privat), bezahlt ab ca. 5 $/Monat | Beste Vorlese-Qualität und als einziger Anbieter zeichengenaue Zeitstempel → die Wort-Hervorhebung läuft exakt mit. | eigener API-Key |
| **OpenAI** | kein Gratis-Kontingent, ca. 1,3 Cent je Minute Audio | Günstig und gut steuerbar - die Erzähler-Persona wird als Sprechanweisung mitgeschickt. | eigener API-Key |

Faustregel: **Gemini** zum kostenlosen Reinschnuppern, **Google Cloud Chirp 3 HD** für den Dauerbetrieb, **ElevenLabs**, wenn es besonders schön klingen soll.

### Was die App dabei mitmacht

- **Stimmen-Speicher:** Jede erzeugte Aufnahme landet in der lokalen Datenbank. Dieselbe Seite ein zweites Mal vorlesen kostet dann kein Kontingent mehr und startet sofort. Abschaltbar; Belegung und "Leeren"-Knopf stehen direkt darunter.
- **Vorbereitung im Hintergrund:** Während eine Seite vorgelesen wird, entsteht die Audiodatei der nächsten Seite schon - so bleibt beim Umblättern keine Stille.
- **Rückfall:** Kein Internet, Tageslimit erreicht oder Key falsch? Dann springt automatisch die Gerätestimme ein, mit einem kurzen Hinweis - das Vorlesen bricht nie einfach ab.
- **Wort-Hervorhebung:** Läuft auch bei KI-Stimmen mit. Bei ElevenLabs zeichengenau, bei den übrigen Anbietern anhand der Audiolänge geschätzt.
- **Persona-Stimmlage:** Bei Gemini und OpenAI wird die gewählte Erzähler-Persona als Sprechanweisung mitgeschickt - die "Gute-Nacht-Fee" klingt dann tatsächlich sanfter als der "Weise Professor".
- **Vorbereitet für den Video-Export:** Die Aufnahmen liegen als echte Dateien inklusive Länge und Wort-Zeitpunkten vor (`app.ttsNeural.renderAudio()` / `renderPageSegments()`). Damit lässt sich später ein Video aus Buchseite + Stimme + mitlaufenden Untertiteln bauen, ohne dass dafür noch einmal Kontingent verbraucht wird. Mit der Gerätestimme geht das nicht - die spricht direkt über den Lautsprecher und gibt keine Datei heraus.

### Einrichten

1. ⚙️ Einstellungen → **Vorlese-Stimme** → Anbieter wählen
2. API-Key eintragen (bei Gemini nicht nötig - der Key von oben wird mitbenutzt)
3. Stimme auswählen und auf **🔊 Stimme testen** tippen. Der Test sagt direkt, ob der Key funktioniert.
4. Speichern.

> **Hinweis zu ElevenLabs:** Der Anbieter rät von API-Keys direkt im Browser ab und kann Browser-Zugriffe sperren. Meldet der Test "vom Browser aus nicht erreichbar", liegt es daran - dann bleiben Google Cloud oder OpenAI als Alternativen. Eigene/geklonte Stimmen aus dem eigenen Konto lassen sich per Knopf nachladen.

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
  config.js              Erzähler-Personas (hier neue Persona ergänzen) + Bucharten
  state.js               Laufzeit-Zustand & Einstellungen
  db.js                   Speichern/Laden (IndexedDB)
  profiles.js             Lokale Profile (kein Login/Server nötig)
  nav.js                  Ansichten-Router
  api.js                  Google-Gemini-Anfragen
  tts.js                  Sprachausgabe inkl. Auto-Vorlese-Modus (Weiche Gerät/KI-Stimme)
  ttsProviders.js         KI-Stimmen-Anbieter (Gemini, Google Cloud, ElevenLabs, OpenAI)
  ttsNeural.js            Abspielen, Zwischenspeicher & Wort-Hervorhebung der KI-Stimmen
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
    workbook.js            Übungsheft-Modus (Buchart umschalten, Lösung aufdecken)
    progress.js            Erledigt-Häkchen, Sticker, Belohnungen (pro Profil)
    checkWork.js           Bearbeitetes Blatt fotografieren und kontrollieren lassen
  render/
    library.js             Bibliotheks-Ansicht + Suche
    book.js                 Buch-Detail-Ansicht
    reader.js                Lese-Ansicht
    settings.js               Einstellungen-Ansicht
    workbook.js               Hilfe-/Lösungs-Karte und Art-Umschalter
    progress.js               Fortschrittsbalken, Erledigt-Knopf, Belohnungen
    checkWork.js              Ergebniskarte der Blatt-Kontrolle
  vendor/
    pdfjs/                  PDF.js (Mozilla) - wird nur bei PDF-Import nachgeladen
main.js                  Bindet alle Module zusammen und startet die App
docs/
  ROADMAP.md               Konzepte & offene Entscheidungen für die nächsten Schritte
  uebungshefte-konzept.md  Konzept: Bibel-Übungshefte zur Schulvorbereitung
  todo-heft-generator.md   Offenes To-Do: Übungsblätter von der KI erstellen lassen
```

**Neue Funktion hinzufügen?** In der Regel reicht eine neue Datei unter `js/actions/` oder `js/render/`, die in `js/main.js` importiert wird – der Rest des Codes muss dafür nicht angefasst werden.

## ⚠️ Bekannte Grenzen

- Alle Daten liegen im Browser des jeweiligen Geräts (IndexedDB) – kein automatischer Abgleich zwischen mehreren Geräten. Für den Umzug auf ein neues Gerät: Export/Import unter ⚙️ nutzen.
- Der Gemini-API-Key liegt im Klartext im Browser des Geräts (kein eigener Server dazwischen). Das gilt genauso für die Keys der KI-Stimmen-Anbieter - deshalb dort möglichst Keys mit knappem Budget/Limit verwenden.
- Neue Seiten scannen/analysieren braucht Internet (die KI-Auswertung läuft über Gemini bzw. Mistral). Die App selbst und bereits analysierte Bücher funktionieren dank Service Worker auch offline - Tailwind liegt seit dem eigenen Build lokal mit im Cache.
- KI-Stimmen brauchen Internet. Bereits gespeicherte Aufnahmen (Stimmen-Speicher) spielen auch offline; für alles andere übernimmt automatisch die Gerätestimme.
- iOS Safari kann Website-Speicher (auch IndexedDB) nach langer Inaktivität automatisch löschen, wenn die Seite nicht zum Homescreen hinzugefügt wurde – regelmäßiger Export ist deshalb weiterhin empfehlenswert.

## 🗺 Mögliche nächste Schritte

> **Ausführliche Konzepte, offene Entscheidungen und eine Kostenübersicht stehen in [`docs/ROADMAP.md`](docs/ROADMAP.md).** Die Liste hier ist nur die Kurzfassung.

**Bleibt komplett im Browser (kein Server nötig):**
- 🎨 KI-generierte Illustrationen für textlastige EPUB-Kapitel ohne eigenes Bild, optional im Comic-Stil (Gemini kann mittlerweile auch Bilder erzeugen, gleicher Key wie bisher) - Cover-Bild-Sonderfall erstmal nicht nötig
- 📱 Native App / Android-Store-Verpackung (Capacitor) - verpackt den bestehenden Code weitgehend unverändert
- 📝 **Heft-Generator**: Übungsblätter von der KI erstellen lassen (Geschichte + Lernziel auswählen) - Entwurf und offene Punkte in `docs/todo-heft-generator.md`
- 🎬 **Video-Export** (Seite + KI-Stimme als Videodatei). Vorarbeit ist erledigt: Audiodatei, Länge und Wort-Zeitpunkte je Seite liefert `app.ttsNeural.renderPageSegments()`, das Seitenbild liegt ohnehin vor. Offen ist nur noch das Zusammensetzen im Browser (Bild auf ein Canvas zeichnen, Untertitel einblenden, mit `MediaRecorder` aufnehmen) - und die Entscheidung, ob pro Seite oder ein Video fürs ganze Buch. Setzt eine KI-Stimme voraus.

**Bräuchte einen eigenen Server** (aktuell bewusst zurückgestellt):
- API-Key über ein Backend absichern
- Automatische Cloud-Synchronisierung (statt manuellem Export/Import)
- Echte Multi-Geräte-Accounts mit Login

## 🧑‍💻 Technologie

Reines HTML/CSS/JavaScript (ES-Module), [Tailwind CSS](https://tailwindcss.com/) (eigener Build, kein CDN), [Google Gemini API](https://ai.google.dev/) für die Bildanalyse, [PDF.js](https://mozilla.github.io/pdf.js/) für den PDF-Import, [JSZip](https://stuk.github.io/jszip/) für den EPUB-Import. Kein Server, kein Backend - läuft komplett im Browser.
