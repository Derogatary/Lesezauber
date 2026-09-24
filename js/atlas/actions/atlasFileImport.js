import { app } from '../../core.js';

// ================= ePub-, PDF- und Bild-Import =================
// ePub und PDF enthalten meistens schon digitalen Text - der wird direkt
// extrahiert (kein OCR nötig, schneller und kostenlos). NUR wenn eine
// PDF-Seite keine eigene Textebene hat (typisch bei eingescannten Büchern)
// oder direkt ein Bild importiert wird, kommt OCR über Gemini Vision zum
// Einsatz (app.atlas.api.ocrImage) - siehe extractPdfText() und
// createBookFromImageFiles() unten. Seiten mit bereits vorhandenem Text
// werden NIE zusätzlich per OCR gelesen, das wäre unnötig langsam und
// würde unnötig API-Kontingent verbrauchen.
//
// FIX (v0.47.0-beta): pdf.js/JSZip kommen jetzt aus js/vendor/
// (app.atlas.utils.loadPdfLib()/loadJSZip()) statt vom CDN - kein
// ungeprüfter fremder Code mehr, und der Import klappt auch offline.

// Unter dieser Anzahl an tatsächlichen Buchstaben (nicht Leerzeichen/
// Satzzeichen/Seitenzahlen) gilt eine PDF-Seite als "hat keine eigene
// Textebene".
const OCR_THRESHOLD_LETTERS = 15;

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
        reader.readAsDataURL(file);
    });
}

function setLoaderProgress(title, sub) {
    const titleEl = document.getElementById('processTitle');
    const subEl = document.getElementById('processSub');
    if (titleEl && title) titleEl.innerText = title;
    if (subEl && sub) subEl.innerText = sub;
}

