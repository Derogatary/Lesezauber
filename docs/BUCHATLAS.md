# 🗺️ Buchatlas (Teil von LeseZauber seit v0.47.0-beta)

Buchatlas ist der Bereich für **eigene Texte** (Romane, E-Books, Abschriften):
Text importieren, daraus automatisch ein **Wiki** (Kapitelübersicht + Personen,
Orte, Monster, Fähigkeiten, Systeme, Konzepte) und eine **Übersetzung** in eine
frei wählbare Sprache erstellen lassen.

Er war eine Zeit lang als eigene App abgetrennt ("Buchatlas", geplantes
Netlify-Deployment mit serverseitigem Key). Mit v0.47.0-beta ist er wieder
eingegliedert - Netlify wird nicht mehr gebraucht.

## Aufbau in LeseZauber

- Einstieg: Knopf **🗺️ Buchatlas** in der Bibliothek (neben SchreibZauber),
  nur für Eltern (`data-parent-only`, im Kinder-Lesemodus gesperrt).
- Code: `js/atlas/` - eigener Namensraum **`app.atlas.*`** (state, library,
  dbOps, nav, api, ui, actions, render, utils), damit nichts mit den
  gleichnamigen LeseZauber-Funktionen kollidiert (`app.render.library`,
  `app.actions.translateBook` ...).
- HTML: fünf Ansichten + zwei Fenster in `index.html`, alle IDs mit Präfix
  `atlas` (`atlasViewLibrary`, `atlasViewBook`, `atlasViewWiki`,
  `atlasViewTranslate`, `atlasViewSettings`, `atlasTextImportModal`,
  `atlasPageTextModal`).
- Navigation: `app.atlas.nav.go('lib'|'book'|'wiki'|'translate'|'settings')`
  wird auf `app.nav.go('atlas'|'atlasBook'|'atlasWiki'|'atlasTranslate'|'atlasSettings')`
  umgebogen - Browser-Zurück und Kinder-Lesemodus-Sperre greifen dadurch wie überall.
- Daten: **eigene IndexedDB `BuchatlasDB`** (Store `books`), getrennt von
  `LeseZauberDB`. Eigene Sicherungsdatei (Buchatlas-Einstellungen), NICHT in
  der LeseZauber-Sicherung enthalten.
- Gemeinsam mit LeseZauber: Gemini-Key (`app.settings.apiKey`), Modell-Liste
  und Filterstufe (`app.api.geminiModels`/`app.api.safetySettingsBook`), Toast,
  Lade-Overlay inkl. "Vorgang abbrechen" (`app.state.cancelAnalysis`) und
  `app.state.apiBusy` (die Hintergrund-Vorbereitung pausiert, solange
  Buchatlas läuft).
- Ein Buchatlas-Buch: `{ id, title, author, created, sourceType, pages: [{ id, text, status, translations: { [Sprache]: { text, generatedAt } } }], wiki, wikiPrevious, translationMemory, ... }` -
  reiner Text, keine Bilder, keine Persona-Varianten.

## ✨ Funktionen

