import { app } from '../core.js';

Object.assign(app.actions, {
    async askWizard() {
        const input = document.getElementById('chatInput');
        const q = input.value.trim();
        if (!q) return;

        const book = app.library[app.state.currentBookId];
        const page = book.pages[app.state.currentPageIdx];
        // NEU (Ausbaustufe 5, Panels): dasselbe Bild wie gerade angezeigt
        // fragen (siehe app.utils.resolveDisplayImageUrl()) - bei
        // ausgeschalteten Sprechblasen soll "Frag den Zauberer" auch die
        // gerade sichtbaren, reinen Bilder sehen, keine andere Fassung.
        const b64 = app.utils.resolveDisplayImageUrl(page).split(',')[1];

        const history = document.getElementById('chatHistory');
        history.innerHTML += `<div class="bg-indigo-50 p-2 rounded-lg text-indigo-900 font-medium"><b>Du:</b> ${app.utils.sanitize(q)}</div>`;
        input.value = '';

        try {
            app.state.apiBusy = true;
            const answer = await app.api.answerQuestion(b64, q);
            if (app.state.autoReadActive) app.tts.stopAutoRead();
            // NEU (v0.41.0-beta, Meldeknopf): Antwort merken und mit 🚩 versehen
            // (app.actions.reportChatAnswer, js/actions/aiReports.js).
            app.state.chatAnswers = app.state.chatAnswers || [];
            const idx = app.state.chatAnswers.push({ question: q, answer }) - 1;
            history.innerHTML += `<div class="bg-purple-50 p-2 rounded-lg text-purple-900 flex items-start gap-2"><span class="flex-1" data-chat-answer="${idx}"><b>🧙‍♂️ Zauberer:</b> ${app.utils.sanitize(answer)}</span><button onclick="app.actions.reportChatAnswer(${idx})" aria-label="Antwort melden" title="Unpassende Antwort melden" class="text-sm opacity-60 hover:opacity-100">🚩</button></div>`;
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
        const changed = app.state.readingPersonaId !== personaId;
        app.state.readingPersonaId = personaId;
        app.render.reader(app.state.currentPageIdx);
        // NEU (v0.39.0-beta, "Personas kommen nicht zur Geltung"): kurze,
        // sichtbare Rückmeldung, wer jetzt erzählt.
        const persona = app.personas.find(p => p.id === personaId);
        if (changed && persona) app.ui.toast(`${app.utils.personaShortName(persona)} erzählt jetzt`, persona.icon || '🎭');
    },

    // NEU (v0.39.0-beta): 🔊 in der Zwischenruf-Sprechblase.
    speakPersonaComment() {
        const book = app.library[app.state.currentBookId];
        const page = book?.pages[app.state.currentPageIdx];
        const variant = page && app.utils.resolvePageVariant(page, app.state.readingPersonaId);
        if (variant?.personaComment) app.tts.speak(variant.personaComment);
    },

    // NEU (Ausbaustufe 5, Panels): Sprechblasen-Sichtbarkeit beim Comic
    // umschalten - reine Lese-Einstellung (wie readingPersonaId), NICHT
    // gespeichert, setzt sich beim nächsten Öffnen zurück auf "sichtbar".
    // Zeigt/versteckt einfach die passende gespeicherte Bildfassung
    // (page.imgUrl MIT Sprechblasen vs. page.comicCleanImgUrl OHNE) - beide
    // liegen bereits fertig vor (siehe js/studio/studioExport.js), hier wird
    // nichts neu erzeugt.
    toggleComicBubblesInReader(showBubbles) {
        app.state.comicBubblesOff = !showBubbles;
        app.render.reader(app.state.currentPageIdx);
        if (app.state.focusMode) app.render.focusMode();
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
    },

    // NEU: eine Seite als Titelseite/Rückseite-Klappentext/Inhaltsverzeichnis/
    // Über-den-Autor markieren (siehe "Seiten-Rollen"-Auswahl in der
    // Buchansicht) - unabhängig von der Scan-Reihenfolge, erleichtert der
    // KI die richtigen Metadaten-Felder zu füllen und
    // app.tts._buildMetadataAnnouncements() die passenden Ansagen.
    // role: 'titlePageId' | 'backCoverPageId' | 'tocPageId' | 'authorBioPageId'.
    // pageIdValue kommt als String aus dem <select> - Seiten-IDs sind
    // Zahlen, deshalb über die Seite selbst statt den rohen String speichern.
    setPageRole(role, pageIdValue) {
        const book = app.library[app.state.currentBookId];
        if (!book) return;
        const page = book.pages.find(p => String(p.id) === pageIdValue);
        book[role] = page ? page.id : null;
        app.dbOps.saveBook(book);

        const labels = { titlePageId: 'Titelseite', backCoverPageId: 'Rückseite/Klappentext', tocPageId: 'Inhaltsverzeichnis', authorBioPageId: 'Über den Autor' };
        app.ui.toast(page ? `${labels[role]} festgelegt` : `${labels[role]}-Markierung entfernt`, '🏷️');

        // FIX: nur Titelseite/Inhaltsverzeichnis beeinflussen tatsächlich,
        // WELCHE Felder die KI extrahiert (siehe js/api.js) - Rückseite und
        // Über-den-Autor lösen nur eine Vorlese-Ansage aus, brauchen also
        // keine erneute (kostenpflichtige) Analyse.
        const needsReanalysis = role === 'titlePageId' || role === 'tocPageId';
        if (page && page.status === 'done' && needsReanalysis) {
            app.actions.retryPage(book.pages.indexOf(page));
        } else {
            app.render.book(book.id);
        }
    },

    // NEU: steuert, ob die "Über den Autor"-Seite beim automatischen
    // Vorlesen mit angesagt/vorgelesen wird - manchen Familien ist die
    // Autor-Biografie für Kinder zu lang/uninteressant.
    toggleReadAuthorBioAloud(enabled) {
        const book = app.library[app.state.currentBookId];
        if (!book) return;
        book.readAuthorBioAloud = enabled;
        app.dbOps.saveBook(book);
        app.ui.toast(enabled ? 'Wird beim Vorlesen mit angesagt' : 'Wird beim automatischen Vorlesen übersprungen', '🔊');
    },

    // NEU: eine Seite komplett von Analyse UND automatischem Vorlesen
    // ausschließen - für Leerseiten, Impressum/Vorsatzseiten etc. ohne
    // Story-Inhalt, die weder API-Kosten noch eine Vorlese-Pause wert sind.
    // Manuelles Ansehen/Durchblättern der Seite bleibt trotzdem möglich.
    togglePageExcluded(pageId) {
        const book = app.library[app.state.currentBookId];
        if (!book) return;
        const page = book.pages.find(p => p.id === pageId);
        if (!page) return;
        page.excluded = !page.excluded;
        app.dbOps.saveBook(book);
        app.render.book(book.id);
        app.ui.toast(
            page.excluded ? 'Seite ausgeschlossen (keine Analyse, kein Vorlesen)' : 'Seite wieder eingeschlossen',
            page.excluded ? '🚫' : '✅'
        );
    }
});
