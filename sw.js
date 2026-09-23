// Bei jeder inhaltlichen Änderung an einer dieser Dateien diese Nummer
// erhöhen - sonst bekommen wiederkehrende Besucher weiter die alte
// zwischengespeicherte Version ausgeliefert.
const CACHE_NAME = 'lesezauber-shell-v81';

// NEU (v81, v0.46.0-beta): Bild-Prompts nach Nano-Banana-Empfehlungen, Zielprogramme
// beim manuellen Austausch (neue Datei js/studio/imageTargets.js).

// FIX (v80, v0.45.1-beta): Knopfreihe der Bibliothek bricht auf dem Handy um
// (vorher seitlich verschiebbare Seite).

// NEU (v79, v0.45.0-beta): SchreibZauber - Bilder manuell austauschen (neue
// Dateien js/studio/studioManualImages.js, js/render/studioManualImages.js).

// NEU (v78, v0.44.0-beta): Nachtmodus "Über Nacht vorbereiten" (neue Dateien
// js/actions/nightPrep.js, js/render/nightPrep.js).

// NEU (v77, v0.43.0-beta): eigene Stimme - Seiten selbst einsprechen (neue
// Dateien js/actions/voiceRecord.js, js/render/voiceRecord.js, IndexedDB v5).

// NEU (v76, v0.42.0-beta): Kinder-Lesemodus mit Eltern-Frage, Buch-Freigabe,
// "Frag den Zauberer" pro Profil, Monatsbudget, Wochenrückblick, Wortkarten
// (neue Dateien js/actions/kidMode.js, js/actions/familyTools.js).

// NEU (v75, v0.41.0-beta): Meldeknopf für KI-Inhalte (neue Datei
// js/actions/aiReports.js), Hinweis "App für Eltern", API-Key-Warnungen,
// doppelte Sicherungs-Erinnerung aus v74 wieder entfernt.

// NEU (v74, v0.40.0-beta): Release-Prüfung, alles für die private Nutzung
// Machbare - neue Datei js/actions/appHealth.js (Fehlerprotokoll, Update-
// Hinweis, Sicherungs-Erinnerung), CSP in index.html, Sicherheitsfilter in
// js/api.js, sanitize() escaped jetzt auch Anführungszeichen, neu gebaute
// css/tailwind.css. install() ruft KEIN skipWaiting() mehr auf (siehe unten).

// NEU (v73, v0.39.0-beta): KDP-Quadratformat/Seitenaufbau/Panorama
// (js/studio/*), ganzes Buch übersetzen (neue Datei
// js/actions/bookTranslate.js), Erzähler-Knöpfe + Persona-Zwischenruf im
// Reader, neu gebaute css/tailwind.css.

// NEU (v72, v0.38.0-beta): zwei offene Punkte aus docs/TODO-GESAMT.md.
// 1) KI-Stimme für die Birkenbihl-Zielsprache (app.ttsNeural.speakForeign(),
// js/ttsNeural.js + foreignLanguages je Anbieter in js/ttsProviders.js).
// 2) Arbeitsheft-Aufgabentyp "Suchsel" - neue Datei js/studio/wordSearch.js
// (Buchstabengitter-Generator), eingebunden über js/studio/worksheet.js.

// NEU (v56): Modell-Rotation bei Ratenbegrenzung (Nutzerwunsch: "rotierende
// Funktion von absteigender Qualität") - js/api.js/js/studio/studioApi.js
// probieren jetzt mehrere Gemini-Modelle nacheinander (GEMINI_MODELS,
// absteigend nach Modellgüte, gemini-3.1-flash-lite als großzügigste
// Reserve am Ende), sobald eins mit HTTP 429 antwortet. Jedes Modell hat
// laut Nutzer-Screenshot sein eigenes, komplett getrenntes Tageskontingent
// (~20 bei den "vollen" Flash-Modellen) - eine Rotation über 4-5 Modelle
// vervielfacht das effektive Tageskontingent, bevor überhaupt der
// bestehende Mistral-Fallback greift. Auch der bisher übersehene direkte
// Gemini-Aufruf in app.api.answerQuestion() ("Frag den Zauberer") bekommt
// jetzt dieselbe Rotation. Keine neuen Dateien.

