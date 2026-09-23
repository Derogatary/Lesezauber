import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

const L = app.studio.layout;
const project = (trim, layouts) => ({ type: 'picturebook', spec: { trim }, spreads: layouts.map((layout, index) => ({ index, layout })) });

test('Panorama beginnt immer auf einer linken (geraden) Buchseite', () => {
    const plan = L.planPhysicalPages(project('quadrat', [{}, { panorama: true }, {}, { panorama: true }]));
    plan.filter(p => p.panorama).forEach(p => assert.equal(p.startPage % 2, 0));
    assert.equal(plan[1].blankBefore, true);  // Seite 3 wäre rechts -> Leerseite
    assert.equal(plan[1].startPage, 4);
});

test('Panorama nur bei Hochformat/Quadrat, nicht bei A5 quer oder Comic', () => {
    assert.equal(L.panoramaAllowed(project('a5-hoch', [])), true);
    assert.equal(L.panoramaAllowed(project('a5-quer', [])), false);
    assert.equal(L.panoramaAllowed({ type: 'comic', spec: { trim: 'quadrat' } }), false);
    assert.equal(L.planPhysicalPages(project('a5-quer', [{ panorama: true }]))[0].pages, 1);
});

test('Textstreifen verkleinert den Bildbereich, Panorama macht aus Streifen einen Kasten', () => {
    assert.deepEqual(L.imageRegion({ textPos: 'band-unten' }), { top: 0, bottom: 28, fit: 'contain' });
    assert.deepEqual(L.imageRegion({ textPos: 'unten' }), { top: 0, bottom: 0, fit: null });
    assert.equal(L.effectiveTextPos({ textPos: 'band-oben', panorama: true }), 'oben');
});

test('"Vollbild ohne Text" liefert keine Textebene', () => {
    assert.equal(L.buildOverlayHtml('Hallo', { textPos: 'ohne' }, 'normal', 4, 'mm'), '');
    assert.match(L.buildOverlayHtml('Hallo <b>', { textPos: 'unten' }, 'normal', 4, 'mm'), /Hallo &lt;b&gt;/);
});

test('sanitize() ist auch in Attributen sicher', () => {
    assert.equal(app.utils.sanitize('a"b\'c<d>&'), 'a&quot;b&#39;c&lt;d&gt;&amp;');
    assert.equal(app.utils.sanitize(0), '0');
    assert.equal(app.utils.sanitize(null), '');
});
