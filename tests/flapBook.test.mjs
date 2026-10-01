// NEU (v0.51.0-beta, überarbeitet v0.52.0-beta): Klappenbücher - Klappen sind
// eigene, normal ausgelesene Seiten mit Verweis auf die Hauptseite
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

const v = (text, extra = {}) => ({ variants: { standard: { text, erstleserText: text, desc: 'Bild.', ...extra } } });

test('Klappen: nur fertige, nicht ausgeschlossene Klappen der Seite, nur im Klappenbuch', () => {
    const base = { id: 1, status: 'done', ...v('Wo ist der Hase?') };
    const book = { flapBook: true, pages: [
        base,
        { id: 2, flapOf: 1, status: 'done', ...v('Kuckuck!') },
        { id: 3, flapOf: 1, status: 'pending' },
        { id: 4, flapOf: 1, status: 'done', excluded: true, ...v('x') },
        { id: 5, flapOf: 9, status: 'done', ...v('fremd') }
    ] };
    const flaps = app.utils.flapsForPage(book, base, 'standard');
    assert.deepEqual(flaps.map(f => f.page.id), [2]);
    assert.equal(flaps[0].variant.text, 'Kuckuck!');
    assert.deepEqual(app.utils.flapsForPage({ ...book, flapBook: false }, base, 'standard'), []);
    assert.equal(app.utils.isFlapPage(book, book.pages[1]), true);
    assert.equal(app.utils.isFlapPage(book, book.pages[4]), false); // Hauptseite gibt es nicht
    assert.equal(app.utils.isFlapPage({ ...book, flapBook: false }, book.pages[1]), false);
    assert.equal(app.utils.flapIntro(0), 'Heb mal die Klappe hoch!');
});

test('Schwierige Wörter von Seite und Klappen ohne Doppelte', () => {
    const merged = app.utils.mergeDifficultWords([
        [{ word: 'Hase', explanation: 'Ein Tier.' }],
        [{ word: 'hase', explanation: 'doppelt' }, { word: 'Möhre', explanation: 'Gemüse.' }, { word: 'kaputt' }]
    ]);
    assert.deepEqual(merged.map(w => w.word), ['Hase', 'Möhre']);
});

test('Alte Klappen (v0.51.0-beta) werden umgestellt', () => {
    const book = { pages: [{ id: 1 }, { id: 2, flapOf: 1, excluded: true, flap: { status: 'done' } }] };
    assert.equal(app.utils.migrateOldFlaps(book), true);
    assert.equal(book.pages[1].excluded, false);
    assert.equal(book.pages[1].flap, undefined);
    assert.equal(app.utils.migrateOldFlaps(book), false);
});

test('Klappenbuch-Auswahl gilt nur für Geschichten', () => {
    app.state.newBookFlaps = true;
    app.state.newBookType = 'story';
    assert.deepEqual(app.utils.newBookFlapFields(), { flapBook: true });
    app.state.newBookType = 'workbook';
    assert.deepEqual(app.utils.newBookFlapFields(), {});
    app.state.newBookFlaps = false;
    app.state.newBookType = 'story';
});

// NEU (v0.53.0-beta): Hörbuch/Video bekommen die Klappen in Vorlese-Reihenfolge
test('Sprach-Teile: Text, Bild, Klappe (mit Klappen-Foto), Rätsel', () => {
    const base = { id: 1, imgUrl: 'B', status: 'done', variants: { standard: { text: 'Wo?', desc: 'Wiese.', quizQ: 'Wer?', quizA: 'Hase.' } } };
    const flap = { id: 2, imgUrl: 'F', flapOf: 1, status: 'done', variants: { standard: { text: 'Kuckuck!', desc: 'Ein Hase.' } } };
    const book = { flapBook: true, pages: [base, flap] };
    const parts = app.utils.pageSpeechParts(book, base, base.variants.standard, 'standard', { includeDescription: true, includeQuiz: true });
    assert.deepEqual(parts.map(p => p.kind), ['text', 'desc', 'flap0Intro', 'flap0Text', 'flap0Desc', 'quizQ', 'quizA']);
    assert.deepEqual(parts.map(p => p.imgUrl), ['B', 'B', 'F', 'F', 'F', 'B', 'B']);
    assert.equal(parts.find(p => p.kind === 'flap0Text').isPageText, true);
    const noDesc = app.utils.pageSpeechParts(book, base, base.variants.standard, 'standard', { includeDescription: false });
    assert.deepEqual(noDesc.map(p => p.kind), ['text', 'flap0Intro', 'flap0Text']);
});