// NEU (v55): Zwei Funde aus einem Nutzer-Screenshot der AI-Studio-
// Ratenbegrenzungs-Seite behoben. 1) Modellwechsel: gemini-3.6-flash
// (bisher) taucht in der aktuellen kostenlosen Ratenbegrenzung gar nicht
// mehr auf (nur noch ~20 Anfragen/Tag laut Recherche) - gemini-3.1-flash-
// lite hat die großzügigste Grenze aller Textausgabemodelle (~500/Tag,
// 15 RPM), js/api.js + js/studio/studioApi.js. 2) Hintergrund-Vorbereitung
// läuft jetzt auch, wenn der Tab nicht der gerade sichtbare ist (nur ein
// komplett geschlossener Tab/Browser stoppt sie zwangsläufig - ehrliche
// Grenze ohne eigenen Server). Keine neuen Dateien.

// NEU (v54): Birkenbihl-Übersetzungen als dritte, niedrigste Priorität in
// die Hintergrund-Vorbereitung aufgenommen (Nutzerwunsch: "erst Seiten,
// dann anderer Kram") - läuft erst, wenn ALLE Bücher weder eine fehlende
// Persona-Variante noch ein fehlendes Buch-Quiz mehr haben. Eigener
// Zusatz-Schalter "🌍 Auch Birkenbihl-Übersetzungen automatisch
// vorbereiten" in den Einstellungen (app.settings.backgroundPregenBirkenbihl,
// Default aus - kostet sonst ungefragt mehr Anfragen). Einstellungen zeigen
// jetzt eine Übersicht aller drei Aufgaben-Arten statt nur einer Zahl
// (app.utils.countMissingVariants()/countMissingBookQuiz()/
// countMissingBirkenbihl()). Neu: kleiner "⏳ X im Hintergrund offen"-Hinweis
// im Bibliotheks-Kopf, Tippen springt zu den Einstellungen. Keine neuen
// Dateien.

// NEU (v53): Bugfix "Birkenbihl-Übersetzung schlägt fehl" - eine Seite mit
// wörtlicher Rede erzeugt viele Wort-Paare, ein einziges nicht sauber
// escapetes Anführungszeichen im Modell-Output machte bisher das GESAMTE
// JSON unbrauchbar (js/api.js). Neuer nachsichtiger Rückfall
// (extractPairsLoosely()/callGeminiTextLenient()/runTextPromptLenient())
// zieht Wortpaare einzeln per Regex heraus, rettet auch aus einer wegen
// MAX_TOKENS abgeschnittenen Antwort noch die vollständigen Paare. Toast
// bei einem Fehlschlag zeigt jetzt den tatsächlichen Grund statt einer
// immer gleichen Pauschalmeldung (js/actions/birkenbihl.js). Keine neuen
// Dateien.

// NEU (v52): Künstliches Nutzer-Feedback simuliert (mehrere Personas
// durchgespielt) - zwei Funde behoben. 1) Bug: bei "🔍 Alle Profile"
// liefen renameProfile()/deleteProfile() lautlos ins Leere, die Knöpfe
// blieben aber wirkungslos anklickbar - jetzt ausgeblendet
// (render/library.js) UND defensiv mit Toast statt stillem Rückfall
// (js/profiles.js). 2) SchreibZauber Stufe 1 hatte drei KI-Hilfe-Knöpfe
// ungefragt vor dem Formular - jetzt in einer eingeklappten <details>-Karte
// gebündelt, keine neue JS-Logik nötig. Keine neuen Dateien.

