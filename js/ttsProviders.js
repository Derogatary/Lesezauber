import { app } from './core.js';

// ================= KI-Stimmen (neuronale TTS-Anbieter) =================
// Die Gerätestimme (SpeechSynthesis) klingt auf vielen Geräten hölzern und
// "abgehackt", weil sie Wortbausteine zusammensetzt. Die Anbieter hier
// erzeugen stattdessen eine echte, durchgehend gesprochene Audiodatei -
// deutlich natürlicher, dafür kostenpflichtig bzw. limitiert.
//
// Jeder Anbieter ist ein Eintrag in app.ttsProviders.list. Ein neuer
// Anbieter = ein weiterer Eintrag hier; Einstellungen-Dropdown, Speicherung
// und Reader nutzen ihn danach automatisch (analog zu app.personas).

// Preview-Modelle bei Google werden regelmäßig umbenannt. Schlägt das
// primäre Modell mit "not found" fehl, wird automatisch das ältere
// versucht - so bleibt die App auch nach einer Umbenennung nutzbar.
const GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_FALLBACK_MODEL = 'gemini-2.5-flash-preview-tts';

// Mehrsprachiges ElevenLabs-Modell - nur die mehrsprachigen Modelle
// sprechen sauberes Deutsch, die reinen englischen Modelle nicht.
const ELEVEN_MODEL = 'eleven_multilingual_v2';

const OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';

// Fehler mit Zusatzinfo: "fatal" bedeutet, dass ein erneuter Versuch in
// dieser Sitzung sinnlos ist (falscher Key, Tageslimit erreicht) - die App
// schaltet dann bis zum Neuladen auf die Gerätestimme zurück, statt bei
// jeder Seite erneut in denselben Fehler zu laufen.
export class TtsError extends Error {
    constructor(message, { fatal = false, code = '' } = {}) {
        super(message);
        this.name = 'TtsError';
        this.fatal = fatal;
        this.code = code;
    }
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Gemini liefert rohes PCM (16 Bit) ohne Dateikopf zurück. Ein <audio>-Tag
// kann damit nichts anfangen - deshalb setzen wir hier einen normalen
// WAV-Header davor. Das ist reines Umverpacken, kein Neukodieren.
function pcmToWavBlob(pcmBytes, sampleRate) {
    const channels = 1;
    const bitsPerSample = 16;
    const blockAlign = channels * bitsPerSample / 8;
    const buffer = new ArrayBuffer(44 + pcmBytes.byteLength);
    const view = new DataView(buffer);

    const writeText = (offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeText(0, 'RIFF');
    view.setUint32(4, 36 + pcmBytes.byteLength, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);          // Länge des fmt-Blocks
    view.setUint16(20, 1, true);           // 1 = unkomprimiertes PCM
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeText(36, 'data');
    view.setUint32(40, pcmBytes.byteLength, true);
    new Uint8Array(buffer, 44).set(pcmBytes);

    return new Blob([buffer], { type: 'audio/wav' });
}

// "audio/L16;codec=pcm;rate=24000" -> 24000
function sampleRateFromMime(mimeType) {
    const match = /rate=(\d+)/.exec(mimeType || '');
    return match ? parseInt(match[1], 10) : 24000;
}

// Gemeinsame Fehlerübersetzung: aus HTTP-Status wird eine Meldung, die der
// Nutzer ohne Entwicklerwissen versteht.
async function describeHttpError(res, providerLabel) {
    let detail = '';
    try {
        detail = (await res.text()).slice(0, 300);
    } catch (e) {
        detail = '';
    }
    console.error(`${providerLabel}-TTS-Fehler ${res.status}:`, detail);

    if (res.status === 401 || res.status === 403) {
        return new TtsError(`${providerLabel}: API-Key fehlt oder ist ungültig.`, { fatal: true, code: 'AUTH' });
    }
    if (res.status === 429) {
        return new TtsError(`${providerLabel}: Limit erreicht (zu viele Anfragen).`, { fatal: true, code: 'QUOTA' });
    }
    if (res.status === 402) {
        return new TtsError(`${providerLabel}: Guthaben aufgebraucht.`, { fatal: true, code: 'QUOTA' });
    }
    return new TtsError(`${providerLabel}-Fehler ${res.status}`, { code: 'HTTP' });
}

// Netzwerkfehler beim Browser-Aufruf sind hier fast immer CORS: manche
// Anbieter erlauben Aufrufe nur von einem Server aus. Ohne diese
// Unterscheidung stünde nur ein nichtssagendes "Failed to fetch" in der
// Konsole.
function wrapNetworkError(error, providerLabel) {
    if (error instanceof TtsError) return error;
    console.error(`${providerLabel}-TTS nicht erreichbar:`, error);
    return new TtsError(
        `${providerLabel} ist vom Browser aus nicht erreichbar (Netzwerk oder CORS).`,
        { fatal: true, code: 'NETWORK' }
    );
}

// ---------------------------------------------------------------- Gemini
async function geminiRequest(model, text, voice, signal) {
    const body = {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Kore' } }
            }
        }
    };

    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(app.settings.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
    });
}

