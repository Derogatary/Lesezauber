// main.js
// Der einzige Ort, der alle Module zusammenzieht. Wenn du ein neues Modul
// baust (z.B. js/actions/export.js), musst du es NUR hier zusätzlich
// importieren - der Rest des Codes bleibt unangetastet.
import { app } from './core.js';

// NEU (v0.40.0-beta): möglichst früh laden, damit das Fehlerprotokoll
// (js/actions/appHealth.js) auch Fehler beim Start der übrigen Module erfasst.
import './actions/appHealth.js';
import './config.js';
import './state.js';
import './db.js';
import './profiles.js';
import './nav.js';
import './api.js';
import './tts.js';
import './ttsProviders.js';
import './ttsNeural.js';
import './costMeter.js';
import './ui.js';
import './utils.js';

import './actions/scanner.js';
import './actions/reader.js';
import './actions/reorder.js';
import './actions/backup.js';
import './actions/bookQuiz.js';
import './actions/birkenbihl.js';
import './actions/focusMode.js';
import './actions/pdfImport.js';
import './actions/epubImport.js';
import './actions/vocabTrainer.js';
import './actions/workbook.js';
import './actions/progress.js';
import './actions/checkWork.js';
import './actions/workbookGenerator.js';
import './actions/prepareAudio.js';
// NEU (v0.39.0-beta): ganzes Buch übersetzen (Kopie in Zielsprache).
import './actions/bookTranslate.js';
// NEU (v0.41.0-beta): KI-Inhalte melden (🚩) - MUSS vor dem ersten Rendern
// geladen sein, weil app.utils.resolvePageVariant() stripHiddenAiFields() nutzt.
import './actions/aiReports.js';
// NEU (v0.42.0-beta): Kinder-Lesemodus/Buch-Freigabe/Chat pro Profil und
// Familien-Werkzeuge (Monatsbudget, Wochenrückblick, Wortkarten).
import './actions/kidMode.js';
import './actions/familyTools.js';
// NEU (v0.43.0-beta): eigene Stimme - Seiten selbst einsprechen
import './actions/voiceRecord.js';
import './render/voiceRecord.js';
// NEU (v0.44.0-beta): Nachtmodus "Über Nacht vorbereiten"
import './actions/nightPrep.js';
import './render/nightPrep.js';
import './actions/audiobookExport.js';

// NEU: Video-Export Weg B, Teil 1 - Renderer-Kern (Canvas) plus Zeitplan
// und Vorschau. Reihenfolge unkritisch (alle drei hängen nur Funktionen an
// app.cinema/app.actions an), aber cinema.js zuerst, weil es den Namespace
// mit Formaten/Zeichenfunktionen füllt, auf die die anderen zwei aufbauen.
import './render/cinema.js';
import './actions/videoTimeline.js';
import './actions/videoPreview.js';
import './actions/videoExport.js';

// NEU: SchreibZauber (Werkstatt für eigene Werke) - siehe
// docs/KONZEPT-SchreibZauber.md. studioCore.js importiert seinerseits
// imageFormats.js/placeholder.js/imageSource.js, deshalb reicht hier ein
// gebündelter Import pro Datei statt einer festen Ladereihenfolge.
import './studio/studioCore.js';
import './studio/studioPrompts.js';
import './studio/studioApi.js';
import './studio/studioExport.js';
import './studio/studioMetaPages.js';
// NEU (Stufe 2 - Bilder): Stilkarte/Figuren-Bibel, Storyboard,
// Bildgenerierung - siehe docs/KONZEPT-SchreibZauber.md TEIL E.
import './studio/studioCharacters.js';
import './studio/studioStoryboard.js';
import './studio/studioImages.js';
// NEU (v0.45.0-beta): Bilder manuell austauschen (Prompt kopieren / Bild einfügen)
import './studio/studioManualImages.js';
// NEU (v0.46.0-beta): Zielprogramme für kopierte Bild-Prompts
import './studio/imageTargets.js';
// NEU (Ausbaustufe 3 - Layout & Druck): Textplatzierung/Silbenfarben
// (studioLayout.js) und der davon unabhängige Doppelseiten-Druck
// (studioPrint.js) - siehe docs/KONZEPT-SchreibZauber.md TEIL E.
import './studio/studioLayout.js';
import './studio/studioPrint.js';
// NEU (Ausbaustufe 4 - Arbeitsheft): eigener Werktyp-Pfad, siehe
// docs/KONZEPT-SchreibZauber.md TEIL C.4. worksheet.js importiert
// worksheetCanvas.js selbst mit, deshalb reicht hier ein Eintrag.
import './studio/worksheet.js';
// NEU (Ausbaustufe 5 - Comic): Sprechblasen-Overlay + -Verwaltung, sowie
// Panel-Layout/Zusammensetzen, siehe docs/KONZEPT-SchreibZauber.md TEIL E.
import './studio/studioBalloons.js';
import './studio/studioComicPanels.js';

// NEU (v0.47.0-beta): Buchatlas - Wiki & Übersetzung für eigene Texte,
// wieder eingegliedert (vorher eigene Netlify-Seite). atlasCore.js zuerst:
// Zustand, Navigation und die Brücke zu LeseZaubers Toast/Loader/Key.
import './atlas/atlasCore.js';
import './atlas/atlasUtils.js';
import './atlas/atlasApi.js';
import './atlas/atlasDb.js';
import './atlas/actions/atlasReorder.js';
import './atlas/actions/atlasBackup.js';
import './atlas/actions/atlasWiki.js';
import './atlas/actions/atlasTranslate.js';
import './atlas/actions/atlasTextImport.js';
import './atlas/actions/atlasFileImport.js';
import './atlas/render/atlasLibrary.js';
import './atlas/render/atlasBook.js';
import './atlas/render/atlasSettings.js';
import './atlas/render/atlasWiki.js';
import './atlas/render/atlasTranslate.js';

