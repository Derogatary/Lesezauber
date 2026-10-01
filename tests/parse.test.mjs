import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
const { parseMultiPersonaResponse } = await import('../js/api.js');

test('ein kaputter Persona-Block reißt die anderen nicht mit', () => {
    const raw = [
        '```core\n{"originalText": "Der Hund."}\n```',
        '```persona:standard\n{"simplifiedText": "Der 🐶.", "personaComment": "Toll!"}\n```',
        // abgeschnittener Block - auch die Anführungszeichen-Reparatur hilft hier nicht
        '```persona:papa\n{"simplifiedText": "kaputt, "personaComment": \n```'
    ].join('\n');
    const r = parseMultiPersonaResponse(raw);
    assert.equal(r.core.originalText, 'Der Hund.');
    assert.equal(r.personas.standard.personaComment, 'Toll!');
    assert.equal(r.personas.papa, undefined);
});

// NEU: wörtliche Rede mit geraden Anführungszeichen ließ früher den ganzen
// core-Block (und damit den Seitentext) verschwinden
test('wörtliche Rede mit geraden Anführungszeichen geht nicht mehr verloren', () => {
    const raw = [
        '```core\n{"originalText": ""Hallo", sagte der Bär. "Komm mit!"", "hasIllustration": true, "difficultWords": []}\n```',
        '```persona:standard\n{"simplifiedText": "Er rief "Nein", fragte dann "Wo?"", "personaComment": null}\n```'
    ].join('\n');
    const r = parseMultiPersonaResponse(raw);
    assert.equal(r.core.originalText, '"Hallo", sagte der Bär. "Komm mit!"');
    assert.equal(r.core.hasIllustration, true);
    assert.equal(r.personas.standard.simplifiedText, 'Er rief "Nein", fragte dann "Wo?"');
});
