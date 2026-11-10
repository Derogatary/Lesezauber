import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers.mjs';
import '../js/api.js';
import '../js/ttsProviders.js';

test('Gemini rotates once on 429, skips the blocked model next time and ignores thought parts', async t => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const storage = new Map();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value)
    } });
    t.after(() => {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
        else delete globalThis.localStorage;
    });
    app.settings.apiKey = 'rotation-test';
    const attempts = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        attempts.push(url.split('/').at(-1).split(':')[0]);
        assert.equal(options.headers['x-goog-api-key'], 'rotation-test');
        if (attempts.length === 1) return Response.json({}, { status: 429 });
        return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [
            { thought: true, text: 'intern' }, { text: 'Hallo' }, { text: ' Welt' }
        ] } }] });
    });
    const payload = { contents: [{ parts: [{ text: 'Test' }] }] };
    const data = await app.api.generateGeminiContent(payload);
    await app.api.generateGeminiContent(payload);
    assert.deepEqual(attempts, ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.6-flash']);
    assert.deepEqual(app.api.geminiTextResult(data), { text: 'Hallo Welt', finishReason: 'STOP' });
});

test('Gemini speech separates narration from style and reads the REST audio response', async t => {
    app.settings.apiKey = 'speech-test';
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(new URL(url).pathname, '/v1beta/interactions');
        const body = JSON.parse(options.body);
        calls.push(body.model);
        assert.equal(body.store, false);
        assert.deepEqual(body.input[0].content, [{ type: 'text', text: 'Hallo Welt',
            annotations: [{ type: 'speech_metadata', style: 'warm' }] }]);
        if (calls.length === 1) return Response.json({}, { status: 404 });
        return Response.json({ steps: [{ type: 'model_output', content: [
            { type: 'audio', mime_type: 'audio/wav', data: 'UklGRg==' }
        ] }] });
    });
    const { blob } = await app.ttsProviders.get('gemini').synthesize('Hallo Welt', { styleHint: 'warm' });
    assert.equal(blob.type, 'audio/wav');
    assert.equal(await blob.text(), 'RIFF');
    assert.deepEqual(calls, ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']);
});

test('Speechify preserves word timing with the current flat marks response', async t => {
    app.settings.speechifyKey = 'speechify-test';
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.speechify.ai/v1/audio/speech');
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'simba-3.5');
        assert.equal(body.language, 'de-DE');
        assert.match(body.input, /prosody rate="-10%"/);
        return Response.json({ audio_data: 'SUQz', speech_marks: [
            { type: 'word', value: 'Hallo', start_time: 0 },
            { type: 'word', value: 'Welt', start_time: 450 }
        ] });
    });
    const result = await app.ttsProviders.get('speechify').synthesize('Hallo Welt', { rate: 0.9 });
    assert.equal(result.alignment.starts[6], 0.45);
});

test('ElevenLabs follows opaque page tokens without requesting a total count', async t => {
    app.settings.elevenLabsKey = 'voices-test';
    const tokens = [];
    t.mock.method(globalThis, 'fetch', async url => {
        assert.equal(url.pathname, '/v2/voices');
        assert.equal(url.searchParams.get('include_total_count'), 'false');
        const token = url.searchParams.get('next_page_token');
        tokens.push(token);
        return Response.json(token ? { voices: [{ voice_id: 'v2', name: 'B' }], has_more: false } : {
            voices: [{ voice_id: 'v1', name: 'A' }], has_more: true, next_page_token: 'page+=2'
        });
    });
    assert.deepEqual(await app.ttsProviders.fetchElevenVoices(), [{ id: 'v1', label: 'A' }, { id: 'v2', label: 'B' }]);
    assert.deepEqual(tokens, [null, 'page+=2']);
});
