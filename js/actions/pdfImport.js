import { app } from '../core.js';

// Gleiche Lesegröße wie bei Kamera/Galerie-Import - so bleibt das
// Ergebnis konsistent, egal auf welchem Weg eine Seite reinkommt.
const PDF_RENDER_MAX_WIDTH = 1600;

// PDF.js wird erst geladen, wenn tatsächlich ein PDF importiert wird
// (dynamischer Import) - die ca. 1,7 MB Bibliothek soll nicht jeden
// App-Start verlangsamen, nur weil sie theoretisch existiert.
async function loadPdfLib() {
    const pdfjsLib = await import('../vendor/pdfjs/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return pdfjsLib;
}

Object.assign(app.actions, {
    triggerPdfImport() {
        if (!app.settings.apiKey) {
            app.ui.toast('Bitte zuerst API Key eintragen!', '🔑');
            app.nav.go('settings');
            return;
        }
        document.getElementById('pdfFileInput').click();
    },

    async createBookFromPdf(e) {
        const file = e.target.files[0];
        if (!file) return;

        app.ui.showLoader('Öffne PDF...', 'Einen Moment bitte');

        try {
            const pdfjsLib = await loadPdfLib();
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            const id = 'book_' + Date.now();
            const newBook = {
                id, title: 'Neues Buch', author: 'Unbekannt', created: Date.now(),
                // NEU: ein als Übungsheft importiertes PDF wird auch als
                // Übungsheft ausgewertet (Aufgabe/Hilfe/Lösung statt Erzähltext).
                profileId: app.utils.resolveCreationProfileId(), bookType: app.state.newBookType, pages: []
            };
            app.library[id] = newBook;
            app.state.currentBookId = id;

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                app.ui.showLoader('Importiere PDF...', `Seite ${pageNum} von ${pdf.numPages}`);

                const page = await pdf.getPage(pageNum);
                const baseViewport = page.getViewport({ scale: 1 });
                const scale = PDF_RENDER_MAX_WIDTH / baseViewport.width;
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

                // NEU: prüfen, ob diese PDF-Seite bereits auswählbaren Text
                // enthält (statt nur ein eingescanntes Bild zu sein). Wenn
                // ja, wird dieser exakte Text später verwendet statt ihn
                // von der KI per OCR neu erkennen zu lassen.
                let pdfSourceText = null;
                try {
                    const textContent = await page.getTextContent();
                    const extracted = textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
                    if (extracted.length > 15) pdfSourceText = extracted;
                } catch (textErr) {
                    console.warn('Textebene dieser PDF-Seite konnte nicht gelesen werden, nutze OCR:', textErr);
                }

                // Gleiche Funktion wie bei Kamera/Galerie: erzeugt Lese- und
                // Thumbnail-Version als WebP aus der PDF-gerenderten Seite.
                const { full, thumb } = app.utils.createImageVariants(canvas, canvas.width, canvas.height);
                newBook.pages.push({
                    id: Date.now() + pageNum,
                    imgUrl: full,
                    thumbUrl: thumb,
                    status: 'pending',
                    pdfSourceText,
                    text: '', erstleserText: '', desc: '', quizQ: '', quizA: ''
                });
            }

            app.dbOps.saveBook(newBook);
            app.ui.hideLoader();
            // FIX: siehe gleicher Fix beim Galerie-Import - app.nav.go()
            // wechselt die Ansicht tatsächlich, statt sie nur unsichtbar
            // im Hintergrund zu aktualisieren.
            app.nav.go('book');
        } catch (err) {
            console.error('PDF-Import fehlgeschlagen:', err);
            app.ui.hideLoader();
            // NEU: spezifischere Meldung statt immer nur "konnte nicht
            // gelesen werden" - hilft einzuordnen, woran es liegt.
            let message = 'PDF konnte nicht gelesen werden.';
            if (err?.name === 'PasswordException') {
                message = 'Dieses PDF ist passwortgeschützt - wird aktuell nicht unterstützt.';
            } else if (err?.name === 'InvalidPDFException') {
                message = 'Die Datei scheint kein gültiges PDF zu sein.';
            }
            app.ui.toast(message, '❌');
        } finally {
            e.target.value = '';
        }
    }
});
