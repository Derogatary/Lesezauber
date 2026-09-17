// main.js
// Der einzige Ort, der alle Module zusammenzieht. Wenn du ein neues Modul
// baust (z.B. js/actions/export.js), musst du es NUR hier zusätzlich
// importieren - der Rest des Codes bleibt unangetastet.
import { app } from './core.js';

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
import './actions/focusMode.js';
import './actions/pdfImport.js';
import './actions/epubImport.js';
import './actions/vocabTrainer.js';
import './actions/workbook.js';
import './actions/progress.js';
import './actions/checkWork.js';
import './actions/prepareAudio.js';
import './actions/audiobookExport.js';

// NEU: SchreibZauber (Werkstatt für eigene Werke) - siehe
// docs/KONZEPT-SchreibZauber.md. studioCore.js importiert seinerseits
// imageFormats.js/placeholder.js/imageSource.js, deshalb reicht hier ein
// gebündelter Import pro Datei statt einer festen Ladereihenfolge.
import './studio/studioCore.js';
import './studio/studioPrompts.js';
import './studio/studioApi.js';
import './studio/studioExport.js';

import './render/library.js';
import './render/book.js';
import './render/reader.js';
import './render/settings.js';
import './render/vocab.js';
import './render/workbook.js';
import './render/progress.js';
import './render/checkWork.js';
import './render/studioLibrary.js';
import './render/studioWizard.js';

import './readerUI.js';
import './settingsConfig.js';
import './backgroundPregen.js';
import './keyboard.js';
import './gestures.js';

app.init = async function () {
    // Speech synthesis listener for voice loading
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => app.tts.loadVoices();
    }

    // NEU: Bibliothek liegt jetzt in IndexedDB und wird asynchron geladen -
    // kurze Ladeanzeige, bis app.library gefüllt ist.
    app.ui.showLoader('Lade Bibliothek...', 'Einen Moment bitte');
    await app.dbOps.init();
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
        navigator.serviceWorker.register('./sw.js').catch((e) => {
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
