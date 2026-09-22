import { app } from '../core.js';

// ================= Ganzes Buch übersetzen (v0.39.0-beta) =================
// NEU: docs/TODO-GESAMT.md, Bereich "Mehrsprachigkeit" - Konzept-Skizze
// "Weg 1": die Übersetzung ist ein EIGENES, neues Buch (Kopie), das Original
// bleibt unangetastet. Entscheidung des Betreibers (Sept. 2026): so, und wenn
// es kein großer Mehraufwand ist, gleich ALLE Erzähler-Personas mitübersetzen.
// Das ist kein Mehraufwand an Anfragen: app.api.translatePageVariants()
// übersetzt alle Personas einer Seite in EINEM Aufruf (1 Anfrage pro Seite,
// egal wie viele Personas).
//
// Warum Kopie statt einer Sprach-Achse in page.variants: Reader, Vorlesen,
// Hörbuch, Video und Druck funktionieren mit einem ganz normalen Buch sofort,
// ohne dass jede Stelle, die resolvePageVariant() nutzt, eine Sprache kennen
// muss. Einziges neues Feld: book.language (Sprach-ID aus
// app.birkenbihlLanguages) - gelesen IMMER über app.utils.bookSpeechLang().
// Daran hängen die Sprach-Weichen in js/tts.js/js/ttsNeural.js und die
// Ausnahmen in js/backgroundPregen.js/js/actions/scanner.js.
//
// Fortsetzbar: jede Seite trägt page.translation = { lang, done }. Scheitert
// eine Seite (Tageslimit, Netz), bleibt sie mit dem deutschen Text stehen
// und wird bei "Übersetzung fortsetzen" erneut versucht.

// Pause zwischen zwei Seiten - gemini-3.1-flash-lite erlaubt ~15 Anfragen
// pro Minute (siehe CLAUDE.md), 4,5 s halten sicher Abstand.
const PAGE_DELAY_MS = 4500;

// Felder einer Geschichten-Variante, die übersetzt werden. Alles andere
// (z.B. zukünftige Felder) wird unverändert übernommen.
const TEXT_FIELDS = ['text', 'erstleserText', 'desc', 'quizQ', 'quizA', 'speechText', 'personaComment'];

// Platzhalter, an denen Code hängt (js/tts.js prüft "Kein Text." wörtlich) -
// nie übersetzen.
const KEEP_AS_IS = ['Kein Text.'];

function langInfoFor(langId) {
    return app.birkenbihlLanguages.find(l => l.id === langId) || null;
}

// Alle Personas einer Seite (bzw. die alten flachen Felder vor der
// Varianten-Architektur) als { personaId: {übersetzbare Felder} }.
function collectVariants(page) {
    const out = {};
    if (page.variants && Object.keys(page.variants).length) {
        Object.entries(page.variants).forEach(([id, v]) => { out[id] = pickTranslatable(v); });
    } else if (page.text) {
        out[app.settings.persona] = pickTranslatable(page);
    }
    return out;
}

function pickTranslatable(v) {
    const obj = {};
    TEXT_FIELDS.forEach(f => { obj[f] = (v[f] === undefined || KEEP_AS_IS.includes(v[f])) ? null : v[f]; });
    obj.difficultWords = Array.isArray(v.difficultWords) ? v.difficultWords : [];
    return obj;
}

// Übersetzte Felder zurück in die (kopierte) Variante mischen - nur Strings
// bzw. null übernehmen, alles Unbrauchbare lässt das Original stehen.
function mergeTranslated(original, translated) {
    const merged = { ...original };
    TEXT_FIELDS.forEach(f => {
        if (KEEP_AS_IS.includes(original[f])) return;
        const value = translated[f];
        if (typeof value === 'string' && value.trim()) merged[f] = value.trim();
        else if (value === null && original[f] == null) merged[f] = null;
    });
    if (Array.isArray(translated.difficultWords)) {
        merged.difficultWords = translated.difficultWords.filter(w => w && w.word && w.explanation);
    }
    return merged;
}

