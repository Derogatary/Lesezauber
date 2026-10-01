// NEU (v0.51.0-beta): Klappenbücher - Zuordnung und Vorlese-Text
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

test('Klappen: nur fertige Klappen der Seite, nur im Klappenbuch', () => {
    const base = { id: 1 };
    const book = { flapBook: true, pages: [
        base,
        { id: 2, flapOf: 1, excluded: true, flap: { status: 'done', text: 'Kuckuck!', desc: 'Unter der Klappe ist ein Hase.' } },
        { id: 3, flapOf: 1, excluded: true, flap: { status: 'pending' } },
        { id: 4, flapOf: 9, excluded: true, flap: { status: 'done', text: 'x', desc: '' } }
    ] };
    assert.deepEqual(app.utils.flapsForPage(book, base).map(p => p.id), [2]);
    assert.deepEqual(app.utils.flapsForPage({ ...book, flapBook: false }, base), []);
    assert.equal(app.utils.flapSpeech(book.pages[1], 0), 'Heb mal die Klappe hoch! Kuckuck! Unter der Klappe ist ein Hase.');
    assert.ok(app.utils.flapSpeech(book.pages[1], 1).startsWith('Und jetzt die nächste Klappe!'));
});

test('Klappenbuch-Auswahl gilt nur für Geschichten', () => {
    app.state.newBookFlaps = true;
    app.state.newBookType = 'story';
    assert.deepEqual(app.utils.newBookFlapFields(), { flapBook: true });
    app.state.newBookType = 'workbook';
    assert.deepEqual(app.utils.newBookFlapFields(), {});
    app.state.newBookFlaps = false;
    app.state.newBookType = 'story';
    assert.deepEqual(app.utils.newBookFlapFields(), {});
});