- 📝 Text per Copy-Paste oder .txt-Datei importieren
- 📕 ePub-Import: liest die Kapitel direkt aus der Buchdatei aus (echte Kapitelstruktur, keine Texterkennung nötig)
- 🔑 Nutzt den Gemini-Key aus den LeseZauber-Einstellungen und dieselbe Modell-Rotation (`app.api.geminiModels`): meldet ein Modell 429, wird sofort das nächste probiert, erst wenn alle limitiert sind, wird mit Backoff gewartet
- ⏱️ Grobe Restzeit-Schätzung vor und während langer Läufe (Wiki/Übersetzung/OCR-Import)
- 🔔 Optionale Browser-Benachrichtigung, wenn ein langer Lauf fertig ist, während der Tab im Hintergrund war
- 📄 PDF-Import: liest zuerst die eingebettete Textebene direkt aus; Seiten ohne eigene Textebene (gescannte Bild-PDFs) werden automatisch einzeln per OCR (Gemini Vision) nachgelesen - bereits digitale Seiten werden dabei NICHT unnötig nochmal per OCR gelesen
- 🖼️ Bilder importieren (OCR): fotografierte/gescannte Einzelseiten direkt per Gemini Vision transkribieren lassen (Mehrfachauswahl, wird nach Dateiname sortiert)
- 🧩 Automatische Kapitel-Erkennung bei .txt/PDF (an Überschriften wie "Kapitel 3"), sonst Aufteilung an Absatzgrenzen
- 📖 **Wiki pro Buch**: KI erkennt Kapitelgrenzen und fasst jedes Kapitel zusammen, plus eine durchsuchbare Liste aller Personen, Orte, Monster, Fähigkeiten/Zauber, Regel-/Spielsysteme (z.B. LitRPG-Level-Systeme) und sonstiger wichtiger Konzepte - inkl. Sprungmarken zu den Fundstellen. Einträge lassen sich von Hand bearbeiten (Name/Beschreibung) oder löschen (mit Rückgängig), falls die KI etwas verwechselt hat
- ↩️ Vorherige Wiki-Version wiederherstellen - EIN Sicherungslevel (kein voller Versions-Verlauf), schützt gezielt vor einem versehentlichen "Neu erstellen"
- 📊 API-Nutzungszähler in den Einstellungen (Anzahl Calls + geschätzte Tokens seit letztem Zurücksetzen) - reine Rohzahlen, keine Kostenschätzung
- 🌐 **Übersetzung** in eine frei wählbare Zielsprache, seitenweise mit klarer Zuordnung Original ↔ Übersetzung, nutzt das Wiki automatisch als Namens-Glossar für konsistente Übersetzung wiederkehrender Begriffe
- 💾 Translation Memory: wortwörtlich identische Seiten (z.B. wiederkehrendes Impressum, Kapitel-Trenner) werden nur einmal übersetzt und danach automatisch wiederverwendet - spart Zeit/Kontingent und garantiert Konsistenz bei Wiederholungen
- ✏️ Übersetzung von Hand nachbessern (pro Seite bearbeitbar, wird als "von Hand geprüft" markiert und dadurch vom Namens-Check ausgenommen)
- 🔍 Namens-Konsistenz-Check: übersetzt die Wiki-Namen einmalig in die Zielsprache und prüft client-seitig, ob sie auf den passenden Seiten auch tatsächlich vorkommen - heuristischer Hinweis fürs Gegenlesen, kein Beweis für einen echten Fehler
- 📥 Übersetzung als Markdown-Datei herunterladen (Original + Übersetzung pro Seite, zum Gegenlesen) - oder als reine Text-Datei (nur Übersetzung, zum Lesen/Weitergeben) - oder als echte EPUB-Datei (zum Lesen in einer E-Reader-App)
- 🔁 Rückübersetzungs-Stichprobe: übersetzt 2-3 über das Buch verteilte Beispielseiten zurück in die Ausgangssprache, zum manuellen Vergleich - wie in der professionellen Übersetzungs-QA üblich, aber als Stichprobe statt Vollprüfung (würde sonst nochmal so viel kosten wie die Übersetzung selbst)
- 🔍 Suche in der Bibliothek, in Wiki-Einträgen und in der Übersetzungs-Ansicht
- ↕️ Seiten/Kapitel per Buttons neu sortieren, einzelne Seiten löschen (mit Rückgängig)
- 📤📥 Bibliothek als Datei sichern & wiederherstellen (Export/Import)
- 📥 Einzelne Bücher als Datei herunterladen (weiterhin voll bearbeitbar nach erneutem Import)
- 🖨️ Buch drucken (einfache Druckansicht, reiner Text)
- 💾 Sanfte Erinnerung, wenn lange kein Backup mehr gemacht wurde
- 💾 Speicherung in IndexedDB (deutlich höheres Speicherlimit als der Browser-Standardspeicher), Speicherplatz-Anzeige in den Einstellungen
- 📲 Teil der LeseZauber-PWA - pdf.js/JSZip kommen aus `js/vendor/`, der Import klappt also auch offline
- 🔤 Sortierbare Bibliothek (neueste/älteste/A-Z)
- ☑️ Mehrfachauswahl in der Bibliothek: mehrere Bücher auf einmal löschen oder als eine Datei exportieren
- ♿ aria-labels an Icon-Buttons, aria-live für Toasts