// NEU (v51): Import-Funktion für Stufe 1 "Die Idee" - Gegenstück zum
// Master-Prompt (Nutzerwunsch: "wenn ich dich oder eine andere KI außerhalb
// der Gemini-API frage... alle Felder... One-Click"). Neuer Knopf "📥
// KI-Antwort einfügen" liest die Zwischenablage, zerlegt die Antwort per
// app.studio.prompts.parseMasterSetupResponse() (Codeblöcke wie im
// Master-Prompt verlangt, plus Rückfall auf einfache "Titel: ..."-Zeilen
// samt Markdown-Fettung/Aufzählung) und füllt alle erkannten Felder auf
// einen Schlag. Klappt der Zwischenablage-Zugriff nicht, erscheint ein
// Textfeld zum manuellen Einfügen. Keine neuen Dateien. Siehe CHANGELOG.md.

// NEU (v50): Niederländisch als weitere Birkenbihl-Zielsprache ergänzt
// (app.birkenbihlLanguages, js/config.js) - Nutzerwunsch, ein Zeileneintrag,
// taucht automatisch im Einstellungen-Dropdown und im Prompt auf. Keine
// neuen Dateien.

// NEU (v49): Birkenbihl-Methode (Interlinear-Übersetzung) als neuer Reader-
// Tab "🌍 Birkenbihl" - übersetzt den Seitentext per Gemini/Mistral in eine
// wählbare Zielsprache (Einstellungen) und zerlegt ihn in Wort-Einheiten mit
// wörtlicher deutscher Übersetzung in Zielsprachen-Wortstellung darunter.
// Ergebnis wird pro Seite gecacht (page.birkenbihl). Vorlesen der Zielsprache
// über die Gerätestimme mit passendem Sprachcode (neues, optionales
// langOverride-Argument in app.tts.speakWithDevice()). Nur bei Geschichten
// sichtbar, nicht bei Übungsheften. Neue Dateien: js/actions/birkenbihl.js,
// js/render/birkenbihl.js. Siehe CHANGELOG.md.

// NEU (v48): Silbenfarben jetzt EIN Umschalter fürs ganze Buch (Stufe 7 "Das
// Layout") statt vorher pro Doppelseite - schreibt beim Umschalten auf alle
// Doppelseiten gleichzeitig (app.studio.setBookSyllableColors(),
// js/studio/studioLayout.js). Zusätzlich: Stufe 1 "Die Idee" hat jetzt einen
// direkten API-Ausfüll-Knopf (Thema eintippen -> Titel/Ton/Botschaft/Autor/
// Verlag/Klappentext werden per Gemini/Mistral vorgeschlagen, Ergänzung zum
// bisherigen kostenlosen Master-Prompt-Copy-Paste-Weg) - neue Funktionen
// app.render.studioSuggestBrief()/app.studio.api.suggestBrief(). Keine neuen
// Dateien. Siehe CHANGELOG.md.

// NEU (v47): Dark-Mode-Kontrastfix - mehrere neuere SchreibZauber-Eingabefelder
// (Figuren-Bibel, Comic-Sprechblasen/Panels, Doppelseiten-Textfeld, Layout-
// Auswahlfelder, Storyboard-Skizzenhinweis, Arbeitsheft-Wizard) hatten die
// Klasse text-slate-900 vergessen und blieben dadurch im Dark Mode
// schwarzer-auf-dunklem-Grund-Text (die Dark-Mode-Regeln in css/style.css
// greifen nur an dieser Klasse, siehe CHANGELOG v0.20.1-beta für denselben
// Fehler an anderer Stelle). Keine neuen Dateien. Siehe CHANGELOG.md.

// NEU (v46): KDP-Innenteil-Export (studioPrint.js) korrigiert/vervollständigt
// - Sicherheitsabstand jetzt korrekt 0,375" MIT Bleed (vorher pauschal
// 0,25"), zusätzlicher Bundsteg-Innenrand nach Gesamtseitenzahl, Hinweis
// auf KDPs Mindestseitenzahl (72 Standard-/24 Premiumfarbe). Keine neuen
// Dateien. Siehe CHANGELOG.md.

// NEU (v45): Mausrad im dunklen Rand neben dem App-Rahmen (Laptop) reicht
// jetzt an die sichtbare Ansicht durch statt ins Leere zu laufen - neue
// Datei js/edgeScroll.js. Siehe CHANGELOG.md.