async function geminiSynthesize(text, { voice, styleHint, signal }) {
    if (!app.settings.apiKey) {
        throw new TtsError('Kein Gemini-API-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });
    }

    // Gemini-TTS wird über den Prompt gesteuert: Ein vorangestellter
    // Sprechauftrag färbt die Stimme (z.B. "sanft, wie eine Gute-Nacht-Fee")
    // und wird selbst nicht mitgesprochen.
    const prompt = styleHint ? `${styleHint}\n\n${text}` : `Lies den folgenden Text vor:\n\n${text}`;

    let res;
    try {
        res = await geminiRequest(GEMINI_TTS_MODEL, prompt, voice, signal);
        // 404/400 = Modellname existiert nicht (mehr) -> älteres Modell probieren
        if (res.status === 404 || res.status === 400) {
            console.warn(`Gemini-TTS-Modell ${GEMINI_TTS_MODEL} nicht verfügbar, versuche ${GEMINI_TTS_FALLBACK_MODEL}.`);
            res = await geminiRequest(GEMINI_TTS_FALLBACK_MODEL, prompt, voice, signal);
        }
    } catch (e) {
        throw wrapNetworkError(e, 'Gemini');
    }

    if (!res.ok) throw await describeHttpError(res, 'Gemini');

    const data = await res.json();
    const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!part) {
        throw new TtsError('Gemini hat keine Audiodaten zurückgeliefert.', { code: 'EMPTY' });
    }

    const bytes = base64ToBytes(part.inlineData.data);
    const mime = part.inlineData.mimeType || '';

    // Kommt ausnahmsweise schon ein fertiges Format (z.B. WAV/MP3), nicht
    // noch einmal verpacken.
    if (/wav|mpeg|mp3|ogg/i.test(mime)) {
        return { blob: new Blob([bytes], { type: mime }), alignment: null };
    }
    return { blob: pcmToWavBlob(bytes, sampleRateFromMime(mime)), alignment: null };
}

// -------------------------------------------------- Google Cloud (Chirp 3)
async function googleCloudSynthesize(text, { voice, rate, signal }) {
    const key = app.settings.googleTtsKey;
    if (!key) {
        throw new TtsError('Kein Google-Cloud-TTS-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });
    }

    const voiceName = voice || 'de-DE-Chirp3-HD-Achernar';
    // Der Sprachcode steckt immer im Stimmennamen ("de-DE-Chirp3-HD-...").
    const languageCode = voiceName.split('-').slice(0, 2).join('-') || 'de-DE';

    let res;
    try {
        res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: { text },
                voice: { languageCode, name: voiceName },
                audioConfig: { audioEncoding: 'MP3', speakingRate: rate || 1.0 }
            }),
            signal
        });
    } catch (e) {
        throw wrapNetworkError(e, 'Google Cloud');
    }

    if (!res.ok) throw await describeHttpError(res, 'Google Cloud');

    const data = await res.json();
    if (!data.audioContent) {
        throw new TtsError('Google Cloud hat keine Audiodaten zurückgeliefert.', { code: 'EMPTY' });
    }
    return { blob: new Blob([base64ToBytes(data.audioContent)], { type: 'audio/mpeg' }), alignment: null };
}

// ----------------------------------------------------------- ElevenLabs
async function elevenSynthesize(text, { voice, signal }) {
    const key = app.settings.elevenLabsKey;
    if (!key) {
        throw new TtsError('Kein ElevenLabs-API-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });
    }

    const voiceId = voice || '21m00Tcm4TlvDq8ikWAM';

    // "with-timestamps" liefert zusätzlich, wann welcher Buchstabe
    // gesprochen wird. Damit läuft die Wort-Hervorhebung exakt mit, statt
    // nur geschätzt zu werden - das ist der einzige Anbieter hier, der das
    // kann, deshalb bewusst dieser Endpunkt.
    let res;
    try {
        res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
            body: JSON.stringify({
                text,
                model_id: ELEVEN_MODEL,
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            }),
            signal
        });
    } catch (e) {
        throw wrapNetworkError(e, 'ElevenLabs');
    }

    if (!res.ok) throw await describeHttpError(res, 'ElevenLabs');

    const data = await res.json();
    if (!data.audio_base64) {
        throw new TtsError('ElevenLabs hat keine Audiodaten zurückgeliefert.', { code: 'EMPTY' });
    }

    const raw = data.alignment || data.normalized_alignment || null;
    const alignment = raw && raw.characters
        ? { characters: raw.characters, starts: raw.character_start_times_seconds || [] }
        : null;

    return { blob: new Blob([base64ToBytes(data.audio_base64)], { type: 'audio/mpeg' }), alignment };
}

