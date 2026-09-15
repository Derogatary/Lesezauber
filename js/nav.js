import { app } from './core.js';

Object.assign(app.nav, {
    go(viewId) {
        // Verlässt man den Reader während der Auto-Modus läuft, muss die
        // Sprachausgabe sauber gestoppt werden - sonst spricht sie im
        // Hintergrund weiter, während man z.B. schon in der Bibliothek ist.
        if (app.state.autoReadActive && viewId !== 'reader') {
            app.tts.stopAutoRead();
        }

        // NEU: Vollbild-Vorlese-Modus schließen, falls man den Reader verlässt
        if (app.state.focusMode && viewId !== 'reader') {
            app.state.focusMode = false;
            document.getElementById('viewFocus')?.classList.add('hidden');
        }

        // Hide all main views safely
        ['viewLibrary', 'viewBook', 'viewScanner', 'viewReader', 'viewSettings', 'viewVocab', 'viewHelp'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('view-hidden');
        });

        app.state.currentView = viewId;

        if (viewId === 'lib') {
            document.getElementById('viewLibrary').classList.remove('view-hidden');
            app.render.library();
        } else if (viewId === 'book') {
            document.getElementById('viewBook').classList.remove('view-hidden');
            app.render.book(app.state.currentBookId);
        } else if (viewId === 'scanner') {
            document.getElementById('viewScanner').classList.remove('view-hidden');
        } else if (viewId === 'reader') {
            document.getElementById('viewReader').classList.remove('view-hidden');
            app.render.reader(app.state.currentPageIdx);
        } else if (viewId === 'settings') {
            document.getElementById('viewSettings').classList.remove('view-hidden');
            app.render.settings();
        } else if (viewId === 'vocab') {
            document.getElementById('viewVocab').classList.remove('view-hidden');
            app.render.vocabTrainer();
        } else if (viewId === 'help') {
            document.getElementById('viewHelp').classList.remove('view-hidden');
        }
    }
});