// NEU (v44): Hochauflösend-Umschalter für den Druck (project.spec.highResPrint,
// Stufe 2 "Bauplan") - behält bei NEU erzeugten Bildern mehr von der ohnehin
// gelieferten Auflösung statt sie auf 1600px zu kürzen (js/utils.js
// createHiResPrintVariant()), plus Interpolations-Hochskalierung als
// Rückfall. Kostet keine zusätzlichen Bild-Aufrufe. Beim Comic-KDP-Druck
// wird die Panel-Seite zusätzlich IMMER (unabhängig vom Umschalter) in
// höherer Auflösung neu zusammengesetzt (js/studio/studioComicPanels.js) -
// das kostet nichts, weil dabei kein neuer Bildaufruf entsteht. Keine neuen
// Dateien. Siehe CHANGELOG.md.

// NEU (v43): echter KDP-Innenteil-Export (studioPrint.js, printSpreadsKdp())
// mit tatsächlicher 3mm-Beschnittzugabe und 6,4mm-Sicherheitsabstand statt
// nur eines optischen Randlos-Umschalters - nur für die Papierformate A5/A4
// hoch. Liefert bewusst keinen Umschlag (KDPs eigener Cover-Ersteller).
// Keine neuen Dateien. Siehe CHANGELOG.md.

// NEU (v42): Doppelseiten-Druck (studioPrint.js) ist jetzt comicfähig -
// druckt die fertig geletterte Panel-Seite, Sprechblasen-Einbrennen per
// Checkbox abschaltbar. Keine neuen Dateien. Siehe CHANGELOG.md.

// NEU (v41): Comic-Sprechblasen sind jetzt IMMER Teil des Exports, ihre
// Sichtbarkeit ist ein Umschalter im Reader (nicht mehr beim Erstellen).
// Dazu ein eigener Geräuschwörter-Umschalter. Keine neuen Dateien. Siehe
// CHANGELOG.md.

// NEU (v40): Comic-Werktyp überarbeitet - echte Panels statt einer Seite
// mit lose schwebenden Sprechblasen (Nutzer-Feedback: "sonst ist es
// einfach ein Bilderbuch"). Neue Datei js/studio/studioComicPanels.js.
// Siehe CHANGELOG.md.

// NEU (v39): SchreibZauber Ausbaustufe 6 (Politur, Teilumsetzung) - feste
// Vorlagen in Stufe 1, projektübergreifende Figuren-Übernahme in Stufe 4.
// Keine neuen Dateien. Siehe CHANGELOG.md.

// NEU (v38): SchreibZauber Ausbaustufe 5 (Comic) - Werktyp 'comic'
// freigeschaltet, neue Datei js/studio/studioBalloons.js (Sprechblasen).
// Siehe CHANGELOG.md.

// NEU (v37): "Master-Prompt" fürs Komplett-Setup (Stufe 1) - keine neuen
// Dateien. Siehe CHANGELOG.md.

// NEU (v36): Reihen-Zugehörigkeit (project.seriesName/book.series) inkl.
// Stil-/Figuren-Übernahme aus der jüngsten Geschwister-Doppelseite und
// Reihen-Chip in der Bibliothek - keine neuen Dateien. Siehe CHANGELOG.md.

// NEU (v35): Meta-Seiten (Titel/Klappentext/Autor) beim "Ins Regal stellen"
// - neue Datei js/studio/studioMetaPages.js, drei neue optionale Felder in
// Stufe 1 (Idee). Siehe CHANGELOG.md.

// NEU (v34): Textposition pro Doppelseite wird jetzt beim Anlegen
// automatisch abwechslungsreich verteilt und beim Bild-Prompt als
// tatsächlich freizuhaltende Zone mitgeschickt (js/studio/studioCore.js,
// imageSource.js, imageFormats.js) - siehe CHANGELOG.md.

// NEU (v33): Leitplanken (guardrailsBlock, js/studio/studioPrompts.js) für
// gemeinfreie Figuren geöffnet - siehe CHANGELOG.md.

