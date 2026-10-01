// NEU: Speechify-Hervorhebung über die gesprochenen Wörter statt nur über Zeichen-Positionen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
const { alignmentBySpeechMarkValues } = await import('../js/ttsProviders.js');

test('Speechify: Wörter werden der Reihe nach zugeordnet, auch bei falschen Positionen', () => {
    const text = '"Hallo", sagte der Bär. Komm mit!';
    // absichtlich unsinnige start-Werte (z.B. SSML-Versatz) - zählen hier nicht
    const marks = { chunks: [
        { type: 'sentence', chunks: [
            { type: 'word', value: 'Hallo', start: 999, start_time: 100 },
            { type: 'word', value: 'sagte', start: 999, start_time: 600 },
            { type: 'word', value: 'der', start: 999, start_time: 900 },
            { type: 'word', value: 'Bär', start: 999, start_time: 1100 }
        ] },
        { type: 'word', value: 'Komm', start: 999, start_time: 1800 },
        { type: 'word', value: 'mit', start: 999, start_time: 2100 }
    ] };
    const a = alignmentBySpeechMarkValues(marks, text);
    assert.ok(a);
    assert.equal(a.characters.length, text.length);
    assert.equal(a.starts[text.indexOf('"Hallo"')], 0.1);
    assert.equal(a.starts[text.indexOf('sagte')], 0.6);
    assert.equal(a.starts[text.indexOf('Komm')], 1.8);
    assert.equal(a.starts[text.indexOf('mit!')], 2.1);
});

test('Speechify: zu wenige Treffer -> null (alte Zuordnung greift)', () => {
    const marks = { chunks: [{ type: 'word', value: 'ganz', start_time: 1 }, { type: 'word', value: 'anders', start_time: 2 }] };
    assert.equal(alignmentBySpeechMarkValues(marks, 'Der Hund bellt.'), null);
});
