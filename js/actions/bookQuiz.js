import { app } from '../core.js';

Object.assign(app.actions, {
    // NEU: erstellt (oder zeigt bereits vorhandene) Verständnisfragen zum
    // GESAMTEN Buch - erscheint nur auf der letzten Seite im Reader.
    // Wird wie die Personas gecacht (book.bookQuiz), damit nicht bei jedem
    // Aufruf erneut die KI bemüht wird.
    async generateBookQuiz(forceRegenerate = false) {
        const book = app.library[app.state.currentBookId];
        if (!book) return;

        if (book.bookQuiz && !forceRegenerate) {
            app.render.bookQuiz();
            return;
        }

        const personaId = app.state.readingPersonaId || app.settings.persona;
        const compiledText = book.pages
            .map((p, i) => {
                const variant = app.utils.resolveAnyVariant(p, personaId);
                return variant && variant.text ? `Seite ${i + 1}: ${variant.text}` : null;
            })
            .filter(Boolean)
            .join('\n');

        if (!compiledText) {
            app.ui.toast('Noch keine Seite analysiert - Quiz kann noch nicht erstellt werden.', 'ℹ️');
            return;
        }

        app.ui.showLoader('Erstelle Buch-Quiz...', 'Einen Moment bitte');
        app.state.apiBusy = true;
        try {
            const questions = await app.api.generateBookQuiz(compiledText, personaId, book.language || null);
            book.bookQuiz = { questions };
            app.dbOps.saveBook(book);
            app.render.bookQuiz();
            // FIX: der "Fragen erstellen"-Knopf blieb nach dem Erzeugen
            // stehen (erst ein Seitenwechsel blendete ihn aus) - ein zweiter
            // Klick sah dann aus, als passiere nichts, weil das fertige Quiz
            // ja schon aus dem Zwischenspeicher kam.
            document.getElementById('bookQuizGenerateBtn')?.classList.add('hidden');
        } catch (e) {
            console.error('Buch-Quiz fehlgeschlagen:', e);
            app.ui.toast('Quiz konnte nicht erstellt werden.', '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    }
});