// NEU (v32): drei Bugfixes aus Nutzer-Testfeedback zur Werkstatt (siehe
// CHANGELOG.md) - keine neuen Dateien, nur geänderte
// index.html/js/nav.js/js/studio/studioCore.js/js/studio/worksheet.js/
// css/tailwind.css, deshalb trotzdem CACHE_NAME hochzählen.

// NEU (v31): SchreibZauber Ausbaustufe 3 (Layout & Druck) - Textplatzierung/
// Silbenfarben (js/studio/studioLayout.js + js/render/studioLayout.js) und
// der davon unabhängige Doppelseiten-Druck (js/studio/studioPrint.js) dazu.
// Siehe docs/KONZEPT-SchreibZauber.md, Abschnitt "Stand nach Stufe 3".

// NEU (v30): Integrationspass Welle 5 - Video-Restpunkte (Auftrag 18),
// SchreibZauber Stufe 2 (Bilder, Auftrag 16) und Ausbaustufe 4 (Arbeitsheft,
// Auftrag 17) waren drei parallel laufende, unabhängige Sitzungen auf
// demselben main-Stand und sind hier zusammengeführt (siehe CLAUDE.md,
// "Arbeitsschritt-Varianten bei mehreren parallelen Aufträgen").

// NEU (v28): Integrationspass - Heft-Generator und Video-Export zusammengeführt.
// Beide Zweige hatten unabhängig voneinander bis v26/v27 hochgezählt, deshalb hier
// einmal über beide hinweg auf v28.

// NEU (v25/v26): Video-Export Weg B - js/render/cinema.js,
// js/actions/videoTimeline.js, js/actions/videoPreview.js und
// js/actions/videoExport.js sind in main.js verdrahtet und gehören damit in
// die App-Hülle. Die Muxer-Bibliothek js/vendor/mp4muxer/mp4-muxer.mjs steht
// bewusst NICHT hier: sie wird wie PDF.js und JSZip erst bei Bedarf geladen
// und landet dann über den fetch-Handler unten automatisch im Cache.

// NEU: js/studio/* (SchreibZauber) ist jetzt in main.js verdrahtet (Stufe 1,
// siehe docs/KONZEPT-SchreibZauber.md) und steht deshalb komplett in der
// APP_SHELL-Liste - inklusive der schon vorher vorhandenen, aber bis jetzt
// unverdrahteten Bildquellen-Module.

