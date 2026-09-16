import { app } from '../core.js';

// JSZip liegt als klassisches (nicht-ES-Modul) Skript vor - wird nur bei
// tatsächlichem EPUB-Import per <script>-Tag nachgeladen, nicht bei jedem
// App-Start.
function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('../vendor/jszip/jszip.min.js', import.meta.url).href;
        script.onload = () => resolve(window.JSZip);
        script.onerror = () => reject(new Error('JSZip konnte nicht geladen werden.'));
        document.head.appendChild(script);
    });
}

function dirname(path) {
    const idx = path.lastIndexOf('/');
    return idx === -1 ? '' : path.slice(0, idx);
}

// Einfache relative Pfadauflösung (./, ../) innerhalb des EPUB-Archivs
function resolvePath(baseDir, relativePath) {
    if (!relativePath) return relativePath;
    if (relativePath.startsWith('/')) return relativePath.slice(1);
    const parts = baseDir ? baseDir.split('/').filter(Boolean) : [];
    relativePath.split('/').forEach(part => {
        if (part === '.' || part === '') return;
        if (part === '..') parts.pop();
        else parts.push(part);
    });
    return parts.join('/');
}

function extractTextFromHtml(htmlString) {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    doc.querySelectorAll('script, style').forEach(el => el.remove());
    return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
}

function findFirstImageHref(htmlString) {
    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    const img = doc.querySelector('img[src]');
    if (img) return img.getAttribute('src');
    // Manche (v.a. Fixed-Layout-) EPUBs betten Bilder als SVG <image> ein
    const svgImage = doc.querySelector('image');
    if (svgImage) return svgImage.getAttribute('xlink:href') || svgImage.getAttribute('href');
    return null;
}

// Kapitel ohne eigenes Bild bekommen ein einfaches Text-Ersatzbild, damit
// unser bestehendes "eine Seite = ein Bild + Text"-Modell unverändert
// bleibt - ohne diesen Kniff bräuchte EPUB einen viel größeren Umbau.
function renderTextAsImageCanvas(text) {
    const width = 1200, height = 1600;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fefce8';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#1e293b';
    ctx.font = '42px sans-serif';
    ctx.textBaseline = 'top';

    const words = (text || '(kein Text)').split(/\s+/);
    let line = '';
    let y = 80;
    const maxWidth = width - 160;
    const lineHeight = 60;

    words.forEach(word => {
        const testLine = line + word + ' ';
        if (ctx.measureText(testLine).width > maxWidth && line !== '') {
            ctx.fillText(line, 80, y);
            line = word + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    });
    ctx.fillText(line, 80, y);
    return canvas;
}

Object.assign(app.actions, {
    triggerEpubImport() {
        if (!app.settings.apiKey) {
            app.ui.toast('Bitte zuerst API Key eintragen!', '🔑');
            app.nav.go('settings');
            return;
        }
        document.getElementById('epubFileInput').click();
    },

    async createBookFromEpub(e) {
        const file = e.target.files[0];
        if (!file) return;

        app.ui.showLoader('Öffne EPUB...', 'Einen Moment bitte');
        let newBookId = null;

        try {
            const JSZip = await loadJSZip();
            const zip = await JSZip.loadAsync(file);

            const containerFile = zip.file('META-INF/container.xml');
            if (!containerFile) throw new Error('Keine gültige EPUB-Struktur gefunden.');
            const containerXml = await containerFile.async('text');
            const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
            const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
            if (!opfPath) throw new Error('OPF-Datei nicht gefunden.');
            const opfDir = dirname(opfPath);

            const opfFile = zip.file(opfPath);
            const opfXml = await opfFile.async('text');
            const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

            const manifest = {};
            opfDoc.querySelectorAll('manifest item').forEach(item => {
                manifest[item.getAttribute('id')] = item.getAttribute('href');
            });
            const spineIds = Array.from(opfDoc.querySelectorAll('spine itemref')).map(el => el.getAttribute('idref'));

            const title = opfDoc.querySelector('metadata title')?.textContent?.trim() || 'Neues Buch';
            const author = opfDoc.querySelector('metadata creator')?.textContent?.trim() || 'Unbekannt';

            newBookId = 'book_' + Date.now();
            const newBook = {
                id: newBookId, title, author, created: Date.now(),
                profileId: app.utils.resolveCreationProfileId(), pages: []
            };
            app.library[newBookId] = newBook;
            app.state.currentBookId = newBookId;

            let pageNum = 0;
            for (const spineId of spineIds) {
                pageNum++;
                const href = manifest[spineId];
                if (!href) continue;

                app.ui.showLoader('Importiere EPUB...', `Kapitel ${pageNum} von ${spineIds.length}`);

                const chapterPath = resolvePath(opfDir, href);
                const chapterFile = zip.file(chapterPath);
                if (!chapterFile) continue;

                const chapterHtml = await chapterFile.async('text');
                const text = extractTextFromHtml(chapterHtml);
                const imgHref = findFirstImageHref(chapterHtml);

                // Wirklich leere Kapitel (z.B. reines Inhaltsverzeichnis
                // ohne Bild) überspringen - alles andere wird eine Seite.
                if (!text && !imgHref) continue;

                let source = null;
                let naturalWidth, naturalHeight;

                if (imgHref) {
                    const imgPath = resolvePath(dirname(chapterPath), imgHref);
                    const imgFile = zip.file(imgPath);
                    if (imgFile) {
                        const imgBlob = await imgFile.async('blob');
                        const objUrl = URL.createObjectURL(imgBlob);
                        try {
                            source = await new Promise((resolve, reject) => {
                                const im = new Image();
                                im.onload = () => resolve(im);
                                im.onerror = () => reject(new Error('Bild im EPUB beschädigt.'));
                                im.src = objUrl;
                            });
                            naturalWidth = source.naturalWidth;
                            naturalHeight = source.naturalHeight;
                        } finally {
                            URL.revokeObjectURL(objUrl);
                        }
                    }
                }

                if (!source) {
                    // Kein Bild in diesem Kapitel gefunden - Text als
                    // Ersatzbild rendern (siehe Kommentar bei der Funktion).
                    source = renderTextAsImageCanvas(text);
                    naturalWidth = source.width;
                    naturalHeight = source.height;
                }

                const { full, thumb } = app.utils.createImageVariants(source, naturalWidth, naturalHeight);
                newBook.pages.push({
                    id: Date.now() + pageNum,
                    imgUrl: full,
                    thumbUrl: thumb,
                    status: 'pending',
                    // Wiederverwendet dasselbe Feld wie beim PDF-Import:
                    // garantiert korrekter Text, kein OCR-Rateversuch nötig.
                    pdfSourceText: text || null,
                    text: '', erstleserText: '', desc: '', quizQ: '', quizA: ''
                });
            }

            if (newBook.pages.length === 0) {
                delete app.library[newBookId];
                app.ui.hideLoader();
                app.ui.toast('Im EPUB wurden keine lesbaren Kapitel gefunden.', '❌');
                e.target.value = '';
                return;
            }

            app.dbOps.saveBook(newBook);
            app.ui.hideLoader();
            app.nav.go('book');
        } catch (err) {
            console.error('EPUB-Import fehlgeschlagen:', err);
            if (newBookId) delete app.library[newBookId];
            app.ui.hideLoader();
            app.ui.toast('EPUB konnte nicht gelesen werden.', '❌');
        } finally {
            e.target.value = '';
        }
    }
});
