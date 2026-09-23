import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

const page = () => ({
    id: 1, status: 'done',
    variants: { papa: { text: 'Der Hund.', erstleserText: 'Der 🐶.', desc: 'Bild', quizQ: 'Wer?', quizA: 'Hund', personaComment: 'Witz' } }
});

test('gemeldete Felder sind überall weg, das Original bleibt gespeichert', () => {
    const p = page();
    p.aiHidden = { 'papa:personaComment': 1, 'papa:quiz': 1, 'papa:erstleserText': 1 };
    const v = app.utils.resolvePageVariant(p, 'papa');
    assert.equal(v.personaComment, null);
    assert.equal(v.quizQ, null);
    assert.equal(v.quizA, null);
    assert.equal(v.erstleserText, 'Der Hund.'); // fällt auf den gedruckten Text zurück
    assert.equal(v.desc, 'Bild');
    assert.equal(p.variants.papa.personaComment, 'Witz'); // Original unverändert
    assert.equal(app.utils.resolveAnyVariant(p, 'fee').personaComment, null);
});

test('ohne Meldung bekommt man das gespeicherte Objekt selbst', () => {
    const p = page();
    assert.equal(app.utils.resolvePageVariant(p, 'papa'), p.variants.papa);
    assert.equal(app.utils.isAiHidden(p, 'papa', 'desc'), false);
});

test('Meldung gilt nur für die gemeldete Persona', () => {
    const p = page();
    p.variants.fee = { ...p.variants.papa };
    p.aiHidden = { 'papa:desc': 1 };
    assert.equal(app.utils.resolvePageVariant(p, 'fee').desc, 'Bild');
});
