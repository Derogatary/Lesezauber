import { app } from '../core.js';

// ================= 📝 Fragerunde zum ganzen Buch (v0.56.0-beta) =================
// NEU (Nutzerwunsch: "eine Frageseite, die alle Fragen des Buches zum Schluss
// bzw. als eigener Modus vorliest, damit man das Buch nochmal durchgehen
// kann - dort auch die schwierigen Wörter, die genauso abgefragt werden"):
//
// - Sammelt in Vorlese-Reihenfolge (app.utils.autoReadOrder) je Seite die
//   Rätselfrage und die schwierigen Wörter (inkl. Klappen), danach die
//   Verständnisfragen zum ganzen Buch (book.bookQuiz, falls schon erzeugt).
//   Kostet KEINE KI-Anfrage - nur, was beim Auslesen ohnehin entstanden ist.
// - Läuft in einem eigenen Vollbild-Fenster (#reviewQuizOverlay) mit dem
//   Bild der jeweiligen Seite: Frage vorlesen -> Bedenkzeit -> Antwort
//   aufdecken und vorlesen -> nächste. Anhalten/Weiter/Antwort per Knopf.
// - Start: Knopf auf der letzten Seite im Reader und in der Buchansicht,
//   und - wenn "📝 Fragerunde am Ende" an ist - automatisch, sobald das
//   automatische Vorlesen das Buchende erreicht.
// - Wörter werden buchweit nur einmal abgefragt.

const THINK_MS = { quiz: 3000, word: 2500, book: 5000 };
const AFTER_ANSWER_MS = 1200;
const AT_END_KEY = 'lz_review_at_end';

const rq = { active: false, playing: false, items: [], idx: 0, run: 0, revealed: false, timer: null };

Object.assign(app.utils, {
    // Reine Funktion (Unit-Test). Liefert
    // [{ kind: 'quiz'|'word'|'book', pageIdx, q, a, word? }]
    buildReviewQuizItems(book, personaId) {
        if (!book || app.utils.resolveBookType(book) === 'workbook') return [];
        const items = [];
        const seenWords = new Set();
        app.utils.autoReadOrder(book).forEach(idx => {
            const page = book.pages[idx];
            if (!page || page.excluded || app.utils.isFlapPage?.(book, page)) return;
            const variant = app.utils.resolvePageVariant(page, personaId) || app.utils.resolveAnyVariant(page, personaId);
            if (!variant) return;
            if (variant.quizQ && variant.quizA && !app.utils.isAiHidden?.(page, personaId, 'quiz')) {
                items.push({ kind: 'quiz', pageIdx: idx, q: variant.quizQ, a: variant.quizA });
            }
            const flaps = app.utils.flapsForPage?.(book, page, personaId) || [];
            const words = app.utils.mergeDifficultWords([
                Array.isArray(variant.difficultWords) ? variant.difficultWords : [],
                ...flaps.map(f => Array.isArray(f.variant.difficultWords) ? f.variant.difficultWords : [])
            ]);
            words.forEach(w => {
                const key = w.word.trim().toLowerCase();
                if (seenWords.has(key)) return;
                seenWords.add(key);
                items.push({ kind: 'word', pageIdx: idx, word: w.word, q: `Weißt du noch, was „${w.word}“ bedeutet?`, a: w.explanation });
            });
        });
        (book.bookQuiz?.questions || []).forEach(qa => {
            if (qa?.question && qa?.answer) items.push({ kind: 'book', pageIdx: null, q: qa.question, a: qa.answer });
        });
        return items;
    },

    reviewQuizAtEnd() {
        try { return localStorage.getItem(AT_END_KEY) !== 'off'; } catch (e) { return true; }
    }
});

function currentBook() {
    return app.library[app.state.currentBookId];
}

function clearTimer() {
    clearTimeout(rq.timer);
    rq.timer = null;
}

// Wartet ms und läuft nur weiter, wenn die Fragerunde noch dieselbe ist
function later(run, ms, fn) {
    clearTimer();
    rq.timer = setTimeout(() => { if (rq.active && rq.playing && rq.run === run) fn(); }, ms);
}

function stillOn(run) {
    return rq.active && rq.playing && rq.run === run;
}

// Eine Frage abspielen: Frage -> Bedenkzeit -> Antwort -> nächste
function playCurrent() {
    const run = ++rq.run;
    const item = rq.items[rq.idx];
    rq.revealed = false;
    app.render.reviewQuiz(rq);
    if (!item || !rq.playing) return;
    app.tts.speak(item.q, () => {
        if (!stillOn(run)) return;
        later(run, THINK_MS[item.kind] || 3000, () => {
            rq.revealed = true;
            app.render.reviewQuiz(rq);
            app.tts.speak(item.a, () => {
                if (!stillOn(run)) return;
                later(run, AFTER_ANSWER_MS, () => app.actions.reviewQuizNext());
            }, 'reviewQuizA');
        });
    }, 'reviewQuizQ');
}

