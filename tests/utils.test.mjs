import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';

test('Buchsprache nur bei übersetzten Büchern', () => {
    assert.equal(app.utils.bookSpeechLang({ language: 'en' }), 'en-GB');
    assert.equal(app.utils.bookSpeechLang({}), null);
    assert.equal(app.utils.bookSpeechLang(null), null);
});

test('Persona-Kurzname ohne Klammerzusatz', () => {
    assert.equal(app.utils.personaShortName({ label: 'Standard (Neutral & Freundlich)' }), 'Standard');
    assert.equal(app.utils.personaShortName({ label: 'Lustiger Papa' }), 'Lustiger Papa');
});

test('jede Persona hat Symbol, Kurzbeschreibung und Zwischenruf-Stil', () => {
    app.personas.forEach(p => {
        assert.ok(p.icon && p.tagline && p.commentStyle, p.id);
        assert.ok(!p.commentStyle.includes("'"), `${p.id}: einfaches Anführungszeichen bricht den Prompt`);
    });
});

test('Varianten-Umrechnung übernimmt den Zwischenruf', () => {
    const v = app.utils.buildPageVariant({ originalText: 'Text', personaComment: '  Hallo!  ' }, {}, 'story');
    assert.equal(v.personaComment, 'Hallo!');
    assert.equal(app.utils.buildPageVariant({ originalText: 'Text' }, {}, 'story').personaComment, null);
});