import './render/library.js';
import './render/book.js';
import './render/reader.js';
import './render/birkenbihl.js';
import './render/settings.js';
import './render/vocab.js';
import './render/workbook.js';
import './render/workbookGenerator.js';
import './render/progress.js';
import './render/checkWork.js';
import './render/studioLibrary.js';
import './render/studioWizard.js';
import './render/studioCharacters.js';
import './render/studioStoryboard.js';
import './render/studioImages.js';
import './render/studioManualImages.js';
import './render/studioLayout.js';
import './render/studioWorkbookWizard.js';

import './readerUI.js';
import './settingsConfig.js';
import './backgroundPregen.js';
import './keyboard.js';
import './gestures.js';
import './edgeScroll.js';

app.init = async function () {
    // Speech synthesis listener for voice loading
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => app.tts.loadVoices();
    }

    // NEU: Bibliothek liegt jetzt in IndexedDB und wird asynchron geladen -
    // kurze Ladeanzeige, bis app.library gefüllt ist.
    app.ui.showLoader('Lade Bibliothek...', 'Einen Moment bitte');
    await app.dbOps.init();
    // NEU (v0.43.0-beta): welche Seiten selbst eingesprochen sind (nur die Schlüssel)
    await app.voice.loadIndex();
    app.ui.hideLoader();

    // NEU: Online/Offline-Punkt gleich beim Start korrekt setzen (nicht
    // erst beim nächsten Wechsel)
    updateOnlineStatusDot();

    // NEU: Vorlese-Stimme ist jetzt pro Profil gespeichert - die zum aktuell
    // aktiven Profil gehörende Wahl gleich beim Start nach app.settings
    // übernehmen (profiles.js selbst kann das noch nicht, weil es vor
    // utils.js geladen wird, siehe resolveCreationProfileId dort).
    app.utils.syncActiveProfileTtsSettings();

    // NEU: gespeicherte Hervorhebungsfarbe gleich anwenden, nicht erst
    // nach dem ersten Öffnen der Einstellungen
    document.documentElement.style.setProperty('--speech-highlight-color', app.settings.highlightColor);

    // NEU: gespeichertes zweiseitiges Layout gleich anwenden, nicht erst
    // nach dem ersten Umschalten in den Einstellungen
    document.getElementById('viewReader')?.classList.toggle('two-page-layout', app.settings.twoPageLayout);

    app.nav.go('lib');
};

// Macht "app" global verfügbar, damit onclick="app.actions.xyz()" im HTML
// weiterhin funktioniert.
window.app = app;

// PWA: Service Worker registrieren, damit die App installierbar wird und
// die eigenen Dateien beim nächsten Besuch aus dem Cache statt erneut aus
// dem Netz geladen werden.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // NEU (v0.40.0-beta, Release-Prüfung C5): auf neue Versionen hinweisen
        // statt still umzuschalten (siehe js/actions/appHealth.js).
        navigator.serviceWorker.register('./sw.js').then((reg) => app.actions.watchForAppUpdate(reg)).catch((e) => {
            console.error('Service Worker Registrierung fehlgeschlagen:', e);
        });
    });
}

// NEU: globales Sicherheitsnetz - fängt unerwartete Fehler ab, die sonst
// zu einem stillen "die App reagiert einfach nicht mehr" führen würden,
// und zeigt stattdessen eine verständliche Meldung.
window.addEventListener('error', (e) => {
    console.error('Unerwarteter Fehler:', e.error || e.message);
    app.ui?.toast?.('Ein unerwarteter Fehler ist aufgetreten.', '⚠️');
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unbehandelter Promise-Fehler:', e.reason);
    app.ui?.toast?.('Ein unerwarteter Fehler ist aufgetreten.', '⚠️');
});

// NEU: Offline-Erkennung - klare Rückmeldung statt einer verwirrenden
// "Verbindungsfehler"-Meldung mitten in der Analyse. Aktualisiert
// zusätzlich einen dauerhaft sichtbaren Punkt im Bibliotheks-Header
// (Toast allein verschwindet nach ein paar Sekunden wieder).
function updateOnlineStatusDot() {
    const dot = document.getElementById('onlineStatusDot');
    if (!dot) return;
    if (navigator.onLine) {
        dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0';
        dot.title = 'Online';
    } else {
        dot.className = 'w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0';
        dot.title = 'Offline';
    }
}

window.addEventListener('offline', () => {
    app.ui?.toast?.('Du bist offline - Scannen/Analysieren braucht wieder Internet.', '📡');
    updateOnlineStatusDot();
});
window.addEventListener('online', () => {
    app.ui?.toast?.('Wieder online', '✅');
    updateOnlineStatusDot();
});

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// NEU: Klick außerhalb eines Karten-Menüs schließt es automatisch.
document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-card-menu]') && !e.target.closest('[onclick*="toggleCardMenu"]')) {
        document.querySelectorAll('[data-card-menu]').forEach(el => el.classList.add('hidden'));
    }
});