// -------------------- PDF --------------------
// pdf.js liest zuerst die eingebettete Textebene aus (kostenlos, sofort).
// Seiten ohne verwertbaren Text (< OCR_THRESHOLD_LETTERS Zeichen) werden
// NACHTRÄGLICH einzeln als Bild gerendert und per Gemini-OCR gelesen -
// so bekommen auch gemischte oder komplett gescannte PDFs einen
// vollständigen Text, ohne bereits digitale Seiten unnötig zu OCRen.
async function extractPdfText(file) {
    const pdfjsLib = await app.atlas.utils.loadPdfLib();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const pageTexts = [];
    const ocrNeededIdx = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        // Auch diese (meist schnelle) Phase muss abbrechbar sein - bei
        // sehr langen PDFs sonst ein "Abbrechen"-Button, der nichts tut.
        if (app.state.cancelAnalysis) break;

        let text = '';
        try {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text = content.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
        } catch (err) {
            // Eine einzelne defekte Seite darf nicht den ganzen Import
            // abbrechen - sie bleibt leer und läuft dadurch automatisch
            // durch den OCR-Fallback weiter unten (siehe OCR_THRESHOLD_LETTERS).
            console.error(`Text-Extraktion für PDF-Seite ${i} fehlgeschlagen:`, err);
        }
        pageTexts.push(text);
        // Buchstaben zählen statt roher Zeichenlänge - eine Seite mit nur
        // Seitenzahl + Satzzeichen ("- 42 -") wäre nach Zeichenlänge evtl.
        // schon "genug Text", enthält aber praktisch keinen lesbaren Inhalt.
        const letterCount = (text.match(/\p{L}/gu) || []).length;
        if (letterCount < OCR_THRESHOLD_LETTERS) ocrNeededIdx.push(i - 1);
    }

    let title = '';
    try {
        const meta = await pdf.getMetadata();
        title = meta?.info?.Title || '';
    } catch (e) {
        // Metadaten sind optional - fehlen sie, nutzen wir einfach den
        // Dateinamen als Titel (siehe Aufrufer).
    }

    // Wichtig: cancelAnalysis wird HIER NICHT zurückgesetzt (das passiert
    // einmalig beim Start von createBookFromPdfFile) - sonst würde ein
    // Abbruch-Klick während der obigen Textextraktion-Phase stillschweigend
    // verschluckt, bevor die OCR-Phase unten überhaupt beginnt.
    if (ocrNeededIdx.length > 0 && !app.state.cancelAnalysis) {
        const pacingMs = app.atlas.api.getPacingDelayMs();
        for (let n = 0; n < ocrNeededIdx.length; n++) {
            if (app.state.cancelAnalysis) break;

            const pageIdx = ocrNeededIdx[n];
            setLoaderProgress('Erkenne Text per OCR...', `Gescannte Seite ${n + 1} von ${ocrNeededIdx.length} · ${app.atlas.utils.formatEta(ocrNeededIdx.length - n, pacingMs)}`);

            try {
                const page = await pdf.getPage(pageIdx + 1);
                const viewport = page.getViewport({ scale: 1.6 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

                pageTexts[pageIdx] = await app.atlas.api.ocrImage(base64);
            } catch (err) {
                console.error(`OCR für PDF-Seite ${pageIdx + 1} fehlgeschlagen:`, err);
                // Diese eine Seite bleibt dann leer/kurz - der Rest läuft weiter,
                // AUSSER der Grund ist ein fehlender API-Key - dann würden alle
                // weiteren Seiten ohnehin genauso scheitern, also gleich abbrechen.
                if (err?.message === 'API_KEY_MISSING') {
                    app.atlas.ui.toastApiError(err, 'OCR fehlgeschlagen.');
                    break;
                }
            }

            if (n < ocrNeededIdx.length - 1 && !app.state.cancelAnalysis) {
                setLoaderProgress(null, 'Warte auf API...');
                await new Promise(r => setTimeout(r, pacingMs));
            }
        }
    }

    return { rawText: pageTexts.join('\n\n'), title, ocrPageCount: ocrNeededIdx.length };
}

// -------------------- ePub --------------------
// ePub ist im Kern ein ZIP-Archiv aus XHTML-Dateien mit bereits digitalem
// Text - hier gibt es also nie einen OCR-Bedarf. Statt den Text in
// Kapitel-Blöcke zu raten (wie beim .txt-Import), nutzen wir die
// tatsächliche Kapitel-/Dateistruktur aus dem Buch selbst.

// Wandelt XHTML-Kapiteltext in reinen Fließtext um. textContent allein
// reicht nicht, weil es Tag-Grenzen ignoriert ("</p><p>" würde sonst zu
// zusammengeklebten Wörtern führen) - deshalb werden Block-Elemente vorher
// in Zeilenumbrüche übersetzt.
function htmlToPlainText(html) {
    const withBreaks = html
        .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote)\s*\/?>/gi, '\n')
        .replace(/<(p|div|li|h[1-6]|blockquote)\b[^>]*>/gi, '\n');
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    doc.querySelectorAll('script, style').forEach(el => el.remove());
    return (doc.body?.textContent || '')
        .replace(/[ \t]+/g, ' ')
        .split('\n').map(l => l.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Liest den ersten passenden Tag (versucht mehrere Namensvarianten wegen
// XML-Namensräumen wie "dc:title" vs. "title").
function readFirstTag(doc, tagNames) {
    for (const name of tagNames) {
        const el = doc.getElementsByTagName(name)[0];
        if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
}

// Löst einen relativen Pfad aus der OPF-Datei (z.B. "text/kapitel1.xhtml")
// gegen das Verzeichnis der OPF-Datei selbst auf (z.B. "OEBPS/") - inkl.
// Auflösen von "../".
function resolveZipPath(baseDir, href) {
    const decoded = decodeURIComponent(href.split('#')[0]);
    const combined = (baseDir + decoded).split('/');
    const resolved = [];
    for (const part of combined) {
        if (part === '..') resolved.pop();
        else if (part !== '.' && part !== '') resolved.push(part);
    }
    return resolved.join('/');
}

async function extractEpubChapters(file) {
    const JSZip = await app.atlas.utils.loadJSZip();
    const zip = await JSZip.loadAsync(file);

    const containerXml = await zip.file('META-INF/container.xml')?.async('string');
    if (!containerXml) throw new Error('Keine gültige ePub-Datei (container.xml fehlt).');
    const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
    const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) throw new Error('Keine gültige ePub-Datei (rootfile fehlt).');

    const opfXml = await zip.file(opfPath)?.async('string');
    if (!opfXml) throw new Error('OPF-Datei nicht gefunden.');
    const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');

    const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

    const title = readFirstTag(opfDoc, ['dc:title', 'title']);
    const author = readFirstTag(opfDoc, ['dc:creator', 'creator']);

    // Manifest: id -> {href, mediaType}
    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
        manifest[item.getAttribute('id')] = {
            href: item.getAttribute('href'),
            mediaType: item.getAttribute('media-type') || ''
        };
    });

    // Spine: Lesereihenfolge der Kapiteldateien
    const spineIds = Array.from(opfDoc.querySelectorAll('spine itemref')).map(el => el.getAttribute('idref'));

    const chapters = [];
    let skippedCount = 0;
    let wasCancelled = false;
    for (const idref of spineIds) {
        if (app.state.cancelAnalysis) { wasCancelled = true; break; }

        const entry = manifest[idref];
        if (!entry || !/html|xml/i.test(entry.mediaType)) continue; // Bilder/CSS/NCX etc. überspringen

        try {
            const zipPath = resolveZipPath(baseDir, entry.href);
            const fileEntry = zip.file(zipPath);
            if (!fileEntry) continue;

            const html = await fileEntry.async('string');
            const text = htmlToPlainText(html);
            if (text.length < 40) continue; // vermutlich Cover/Leerseite - überspringen

            const headingMatch = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/is);
            const chapterTitle = headingMatch ? htmlToPlainText(headingMatch[1]) : '';

            chapters.push({ title: chapterTitle, text });
        } catch (err) {
            // Ein einzelnes defektes Kapitel darf nicht den ganzen Import
            // abbrechen - wird übersprungen, der Rest läuft normal weiter.
            console.error(`ePub-Kapitel "${entry.href}" konnte nicht gelesen werden:`, err);
            skippedCount++;
        }
    }

    return { title, author, chapters, skippedCount, wasCancelled };
}

