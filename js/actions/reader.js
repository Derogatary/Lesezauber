import { app } from '../core.js';

Object.assign(app.actions, {
    async askWizard() {
        const input = document.getElementById('chatInput');
        const q = input.value.trim();
        if (!q) return;

        const book = app.library[app.state.currentBookId];
        const page = book.pages[app.state.currentPageIdx];
        const b64 = page.imgUrl.split(',')[1];

        const history = document.getElementById('chatHistory');
        history.innerHTML += `<div class="bg-indigo-50 p-2 rounded-lg text-indigo-900 font-medium"><b>Du:</b> ${app.utils.sanitize(q)}</div>`;
        input.value = '';

        try {
            app.state.apiBusy = true;
            const answer = await app.api.answerQuestion(b64, q);
            if (app.state.autoReadActive) app.tts.stopAutoRead();
            history.innerHTML += `<div class="bg-purple-50 p-2 rounded-lg text-purple-900"><b>🧙‍♂️ Zauberer:</b> ${app.utils.sanitize(answer)}</div>`;
            history.scrollTop = history.scrollHeight;
            app.tts.speak(answer);
        } catch (e) {
            app.ui.toast('Fehler beim Antworten', '❌');
        } finally {
            app.state.apiBusy = false;
        }
    },

    // NEU: Persona nur für das gerade geöffnete Buch umschalten - ändert
    // NICHT die globale Standard-Persona für zukünftige Scans.
    switchReadingPersona(personaId) {
        app.state.readingPersonaId = personaId;
        app.render.reader(app.state.currentPageIdx);
    },

    deletePage(idx) {
        const book = app.library[app.state.currentBookId];
        const [removed] = book.pages.splice(idx, 1);
        app.dbOps.saveBook(book);
        app.render.book(book.id);

        // NEU: 5 Sekunden Zeit, das Löschen rückgängig zu machen.
        app.ui.toast('Seite entfernt', '🗑️', () => {
            const b = app.library[app.state.currentBookId];
            if (!b) return;
            b.pages.splice(idx, 0, removed);
            app.dbOps.saveBook(b);
            app.render.book(b.id);
        });
    },

    // NEU: eine bestimmte Seite als Buch-Cover festlegen
    setCover(pageId) {
        const book = app.library[app.state.currentBookId];
        book.coverPageId = pageId;
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        app.ui.toast('Cover festgelegt', '⭐');
    }
});
