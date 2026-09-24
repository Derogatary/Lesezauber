import { app } from '../../core.js';

Object.assign(app.atlas.actions, {
    // NEU: einzelnes Buch herunterladen. Gleiches Format wie der
    // Bibliotheks-Export - die Datei lässt sich später über
    // "Importieren" wieder einlesen und ist dann genauso bearbeitbar
    // wie jedes andere Buch (Seiten löschen/verschieben, Cover ändern usw.).
    downloadBook(bookId) {
        const book = app.atlas.library[bookId];
        if (!book) return;

        const dataStr = JSON.stringify(book, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const safeTitle = (book.title || 'buch')
            .toLowerCase()
            .replace(/[^a-z0-9äöüß]+/gi, '-')
            .replace(/^-+|-+$/g, '') || 'buch';

        const a = document.createElement('a');
        a.href = url;
        a.download = `buchatlas-${safeTitle}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        app.atlas.ui.toast('Buch heruntergeladen', '📥');
    },

    // Buch als einfaches Druck-Dokument öffnen (neuer Tab, eigener
    // Druckdialog) - unabhängig vom App-Layout, damit nichts von den
    // normalen Bedienelementen mitgedruckt wird. Reiner Text (kein Bild
    // mehr, da textimportierte Bücher keine Fotos haben).
    printBook() {
        const book = app.atlas.library[app.atlas.state.currentBookId];
        if (!book) return;

        const pagesHtml = book.pages.map((p, i) => `
            <div style="page-break-after: always; padding: 24px 16px;">
                <p style="font-size:11px; color:#999; margin-bottom:12px;">Seite ${i + 1}</p>
                <p style="font-size:16px; line-height:1.6; white-space:pre-line;">${app.utils.sanitize(p.text || '')}</p>
            </div>`).join('');

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            app.atlas.ui.toast('Pop-up blockiert - bitte für diese Seite erlauben.', '⚠️');
            return;
        }

        printWindow.document.write(`
            <html>
            <head><title>${app.utils.sanitize(book.title)}</title></head>
            <body style="font-family: sans-serif; margin:0;">
                <h1 style="text-align:center; margin-top:24px;">${app.utils.sanitize(book.title)}</h1>
                ${pagesHtml}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 400);
    },

    exportLibrary() {
        const bookCount = Object.keys(app.atlas.library).length;
        if (bookCount === 0) {
            app.atlas.ui.toast('Keine Bücher zum Exportieren vorhanden.', 'ℹ️');
            return;
        }

        const dataStr = JSON.stringify(app.atlas.library, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const dateStr = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `buchatlas-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // NEU: Zeitstempel für die Backup-Erinnerung in der Bibliothek
        localStorage.setItem('lz_atlas_last_export', String(Date.now()));

        app.atlas.ui.toast(`${bookCount} Buch/Bücher exportiert.`, '📤');
    },

    triggerImportLibrary() {
        document.getElementById('atlasImportFileInput').click();
    },

    async importLibrary(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const imported = JSON.parse(text);

            if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) {
                throw new Error('Ungültiges Format');
            }

            // NEU: jedes importierte Buch einzeln über dbOps.saveBook
            // speichern - das übernimmt automatisch die richtige
            // Speicher-Engine (IndexedDB), ohne dass diese Datei wissen
            // muss, wie/wo genau gespeichert wird.
            // FIX (v0.47.0-beta): nur echte Buchatlas-Bücher übernehmen (Text-
            // Seiten) - eine versehentlich gewählte LeseZauber-Sicherung hat
            // ein anderes Format und würde sonst Datenmüll erzeugen.
            const importedBooks = Object.values(imported).filter(b =>
                b && typeof b === 'object' && b.id && Array.isArray(b.pages)
                && b.pages.every(p => p && typeof p.text === 'string'));
            if (importedBooks.length === 0) throw new Error('Keine Buchatlas-Bücher in der Datei');
            importedBooks.forEach(book => app.atlas.dbOps.saveBook(book));

            app.atlas.ui.toast(`${importedBooks.length} Buch/Bücher importiert.`, '📥');
            app.atlas.nav.go('lib');
        } catch (err) {
            console.error('Import fehlgeschlagen:', err);
            app.atlas.ui.toast('Datei ungültig - ist es eine Buchatlas-Backup-Datei?', '❌');
        } finally {
            e.target.value = '';
        }
    }
});
