import { app } from '../core.js';

// NEU (v0.47.0-beta): pdf.js und JSZip kommen jetzt aus dem mitgelieferten
// js/vendor/ (dieselben Dateien wie beim LeseZauber-Import) statt von
// cdnjs.cloudflare.com - die LeseZauber-CSP (index.html) erlaubt keine
// fremden Skript-Server, und offline klappt der Import so auch.
let pdfLibPromise = null;
let jsZipPromise = null;

Object.assign(app.atlas.utils, {
    // Lädt pdf.js erst beim ersten PDF-Import (ca. 1,7 MB).
    loadPdfLib() {
        if (!pdfLibPromise) {
            pdfLibPromise = import('../vendor/pdfjs/pdf.min.mjs').then(lib => {
                lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
                return lib;
            }).catch(err => {
                pdfLibPromise = null;
                throw err;
            });
        }
        return pdfLibPromise;
    },

    // JSZip ist ein klassisches Skript (kein ES-Modul) - per <script>-Tag.
    loadJSZip() {
        if (window.JSZip) return Promise.resolve(window.JSZip);
        if (!jsZipPromise) {
            jsZipPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = new URL('../vendor/jszip/jszip.min.js', import.meta.url).href;
                script.onload = () => resolve(window.JSZip);
                script.onerror = () => {
                    jsZipPromise = null;
                    reject(new Error('JSZip konnte nicht geladen werden.'));
                };
                document.head.appendChild(script);
            });
        }
        return jsZipPromise;
    },

    // Erkennt Kapitelüberschriften (Kapitel 1 / Chapter 1 / Kap. 1 / Teil 1 /
    // Buch 1, jeweils gefolgt von Zahl oder römischer Ziffer) als Zeilenanfang
    // einer kurzen Zeile. Findet die Funktion weniger als 2 Überschriften,
    // gilt das als "nicht erkannt" - dann greift der Längen-Fallback.
    splitIntoChapters(rawText) {
        const lines = rawText.split(/\r\n|\r|\n/);
        const headingRegex = /^\s*(kapitel|chapter|kap\.?|teil|buch)\s+[\divxlcmIVXLCM]+\b/i;
        const starts = [];
        lines.forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.length > 0 && trimmed.length < 60 && headingRegex.test(trimmed)) {
                starts.push(i);
            }
        });
        if (starts.length < 2) return null;

        const chapters = [];
        for (let i = 0; i < starts.length; i++) {
            const start = starts[i];
            const end = (i + 1 < starts.length) ? starts[i + 1] : lines.length;
            const chunk = lines.slice(start, end).join('\n').trim();
            if (chunk) chapters.push(chunk);
        }
        return chapters.length >= 2 ? chapters : null;
    },

    // Fallback ohne erkennbare Kapitel: an Absatzgrenzen in ca. 3000-
    // Zeichen-Blöcke aufteilen (nie mitten im Satz/Absatz trennen).
    splitByLength(rawText, chunkSize = 3000) {
        const paragraphs = rawText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
        const chunks = [];
        let current = '';
        for (const para of paragraphs) {
            if (current && (current.length + para.length + 2) > chunkSize) {
                chunks.push(current);
                current = para;
            } else {
                current = current ? `${current}\n\n${para}` : para;
            }
        }
        if (current) chunks.push(current);
        return chunks.length ? chunks : (rawText.trim() ? [rawText.trim()] : []);
    },

    // Baut aus rohem Fließtext (aus .txt-Import oder aus extrahiertem
    // PDF-Text) ein Array fertiger "Seiten" - versucht zuerst echte
    // Kapitel zu erkennen, fällt sonst auf Längen-Blöcke zurück. Wird von
    // ePub NICHT genutzt - dort ergeben sich die Kapitel direkt aus den
    // einzelnen Dateien im Buch (zuverlässiger als Text-Heuristik).
    buildPagesFromText(rawText) {
        const chunks = this.splitIntoChapters(rawText) || this.splitByLength(rawText);
        return chunks.map((text, i) => ({ id: Date.now() + i, text, status: 'done' }));
    },

    // Grobe Restzeit-Schätzung für Fortschrittsanzeigen: Pacing-Pause
    // zwischen Calls + eine pauschale Schätzung für die reine Antwortzeit
    // (echte Dauer variiert je nach Textlänge/Auslastung - das ist bewusst
    // nur ein grober Anhaltspunkt, keine exakte Vorhersage).
    formatEta(itemsRemaining, pacingMs) {
        if (itemsRemaining <= 0) return '';
        const perItemMs = pacingMs + 2000;
        const totalMin = (itemsRemaining * perItemMs) / 60000;
        if (totalMin < 1) return 'ca. <1 Min.';
        if (totalMin < 60) return `ca. ${Math.ceil(totalMin)} Min.`;
        const hours = Math.floor(totalMin / 60);
        const mins = Math.round(totalMin % 60);
        return `ca. ${hours} Std. ${mins} Min.`;
    }
});