Object.assign(app.atlas.actions, {
    triggerPdfFileImport() {
        document.getElementById('atlasPdfFileInput')?.click();
    },

    triggerEpubFileImport() {
        document.getElementById('atlasEpubFileInput')?.click();
    },

    triggerImageFileImport() {
        document.getElementById('atlasImageFileInput')?.click();
    },

    async createBookFromPdfFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        app.state.cancelAnalysis = false;
        app.state.apiBusy = true;
        app.atlas.ui.showLoader('Lese PDF-Text...', 'Suche nach eingebettetem Text');
        try {
            const { rawText, title, ocrPageCount } = await extractPdfText(file);
            const wasCancelled = app.state.cancelAnalysis;
            const pages = app.atlas.utils.buildPagesFromText(rawText);

            if (pages.length === 0) {
                app.atlas.ui.toast(
                    wasCancelled ? 'Import abgebrochen - noch kein Text erfasst.' : 'Kein Text im PDF gefunden - auch OCR konnte nichts erkennen.',
                    wasCancelled ? '⏹️' : '❌'
                );
                return;
            }

            const book = {
                id: 'book_' + Date.now(),
                title: title || file.name.replace(/\.[^./]+$/, ''),
                author: 'Unbekannt',
                created: Date.now(),
                sourceType: 'pdf',
                pages
            };
            const ocrNote = ocrPageCount > 0 ? ` (davon ${ocrPageCount} per OCR erkannt)` : '';
            const cancelNote = wasCancelled ? ' - Import abgebrochen, nur teilweise erfasst' : '';
            this.finishImport(book, `PDF importiert: ${pages.length} Seite(n)${ocrNote}${cancelNote}`);
            app.atlas.ui.notifyIfHidden('Import fertig', `${book.title} - PDF-Import abgeschlossen.`);
        } catch (err) {
            console.error('PDF-Import fehlgeschlagen:', err);
            app.atlas.ui.toast('PDF konnte nicht gelesen werden.', '❌');
        } finally {
            app.state.apiBusy = false;
            app.atlas.ui.hideLoader();
        }
    },

    async createBookFromEpubFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        app.state.cancelAnalysis = false;
        app.atlas.ui.showLoader('Entpacke ePub...', 'Lese Kapitel aus der Datei');
        try {
            const { title, author, chapters, skippedCount, wasCancelled } = await extractEpubChapters(file);
            if (chapters.length === 0) {
                app.atlas.ui.toast(
                    wasCancelled ? 'Import abgebrochen - noch kein Kapitel erfasst.' : 'Kein lesbarer Text im ePub gefunden.',
                    wasCancelled ? '⏹️' : '❌'
                );
                return;
            }

            const book = {
                id: 'book_' + Date.now(),
                title: title || file.name.replace(/\.[^./]+$/, ''),
                author: author || 'Unbekannt',
                created: Date.now(),
                sourceType: 'epub',
                pages: chapters.map((c, i) => ({
                    id: Date.now() + i,
                    text: c.title ? `${c.title}\n\n${c.text}` : c.text,
                    status: 'done'
                }))
            };
            const skipNote = skippedCount > 0 ? ` (${skippedCount} Kapitel übersprungen - defekt/nicht lesbar)` : '';
            const cancelNote = wasCancelled ? ' - Import abgebrochen, nur teilweise erfasst' : '';
            this.finishImport(book, `ePub importiert: ${chapters.length} Kapitel${skipNote}${cancelNote}`);
            app.atlas.ui.notifyIfHidden('Import fertig', `${book.title} - ePub-Import abgeschlossen.`);
        } catch (err) {
            console.error('ePub-Import fehlgeschlagen:', err);
            app.atlas.ui.toast('ePub konnte nicht gelesen werden.', '❌');
        } finally {
            app.atlas.ui.hideLoader();
        }
    },

    // -------------------- Bilder direkt per OCR --------------------
    // Für fotografierte/gescannte Seiten, die nicht in einem PDF stecken -
    // z.B. Einzelfotos von Buchseiten. Läuft komplett über OCR, da Bilder
    // naturgemäß keine eigene Textebene haben. Mehrfachauswahl möglich,
    // wird nach Dateiname sortiert (falls z.B. "seite-01.jpg" benannt).
    async createBookFromImageFiles(e) {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        e.target.value = '';

        if (!app.atlas.settings.apiKeys || app.atlas.settings.apiKeys.length === 0) {
            app.atlas.ui.toast('Kein API-Key hinterlegt - unter ⚙️ Einstellungen eintragen.', '🔑', null, 6000);
            return;
        }

        files.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));

        const pacingMs = app.atlas.api.getPacingDelayMs();
        app.state.cancelAnalysis = false;
        app.state.apiBusy = true;
        app.atlas.ui.showLoader('Erkenne Text per OCR...', `Bild 1 von ${files.length} · ${app.atlas.utils.formatEta(files.length, pacingMs)}`);

        const pages = [];
        for (let i = 0; i < files.length; i++) {
            if (app.state.cancelAnalysis) {
                app.atlas.ui.toast('Import abgebrochen', '⏹️');
                break;
            }

            setLoaderProgress(null, `Bild ${i + 1} von ${files.length} · ${app.atlas.utils.formatEta(files.length - i, pacingMs)}`);

            try {
                const base64 = await fileToBase64(files[i]);
                const text = await app.atlas.api.ocrImage(base64, files[i].type || 'image/jpeg');
                if (text) pages.push({ id: Date.now() + i, text, status: 'done' });
            } catch (err) {
                console.error(`OCR für Bild ${i + 1} fehlgeschlagen:`, err);
                app.atlas.ui.toastApiError(err, `Bild ${i + 1}: OCR fehlgeschlagen.`);
                if (err?.message === 'API_KEY_MISSING') break; // ohne Key schlagen alle weiteren genauso fehl
            }

            if (i < files.length - 1 && !app.state.cancelAnalysis) {
                setLoaderProgress(null, 'Warte auf API...');
                await new Promise(r => setTimeout(r, pacingMs));
            }
        }

        app.state.apiBusy = false;
        app.atlas.ui.hideLoader();

        if (pages.length === 0) {
            app.atlas.ui.toast('Kein Text erkannt.', '❌');
            return;
        }

        const book = {
            id: 'book_' + Date.now(),
            title: files[0].name.replace(/\.[^./]+$/, '') || 'Importierte Bilder',
            author: 'Unbekannt',
            created: Date.now(),
            sourceType: 'ocr-images',
            pages
        };
        this.finishImport(book, `${pages.length} Seite(n) per OCR importiert`);
        app.atlas.ui.notifyIfHidden('Import fertig', `${book.title} - Bild-Import abgeschlossen.`);
    }
});