// Nur die eigenen, lokalen Dateien werden zwischengespeichert (die
// "App-Hülle"). Die Gemini-/Mistral-APIs werden absichtlich NICHT
// hierüber abgewickelt - die sollen immer frisch aus dem Netz kommen.
const APP_SHELL = [
    './',
    './index.html',
    './css/style.css',
    './css/tailwind.css',
    './js/main.js',
    './js/core.js',
    './js/config.js',
    './js/state.js',
    './js/db.js',
    './js/profiles.js',
    './js/nav.js',
    './js/api.js',
    './js/tts.js',
    './js/ttsProviders.js',
    './js/ttsNeural.js',
    './js/costMeter.js',
    './js/ui.js',
    './js/utils.js',
    './js/readerUI.js',
    './js/settingsConfig.js',
    './js/actions/scanner.js',
    './js/actions/reader.js',
    './js/actions/reorder.js',
    './js/actions/backup.js',
    './js/actions/bookQuiz.js',
    './js/actions/birkenbihl.js',
    './js/actions/focusMode.js',
    './js/actions/pdfImport.js',
    './js/actions/vocabTrainer.js',
    './js/actions/workbook.js',
    './js/actions/progress.js',
    './js/actions/checkWork.js',
    './js/actions/workbookGenerator.js',
    './js/actions/prepareAudio.js',
    './js/actions/bookTranslate.js',
    './js/actions/appHealth.js',
    './js/actions/aiReports.js',
    './js/actions/kidMode.js',
    './js/actions/familyTools.js',
    './js/actions/voiceRecord.js',
    './js/render/voiceRecord.js',
    './js/actions/nightPrep.js',
    './js/render/nightPrep.js',
    './js/actions/audiobookExport.js',
    './js/actions/videoTimeline.js',
    './js/actions/videoPreview.js',
    './js/actions/videoExport.js',
    './js/render/library.js',
    './js/render/book.js',
    './js/render/reader.js',
    './js/render/birkenbihl.js',
    './js/render/settings.js',
    './js/render/vocab.js',
    './js/render/workbook.js',
    './js/render/workbookGenerator.js',
    './js/render/progress.js',
    './js/render/checkWork.js',
    './js/render/cinema.js',
    './js/studio/imageFormats.js',
    './js/studio/placeholder.js',
    './js/studio/imageSource.js',
    './js/studio/studioCore.js',
    './js/studio/studioPrompts.js',
    './js/studio/studioApi.js',
    './js/studio/studioExport.js',
    './js/studio/studioMetaPages.js',
    // NEU (Stufe 2 - Bilder): Stilkarte/Figuren-Bibel, Storyboard, Bildgenerierung.
    './js/studio/studioCharacters.js',
    './js/studio/studioStoryboard.js',
    './js/studio/studioImages.js',
    './js/studio/studioManualImages.js',
    './js/studio/imageTargets.js',
    // NEU (Ausbaustufe 3 - Layout & Druck): siehe
    // docs/KONZEPT-SchreibZauber.md, Abschnitt "Stand nach Stufe 3".
    './js/studio/studioLayout.js',
    './js/studio/studioPrint.js',
    // NEU (Ausbaustufe 4 - Arbeitsheft): eigener Werktyp-Pfad, siehe
    // docs/KONZEPT-SchreibZauber.md TEIL C.4.
    './js/studio/worksheet.js',
    './js/studio/worksheetCanvas.js',
    './js/studio/wordSearch.js',
    // NEU (Ausbaustufe 5 - Comic): Sprechblasen-Overlay + -Verwaltung,
    // Panel-Layout/Zusammensetzen.
    './js/studio/studioBalloons.js',
    './js/studio/studioComicPanels.js',
    './js/render/studioLibrary.js',
    './js/render/studioWizard.js',
    './js/render/studioCharacters.js',
    './js/render/studioStoryboard.js',
    './js/render/studioImages.js',
    './js/render/studioManualImages.js',
    './js/render/studioLayout.js',
    './js/render/studioWorkbookWizard.js',
    './js/backgroundPregen.js',
    './js/keyboard.js',
    './js/gestures.js',
    './js/edgeScroll.js',
    './js/actions/epubImport.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    // FIX (v0.40.0-beta, Release-Prüfung C5): KEIN sofortiges skipWaiting()
    // mehr - eine neue Version wartet, bis der Nutzer im Hinweis "Neu laden"
    // tippt (js/actions/appHealth.js watchForAppUpdate). Vorher lief eine
    // offene Seite nach einem Update mit gemischten alten/neuen Dateien weiter.
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Alte Cache-Versionen aufräumen, sobald eine neue aktiv wird.
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Fremde Anfragen (Google-Gemini-API, Mistral-API) unangetastet lassen
    // - dafür ist dieser Service Worker nicht zuständig. (Tailwind kommt
    // seit dem eigenen Build aus css/tailwind.css, also von hier.)
    if (url.origin !== self.location.origin) {
        return;
    }

    // "Cache first, dann Netzwerk": eigene Dateien liegen schon lokal vor
    // und laden dadurch sofort, auch offline. Dateien, die nicht in der
    // festen APP_SHELL-Liste stehen (z.B. die PDF.js-Bibliothek, die nur
    // bei Bedarf nachgeladen wird), werden nach dem ersten Abruf ebenfalls
    // automatisch im Cache abgelegt - so ist auch ein PDF-Import später
    // offline bzw. sofort verfügbar, ohne die App beim Start unnötig mit
    // ca. 1,7 MB PDF.js-Code zu belasten.
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                }
                return response;
            });
        })
    );
});
