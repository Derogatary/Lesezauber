// NEU (v0.45.0-beta): SchreibZauber - Bilder manuell austauschen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';
await import('../js/studio/studioCore.js');
await import('../js/studio/imageSource.js');
await import('../js/studio/studioManualImages.js');
await import('../js/studio/imageTargets.js');

const project = () => ({
    type: 'picturebook', spec: { trim: 'a4hoch' },
    style: { look: 'aquarell', lineWeight: 'weich', palette: ['Himmelblau', 'Moosgrün'], extraPrompt: 'Abendlicht' },
    characters: [{ id: 'char_1_1', name: 'Fuchs Fridolin', sheetText: 'roter Fuchs mit gelbem Schal', sheetImgUrl: 'data:image/webp;base64,AA', sheetMeta: { source: 'upload' } }],
    spreads: [
        { index: 0, sketchPrompt: 'Fridolin im Wald', characterIds: ['char_1_1'], layout: { textPos: 'unten' }, imageMeta: { source: 'placeholder' }, imgUrl: 'x' },
        { index: 1, panels: [{ visual: 'Panel A', balloons: [{ speaker: 'Fuchs Fridolin', text: 'Hallo' }] }] }
    ]
});

test('Liste: erst Figurenblätter, dann Seiten bzw. Comic-Panels', () => {
    const items = app.studio.manualImageItems(project());
    assert.deepEqual(items.map(i => i.key), ['c:char_1_1', 's:0', 'p:1:0']);
    assert.deepEqual(items.map(i => i.source), ['upload', 'placeholder', '']);
    assert.deepEqual(app.studio.parseManualItemKey('p:1:0'), { kind: 'panel', spreadIndex: 1, panelIndex: 0 });
});

test('Nano-Banana-Prompt: vollständig, positiv formuliert, unterstütztes Format', () => {
    const p = project();
    const prompt = app.studio.manualPromptFor(p, { kind: 'spread', spreadIndex: 0 }, 'nanobanana');
    for (const part of ['Fridolin im Wald', 'Aquarell', 'Himmelblau, Moosgrün', 'Abendlicht', 'roter Fuchs mit gelbem Schal',
        'Format 3:4 (Hochformat)', 'unteres Drittel', 'ohne Schrift', 'Figurenblätter von Fuchs Fridolin']) {
        assert.ok(prompt.includes(part), `fehlt: ${part}`);
    }
    // Keine "KEIN ..."-Verbotslisten mehr (Google: positiv formulieren), keine Pixelangaben
    assert.ok(!/KEIN |keine Gewalt|Pixel/.test(prompt), prompt);
    assert.ok(!prompt.includes('..'), 'doppelter Punkt');
    // Comic-Panel: Referenz über den Sprecher in der Sprechblase
    assert.ok(app.studio.manualPromptFor(p, { kind: 'panel', spreadIndex: 1, panelIndex: 0 }, 'nanobanana').includes('Figurenblätter von Fuchs Fridolin'));
    // Figurenblatt selbst: keine Referenz auf sich selbst
    assert.ok(!app.studio.manualPromptFor(p, { kind: 'character', characterId: 'char_1_1' }, 'nanobanana').includes('Angehängte Referenzbilder'));
});

test('Seitenverhältnis: nächstes unterstütztes je Programm', () => {
    const f = app.studio.formats;
    assert.equal(f.supportedAspect('pagePortrait'), '3:4');
    assert.equal(f.supportedAspect('panoramaPortrait'), '4:3');   // 1,41:1
    assert.equal(f.supportedAspect('panoramaSquare'), '16:9');    // 2:1
    assert.equal(f.supportedAspect('pagePortrait', ['1:1', '3:2', '2:3']), '2:3'); // ChatGPT
    assert.equal(f.orientationLabel('3:4'), 'Hochformat');
});

test('Zielprogramme: ChatGPT-Format, englische Fassung mit Negativ-Prompt', () => {
    const p = project();
    const gpt = app.studio.manualPromptData(p, { kind: 'spread', spreadIndex: 0 }, 'chatgpt');
    assert.equal(gpt.aspect, '2:3');
    assert.equal(gpt.negative, '');
    const en = app.studio.manualPromptData(p, { kind: 'spread', spreadIndex: 0 }, 'english');
    assert.ok(en.prompt.startsWith("Children's book illustration, portrait format, aspect ratio 3:4."));
    assert.ok(en.negative.includes('text') && en.negative.includes('watermark'));
    // ohne Übersetzung bleibt der freie Text (deutsch) drin - nie leer
    assert.ok(en.prompt.includes('Fridolin im Wald'));
    assert.ok(app.studio.imageTargets.needsTranslation('english', en.parts));
    assert.ok(!app.studio.imageTargets.needsTranslation('nanobanana', en.parts));
    assert.ok(app.studio.imageTargets.list().length >= 3);
});
