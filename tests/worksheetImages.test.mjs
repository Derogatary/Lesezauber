// NEU (v0.55.0-beta): Ausmalbild-Prompts fürs Arbeitsheft
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

test('Ausmal-Prompt deutsch: Motiv, Konturen, weißer Grund, keine Schrift', () => {
    const d = app.studio.worksheetImages.coloringPromptData('ein lachender Apfel mit Blatt.', 'nanobanana');
    assert.match(d.prompt, /Motiv: ein lachender Apfel mit Blatt\./);
    assert.match(d.prompt, /schwarze Umrisslinien/);
    assert.match(d.prompt, /weißem Hintergrund/);
    assert.match(d.prompt, /ohne Schrift/);
    assert.equal(d.aspect, '1:1');
    assert.equal(d.negative, '');
    assert.equal(d.needsTranslation, false);
});

test('Ausmal-Prompt für Leonardo & Co.: englisch mit Negativ-Prompt, erst nach Übersetzung', () => {
    const before = app.studio.worksheetImages.coloringPromptData('ein Drache', 'english');
    assert.equal(before.needsTranslation, true);
    assert.match(before.negative, /shading/);
    assert.match(before.prompt, /coloring book page/);
});

test('Leeres Motiv bekommt einen freundlichen Standard', () => {
    const d = app.studio.worksheetImages.coloringPromptData('', 'chatgpt');
    assert.match(d.prompt, /Motiv: ein einfaches, freundliches Motiv\./);
});