// --------------------------------------------------------------- OpenAI
async function openaiSynthesize(text, { voice, rate, styleHint, signal }) {
    const key = app.settings.openAiKey;
    if (!key) {
        throw new TtsError('Kein OpenAI-API-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });
    }

    let res;
    try {
        res = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                model: OPENAI_TTS_MODEL,
                input: text,
                voice: voice || 'nova',
                // Eigenes Feld für die Sprechanweisung - anders als bei
                // Gemini besteht hier keine Gefahr, dass sie mitgesprochen wird.
                instructions: styleHint || 'Lies wie in einem Kinderbuch vor: warm, deutlich und nicht gehetzt.',
                response_format: 'mp3',
                speed: rate || 1.0
            }),
            signal
        });
    } catch (e) {
        throw wrapNetworkError(e, 'OpenAI');
    }

    if (!res.ok) throw await describeHttpError(res, 'OpenAI');

    return { blob: new Blob([await res.arrayBuffer()], { type: 'audio/mpeg' }), alignment: null };
}

Object.assign(app.ttsProviders, {
    list: [
        {
            id: 'device',
            label: 'Gerätestimme (kostenlos, offline)',
            tier: 'Gratis',
            neural: false,
            hint: 'Die eingebaute Stimme des Geräts. Kostet nichts, funktioniert offline - klingt aber maschinell.',
            keySetting: null,
            voices: [],
            synthesize: null
        },
        {
            id: 'gemini',
            label: 'Gemini KI-Stimme (Free Tier)',
            tier: 'Free Tier',
            neural: true,
            hint: 'Nutzt denselben Gemini-Key wie die Seitenanalyse - kein zusätzliches Konto nötig. Im kostenlosen Tarif gibt es allerdings nur wenige Anfragen pro Tag; mit eingeschaltetem Stimmen-Speicher reicht das für ein paar Seiten täglich.',
            keySetting: 'apiKey',
            keyUrl: 'https://aistudio.google.com/app/apikey',
            // 8 der 30 Gemini-Stimmen, alle sprechen Deutsch.
            voices: [
                { id: 'Kore', label: 'Kore - sachlich, klar' },
                { id: 'Aoede', label: 'Aoede - leicht, freundlich' },
                { id: 'Leda', label: 'Leda - jugendlich' },
                { id: 'Callirrhoe', label: 'Callirrhoe - entspannt' },
                { id: 'Puck', label: 'Puck - munter, verspielt' },
                { id: 'Charon', label: 'Charon - ruhig, tief' },
                { id: 'Enceladus', label: 'Enceladus - behaglich, hauchig' },
                { id: 'Sulafat', label: 'Sulafat - warm' }
            ],
            defaultVoice: 'Kore',
            supportsStyle: true,
            synthesize: geminiSynthesize
        },
        {
            id: 'googlecloud',
            label: 'Google Cloud Chirp 3 HD (1 Mio. Zeichen/Monat gratis)',
            tier: 'Bezahlt',
            neural: true,
            hint: 'Braucht ein Google-Cloud-Projekt mit hinterlegter Zahlungsart. Die ersten 1 Mio. Zeichen pro Monat sind frei (grob: mehrere tausend Buchseiten), danach ca. 30 US-Dollar je 1 Mio. Zeichen.',
            keySetting: 'googleTtsKey',
            keyUrl: 'https://console.cloud.google.com/apis/credentials',
            voices: [
                { id: 'de-DE-Chirp3-HD-Achernar', label: 'Achernar - weiblich, warm' },
                { id: 'de-DE-Chirp3-HD-Aoede', label: 'Aoede - weiblich, freundlich' },
                { id: 'de-DE-Chirp3-HD-Leda', label: 'Leda - weiblich, jugendlich' },
                { id: 'de-DE-Chirp3-HD-Charon', label: 'Charon - männlich, ruhig' },
                { id: 'de-DE-Chirp3-HD-Puck', label: 'Puck - männlich, munter' },
                { id: 'de-DE-Chirp3-HD-Enceladus', label: 'Enceladus - männlich, behaglich' },
                { id: 'de-DE-Neural2-F', label: 'Neural2-F - weiblich (günstiger)' },
                { id: 'de-DE-Neural2-D', label: 'Neural2-D - männlich (günstiger)' }
            ],
            defaultVoice: 'de-DE-Chirp3-HD-Achernar',
            supportsStyle: false,
            supportsRate: true,
            synthesize: googleCloudSynthesize
        },
        {
            id: 'elevenlabs',
            label: 'ElevenLabs (beste Vorlese-Qualität)',
            tier: 'Bezahlt',
            neural: true,
            hint: 'Klingt am lebendigsten und hält als einziger Anbieter die Wort-Hervorhebung exakt synchron. Gratis-Konto: 10.000 Zeichen/Monat (ca. 10 Minuten, nur privat). Bezahlt ab ca. 5 US-Dollar/Monat. Achtung: der Browser-Zugriff kann vom Anbieter gesperrt sein - der Test-Knopf zeigt es sofort.',
            keySetting: 'elevenLabsKey',
            keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
            // Bekannte Standardstimmen; eigene Stimmen lassen sich in den
            // Einstellungen per Knopf aus dem Konto nachladen.
            voices: [
                { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel - ruhig, erzählend' },
                { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah - sanft' },
                { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda - warm' },
                { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam - männlich, tief' },
                { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh - männlich, jung' }
            ],
            defaultVoice: '21m00Tcm4TlvDq8ikWAM',
            supportsStyle: false,
            supportsVoiceFetch: true,
            synthesize: elevenSynthesize
        },
        {
            id: 'openai',
            label: 'OpenAI (günstig, gut steuerbar)',
            tier: 'Bezahlt',
            neural: true,
            hint: 'Kein Gratis-Kontingent, dafür sehr günstig (ca. 1,3 Cent je Minute Audio) und die Erzähler-Persona lässt sich direkt als Sprechanweisung mitgeben.',
            keySetting: 'openAiKey',
            keyUrl: 'https://platform.openai.com/api-keys',
            voices: [
                { id: 'nova', label: 'Nova - weiblich, freundlich' },
                { id: 'shimmer', label: 'Shimmer - weiblich, sanft' },
                { id: 'coral', label: 'Coral - weiblich, lebhaft' },
                { id: 'fable', label: 'Fable - erzählend' },
                { id: 'alloy', label: 'Alloy - neutral' },
                { id: 'onyx', label: 'Onyx - männlich, tief' },
                { id: 'ballad', label: 'Ballad - männlich, ruhig' }
            ],
            defaultVoice: 'nova',
            supportsStyle: true,
            supportsRate: true,
            synthesize: openaiSynthesize
        }
    ],

    get(providerId) {
        return this.list.find(p => p.id === providerId) || this.list[0];
    },

    // Der aktuell eingestellte Anbieter - fällt auf die Gerätestimme
    // zurück, falls in den Einstellungen ein unbekannter Wert steht (z.B.
    // nach einem Backup-Import von einer neueren Version).
    current() {
        return this.get(app.settings.ttsProvider || 'device');
    },

    // Pro Anbieter wird eine eigene Stimme gemerkt - sonst stünde beim
    // Umschalten von Gemini auf ElevenLabs eine unbrauchbare Stimmen-ID drin.
    voiceFor(provider) {
        const stored = (app.settings.ttsVoices || {})[provider.id];
        const known = provider.voices.some(v => v.id === stored);
        return known || (stored && provider.supportsVoiceFetch) ? stored : provider.defaultVoice;
    },

    // NEU: Sprechanweisung aus der Erzähler-Persona. Nur Anbieter mit
    // supportsStyle nutzen sie - so klingt die Gute-Nacht-Fee auch
    // wirklich sanft und nicht wie ein Nachrichtensprecher.
    styleHintFor(personaId) {
        if (!app.settings.ttsPersonaStyle) return null;
        const persona = app.personas.find(p => p.id === personaId);
        if (!persona) return null;
        return `${persona.instruction} Lies den folgenden Kinderbuch-Text in genau dieser Rolle vor - warm, deutlich und nicht gehetzt. Sprich ausschließlich den Text selbst, nicht diese Anweisung:`;
    },

    // Eigene/geklonte Stimmen aus dem ElevenLabs-Konto nachladen, damit man
    // sie nicht per Hand aus der Web-Oberfläche abtippen muss.
    async fetchElevenVoices() {
        const key = app.settings.elevenLabsKey;
        if (!key) throw new TtsError('Kein ElevenLabs-API-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });

        let res;
        try {
            res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
        } catch (e) {
            throw wrapNetworkError(e, 'ElevenLabs');
        }
        if (!res.ok) throw await describeHttpError(res, 'ElevenLabs');

        const data = await res.json();
        return (data.voices || []).map(v => ({ id: v.voice_id, label: v.name }));
    }
});
