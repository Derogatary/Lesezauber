# 🎨 Konzept: Comic & KI-Illustrationen

**Stand:** 16.09.2026 · **Status:** Konzeptphase, erster Testlauf gemacht ·
**Umgezogen von:** `COMIC-ADAPTION-TODO.md` (Repo-Root) nach `docs/`, September 2026,
für einheitliche Ablage aller Konzeptpapiere.

**Noch nichts von alledem ist implementiert** - das hier ist die Diskussions- und
Entscheidungslage, kein Code-Stand.

---

## 0. Zwei getrennte Vorhaben, die dieselbe Technik brauchen

Zwei unterschiedliche Anlässe für KI-generierte Bilder im Comic-/Illustrationsstil
laufen im Projekt parallel und werden hier bewusst **nicht** vermischt, weil sie
unterschiedliche Architekturen brauchen:

| | **A. Illustrationen für vorhandene Bücher** (dieses Dokument) | **B. Comic/Heft als eigenes Werk** ([`KONZEPT-SchreibZauber.md`](KONZEPT-SchreibZauber.md)) |
|---|---|---|
| **Anlass** | Ein importiertes Text-only-EPUB-Kapitel hat kein Bild | Ein Kind will von Grund auf einen eigenen Comic erstellen lassen |
| **Architektur** | **Separates lokales Node-Werkzeug** (`tools/comic-gen/`), nicht Teil der PWA | **In-Browser**, Teil der SchreibZauber-Werkstatt |
| **Warum die unterschiedliche Architektur?** | Freie Modellwahl gewünscht (Flux, lokale GPU) - viele Bild-Anbieter erlauben keine CORS-Aufrufe aus dem Browser | Bleibt bei Gemini (CORS-fähig), läuft also problemlos im Browser wie der Rest der App |
| **Ergebnis** | Ein normales Buch-JSON zum Import in LeseZauber | Ein Projekt in der Werkstatt, am Ende „ins Regal gestellt" |

**Was beide teilen** und deshalb hier an einer Stelle gesammelt ist: Figurenkonsistenz,
Prompt-Aufbau für Comic-Stil-Bilder, die Lektion zu Sprechblasen/Panelrahmen (Abschnitt
5) - diese Erkenntnisse gelten für **beide** Vorhaben. Wo SchreibZauber dieselbe Technik
braucht, wird unten verwiesen statt dupliziert.

**Konkreter Fund, der auf SchreibZauber übertragen gehört:** `KONZEPT-SchreibZauber.md`
Abschnitt D.4 weist der KI aktuell an: *"Keine Sprechblasen zeichnen."* Genau diese
Formulierung hat im Testbild unten (Abschnitt 5) das Gegenteil bewirkt - das Modell hat
trotzdem eine Sprechblase gemalt, vermutlich **weil** das Wort im Prompt vorkam. Die
positiv formulierte Alternative aus Abschnitt 5 sollte beim Bau von SchreibZauber Stufe 5
(Comic) direkt übernommen werden, statt denselben Fehler dort noch einmal zu machen.

---

# TEIL A – Illustrationen für Text-only-EPUB-Kapitel

## Status: Konzeptphase

Ein Testbild wurde manuell über die Gemini-App erzeugt und hat zwei
Prompt-Probleme aufgedeckt (siehe Abschnitt 5). Als Nächstes steht ein
zweiter Testlauf mit dem korrigierten Wortlaut an, bevor die
Kategorien-JSON und das Generator-Skript gebaut werden.

## 1. Architekturentscheidung: separates lokales Werkzeug, keine PWA-Änderung

- LeseZauber Pro bleibt unverändert - reiner Reader, kein Server, kein Proxy.
- Comic-Erzeugung läuft als eigenes kleines Node-Werkzeug lokal auf dem
  Rechner des Betreibers (`tools/comic-gen/` oder eigenes Repo, nicht deployed).
  Grund: Browser-Apps dürfen nur APIs ansprechen, die CORS erlauben (Gemini
  tut das, viele andere Bild-Anbieter nicht) - ein Server-Proxy wäre nötig,
  um im Browser andere Anbieter als Gemini zu nutzen. Läuft die Erzeugung
  stattdessen lokal (kein Browser beteiligt), entfällt das Problem
  komplett, und die Modellwahl ist frei (Flux, lokale GPU, etc.).
- Empfehlung: eigener Gemini-API-Key/eigenes Google-Cloud-Projekt fürs
  Generator-Werkzeug, getrennt vom Key der App - Rate-Limits gelten pro
  Modell, aber der Textmodell-Anteil wird sich sonst mit der laufenden
  App geteilt (ein langer Batch-Lauf könnte die Kinder-App mit 429 blockieren).
- Übergabe ans Werkzeug + zurück: über ein synchronisiertes Ordner-Paar
  (z. B. Syncthing/Dropbox) statt Netzwerk-Server, falls der Betreiber
  selten am Generierungs-Rechner sitzt.