function pagesToTranslate(book) {
    return book.pages.filter(p => p.translation && !p.translation.done);
}

// Übersetzt EINE Seite. Liefert true bei Erfolg. Personas, die in der
// Antwort fehlen, werden aus der Kopie entfernt statt deutsch stehen zu
// bleiben (sonst wechselt das Buch mitten drin die Sprache, sobald jemand
// diese Persona wählt) - solange mindestens eine Persona übersetzt wurde.
async function translateOnePage(page, langId) {
    const source = collectVariants(page);
    if (Object.keys(source).length === 0) {
        page.translation.done = true; // nichts zu übersetzen (z.B. reine Bildseite ohne Analyse)
        return true;
    }
    const translated = await app.api.translatePageVariants(source, langId);
    const ids = Object.keys(translated);
    if (ids.length === 0) return false;

    const base = page.variants && Object.keys(page.variants).length
        ? page.variants
        : { [app.settings.persona]: { text: page.text, erstleserText: page.erstleserText, desc: page.desc, quizQ: page.quizQ, quizA: page.quizA } };
    const newVariants = {};
    ids.forEach(id => {
        if (base[id]) newVariants[id] = mergeTranslated(base[id], translated[id]);
    });
    if (Object.keys(newVariants).length === 0) return false;

    page.variants = newVariants;
    // Alte flache Felder (vor der Varianten-Architektur) sind deutsch -
    // entfernen, sonst griffe resolvePageVariant() für fehlende Personas
    // darauf zurück.
    ['text', 'erstleserText', 'desc', 'quizQ', 'quizA'].forEach(f => delete page[f]);
    page.translation.done = true;
    return true;
}

async function runTranslation(book) {
    const langInfo = langInfoFor(book.language);
    const todo = pagesToTranslate(book);
    if (todo.length === 0) return { done: 0, failed: 0, cancelled: false };

    app.state.cancelAnalysis = false;
    app.state.apiBusy = true;
    app.ui.showLoader(`Übersetzung auf ${langInfo ? langInfo.promptLabel : ''}...`, `Seite 1 von ${todo.length}`);

    let done = 0, failed = 0, cancelled = false;
    try {
        for (let i = 0; i < todo.length; i++) {
            if (app.state.cancelAnalysis) { cancelled = true; break; }
            const sub = document.getElementById('processSub');
            if (sub) sub.innerText = `Seite ${i + 1} von ${todo.length} - alle Erzähler auf einmal`;
            if (i > 0) await new Promise(r => setTimeout(r, PAGE_DELAY_MS));
            try {
                if (await translateOnePage(todo[i], book.language)) done++;
                else failed++;
            } catch (e) {
                console.error(`Übersetzung von Seite ${i + 1} fehlgeschlagen:`, e);
                failed++;
                // Tageslimit/kein Key: weitere Versuche sind sinnlos - lieber
                // sauber anhalten, "fortsetzen" geht später.
                if (e.message === 'API_KEY_MISSING' || /429/.test(e.message)) {
                    app.ui.toast(e.message === 'API_KEY_MISSING'
                        ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.'
                        : 'Tageslimit erreicht - die Übersetzung lässt sich später fortsetzen.', '⏸️');
                    break;
                }
            }
            // Nach jeder Seite speichern - ein abgebrochener Lauf verliert so nichts.
            app.dbOps.saveBook(book);
        }
    } finally {
        app.state.apiBusy = false;
        app.ui.hideLoader();
    }
    return { done, failed, cancelled };
}

