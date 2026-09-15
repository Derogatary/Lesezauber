import { app } from './core.js';

// ================= Hintergrund-Vorbereitung (opt-in) =================
// Läuft nur, wenn in den Einstellungen aktiviert. Sucht sich alle paar
// Sekunden EINE fehlende Aufgabe (Persona-Variante einer Seite ODER
// Buch-Quiz) und erledigt genau diese eine - nie mehr, und nie während
// gerade etwas anderes mit der KI läuft. So bleibt die Kostenlos-Grenze
// im Blick, auch wenn man das Feature aktiviert.
// Erhöht von 6s auf 9s - Hintergrundarbeit hat keine Eile und soll das
// Minutenlimit nicht zusätzlich zu regulären Analysen strapazieren.
const BACKGROUND_PAUSE_MS = 9000;

function findNextMissingTask() {
    for (const bookId of Object.keys(app.library)) {
        const book = app.library[bookId];

        for (let i = 0; i < book.pages.length; i++) {
            const page = book.pages[i];
            if (page.status !== 'done') continue; // nur fertig gescannte Seiten haben überhaupt Grundmaterial

            for (const persona of app.personas) {
                const hasVariant = page.variants && page.variants[persona.id];
                if (!hasVariant) {
                    return { type: 'persona', bookId, pageIdx: i, personaId: persona.id };
                }
            }
        }

        // Buch-Quiz erst vorschlagen, wenn wirklich JEDE Seite mindestens
        // eine Version hat (Buch vollständig gescannt).
        const allDone = book.pages.length > 0 && book.pages.every(p => p.status === 'done');
        if (allDone && !book.bookQuiz) {
            return { type: 'bookQuiz', bookId };
        }
    }
    return null;
}

// Erzeugt EINE Persona-Variante für eine bestimmte Seite. Arbeitet
// bewusst NICHT über app.state.currentBookId (das würde die gerade
// sichtbare Ansicht der Person durcheinanderbringen, falls sie parallel
// ein anderes Buch offen hat) - alles läuft über direkt übergebene
// Objekte.
async function generatePersonaVariantForPage(book, pageIdx, personaId) {
    const page = book.pages[pageIdx];
    const b64 = page.imgUrl.split(',')[1];
    const isCover = (pageIdx === 0 && (!book.title || book.title === 'Neues Buch'));
    const result = await app.api.analyze(b64, isCover, personaId, page.pdfSourceText || null);

    if (!page.variants) page.variants = {};
    page.variants[personaId] = {
        text: page.pdfSourceText || result.originalText || 'Kein Text.',
        erstleserText: result.simplifiedText || page.pdfSourceText || result.originalText || 'Kein Text.',
        desc: result.imageDescription || 'Keine Beschreibung.',
        quizQ: result.quizQuestion || 'Was siehst du auf dem Bild?',
        quizA: result.quizAnswer || 'Schau genau hin!'
    };
    // NEU: auch bei im Hintergrund vorbereiteten Varianten Vokabeln sammeln
    app.actions.recordVocabulary(result.vocabulary);
    app.dbOps.saveBook(book);
}

async function generateBookQuizInBackground(book) {
    const personaId = app.settings.persona;
    const compiledText = book.pages
        .map((p, i) => {
            const variant = app.utils.resolveAnyVariant(p, personaId);
            return variant && variant.text ? `Seite ${i + 1}: ${variant.text}` : null;
        })
        .filter(Boolean)
        .join('\n');

    if (!compiledText) return;

    const questions = await app.api.generateBookQuiz(compiledText, personaId);
    book.bookQuiz = { questions };
    app.dbOps.saveBook(book);
}

async function runOneBackgroundTask() {
    if (!app.settings.backgroundPregenEnabled) return;
    if (app.state.apiBusy) return;
    if (document.visibilityState !== 'visible') return;

    const task = findNextMissingTask();
    if (!task) return;

    app.state.apiBusy = true;
    try {
        if (task.type === 'persona') {
            await generatePersonaVariantForPage(app.library[task.bookId], task.pageIdx, task.personaId);
            // Nur neu zeichnen, wenn genau dieses Buch/diese Seite gerade
            // sichtbar ist - sonst nicht in eine fremde Ansicht eingreifen.
            if (app.state.currentBookId === task.bookId) {
                if (app.state.currentView === 'book') app.render.book(task.bookId);
                if (app.state.currentView === 'reader' && app.state.currentPageIdx === task.pageIdx) {
                    app.render.reader(task.pageIdx);
                }
            }
        } else if (task.type === 'bookQuiz') {
            await generateBookQuizInBackground(app.library[task.bookId]);
            if (app.state.currentBookId === task.bookId && app.state.currentView === 'reader') {
                app.render.reader(app.state.currentPageIdx);
            }
        }
    } catch (e) {
        // Einzelner Fehler im Hintergrund soll nicht störend auffallen -
        // beim nächsten Zyklus wird es automatisch erneut versucht.
        console.warn('Hintergrund-Vorbereitung: ein Versuch fehlgeschlagen, wird später erneut versucht.', e);
    } finally {
        app.state.apiBusy = false;
    }
}

function scheduleNext() {
    setTimeout(async () => {
        await runOneBackgroundTask();
        scheduleNext();
    }, BACKGROUND_PAUSE_MS);
}

scheduleNext();