## 2. Datenmodell / Ausgabeformat

Kein neues Format nötig - ein Comic-Panel ist einfach eine normale
LeseZauber-Seite mit Bild + Text:

- **Ein Panel = eine Seite** im Datenmodell (nicht eine ganze Comicseite
  mit mehreren Panels als eine App-Seite) - Wischen im Reader = Panel für
  Panel, Vorlesen/Personas/Quiz funktionieren unverändert.
- Ausgabe als Buch-JSON im bestehenden `downloadBook()`/`importLibrary()`-
  Format (`{id, title, pages: [...]}`), `pdfSourceText` je Panel setzen,
  damit nie OCR versucht wird.
- Für den späteren Druck (`printBook()` in `js/actions/backup.js`) muss
  jedes Panel schon beim Erzeugen ein Layout-Tag mitbekommen (siehe
  Panel-Raster unten) - das nachträglich zu vergeben wäre reine Handarbeit.

## 3. Kosten (Stand der Recherche, Bild-API-Preise ändern sich laufend)

- Textteil (Skript-Zerlegung, Konsistenz-Check): Cent-Bereich pro Buch (Sonnet 5 $2/$10 pro Mio. Token).
- Bildgenerierung dominiert: Gemini Nano Banana ~0,04 $/Bild, Nano Banana Pro ~0,13-0,24 $/Bild.
- Gemini Free Tier: ~500 Bilder/Tag möglich, aber 2 Bilder/Minute Rate-Limit -
  für ein Buch mit 50-100 Panels praktisch kostenlos, dauert nur entsprechend lange.
- Lokale Erzeugung (siehe unten) ist nicht kostenlos, sondern nur ohne API-Kosten -
  Stromkosten ca. 0,60 €/Buch bei einem Kontext-Modell-Lauf über mehrere Stunden.

## 4. Lokale GPU-Option (Notiz zur Hardware des Betreibers: RTX 2080 Super, 8 GB VRAM, 32 GB RAM)

- Turing-Architektur, kein FP8 - GGUF-Quantisierung + `--lowvram`/Offloading
  ins System-RAM ist der Weg, nicht die schnellen fp8-Pfade neuerer Karten.
- FLUX.2 [klein] 4B (~2,6 GB) läuft bequem, FLUX.1 Kontext [dev] (~7 GB,
  bestes Konsistenz-Werkzeug für "gleiche Figur, andere Pose") läuft knapp,
  deutlich langsamer.
- Größeres Hindernis als die Hardware: der Betreiber ist selten an diesem
  Rechner - Einrichtung und Qualitätsschleife brauchen mehrere Sessions vor Ort.
- Empfehlung: mit Gemini Free Tier starten, Bild-Erzeugung als austauschbaren
  Baustein (`generateImage(prompt, refs)`) bauen, lokale GPU optional später.

## 5. Prompt-Aufbau: was Einstellung ist vs. was Prompt-Text ist

Bei gehosteten APIs (Gemini) sind nur Seitenverhältnis (`aspectRatio`) und
Auflösung (`imageSize`) echte Parameter (`imageConfig`-Block). Alles andere
(Stil, Kamera, Licht, Komposition, Inhalt, Meiden) ist Prompt-Text.
Lokal (ComfyUI) gibt es zusätzlich echte Parameter für Steps/CFG/Sampler/Seed/Negativprompt.

