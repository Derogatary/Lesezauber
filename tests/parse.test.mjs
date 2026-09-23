import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
const { parseMultiPersonaResponse } = await import('../js/api.js');

test('ein kaputter Persona-Block reißt die anderen nicht mit', () => {
    const raw = [
        '```core\n{"originalText": "Der Hund."}\n```',
        '```persona:standard\n{"simplifiedText": "Der 🐶.", "personaComment": "Toll!"}\n```',
        '```persona:papa\n{"simplifiedText": "kaputt "Anführungszeichen" }\n```'
    ].join('\n');
    const r = parseMultiPersonaResponse(raw);
    assert.equal(r.core.originalText, 'Der Hund.');
    assert.equal(r.personas.standard.personaComment, 'Toll!');
    assert.equal(r.personas.papa, undefined);
});