## ⚠️ Bekannte Grenzen

- Translation Memory arbeitet auf ganzer-Seiten-Ebene mit exaktem Textabgleich (kein Fuzzy-Matching wie bei professionellen CAT-Tools, kein Satz-/Absatz-Level) - trifft nur bei wortwörtlich identischen Wiederholungen.
- Übersetzung ist ein einzelner KI-Durchgang ohne separate Editing-/Proofreading-Instanz, wie es in der professionellen Übersetzung üblich wäre (TEP-Prozess) - die App bietet stattdessen: manuelles Nachbearbeiten pro Seite + einen heuristischen Namens-Konsistenz-Check als Hinweisgeber. Ersetzt kein echtes Korrekturlesen.
- Der Namens-Check ist ein reiner Text-Enthält-Vergleich (kein Grammatik-/Deklinationsverständnis) - ein dekliniertes "Frodos" statt "Frodo" kann fälschlich als fehlend markiert werden. Als Hinweis zum Gegenlesen gedacht, nicht als Fehlerbeweis.
- Manuell bearbeitete Wiki-Einträge (Name/Beschreibung) gehen verloren, wenn du das Wiki mit "🔄 Neu erstellen" komplett neu generierst, oder teilweise beim "▶️ Fortsetzen" eines unvollständigen Laufs (die Blockzusammenführung baut die Einträge neu auf und übernimmt dabei keine manuellen Änderungsmarkierungen). Kein Merge-Werkzeug für "zwei Einträge zu einem verschmelzen" - nur Bearbeiten und Löschen einzelner Einträge.
- Der EPUB-Export baut eine minimale, aber gültige EPUB3-Struktur (nav.xhtml, ein Kapitel pro Seite) - kein Cover-Bild, keine erweiterten Formatierungen (Kursiv/Fett aus dem Original gehen beim Import/Export nicht verlustfrei durch, da intern alles als reiner Text gespeichert wird).
- Die Rückübersetzungs-Stichprobe wird NICHT automatisch bewertet (das wäre nur eine weitere, genauso fehleranfällige KI-Einschätzung) - sie zeigt Original und Rückübersetzung nur nebeneinander zum eigenen Vergleich an.
- Alle Daten liegen im Browser des jeweiligen Geräts (IndexedDB) – kein automatischer Abgleich zwischen mehreren Geräten. Für den Umzug auf ein neues Gerät: Export/Import unter ⚙️ nutzen.
- PDF-Seiten ohne eigene Textebene (gescannte Bilder) laufen automatisch über OCR (Gemini Vision) - das braucht pro betroffener Seite einen API-Call inkl. Wartezeit (Gratis-Tarif-Limit), bei komplett gescannten PDFs also spürbar länger als bei PDFs mit echtem Text.
- Wiki und Übersetzung laufen jeweils in EINEM KI-Aufruf über den gesamten Buchtext. Bei sehr langen Romanen (mehrere hundert Seiten Text) kann die Qualität gegen Ende nachlassen ("lost in the middle") - für sehr lange Bücher wäre eine Aufteilung in Blöcke mit anschließendem Zusammenführen der nächste sinnvolle Ausbauschritt.
- Übersetzung läuft Seite für Seite mit ca. 4,5 Sekunden Pause dazwischen (Gemini-Gratis-Tarif-Limit) - bei vielen Kapiteln entsprechend spürbare Wartezeit.
- iOS Safari kann Website-Speicher (auch IndexedDB) nach langer Inaktivität automatisch löschen, wenn die Seite nicht zum Homescreen hinzugefügt wurde – regelmäßiger Export ist deshalb weiterhin empfehlenswert.