Object.assign(app.actions, {
    // Startet die Übersetzung des gerade geöffneten Buchs. langId kommt aus
    // der Sprachauswahl in der Buchansicht (#bookTranslateLang).
    async translateBook(langId) {
        const original = app.library[app.state.currentBookId];
        if (!original) return;
        const langInfo = langInfoFor(langId);
        if (!langInfo) { app.ui.toast('Bitte eine Zielsprache wählen.', 'ℹ️'); return; }
        if (original.language) {
            app.ui.toast('Das ist schon eine Übersetzung - bitte das deutsche Original übersetzen.', 'ℹ️');
            return;
        }
        if (app.utils.resolveBookType(original) === 'workbook') {
            app.ui.toast('Übersetzen gibt es bisher nur für Geschichten, nicht für Übungshefte.', 'ℹ️');
            return;
        }
        if (app.state.apiBusy) { app.ui.toast('Bitte warten, es läuft gerade schon etwas anderes.', '⏳'); return; }

        const relevant = original.pages.filter(p => !p.excluded && p.status === 'done');
        if (relevant.length === 0) {
            app.ui.toast('Erst die Seiten auslesen lassen, dann übersetzen.', 'ℹ️');
            return;
        }
        const personaCount = new Set(relevant.flatMap(p => Object.keys(collectVariants(p)))).size;
        const notDone = original.pages.filter(p => !p.excluded && p.status !== 'done').length;
        const msg = `"${original.title}" auf ${langInfo.promptLabel} übersetzen?\n\n`
            + `• Es entsteht ein NEUES Buch, das Original bleibt unverändert.\n`
            + `• ${relevant.length} Seite(n) = ${relevant.length} KI-Anfrage(n) - alle ${personaCount} Erzähler-Variante(n) je Seite in einer Anfrage.\n`
            + (notDone ? `• ${notDone} noch nicht ausgelesene Seite(n) bleiben leer.\n` : '')
            + `• Dauert ca. ${Math.ceil(relevant.length * (PAGE_DELAY_MS + 4000) / 60000)} Minute(n), abbrechen und später fortsetzen geht.`;
        if (!confirm(msg)) return;

        // Kopie: gleiche Seiten-IDs (Seiten-Rollen/Cover zeigen weiter auf die
        // richtigen Seiten), aber nichts mitnehmen, was an der deutschen
        // Fassung oder am Lesefortschritt hängt.
        const copy = structuredClone(original);
        copy.id = 'book_' + Date.now();
        copy.title = `${original.title} (${langInfo.promptLabel})`;
        copy.language = langId;
        copy.translatedFromBookId = original.id;
        copy.created = Date.now();
        copy.lastReadIdx = 0;
        delete copy.lastReadAt;
        delete copy.bookQuiz;
        copy.pages.forEach(p => {
            delete p.birkenbihl;
            delete p.progress;
            delete p.check;
            // Deutscher PDF-/EPUB-Text würde bei jeder späteren Varianten-
            // Umrechnung (buildPageVariant) wieder gewinnen.
            delete p.pdfSourceText;
            if (!p.excluded && p.status === 'done') p.translation = { lang: langId, done: false };
        });
        app.library[copy.id] = copy;
        app.dbOps.saveBook(copy);

        const result = await runTranslation(copy);
        this._finishTranslation(copy, result);
    },

    // Setzt eine unterbrochene Übersetzung am gerade geöffneten Buch fort.
    async continueBookTranslation() {
        const book = app.library[app.state.currentBookId];
        if (!book || !book.language) return;
        if (app.state.apiBusy) { app.ui.toast('Bitte warten, es läuft gerade schon etwas anderes.', '⏳'); return; }
        const result = await runTranslation(book);
        this._finishTranslation(book, result);
    },

    _finishTranslation(book, { done, failed, cancelled }) {
        const open = pagesToTranslate(book).length;
        if (cancelled) app.ui.toast('Übersetzung angehalten - "Übersetzung fortsetzen" macht weiter.', '⏹️');
        else if (open > 0) app.ui.toast(`${done} Seite(n) übersetzt, ${open} noch offen - später "Übersetzung fortsetzen".`, '⚠️');
        else app.ui.toast(`"${book.title}" ist fertig übersetzt!`, '🌍');
        if (failed > 0) console.warn(`${failed} Seite(n) konnten nicht übersetzt werden.`);
        app.state.currentBookId = book.id;
        app.nav.go('book');
    },

    // Für die Buchansicht: wie viele Seiten fehlen noch?
    countUntranslatedPages(book) {
        return book && book.language ? pagesToTranslate(book).length : 0;
    }
});
