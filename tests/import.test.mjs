import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
const { cleanImportedBook } = await import('../js/actions/backup.js');

const IMG = 'data:image/webp;base64,AAAA';

test('gültiges Buch bleibt erhalten', () => {
    const b = cleanImportedBook({ id: 'book_1', title: 'Fuchs', coverPageId: 5, pages: [{ id: 5, imgUrl: IMG, thumbUrl: IMG }] });
    assert.equal(b.pages.length, 1);
    assert.equal(b.pages[0].imgUrl, IMG);
});

test('Code in Seiten-IDs wird abgewiesen (onclick-Einschleusung)', () => {
    const b = cleanImportedBook({ id: 'book_1', pages: [{ id: '1);alert(1);(' }, { id: 2 }] });
    assert.deepEqual(b.pages.map(p => p.id), [2]);
    assert.equal(cleanImportedBook({ id: 'x" onclick="evil', pages: [] }), null);
});

test('fremde Bild-URLs werden entfernt (src-Einschleusung)', () => {
    const b = cleanImportedBook({ id: 'b', coverPageId: 'a"b', pages: [{ id: 1, imgUrl: 'javascript:alert(1)', thumbUrl: 'x" onerror="evil' }] });
    assert.equal(b.pages[0].imgUrl, undefined);
    assert.equal(b.pages[0].thumbUrl, undefined);
    assert.equal(b.coverPageId, undefined);
});
