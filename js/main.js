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

import './render/library.js';
import './render/book.js';
import './render/reader.js';
import './render/settings.js';
import './render/vocab.js';

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
// "Verbindungsfehler"-Meldung mitten in der Analyse.
window.addEventListener('offline', () => {
    app.ui?.toast?.('Du bist offline - Scannen/Analysieren braucht wieder Internet.', '📡');
});
window.addEventListener('online', () => {
    app.ui?.toast?.('Wieder online', '✅');
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
