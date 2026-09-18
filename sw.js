// Bei jeder inhaltlichen Änderung an einer dieser Dateien diese Nummer
// erhöhen - sonst bekommen wiederkehrende Besucher weiter die alte
// zwischengespeicherte Version ausgeliefert.
const CACHE_NAME = 'lesezauber-shell-v41';

// NEU (v41): Comic-Sprechblasen sind jetzt IMMER Teil des Exports, ihre
// Sichtbarkeit ist ein Umschalter im Reader (nicht mehr beim Erstellen).
// Dazu ein eigener Geräuschwörter-Umschalter. Keine neuen Dateien. Siehe
// CLAUDE.md, Versionsstand.

// NEU (v40): Comic-Werktyp überarbeitet - echte Panels statt einer Seite
// mit lose schwebenden Sprechblasen (Nutzer-Feedback: "sonst ist es
// einfach ein Bilderbuch"). Neue Datei js/studio/studioComicPanels.js.
// Siehe CLAUDE.md, Versionsstand.

// NEU (v39): SchreibZauber Ausbaustufe 6 (Politur, Teilumsetzung) - feste
// Vorlagen in Stufe 1, projektübergreifende Figuren-Übernahme in Stufe 4.
// Keine neuen Dateien. Siehe CLAUDE.md, Versionsstand.

// NEU (v38): SchreibZauber Ausbaustufe 5 (Comic) - Werktyp 'comic'
// freigeschaltet, neue Datei js/studio/studioBalloons.js (Sprechblasen).
// Siehe CLAUDE.md, Versionsstand.

// NEU (v37): "Master-Prompt" fürs Komplett-Setup (Stufe 1) - keine neuen
// Dateien. Siehe CLAUDE.md, Versionsstand.

// NEU (v36): Reihen-Zugehörigkeit (project.seriesName/book.series) inkl.
// Stil-/Figuren-Übernahme aus der jüngsten Geschwister-Doppelseite und
// Reihen-Chip in der Bibliothek - keine neuen Dateien. Siehe CLAUDE.md,
// Versionsstand.

// NEU (v35): Meta-Seiten (Titel/Klappentext/Autor) beim "Ins Regal stellen"
// - neue Datei js/studio/studioMetaPages.js, drei neue optionale Felder in
// Stufe 1 (Idee). Siehe CLAUDE.md, Versionsstand.

// NEU (v34): Textposition pro Doppelseite wird jetzt beim Anlegen
// automatisch abwechslungsreich verteilt und beim Bild-Prompt als
// tatsächlich freizuhaltende Zone mitgeschickt (js/studio/studioCore.js,
// imageSource.js, imageFormats.js) - siehe CLAUDE.md, Versionsstand.

// NEU (v33): Leitplanken (guardrailsBlock, js/studio/studioPrompts.js) für
// gemeinfreie Figuren geöffnet - siehe CLAUDE.md, Versionsstand.

// NEU (v32): drei Bugfixes aus Nutzer-Testfeedback zur Werkstatt (siehe
// CLAUDE.md, Versionsstand) - keine neuen Dateien, nur geänderte
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
    './js/actions/focusMode.js',
    './js/actions/pdfImport.js',
    './js/actions/vocabTrainer.js',
    './js/actions/workbook.js',
    './js/actions/progress.js',
    './js/actions/checkWork.js',
    './js/actions/workbookGenerator.js',
    './js/actions/prepareAudio.js',
    './js/actions/audiobookExport.js',
    './js/actions/videoTimeline.js',
    './js/actions/videoPreview.js',
    './js/actions/videoExport.js',
    './js/render/library.js',
    './js/render/book.js',
    './js/render/reader.js',
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
    // NEU (Ausbaustufe 3 - Layout & Druck): siehe
    // docs/KONZEPT-SchreibZauber.md, Abschnitt "Stand nach Stufe 3".
    './js/studio/studioLayout.js',
    './js/studio/studioPrint.js',
    // NEU (Ausbaustufe 4 - Arbeitsheft): eigener Werktyp-Pfad, siehe
    // docs/KONZEPT-SchreibZauber.md TEIL C.4.
    './js/studio/worksheet.js',
    './js/studio/worksheetCanvas.js',
    // NEU (Ausbaustufe 5 - Comic): Sprechblasen-Overlay + -Verwaltung,
    // Panel-Layout/Zusammensetzen.
    './js/studio/studioBalloons.js',
    './js/studio/studioComicPanels.js',
    './js/render/studioLibrary.js',
    './js/render/studioWizard.js',
    './js/render/studioCharacters.js',
    './js/render/studioStoryboard.js',
    './js/render/studioImages.js',
    './js/render/studioLayout.js',
    './js/render/studioWorkbookWizard.js',
    './js/backgroundPregen.js',
    './js/keyboard.js',
    './js/gestures.js',
    './js/actions/epubImport.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
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
