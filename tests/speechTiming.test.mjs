// NEU: geschätzte Wort-Zeitpunkte für die Hervorhebung (Satzzeichen-Pausen)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

test('Hervorhebung: Pause nach dem Satzende verschiebt das nächste Wort nach hinten', () => {
    const pieces = ['Der ', 'Hund ', 'bellt. ', 'Die ', 'Katze ', 'schläft.'];
    const t = app.utils.estimateWordStartTimes(pieces, 6);
    assert.equal(t.length, 6);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
    // Abstand "bellt." -> "Die" größer als "Der" -> "Hund" (gleich viele Silben)
    assert.ok(t[3] - t[2] > t[1] - t[0]);
    assert.ok(t[t.length - 1] < 6);
    assert.ok(t[0] > 0 && t[0] <= 0.15);
});

test('Sprechdauer der Gerätestimme: langsamer = länger', () => {
    const d1 = app.utils.estimateSpeechDurationSec('Der Hund bellt laut.', 1);
    const d2 = app.utils.estimateSpeechDurationSec('Der Hund bellt laut.', 0.5);
    assert.ok(d1 > 0.5 && d1 < 3);
    assert.ok(Math.abs(d2 - d1 * 2) < 1e-9);
});

// NEU: Doppelpunkt bekommt beim Sprechen eine Pause, Anzeige bleibt gleich
test('Doppelpunkt: Pause beim Sprechen, Anzeige und Positionen unverändert', () => {
    const text = 'Das Bild zeigt: Auf dem Bild ist es 10:30 und er sagt: ja.';
    const spoken = app.utils.stripEmojiForSpeech(text);
    assert.equal(spoken, 'Das Bild zeigt. Auf dem Bild ist es 10:30 und er sagt, ja.');
    const { clean, html } = app.utils.buildSpeechHighlightHtml(text);
    assert.equal(clean, spoken);
    assert.ok(html.includes('zeigt:') && html.includes('sagt:'));
    assert.equal(clean.length, app.utils.stripEmojiForSpeech(text, true).length);
});
