import { app } from '../core.js';

Object.assign(app.actions, {
    // NEU: einzelnes Buch herunterladen. Gleiches Format wie der
    // Bibliotheks-Export - die Datei lässt sich später über
    // "Importieren" wieder einlesen und ist dann genauso bearbeitbar
    // wie jedes andere Buch (Seiten löschen/verschieben, Cover ändern usw.).
    downloadBook(bookId) {
        const book = app.library[bookId];
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
        a.download = `lesezauber-${safeTitle}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        app.ui.toast('Buch heruntergeladen', '📥');
    },

    // NEU: Buch als einfaches Druck-Dokument öffnen (neuer Tab, eigener
    // Druckdialog) - unabhängig vom App-Layout, damit nichts von den
    // normalen Bedienelementen mitgedruckt wird.
    printBook() {
        const book = app.library[app.state.currentBookId];
        if (!book) return;

        const personaId = app.state.readingPersonaId || app.settings.persona;
        // NEU: bei einem Übungsheft kommen unter das Blatt zusätzlich die
        // kindgerechte Erklärung und die Hilfeschritte - so kann man das
        // Heft ausdrucken und ohne Tablet damit arbeiten.
        const isWorkbook = app.utils.resolveBookType(book) === 'workbook';
        const pagesHtml = book.pages.map((p, i) => {
            const variant = app.utils.resolveAnyVariant(p, personaId);
            const text = variant?.text || '';
            const steps = (isWorkbook && Array.isArray(variant?.helpSteps)) ? variant.helpSteps : [];
            const stepsHtml = steps.length > 0
                ? `<ol style="font-size:13px; text-align:left; max-width:520px; margin:12px auto 0; color:#444; line-height:1.6;">${steps.map(step => `<li>${app.utils.sanitize(step)}</li>`).join('')}</ol>`
                : '';
            const explainedHtml = (isWorkbook && variant?.erstleserText && variant.erstleserText !== text)
                ? `<p style="font-size:14px; margin-top:8px; color:#444;">${app.utils.sanitize(variant.erstleserText)}</p>`
                : '';
            return `
                <div style="page-break-after: always; text-align:center; padding: 24px 16px;">
                    <img src="${p.imgUrl}" style="max-width:100%; max-height:65vh; object-fit:contain;">
                    <p style="font-size:16px; margin-top:16px; line-height:1.5;">${app.utils.sanitize(text)}</p>
                    ${explainedHtml}
                    ${stepsHtml}
                    <p style="font-size:11px; color:#999; margin-top:8px;">${isWorkbook ? 'Blatt' : 'Seite'} ${i + 1}</p>
                </div>`;
        }).join('');

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            app.ui.toast('Pop-up blockiert - bitte für diese Seite erlauben.', '⚠️');
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
        const bookCount = Object.keys(app.library).length;
        if (bookCount === 0) {
            app.ui.toast('Keine Bücher zum Exportieren vorhanden.', 'ℹ️');
            return;
        }

        const dataStr = JSON.stringify(app.library, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const dateStr = new Date().toISOString().slice(0, 10);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lesezauber-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // NEU: Zeitstempel für die Backup-Erinnerung in der Bibliothek
        localStorage.setItem('lz_last_export', String(Date.now()));

        app.ui.toast(`${bookCount} Buch/Bücher exportiert.`, '📤');
    },

    triggerImportLibrary() {
        document.getElementById('importFileInput').click();
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
            const importedBooks = Object.values(imported);
            importedBooks.forEach(book => app.dbOps.saveBook(book));

            app.ui.toast(`${importedBooks.length} Buch/Bücher importiert.`, '📥');
            app.nav.go('lib');
        } catch (err) {
            console.error('Import fehlgeschlagen:', err);
            app.ui.toast('Datei ungültig - ist es eine LeseZauber-Backup-Datei?', '❌');
        } finally {
            e.target.value = '';
        }
    }
});
