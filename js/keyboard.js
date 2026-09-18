import { app } from './core.js';

// NEU: Tastatursteuerung - jetzt, wo die App auch am Laptop/Desktop
// responsive läuft, sind Pfeiltasten/Escape eine naheliegende Ergänzung
// zu den Touch-Buttons.
document.addEventListener('keydown', (e) => {
    // Nicht eingreifen, während in einem Eingabefeld getippt wird
    // (z.B. Suchfeld, Chat-Frage, API-Key).
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // NEU: Escape schließt auch die Film-Vorschau (gleiches Muster wie
    // beim Vollbild-Vorlese-Modus, sie liegt ebenfalls als Overlay oben).
    // FIX: nicht währenddessen, wenn gerade ein Film kodiert wird
    // (app.state.apiBusy) - das Schließen gibt die dekodierten Seitenbilder
    // frei, die der Export gerade braucht. Abgebrochen wird dann über den
    // "Vorgang abbrechen"-Knopf der Ladeanzeige.
    if (e.key === 'Escape' && app.state.videoPreview && !app.state.apiBusy) {
        app.actions.closeVideoPreview();
        return;
    }

    if (e.key === 'Escape' && app.state.focusMode) {
        app.actions.toggleFocusMode();
        return;
    }

    if (app.state.currentView === 'reader') {
        if (e.key === 'ArrowRight') {
            app.actions.goToPage(1);
        } else if (e.key === 'ArrowLeft') {
            app.actions.goToPage(-1);
        }
    }
});
