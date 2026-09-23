// NEU (v0.44.0-beta): Nachtmodus - wann ist Schluss?
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

test('Nachtmodus: fertig, festgefahren oder läuft', () => {
    const s = app.utils.nightPrepStatus;
    const now = 10_000_000;
    assert.equal(s({ open: 0, lastProgressAt: now, now }), 'done');
    assert.equal(s({ open: 5, lastProgressAt: now - 60_000, now }), 'running');
    assert.equal(s({ open: 5, lastProgressAt: now - 20 * 60_000, now }), 'stalled');
    assert.equal(s({ open: 5, lastProgressAt: now - 1000, now, stallMs: 500 }), 'stalled');
});