**Wichtig, per Nutzerentscheid:** Zeichenstil-Anlehnung an einen konkreten,
noch lebenden Autor/Illustrator wird **nicht** verfolgt (Modelle verweigern/
verwässern Künstlernamen zunehmend, und es wäre bei einer eventuellen
späteren Verlagsanfrage ohnehin ein Warnsignal). Stattdessen: Stilrichtung/
Epoche/Technik beschreiben (z. B. "Ligne claire, franko-belgische Schule
der 1960er").

**Kategorien** (Grundlage für die noch zu bauende Kategorien-JSON):

Fest pro Buch (Charakter-/Stil-Bibel, eingefroren):
- Technik/Medium, Linienführung, Schule/Epoche, Farbpalette, Kontrast/Tonwert, Detailgrad, Figurenkanon

Pro Panel variabel:
- Einstellungsgröße, Kamerawinkel, Objektiv, Licht, Komposition, Inhalt, Stimmung

Immer gleich (Meiden-Block):
- Schrift im Bild, Sprechblasen, Panelrahmen, Wasserzeichen, Signatur, zusätzliche Gliedmaßen, moderne Gegenstände, gruselige Details

Echte Parameter (kein Prompt-Text): Seitenverhältnis, Auflösung, Modell, Referenzbilder, (lokal zusätzlich) Negativprompt/Steps/CFG/Sampler/Seed.

### Gefundener Prompt-Fehler (aus dem ersten Testbild) - gilt auch für SchreibZauber

Testbild zeigte trotz gegenteiliger Anweisung eine gemalte Sprechblasen-Form
und einen Panelrahmen. Ursache: Bildmodelle reagieren auf **erwähnte
Konzepte**, nicht zuverlässig auf Verneinungen - das Wort "Sprechblase" im
Kompositions-Hinweis hat eine gemalt, "keine Panelrahmen" im Meiden-Block
hat vermutlich gerade dadurch einen ausgelöst.

**Fix (noch nicht gegengetestet):** Zweck nicht mehr benennen, nur die
visuelle Beschreibung geben:
- statt "Freifläche für eine Sprechblase" -> "unbedeckter Hintergrundbereich
  ohne Figuren/Objekte/Details, ca. ein Fünftel der Bildfläche"
- statt "kein Panelrahmen" -> positiv formulieren: "Bild randlos, geht bis
  zum Bildrand, keine Bordüre, kein Passepartout"

**Nächster Schritt:** mit dieser Formulierung erneut testen (idealerweise
über AI Studio im Browser statt der Telefon-App, da dort `aspectRatio`/
`imageSize` überhaupt einstellbar sind - die Telefon-App hat keine
Entwickler-Parameter, das erklärt die fehlende Auflösungs-/Ratio-Kontrolle
im ersten Test).

**Für SchreibZauber (Teil B):** Diese Lektion sollte direkt in
`KONZEPT-SchreibZauber.md` Abschnitt D.4 einfließen, dessen Comic-Prompt-Leitplanke
aktuell noch die problematische Negations-Form nutzt ("Keine Sprechblasen zeichnen").

## 6. Panel-Layout beim Druck: Vorlagen-Bibliothek statt festem Raster

Ursprünglicher Vorschlag (ein einziges festes Raster) wurde verworfen -
zu Recht, echte Comics/Mangas variieren die Panelgröße gezielt für die
Dramaturgie (große Panels für wichtige Momente, viele kleine für Hektik).

**Stattdessen:** eine Bibliothek aus ~10-15 Layout-Vorlagen unterschiedlicher
Dynamik (1 Panel/Splash, 1 groß + 2 klein, 2x2, 3 Streifen, 4-6 kleine
Panels...). Der Skript-Schritt vergibt pro Panel eine Wichtigkeit
(`splash`/`groß`/`normal`/`klein`) aus dem Text-Kontext, die Druckfunktion
wählt daraus die passende Vorlage für die jeweilige Panel-Kombination
einer Seite. Bleibt automatisierbar, ohne die dramaturgische Dynamik
komplett zu verlieren.

Für den Reader selbst ist das irrelevant (ein Panel = eine App-Seite,
unabhängig vom späteren Druck-Layout) - betrifft nur `printBook()`.

**Für SchreibZauber (Teil B):** dieselbe Vorlagen-Bibliothek ist direkt für
SchreibZauber Stufe 5 (Comic) wiederverwendbar, statt sie dort neu zu entwerfen.

## 7. Rechtliche Einschätzung (keine Rechtsberatung, nur Diskussionsstand)

- Rein privater Gebrauch (nur die eigene Familie, nicht geteilt/veröffentlicht):
  rechtlich vergleichsweise unkritisch, ähnlich einer Privatkopie.
- Von einem fertigen KI-Comic aus im Nachhinein Autor/Verlag um Freigabe zu
  bitten, wird **nicht empfohlen** - Rechte-Anfragen laufen umgekehrt (erst
  Lizenz, dann Produktion), ein fertiges Werk vorzulegen wirkt wie vollendete
  Tatsachen schaffen und kann als Urheberrechtsverletzung gewertet werden,
  sobald es über den privaten Kreis hinausgeht. Bei ernsthaftem kommerziellen
  Interesse vorher echten Rechtsrat einholen.

**Für SchreibZauber (Teil B):** Bei selbst erdachten (nicht fremden) Werken
entfällt dieses Risiko - genau deshalb sollen SchreibZauber-Werke laut
`KONZEPT-SchreibZauber.md` von Anfang an auf Veröffentlichung ausgelegt sein,
während Teil A hier (Illustration **fremder** EPUB-Kapitel) bewusst beim privaten
Gebrauch bleibt.

## 8. Offene To-Dos (in empfohlener Reihenfolge)

1. Prompt-Fix (Sprechblase/Rahmen-Wortlaut) mit einem zweiten Testbild verifizieren
2. Kategorien-JSON anlegen (Stil-/Kamera-/Meiden-Bausteine aus obiger Tabelle)
3. Charakter-Bibel-Schritt (Referenzbilder pro Figur/Buchreihe) einmal durchspielen
4. Generator-Skript-Grundgerüst (`skript.js` -> `bibel.js` -> `panels.js` -> `check.js` -> `bundle.js`)
5. Konsistenz-Check-Schritt (Vision-Modell prüft Panels gegen Referenzbilder)
6. Layout-Vorlagen-Bibliothek + Wichtigkeits-Tagging fürs Skript
7. Erst danach: `printBook()`-Erweiterung fürs comic-Layout (gegen echte Panel-Daten bauen, nicht gegen erfundene)
