import { app } from '../../core.js';

Object.assign(app.atlas.actions, {
    // (Abbrechen-Knopf im Loader: app.actions.cancelAnalysis() von
    // LeseZauber, setzt dasselbe app.state.cancelAnalysis - seit v0.47.0-beta
    // keine eigene Buchatlas-Fassung mehr.)

    // Sicherheitsabfrage vor dem Löschen eines ganzen Buches - anders als
    // beim Löschen einer einzelnen Seite gibt es hier kein Rückgängig, das
    // sollte man nicht versehentlich per Klick auslösen können.
    confirmDeleteBook(bookId) {
        const book = app.atlas.library[bookId];
        if (!book) return;
        const confirmed = confirm(`"${book.title}" endgültig löschen? Das kann NICHT rückgängig gemacht werden.`);
        if (confirmed) {
            app.atlas.dbOps.deleteBook(bookId);
        }
    },

    // Gemeinsamer Abschluss für ALLE Import-Wege (Text/ePub/PDF/Bilder):
    // speichert das Buch, öffnet es und zeigt einen Toast mit Rückgängig-
    // Option, die das gerade importierte Buch wieder löscht - falls der
    // Import z.B. mit der falschen Datei ausgelöst wurde. Etwas längere
    // Anzeigedauer als sonst (8s statt 5s), weil man sich das importierte
    // Buch erst kurz anschauen will, bevor man sich entscheidet.
    finishImport(book, message) {
        app.atlas.dbOps.saveBook(book);
        app.atlas.state.currentBookId = book.id;
        app.atlas.nav.go('book');
        app.atlas.ui.toast(message, '✅', () => {
            app.atlas.dbOps.deleteBook(book.id);
            app.atlas.nav.go('lib');
        }, 8000);
    },

    // direction: -1 = eine Position nach oben, +1 = eine Position nach unten
    movePage(idx, direction) {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= book.pages.length) return;

        const pages = book.pages;
        [pages[idx], pages[newIdx]] = [pages[newIdx], pages[idx]];

        app.atlas.dbOps.saveBook(book);
        app.atlas.render.book(book.id);
    },

    deletePage(idx) {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        const [removed] = book.pages.splice(idx, 1);
        app.atlas.dbOps.saveBook(book);
        app.atlas.render.book(book.id);

        // 5 Sekunden Zeit, das Löschen rückgängig zu machen.
        app.atlas.ui.toast('Seite entfernt', '🗑️', () => {
            const b = app.atlas.library[app.atlas.state.currentBookId];
            if (!b) return;
            b.pages.splice(idx, 0, removed);
            app.atlas.dbOps.saveBook(b);
            app.atlas.render.book(b.id);
        });
    },

    // ------------- Leichtgewichtiger Text-Viewer/-Editor -------------
    // Ersatz für den entfernten Bild-Reader. Wird von der Buch-Detail-
    // Seite sowie von den "Seite X"-Sprungmarken in Wiki und Übersetzung
    // genutzt. Merkt sich den Index, damit die Vor/Zurück-Pfeile im Modal
    // blättern können, ohne es zu schließen und neu zu öffnen.
    showPageText(idx) {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;
        const page = book.pages[idx];
        if (!page) return;

        // Falls das Modal gerade neu geöffnet wird (nicht nur geblättert),
        // Fokus merken, um ihn beim Schließen zurückzugeben.
        const modal = document.getElementById('atlasPageTextModal');
        if (modal && modal.classList.contains('hidden')) {
            app.atlas.ui.openModalFocus('atlasPageTextCloseBtn');
        }
        // Falls gerade bearbeitet wurde (z.B. beim Blättern ohne zu
        // speichern), sauber in den Lesemodus zurücksetzen.
        this.cancelEditPageText();

        app.atlas.state.pageTextModalIdx = idx;

        document.getElementById('atlasPageTextTitle').textContent = `Seite ${idx + 1} von ${book.pages.length}`;
        document.getElementById('atlasPageTextBody').textContent = page.text || '(kein Text)';
        modal?.classList.remove('hidden');

        const prevBtn = document.getElementById('atlasPageTextPrevBtn');
        const nextBtn = document.getElementById('atlasPageTextNextBtn');
        if (prevBtn) prevBtn.disabled = idx <= 0;
        if (nextBtn) nextBtn.disabled = idx >= book.pages.length - 1;
    },

    showAdjacentPageText(direction) {
        const idx = app.atlas.state.pageTextModalIdx;
        if (idx === undefined || idx === null) return;
        this.showPageText(idx + direction);
    },

    hidePageTextModal() {
        this.cancelEditPageText();
        document.getElementById('atlasPageTextModal')?.classList.add('hidden');
        app.atlas.state.pageTextModalIdx = null;
        app.atlas.ui.closeModalFocus();
    },

    startEditPageText() {
        const idx = app.atlas.state.pageTextModalIdx;
        const book = app.atlas.library[app.atlas.state.currentBookId];
        const page = book?.pages[idx];
        if (!page) return;

        document.getElementById('atlasPageTextBody').classList.add('hidden');
        const textarea = document.getElementById('atlasPageTextEditArea');
        textarea.value = page.text || '';
        textarea.classList.remove('hidden');
        textarea.focus();

        document.getElementById('atlasPageTextEditBtn').classList.add('hidden');
        document.getElementById('atlasPageTextSaveBtn').classList.remove('hidden');
        document.getElementById('atlasPageTextCancelEditBtn').classList.remove('hidden');

        // Vor/Zurück während des Bearbeitens sperren - sonst gehen
        // ungespeicherte Änderungen beim Blättern verloren, ohne Warnung.
        document.getElementById('atlasPageTextPrevBtn').disabled = true;
        document.getElementById('atlasPageTextNextBtn').disabled = true;
    },

    cancelEditPageText() {
        const editArea = document.getElementById('atlasPageTextEditArea');
        const editBtn = document.getElementById('atlasPageTextEditBtn');
        // Nichts zu tun, wenn gar nicht im Bearbeiten-Modus - verhindert
        // unnötige DOM-Zugriffe beim normalen Blättern/Schließen.
        if (!editArea || editArea.classList.contains('hidden')) return;

        editArea.classList.add('hidden');
        document.getElementById('atlasPageTextBody')?.classList.remove('hidden');
        editBtn?.classList.remove('hidden');
        document.getElementById('atlasPageTextSaveBtn')?.classList.add('hidden');
        document.getElementById('atlasPageTextCancelEditBtn')?.classList.add('hidden');

        const idx = app.atlas.state.pageTextModalIdx;
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (book && idx !== null && idx !== undefined) {
            const prevBtn = document.getElementById('atlasPageTextPrevBtn');
            const nextBtn = document.getElementById('atlasPageTextNextBtn');
            if (prevBtn) prevBtn.disabled = idx <= 0;
            if (nextBtn) nextBtn.disabled = idx >= book.pages.length - 1;
        }
    },

    savePageTextEdit() {
        const idx = app.atlas.state.pageTextModalIdx;
        const book = app.atlas.library[app.atlas.state.currentBookId];
        const page = book?.pages[idx];
        if (!page) return;

        page.text = document.getElementById('atlasPageTextEditArea').value;
        app.atlas.dbOps.saveBook(book);

        this.cancelEditPageText();
        this.showPageText(idx); // aktualisierte Anzeige
        app.atlas.render.book(book.id); // Vorschau im Buch-Raster im Hintergrund aktuell halten
        app.atlas.ui.toast('Seite gespeichert', '✅');
    }
});
