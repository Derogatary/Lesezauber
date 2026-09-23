// NEU (v0.43.0-beta): eigene Stimme - Sprecher-Wahl und Schlüssel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

test('Sprecher-Wahl: gewünschter Sprecher, sonst Mama vor Papa vor anderen, "off" = keiner', () => {
    const pick = app.voice.pickSpeaker.bind(app.voice);
    assert.equal(pick(['Mama', 'Papa'], 'Papa'), 'Papa');
    assert.equal(pick(['Mama'], 'Papa'), 'Mama');          // vertraute Stimme statt Computer
    assert.equal(pick(['Oma', 'Papa'], ''), 'Papa');
    assert.equal(pick(['Opa', 'Oma'], ''), 'Oma');
    assert.equal(pick(['Mama'], 'off'), null);
    assert.equal(pick([], 'Mama'), null);
});

test('Aufnahme-Schlüssel und Sprecher-Namen', () => {
    const k = app.voice.key('book_1', 7, 'Mama');
    assert.equal(k, 'book_1|7|Mama');
    assert.deepEqual(app.voice.parseKey(k), { bookId: 'book_1', pageId: '7', speaker: 'Mama' });
    assert.equal(app.voice.parseKey('kaputt'), null);
    assert.equal(app.voice.cleanSpeakerName('  O|ma<b>"  '), 'Omab');
    assert.equal(app.voice.cleanSpeakerName('x'.repeat(40)).length, 20);
});
