import { app } from './core.js';

// ================= Hintergrund-Vorbereitung (opt-in) =================
// Läuft nur, wenn in den Einstellungen aktiviert. Sucht sich alle paar
// Sekunden EINE fehlende Aufgabe und erledigt genau diese eine - nie mehr,
// und nie während gerade etwas anderes mit der KI läuft. So bleibt die
// Kostenlos-Grenze im Blick, auch wenn man das Feature aktiviert.
// Erhöht von 6s auf 9s - Hintergrundarbeit hat keine Eile und soll das
// Minutenlimit nicht zusätzlich zu regulären Analysen strapazieren.
//
// Drei Aufgaben-Arten, in fester Prioritäts-Reihenfolge (Nutzerwunsch:
// "erst Seiten, dann anderer Kram") - siehe findNextMissingTask():
// 1. Persona-Variante einer Seite (Grundlage fürs Lesen überhaupt)
// 2. Buch-Quiz (erst wenn Punkt 1 für ALLE Bücher erledigt ist)
// 3. Birkenbihl-Übersetzung (niedrigste Priorität, eigener Zusatz-Schalter
//    app.settings.backgroundPregenBirkenbihl, siehe js/state.js)
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
        // NEU: Übungshefte übersprungen - Verständnisfragen "zur Geschichte"
        // ergeben bei Arbeitsblättern keinen Sinn und würden nur API-Aufrufe
        // verbrennen.
        const allDone = book.pages.length > 0 && book.pages.every(p => p.status === 'done');
        if (allDone && !book.bookQuiz && app.utils.resolveBookType(book) !== 'workbook') {
            return { type: 'bookQuiz', bookId };
        }
    }

    // NEU (Birkenbihl-Hintergrundvorbereitung, Nutzerwunsch: "erst Seiten,
    // dann anderer Kram"): niedrigste Priorität - läuft erst, wenn ALLE
    // Bücher weder eine fehlende Persona-Variante noch ein fehlendes
    // Buch-Quiz mehr haben (obige Schleife ist dann ohne Treffer
    // durchgelaufen). Zusätzlich eigens bestätigt
    // (app.settings.backgroundPregenBirkenbihl) - kostet sonst ungefragt
    // mehr Anfragen, als der allgemeine Schalter verspricht. Fundstelle
    // kommt aus derselben Liste wie der Zähler in den Einstellungen (siehe
    // app.utils.findMissingBirkenbihlPages() in js/utils.js).
    if (app.settings.backgroundPregenBirkenbihl) {
        const [first] = app.utils.findMissingBirkenbihlPages();
        if (first) return { type: 'birkenbihl', bookId: first.bookId, pageIdx: first.pageIdx };
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
    // FIX: bookType landete hier auf der Positions-Stelle von forceToc
    // (app.api.analyze() erwartet knownText, forceToc, DANN bookType) - ein
    // im Hintergrund für eine weitere Persona nachgezogenes Übungsheft bekam
    // dadurch immer den Geschichten-Prompt statt des Heft-Prompts. Gleiche
    // forceToc-Ermittlung wie im manuellen Scan (js/actions/scanner.js),
    // damit ein als Inhaltsverzeichnis markiertes Blatt auch im Hintergrund
    // korrekt erkannt wird.
    const forceToc = !!book.tocPageId && page.id === book.tocPageId;
    // NEU: auch im Hintergrund gilt die Buchart - ein Übungsheft bekommt
    // sonst plötzlich Erzähltext-Varianten, sobald man die Persona wechselt.
    const bookType = app.utils.resolveBookType(book);
    const result = await app.api.analyze(b64, isCover, personaId, page.pdfSourceText || null, forceToc, bookType);

    if (!page.variants) page.variants = {};
    // Gemeinsame Umrechnung mit dem Scanner (js/utils.js) - hier lag vorher
    // eine zweite Kopie derselben Felder-Zuordnung.
    page.variants[personaId] = app.utils.buildPageVariant(result, page, bookType);
    // NEU: auch bei im Hintergrund vorbereiteten Varianten Vokabeln sammeln
    app.actions.recordVocabulary(result.vocabulary);
    app.dbOps.saveBook(book);
}

// NEU (Birkenbihl-Hintergrundvorbereitung, Nutzerwunsch): Gegenstück zu
// app.actions.generateBirkenbihlDecoding() in js/actions/birkenbihl.js,
// aber ohne Loader/Toast (läuft ja im Hintergrund) und über die GLOBALE
// Standard-Persona statt der gerade im Reader gewählten - dieselbe
// Begründung wie bei generateBookQuizInBackground() unten: der Hintergrund
// kennt keine "gerade geöffnete" Ansicht.
async function generateBirkenbihlForPageInBackground(book, pageIdx) {
    const page = book.pages[pageIdx];
    const variant = app.utils.resolveAnyVariant(page, app.settings.persona);
    if (!variant || !variant.text) return;

    const langId = app.settings.birkenbihlLanguage;
    const { pairs } = await app.api.generateBirkenbihlDecoding(variant.text, langId);
    // Nichts Brauchbares zurückbekommen -> lieber nichts speichern und beim
    // nächsten Zyklus erneut versuchen, als eine leere Übersetzung zu
    // hinterlegen, die dann fälschlich als "erledigt" gilt.
    if (pairs.length === 0) return;

    page.birkenbihl = { lang: langId, pairs, generatedAt: Date.now() };
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
        } else if (task.type === 'birkenbihl') {
            await generateBirkenbihlForPageInBackground(app.library[task.bookId], task.pageIdx);
            // Nur neu zeichnen, wenn genau diese Seite gerade sichtbar ist -
            // gleiche Vorsicht wie beim Persona-Zweig oben.
            if (app.state.currentBookId === task.bookId && app.state.currentView === 'reader' && app.state.currentPageIdx === task.pageIdx) {
                app.render.birkenbihlTab(app.library[task.bookId].pages[task.pageIdx]);
            }
        }

        // NEU: hält den kleinen "⏳ X im Hintergrund offen"-Hinweis in der
        // Bibliothek aktuell, falls die App gerade dort offen daliegt.
        if (app.state.currentView === 'lib') app.render.library();
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
