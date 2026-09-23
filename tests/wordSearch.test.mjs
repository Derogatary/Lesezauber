import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

const ws = app.studio.wordSearch;

function wordAt(grid, p) {
    let s = '';
    for (let i = 0; i < p.word.length; i++) s += grid[p.dir === 'down' ? p.row + i : p.row][p.dir === 'right' ? p.col + i : p.col];
    return s;
}

test('jedes gelistete Wort steht wirklich im Gitter', () => {
    for (let seed = 1; seed <= 30; seed++) {
        const r = ws.build(['Hund', 'Katze', 'Maus', 'Vogel', 'Fisch', 'Bär'], seed);
        assert.equal(r.grid.length, r.size);
        r.grid.forEach(row => assert.equal(row.length, r.size));
        r.placements.forEach(p => assert.equal(wordAt(r.grid, p), p.word));
        assert.deepEqual(r.words, r.placements.map(p => p.word));
    }
});

test('gleiche Wörter + gleicher Seed = gleiches Gitter', () => {
    assert.deepEqual(ws.build(['Apfel', 'Birne'], 7), ws.build(['Apfel', 'Birne'], 7));
});

test('zu lange Wörter und mehr als 8 Wörter werden gemeldet statt verschluckt', () => {
    const r = ws.build(['Schmetterlingsflügel', 'Ei', 'Oma', 'Opa', 'Hut', 'Zug', 'Bus', 'Ast', 'Igel'], 1);
    assert.ok(r.skipped.includes('SCHMETTERLINGSFLÜGEL'));
    assert.ok(r.skipped.includes('IGEL'));
});

test('ohne Wörter kein Zufallsgitter', () => {
    assert.deepEqual(ws.build([], 1).grid, []);
});
