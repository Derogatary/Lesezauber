import { app } from './core.js';

// NEU: Browser-Verlauf einbinden. Vorher fasste die App history nie an -
// "Zurück" im Browser/der PWA war dadurch gleichbedeutend mit "App
// verlassen" (zur vorherigen externen Seite bzw. Tab schließen), weil
// nichts zum Zurückgehen im Verlauf lag. Jeder echte Ansichtswechsel über
// app.nav.go() bekommt jetzt einen eigenen Verlaufseintrag, "Zurück" wird
// dadurch zu einem internen Navigationsschritt. BEWUSST nur auf
// View-Ebene, nicht pro Blättern im Reader - dafür wird nav.go() beim
// Seitenwechsel gar nicht aufgerufen (siehe keyboard.js/gestures.js), das
// würde den Verlauf sonst mit hunderten Einträgen fluten.
let historyStarted = false;

function pushOrReplaceHistory(state) {
    if (!historyStarted) {
        historyStarted = true;
        history.replaceState(state, '');
    } else {
        history.pushState(state, '');
    }
}

Object.assign(app.nav, {
    // opts.fromHistory: true, wenn dieser Aufruf selbst aus dem popstate-
    // Handler unten kommt - dann darf KEIN neuer Verlaufseintrag entstehen,
    // sonst würde jedes "Zurück" sofort wieder einen "Vorwärts"-Eintrag
    // erzeugen (Ping-Pong statt echtem Zurückgehen).
    go(viewId, opts = {}) {
        // NEU (v0.42.0-beta): im Kinder-Lesemodus nur Bibliothek/Reader/
        // Vokabeln/Hilfe - Buchansicht wird zur Bibliothek umgeleitet, alles
        // andere gesperrt (js/actions/kidMode.js).
        if (app.actions.kidModeGuard) {
            const target = app.actions.kidModeGuard(viewId);
            if (target === null) return;
            viewId = target;
        }
        // NEU: Verlässt man die Werkstatt-Stufenansicht, ohne je etwas
        // eingegeben zu haben, den beim Klick auf "Bilderbuch/Arbeitsheft
        // erstellen" nur im Speicher angelegten Entwurf wieder verwerfen
        // (siehe app.studio.newProject) statt ihn als leere Karteikarte in
        // der Werkstatt-Übersicht liegen zu lassen.
        if (app.state.currentView === 'studioWizard' && viewId !== 'studioWizard') {
            const openProject = app.studio.projects[app.state.currentStudioProjectId];
            if (openProject?._draft) {
                delete app.studio.projects[openProject.id];
            }
        }

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

        // NEU: Film-Vorschau schließen, wenn die Ansicht wechselt - sie
        // läuft als Overlay über allem und würde sonst über der neuen
        // Ansicht stehen bleiben (samt laufendem Animationsschritt).
        if (app.state.videoPreview) app.actions.closeVideoPreview();

        // Hide all main views safely
        // NEU (v0.47.0-beta): Buchatlas-Mehrfachauswahl ist reine Sitzungs-
        // logik - beim Verlassen der Buchatlas-Bibliothek zurücksetzen, sonst
        // bliebe sie unbemerkt aktiv (js/atlas/render/atlasLibrary.js).
        if (viewId !== 'atlas') app.atlas.actions.resetLibrarySelection?.();

        // NEU (v0.47.0-beta): + die fünf Buchatlas-Ansichten (app.atlas.nav.viewIds)
        ['viewLibrary', 'viewBook', 'viewScanner', 'viewReader', 'viewSettings', 'viewVocab', 'viewHelp', 'viewStudioLibrary', 'viewStudioWizard', 'viewWorkbookGenerator', ...(app.atlas.nav.viewIds || [])].forEach(id => {
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
        } else if (viewId === 'studio') {
            document.getElementById('viewStudioLibrary').classList.remove('view-hidden');
            app.render.studioLibrary();
        } else if (viewId === 'studioWizard') {
            document.getElementById('viewStudioWizard').classList.remove('view-hidden');
            app.render.studioWizard();
        } else if (viewId === 'workbookGenerator') {
            document.getElementById('viewWorkbookGenerator').classList.remove('view-hidden');
            app.render.workbookGenerator();
        } else if (viewId.startsWith('atlas')) {
            // NEU (v0.47.0-beta): Buchatlas-Ansichten (atlas, atlasBook,
            // atlasWiki, atlasTranslate, atlasSettings) - js/atlas/atlasCore.js
            app.atlas.nav.show(viewId);
        }

        // NEU: Verlaufseintrag NACH dem eigentlichen Wechsel, mit den für den
        // Wiederaufbau nötigen IDs (Buch/Seite) - ohne die würde "Zurück" auf
        // eine frühere Buch-/Reader-Ansicht zwar die Ansicht, aber ggf. das
        // FALSCHE (das inzwischen aktuelle) Buch zeigen.
        if (!opts.fromHistory) {
            pushOrReplaceHistory({
                view: viewId,
                bookId: app.state.currentBookId,
                pageIdx: app.state.currentPageIdx,
                studioProjectId: app.state.currentStudioProjectId,
                // NEU (v0.47.0-beta): geöffnetes Buchatlas-Buch
                atlasBookId: app.atlas.state.currentBookId
            });
        }
    }
});

window.addEventListener('popstate', (event) => {
    const state = event.state || { view: 'lib' };
    if (state.bookId !== undefined) app.state.currentBookId = state.bookId;
    if (state.pageIdx !== undefined) app.state.currentPageIdx = state.pageIdx;
    if (state.studioProjectId !== undefined) app.state.currentStudioProjectId = state.studioProjectId;
    if (state.atlasBookId !== undefined) app.atlas.state.currentBookId = state.atlasBookId;
    app.nav.go(state.view, { fromHistory: true });
});
