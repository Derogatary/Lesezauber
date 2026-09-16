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

    // NEU: Frage sprechen statt tippen. Es gibt KEINE eigene Spracherkennung
    // in der App - die Diktierfunktion steckt in der Bildschirmtastatur des
    // Geräts (Gboard/iOS). Mehr als das Feld zu fokussieren (womit sich die
    // Tastatur öffnet) und darauf hinzuweisen, kann Webcode nicht tun.
    focusChatInput() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        // Der passende Tab muss sichtbar sein - ein ausgeblendetes Feld
        // lässt sich nicht fokussieren, die Tastatur ginge dann nicht auf.
        app.readerUI.setTab('quiz');
        input.focus();
        app.ui.toast('Tippe auf das 🎤 in deiner Tastatur und sprich die Frage', '🎤');
    },

    // NEU: Persona nur für das gerade geöffnete Buch umschalten - ändert
    // NICHT die globale Standard-Persona für zukünftige Scans.
    // NEU: manuelle Vor/Zurück-Navigation im Reader - funktioniert immer,
    // unabhängig vom Analyse-Status einer Seite (auch eine fehlerhafte
    // oder noch nicht analysierte Seite lässt sich so überspringen).
    goToPage(direction) {
        const book = app.library[app.state.currentBookId];
        if (!book) return;
        const newIdx = app.state.currentPageIdx + direction;
        if (newIdx < 0 || newIdx >= book.pages.length) return;

        // FIX: lief das Auto-Vorlesen gerade (z.B. noch für die alte
        // Seite), lief die "Kette" bisher unbemerkt weiter und sprang am
        // Ende von der NEUEN currentPageIdx aus nochmal +1 weiter -
        // sichtbar z.B. als Sprung auf S.8 während des Vorlesens, der
        // Erzähler landete danach aber bei S.9. Jetzt wird die laufende
        // Vorlese-Kette sauber gestoppt und bei Bedarf an der neuen Stelle
        // neu gestartet, statt im Hintergrund weiterzulaufen.
        const wasReading = app.state.autoReadActive;
        if (wasReading) app.tts.stopAutoRead();

        app.state.currentPageIdx = newIdx;
        app.render.reader(newIdx);
        if (app.state.focusMode) app.render.focusMode();

        if (wasReading) app.tts.startAutoRead();
    },

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