function finishRound() {
    const run = ++rq.run;
    rq.idx = rq.items.length;
    app.render.reviewQuiz(rq);
    if (rq.playing) app.tts.speak('Super, das war die ganze Fragerunde! Toll mitgemacht.', () => {
        if (rq.run === run) { rq.playing = false; app.render.reviewQuiz(rq); }
    }, 'reviewQuizQ');
}

Object.assign(app.actions, {
    startReviewQuiz(autoplay = true) {
        const book = currentBook();
        if (!book) return;
        const items = app.utils.buildReviewQuizItems(book, app.state.readingPersonaId || app.settings.persona);
        if (items.length === 0) {
            app.ui.toast('Für dieses Buch gibt es noch keine Rätselfragen oder schwierigen Wörter.', 'ℹ️');
            return;
        }
        if (app.state.autoReadActive) app.tts.stopAutoRead();
        app.tts.stop();
        Object.assign(rq, { active: true, playing: autoplay, items, idx: 0, revealed: false });
        document.getElementById('reviewQuizOverlay')?.classList.remove('hidden');
        if (autoplay) {
            const run = ++rq.run;
            app.render.reviewQuiz(rq);
            const intro = `Fragerunde! Ich habe ${items.length} ${items.length === 1 ? 'Frage' : 'Fragen'} zum Buch für dich.`;
            app.tts.speak(intro, () => { if (stillOn(run)) later(run, 400, playCurrent); }, 'reviewQuizQ');
        } else {
            app.render.reviewQuiz(rq);
        }
    },

    closeReviewQuiz() {
        rq.active = false;
        rq.playing = false;
        rq.run++;
        clearTimer();
        app.tts.stop();
        document.getElementById('reviewQuizOverlay')?.classList.add('hidden');
    },

    reviewQuizTogglePlay() {
        if (!rq.active) return;
        if (rq.playing) {
            rq.playing = false;
            rq.run++;
            clearTimer();
            app.tts.stop();
            app.render.reviewQuiz(rq);
            return;
        }
        rq.playing = true;
        if (rq.idx >= rq.items.length) rq.idx = 0;
        playCurrent();
    },

    reviewQuizNext() {
        if (!rq.active) return;
        clearTimer();
        app.tts.stop();
        if (rq.idx + 1 >= rq.items.length) { finishRound(); return; }
        rq.idx++;
        if (rq.playing) playCurrent();
        else { rq.revealed = false; rq.run++; app.render.reviewQuiz(rq); }
    },

    reviewQuizPrev() {
        if (!rq.active || rq.idx === 0) return;
        clearTimer();
        app.tts.stop();
        rq.idx = Math.min(rq.idx, rq.items.length) - 1;
        if (rq.playing) playCurrent();
        else { rq.revealed = false; rq.run++; app.render.reviewQuiz(rq); }
    },

    // Antwort sofort aufdecken (und vorlesen), ohne die Bedenkzeit abzuwarten
    reviewQuizReveal() {
        const item = rq.items[rq.idx];
        if (!rq.active || !item) return;
        clearTimer();
        const run = ++rq.run;
        rq.revealed = true;
        app.render.reviewQuiz(rq);
        app.tts.speak(item.a, () => {
            if (stillOn(run)) later(run, AFTER_ANSWER_MS, () => app.actions.reviewQuizNext());
        }, 'reviewQuizA');
    },

    isReviewQuizOpen() {
        return rq.active;
    },

    toggleReviewQuizAtEnd(on) {
        try { localStorage.setItem(AT_END_KEY, on ? 'on' : 'off'); } catch (e) { console.error('Einstellung nicht gespeichert:', e); }
    },

    // Aufgerufen von js/tts.js, wenn das automatische Vorlesen am Buchende ist
    offerReviewQuizAtEnd(book) {
        if (!app.utils.reviewQuizAtEnd() || app.state.currentView !== 'reader') return;
        if (app.utils.buildReviewQuizItems(book, app.state.readingPersonaId || app.settings.persona).length === 0) return;
        setTimeout(() => {
            if (app.state.currentView === 'reader' && app.state.currentBookId === book.id && !app.state.autoReadActive && !rq.active) {
                app.actions.startReviewQuiz(true);
            }
        }, 1500);
    }
});
