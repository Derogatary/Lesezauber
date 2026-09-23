// NEU (v0.45.0-beta): SchreibZauber - Bilder manuell austauschen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';
await import('../js/studio/studioCore.js');
await import('../js/studio/imageSource.js');
await import('../js/studio/studioManualImages.js');

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

test('Prompt enthält Stil, Farbpalette, Figuren, Format, Textfläche und Referenzhinweis', () => {
    const p = project();
    const prompt = app.studio.manualPromptFor(p, { kind: 'spread', spreadIndex: 0 });
    for (const part of ['Fridolin im Wald', 'Aquarell', 'Himmelblau, Moosgrün', 'Abendlicht', 'roter Fuchs mit gelbem Schal',
        'Seitenverhältnis 3:4', '1024 × 1344', 'unteres Drittel', 'KEIN Text', 'Figurenblätter von Fuchs Fridolin']) {
        assert.ok(prompt.includes(part), `fehlt: ${part}`);
    }
    // Comic-Panel: Referenz über den Sprecher in der Sprechblase
    assert.ok(app.studio.manualPromptFor(p, { kind: 'panel', spreadIndex: 1, panelIndex: 0 }).includes('Figurenblätter von Fuchs Fridolin'));
    // Figurenblatt selbst: keine Referenz auf sich selbst
    assert.ok(!app.studio.manualPromptFor(p, { kind: 'character', characterId: 'char_1_1' }).includes('Angehängte Referenzbilder'));
});
