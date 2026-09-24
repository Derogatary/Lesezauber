// NEU (v0.48.0-beta): Buchatlas im Nachtmodus - Reihenfolge und Zählung
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

// saveBook schreibt im Browser in IndexedDB - im Test nur ins Objekt
app.atlas.dbOps.saveBook = (book) => { app.atlas.library[book.id] = book; };

function page(id, text, translations) {
    return { id, text, status: 'done', ...(translations ? { translations } : {}) };
}

test('Nachtmodus: Buchatlas erst nach den LeseZauber-Textaufgaben', () => {
    const may = app.utils.atlasNightMayRun;
    assert.equal(may({ lzTextOpen: 3, atlasOpen: 5 }), false);
    assert.equal(may({ lzTextOpen: 0, atlasOpen: 5 }), true);
    assert.equal(may({ lzTextOpen: 0, atlasOpen: 0 }), false);
});

test('Buchatlas-Nachtaufträge: zählen, Reihenfolge Wiki vor Übersetzung, Aufräumen', () => {
    app.atlas.library = {
        a: { id: 'a', title: 'Älter', created: 1, pages: [page(1, 'Eins'), page(2, 'Zwei', { Englisch: { text: 'Two' } })],
            nightJobs: { wiki: true, translate: ['Englisch'] } },
        b: { id: 'b', title: 'Neuer', created: 2, pages: [page(3, 'Drei')], nightJobs: { translate: ['Englisch'] } },
        c: { id: 'c', title: 'Ohne Auftrag', created: 0, pages: [page(4, 'Vier')] }
    };
    // a: 1 Wiki-Block + 1 fehlende Seite, b: 1 Seite, c: nicht vorgemerkt
    assert.equal(app.atlas.utils.countNightOpen(), 3);

    let next = app.atlas.utils.nextNightTask();
    assert.equal(next.book.id, 'a');
    assert.equal(next.type, 'wiki');

    // Wiki fertig -> als Nächstes die Übersetzung desselben Buchs
    app.atlas.library.a.wiki = { chapters: [], entities: [], complete: true };
    next = app.atlas.utils.nextNightTask();
    assert.deepEqual([next.book.id, next.type, next.lang], ['a', 'translate', 'Englisch']);

    // a komplett übersetzt -> Auftrag räumt sich weg, b ist dran
    app.atlas.library.a.pages[0].translations = { Englisch: { text: 'One' } };
    app.atlas.utils.cleanupNightJobs();
    assert.equal(app.atlas.library.a.nightJobs, undefined);
    next = app.atlas.utils.nextNightTask();
    assert.equal(next.book.id, 'b');
    assert.equal(app.atlas.utils.countNightOpen(), 1);
});

test('Wiki-Blöcke: unvollständiges Wiki zählt nur die fehlenden Blöcke', () => {
    const book = { id: 'w', pages: [page(1, 'x'.repeat(10))] };
    assert.equal(app.atlas.utils.countWikiChunksOpen(book), 1);
    book.wiki = { complete: false, totalChunks: 1, processedChunkIndices: [0] };
    assert.equal(app.atlas.utils.countWikiChunksOpen(book), 0);
    book.wiki = { complete: false, totalChunks: 5, processedChunkIndices: [0] }; // Aufteilung geändert -> von vorn
    assert.equal(app.atlas.utils.countWikiChunksOpen(book), 1);
    assert.equal(app.atlas.utils.countWikiChunksOpen({ id: 'leer', pages: [] }), 0);
});
