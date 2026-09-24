import { app } from '../../core.js';

// ================= Text-Import (kein Foto/OCR nötig) =================
// Für bereits digital vorliegenden Text (E-Books, alte Übersetzungen,
// Abschriften) per Copy-Paste oder .txt-Datei. Im Unterschied zum
// früheren Foto-Import entsteht hier KEIN Bild pro Seite und es wird
// KEIN KI-Call zum "Einlesen" gebraucht - der Text ist ja schon da.
// page.text wird direkt gesetzt; Wiki- und Übersetzungs-Funktion lesen
// ausschließlich dieses Feld. Für ePub/PDF siehe actions/fileImport.js -
// die Chunking-Logik (app.atlas.utils.buildPagesFromText) wird dort mitbenutzt.

function buildTextBook(rawText, title) {
    const pages = app.atlas.utils.buildPagesFromText(rawText);
    if (pages.length === 0) {
        app.atlas.ui.toast('Kein Text gefunden.', '❌');
        return null;
    }

    return {
        id: 'book_' + Date.now(),
        title: (title || '').trim() || 'Importierter Text',
        author: 'Unbekannt',
        created: Date.now(),
        sourceType: 'text', // unterscheidet Text-Import von ePub/PDF
        pages
    };
}

Object.assign(app.atlas.actions, {
    showTextImportModal() {
        app.atlas.ui.openModalFocus('atlasTextImportTitle');
        document.getElementById('atlasTextImportModal')?.classList.remove('hidden');
    },

    hideTextImportModal() {
        document.getElementById('atlasTextImportModal')?.classList.add('hidden');
        const textarea = document.getElementById('atlasTextImportTextarea');
        const titleInput = document.getElementById('atlasTextImportTitle');
        if (textarea) textarea.value = '';
        if (titleInput) titleInput.value = '';
        app.atlas.ui.closeModalFocus();
    },

    submitPastedText() {
        const rawText = document.getElementById('atlasTextImportTextarea')?.value || '';
        const title = document.getElementById('atlasTextImportTitle')?.value || '';
        if (!rawText.trim()) {
            app.atlas.ui.toast('Bitte Text einfügen.', 'ℹ️');
            return;
        }
        const book = buildTextBook(rawText, title);
        if (!book) return;
        this.hideTextImportModal();
        this.finishImport(book, `Text importiert: ${book.pages.length} Seite(n)`);
    },

    triggerTextFileImport() {
        document.getElementById('atlasTextImportFileInput')?.click();
    },

    async createBookFromTextFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const rawText = await file.text();
            const titleInput = document.getElementById('atlasTextImportTitle');
            const fallbackTitle = file.name.replace(/\.[^./]+$/, '');
            const book = buildTextBook(rawText, (titleInput?.value || '').trim() || fallbackTitle);
            if (book) {
                this.hideTextImportModal();
                this.finishImport(book, `Text importiert: ${book.pages.length} Seite(n)`);
            }
        } catch (err) {
            console.error('Textdatei konnte nicht gelesen werden:', err);
            app.atlas.ui.toast('Datei konnte nicht gelesen werden.', '❌');
        } finally {
            e.target.value = '';
        }
    }
});
