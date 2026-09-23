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

// NEU (Audio-Tags, Entscheidung Sept. 2026): eleven_v3 ist seit der
// allgemeinen Verfügbarkeit (März 2026) genauso teuer wie v2, versteht
// aber zusätzlich Audio-Tags mitten im Satz ([flüstert], [lacht], ...) -
// ersetzt v2 komplett, kein Parallelbetrieb. Weiterhin mehrsprachig,
// spricht also sauberes Deutsch.
const ELEVEN_MODEL = 'eleven_v3';

const OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';

// FIX (Nutzer-Screenshot aus dem Speechify-Dashboard, Stand Sept. 2026):
// simba-3.2 ist zwar das "Recommended"-Modell mit der geringsten Latenz,
// spricht aber NUR Englisch - für Deutsch (und Spanisch/Französisch/
// Italienisch/Portugiesisch) ist weiterhin simba-3.0 zuständig, geroutet
// über das "language"-Feld im Request. War vorher fälschlich auf 3.2
// gestellt, hätte auf Deutsch also gar nicht funktioniert bzw. wäre auf
// Englisch ausgesprochen worden.
const SPEECHIFY_MODEL = 'simba-3.0';
const SPEECHIFY_LANGUAGE = 'de-DE';
// NEU (KI-Stimme für die Birkenbihl-Zielsprache): laut derselben Modell-
// Aufteilung spricht simba-3.2 nur Englisch, simba-3.0 die übrigen
// europäischen Sprachen - Türkisch/Niederländisch kann Speechify gar nicht,
// siehe foreignLanguages am Anbieter-Eintrag unten.
const SPEECHIFY_ENGLISH_MODEL = 'simba-3.2';

// NEU (KI-Stimme für die Birkenbihl-Zielsprache): Sprechanweisung für fremd-
// sprachigen Text. Bewusst auf Englisch und OHNE Persona - der deutsche
// Persona-Stilhinweis ("Du bist ein lustiger Papa...") würde die Stimme
// sonst in Richtung deutscher Aussprache ziehen, und für ein lernendes Kind
// zählt hier nur klare, muttersprachliche Aussprache.
function foreignSpeechInstruction(language) {
    return `Read the following text aloud in its own language (${language}) with native pronunciation - clearly, calmly and a little slower than normal, for a child who is learning this language. Only speak the text itself, not this instruction:`;
}

// NEU: Tarif-Lock (siehe Entscheidung in docs/ROADMAP.md). Reihenfolge der
// Preisstufen, um beim Anbieter-/Modellwechsel zu erkennen, ob es teurer
// wird - nur dafür gedacht (keine echte Kostenberechnung).
const COST_TIER_ORDER = { free: 0, cheap: 1, expensive: 2 };

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

    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': app.settings.apiKey },
        body: JSON.stringify(body),
        signal
    });
}

async function geminiSynthesize(text, { voice, styleHint, language, signal }) {
    if (!app.settings.apiKey) {
        throw new TtsError('Kein Gemini-API-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });
    }

    // Gemini-TTS wird über den Prompt gesteuert: Ein vorangestellter
    // Sprechauftrag färbt die Stimme (z.B. "sanft, wie eine Gute-Nacht-Fee")
    // und wird selbst nicht mitgesprochen.
    // NEU (Birkenbihl-Zielsprache): mit "language" statt des deutschen
    // Vorlese-Auftrags eine neutrale, fremdsprachige Anweisung - sonst liest
    // Gemini englischen Text mit deutschem Einschlag vor.
    const prompt = language
        ? `${foreignSpeechInstruction(language)}\n\n${text}`
        : (styleHint ? `${styleHint}\n\n${text}` : `Lies den folgenden Text vor:\n\n${text}`);

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
async function googleCloudSynthesize(text, { voice, rate, language, signal }) {
    const key = app.settings.googleTtsKey;
    if (!key) {
        throw new TtsError('Kein Google-Cloud-TTS-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });
    }

    let voiceName = voice || 'de-DE-Chirp3-HD-Achernar';
    // NEU (Birkenbihl-Zielsprache): Google Cloud spricht nur die Sprache, die
    // im Stimmennamen steckt - eine deutsche Stimme würde englischen Text
    // "eindeutschen". Die Chirp-3-HD-Stimmen gibt es unter demselben Namen in
    // jeder Sprache ("en-GB-Chirp3-HD-Achernar"), also einfach den Sprachcode
    // austauschen; die Neural2-Stimmen heißen je Sprache anders, dort springt
    // die Standard-Chirp-Stimme der Zielsprache ein.
    if (language) {
        const chirpMatch = /Chirp3-HD-([A-Za-z]+)$/.exec(voiceName);
        voiceName = `${language}-Chirp3-HD-${chirpMatch ? chirpMatch[1] : 'Achernar'}`;
    }
    // Der Sprachcode steckt immer im Stimmennamen ("de-DE-Chirp3-HD-...").
    const languageCode = voiceName.split('-').slice(0, 2).join('-') || 'de-DE';

    let res;
    try {
        // HINWEIS (Release-Prüfung C2): hier bewusst NOCH der Key in der URL -
        // ob Google Cloud TTS den Header "x-goog-api-key" per CORS zulässt, ist
        // ohne echten Key nicht geprüft (Gemini-Aufrufe sind schon umgestellt).
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
    // nur geschätzt zu werden - das kann hier sonst nur noch Speechify,
    // deshalb bewusst dieser Endpunkt.
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
async function openaiSynthesize(text, { voice, rate, styleHint, language, signal }) {
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
                // NEU (Birkenbihl-Zielsprache): eigene, fremdsprachige Anweisung.
                instructions: language
                    ? foreignSpeechInstruction(language)
                    : (styleHint || 'Lies wie in einem Kinderbuch vor: warm, deutlich und nicht gehetzt.'),
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

// -------------------------------------------------------------- Speechify
// Speechify liefert Wort-Zeitstempel als "speech_marks" (Zeichen-Offset im
// Text + Millisekunden), nicht Zeichen-für-Zeichen wie ElevenLabs. Hier auf
// dasselbe { characters, starts }-Format umgerechnet, das
// ttsNeural._wordStartTimes() bereits für ElevenLabs erwartet - so bleibt
// die Hervorhebungs-Berechnung an einer einzigen Stelle.
//
// NEU (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen", SSML für
// Persona-Emotionen): optionaler dritter Parameter offsetMap - laut
// Speechify-Doku beziehen sich die Zeichen-Offsets bei SSML-Eingabe auf
// den GESENDETEN SSML-String (inkl. Tags und Escaping), nicht auf den
// ANGEZEIGTEN Text. Ohne Rückrechnung würde die zeichengenaue Wort-
// Hervorhebung - der Hauptgrund, Speechify statt eines günstigeren
// Anbieters zu nutzen - bei jeder Emotion-Persona unbemerkt auf die
// ungenaue Schätz-Methode zurückfallen (Längen-Check in
// ttsNeural._wordStartTimes() würde sonst fehlschlagen).
//
// FIX (Nutzer-Feedback: "Hervorhebung fing meist zu spät an, war zum
// Schluss jeder Seite aber wieder gleich"): vierter Parameter
// contentBounds - ein Wort-Zeitstempel, dessen "start" INNERHALB des
// SSML-Vorspanns (<speak><speechify:style...>) oder -Nachspanns
// (</speechify:style></speak>) landet, kann kein echtes gesprochenes Wort
// sein - diese Tags werden nicht mitgesprochen. Ohne diesen Filter wären
// solche (vermutlich durch die Tag-Verarbeitung entstandenen) Ausreißer
// über offsetMap alle auf Zeichen-Index 0 gefallen und hätten dort
// gegenseitig die echte Anfangszeit überschrieben - genau das Muster, das
// "am Seitenanfang hinterher, gegen Seitenende plötzlich wieder synchron"
// erklären würde. Chunks außerhalb der Grenzen werden jetzt übersprungen
// statt ihnen (fälschlich) Zeichen-Index 0 zuzuweisen.
function alignmentFromSpeechMarks(marks, text, offsetMap, contentBounds) {
    const chunks = marks && marks.chunks;
    if (!Array.isArray(chunks) || !chunks.length) return null;

    const startSecByCharIndex = new Map();
    for (const chunk of chunks) {
        if (chunk.type !== 'word' || typeof chunk.start !== 'number') continue;
        if (contentBounds && (chunk.start < contentBounds.start || chunk.start >= contentBounds.end)) continue;
        const charIndex = offsetMap ? offsetMap[chunk.start] : chunk.start;
        if (typeof charIndex === 'number') {
            startSecByCharIndex.set(charIndex, (chunk.start_time || 0) / 1000);
        }
    }
    if (!startSecByCharIndex.size) return null;

    const characters = Array.from(text);
    const starts = new Array(characters.length).fill(0);
    let current = 0;
    for (let i = 0; i < characters.length; i++) {
        if (startSecByCharIndex.has(i)) current = startSecByCharIndex.get(i);
        starts[i] = current;
    }
    return { characters, starts };
}

// NEU (SSML, Nutzerwunsch): Pflicht-Escaping laut SSML-Doku - unescapetes
// &/</> würde die XML als kaputt zurückweisen (HTTP 400, "Malformed XML"),
// " und ' kommen in Kinderbuchtext (wörtliche Rede) ebenfalls oft vor.
// Baut GLEICHZEITIG die Versatz-Tabelle: offsetMap[escapedIndex] =
// ursprünglicher Zeichen-Index - jedes escapete Zeichen (z.B. "&" -> 5
// Zeichen "&amp;") zeigt auf denselben Original-Index, damit ein
// Wort-Start irgendwo innerhalb der Entity trotzdem korrekt zurückfindet.
const SSML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
function escapeSsmlWithOffsets(text) {
    let escaped = '';
    const offsetMap = [];
    for (let i = 0; i < text.length; i++) {
        const replacement = SSML_ESCAPES[text[i]] || text[i];
        for (let j = 0; j < replacement.length; j++) offsetMap.push(i);
        escaped += replacement;
    }
    return { escaped, offsetMap };
}

// Baut das komplette SSML-Dokument plus die volle Versatz-Tabelle (Länge =
// SSML-String), die jede Position im gesendeten SSML auf die passende
// Position im ANGEZEIGTEN Text zurückführt. Die Positionen in den
// umschließenden Tags zeigen auf 0 - dort kann laut Speechify ohnehin nie
// ein Wortanfang liegen, die Tags selbst werden nicht mitgesprochen (siehe
// contentBounds/alignmentFromSpeechMarks).
//
// NEU (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen") - zwei
// UNABHÄNGIGE, verschachtelbare Ebenen statt nur der Emotion:
// - speechify:style emotion="..." (Persona-Gefühl, siehe emotionHintFor())
// - prosody rate="...%" (Vorlesegeschwindigkeit, siehe app.settings.speechRate)
// Beide können einzeln, zusammen oder gar nicht vorkommen - die Prozent-
// Länge der jeweils geöffneten Tags wird einfach aufsummiert, die restliche
// Versatz-Logik bleibt unverändert.
function buildSpeechifySsml(text, { emotion, ratePercent } = {}) {
    let openTags = '<speak>';
    let closeTags = '</speak>';
    if (emotion) {
        openTags += `<speechify:style emotion="${emotion}">`;
        closeTags = '</speechify:style>' + closeTags;
    }
    if (typeof ratePercent === 'number') {
        const sign = ratePercent >= 0 ? '+' : '';
        openTags += `<prosody rate="${sign}${ratePercent}%">`;
        closeTags = '</prosody>' + closeTags;
    }
    const { escaped, offsetMap } = escapeSsmlWithOffsets(text);
    const fullOffsetMap = new Array(openTags.length).fill(0).concat(offsetMap);
    return {
        ssml: openTags + escaped + closeTags,
        offsetMap: fullOffsetMap,
        contentBounds: { start: openTags.length, end: openTags.length + escaped.length }
    };
}

async function speechifySynthesize(text, { voice, signal, emotion, rate, language }) {
    const key = app.settings.speechifyKey;
    if (!key) {
        throw new TtsError('Kein Speechify-API-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });
    }

    // NEU (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen - bietet
    // Speechify nicht noch mehr Funktionen durch SSML?"): die bestehende
    // Vorlesegeschwindigkeit (app.settings.speechRate, Regler in den
    // Einstellungen) wurde bei Speechify bisher nur NACHTRÄGLICH über
    // audio.playbackRate im Browser umgesetzt (gröber, kann bei starker
    // Abweichung leicht "gepresst" klingen) - jetzt zusätzlich nativ über
    // <prosody rate="...%">, sobald echtes SSML ohnehin gebraucht wird oder
    // die Geschwindigkeit vom Normaltempo abweicht. 1.0 = 0% (Normaltempo),
    // z.B. 0.9 (Standard-Einstellung) -> "-10%". SSML-Doku erlaubt -50% bis
    // +9900% - der Einstellungen-Regler bewegt sich zwischen 0.5 und 1.5,
    // die untere Grenze liegt also genau auf der erlaubten Kante.
    const ratePercent = (typeof rate === 'number' && rate !== 1) ? Math.round((rate - 1) * 100) : null;

    let input = text;
    let offsetMap = null;
    let contentBounds = null;
    if (emotion || ratePercent !== null) {
        const built = buildSpeechifySsml(text, { emotion, ratePercent });
        input = built.ssml;
        offsetMap = built.offsetMap;
        contentBounds = built.contentBounds;
    }

    let res;
    try {
        res = await fetch('https://api.sws.speechify.com/v1/audio/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                input,
                voice_id: voice || 'beatrice_32',
                // NEU (Birkenbihl-Zielsprache): Modell und Sprachfeld folgen
                // der Zielsprache, Englisch läuft über das eigene Modell.
                model: (language && language.startsWith('en')) ? SPEECHIFY_ENGLISH_MODEL : SPEECHIFY_MODEL,
                audio_format: 'mp3',
                language: language || SPEECHIFY_LANGUAGE
            }),
            signal
        });
    } catch (e) {
        throw wrapNetworkError(e, 'Speechify');
    }

    if (!res.ok) throw await describeHttpError(res, 'Speechify');

    const data = await res.json();
    if (!data.audio_data) {
        throw new TtsError('Speechify hat keine Audiodaten zurückgeliefert.', { code: 'EMPTY' });
    }

    return {
        blob: new Blob([base64ToBytes(data.audio_data)], { type: 'audio/mpeg' }),
        alignment: alignmentFromSpeechMarks(data.speech_marks, text, offsetMap, contentBounds)
    };
}

Object.assign(app.ttsProviders, {
    list: [
        {
            id: 'device',
            label: 'Gerätestimme (kostenlos, offline)',
            tier: 'Gratis',
            costTier: 'free',
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
            costTier: 'free',
            neural: true,
            hint: 'Nutzt denselben Gemini-Key wie die Seitenanalyse - kein zusätzliches Konto nötig. Im kostenlosen Tarif gibt es allerdings nur wenige Anfragen pro Tag; mit eingeschaltetem Stimmen-Speicher reicht das für ein paar Seiten täglich.',
            keySetting: 'apiKey',
            keyUrl: 'https://aistudio.google.com/app/apikey',
            pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
            // NEU: alle 30 Gemini-Stimmen (vorher nur 8), alle sprechen
            // Deutsch. Die ersten 8 bleiben bewusst oben (bewährte Auswahl),
            // der Rest ist nach Googles eigener Stimmen-Tabelle ergänzt.
            voices: [
                { id: 'Kore', label: 'Kore - sachlich, klar' },
                { id: 'Aoede', label: 'Aoede - leicht, freundlich' },
                { id: 'Leda', label: 'Leda - jugendlich' },
                { id: 'Callirrhoe', label: 'Callirrhoe - entspannt' },
                { id: 'Puck', label: 'Puck - munter, verspielt' },
                { id: 'Charon', label: 'Charon - ruhig, tief' },
                { id: 'Enceladus', label: 'Enceladus - behaglich, hauchig' },
                { id: 'Sulafat', label: 'Sulafat - warm' },
                { id: 'Zephyr', label: 'Zephyr - hell, klar' },
                { id: 'Fenrir', label: 'Fenrir - lebhaft, aufgeregt' },
                { id: 'Orus', label: 'Orus - bestimmt' },
                { id: 'Autonoe', label: 'Autonoe - hell, freundlich' },
                { id: 'Iapetus', label: 'Iapetus - klar, deutlich' },
                { id: 'Umbriel', label: 'Umbriel - locker, gelassen' },
                { id: 'Algieba', label: 'Algieba - weich, geschmeidig' },
                { id: 'Despina', label: 'Despina - sanft, samtig' },
                { id: 'Erinome', label: 'Erinome - klar, präzise' },
                { id: 'Algenib', label: 'Algenib - rau, markant' },
                { id: 'Rasalgethi', label: 'Rasalgethi - sachlich, informativ' },
                { id: 'Laomedeia', label: 'Laomedeia - munter, schwungvoll' },
                { id: 'Achernar', label: 'Achernar - weich, leise' },
                { id: 'Alnilam', label: 'Alnilam - klar, bestimmt' },
                { id: 'Schedar', label: 'Schedar - gleichmäßig, ruhig' },
                { id: 'Gacrux', label: 'Gacrux - reif, erwachsen' },
                { id: 'Pulcherrima', label: 'Pulcherrima - energisch, direkt' },
                { id: 'Achird', label: 'Achird - freundlich, zugewandt' },
                { id: 'Zubenelgenubi', label: 'Zubenelgenubi - locker, alltagsnah' },
                { id: 'Vindemiatrix', label: 'Vindemiatrix - sanft, zart' },
                { id: 'Sadachbia', label: 'Sadachbia - lebendig, quirlig' },
                { id: 'Sadaltager', label: 'Sadaltager - kundig, sachkundig' }
            ],
            defaultVoice: 'Kore',
            supportsStyle: true,
            // NEU (Audio-Tags): Gemini kennt über 200 Inline-Tags mitten im
            // Satz ([whispers], [laughs], [excited], ...) - wird genutzt,
            // wenn eine Seite ein speechText hat (siehe js/tts.js).
            supportsTags: true,
            // NEU (KI-Stimme für die Birkenbihl-Zielsprache): welche
            // Fremdsprachen (Sprachcode-Anfang, z.B. 'en') der Anbieter
            // sauber aussprechen kann - '*' = alle. Fehlt das Feld oder
            // passt die Sprache nicht, liest weiterhin die Gerätestimme
            // (siehe app.ttsNeural.speakForeign()). Gemini, ElevenLabs und
            // OpenAI sind mehrsprachig und erkennen die Sprache am Text.
            foreignLanguages: '*',
            synthesize: geminiSynthesize
        },
        {
            id: 'googlecloud',
            label: 'Google Cloud Chirp 3 HD (1 Mio. Zeichen/Monat gratis)',
            tier: 'Bezahlt',
            costTier: 'cheap',
            neural: true,
            hint: 'Braucht ein Google-Cloud-Projekt mit hinterlegter Zahlungsart. Die ersten 1 Mio. Zeichen pro Monat sind frei (grob: mehrere tausend Buchseiten), danach ca. 30 US-Dollar je 1 Mio. Zeichen.',
            keySetting: 'googleTtsKey',
            keyUrl: 'https://console.cloud.google.com/apis/credentials',
            pricingUrl: 'https://cloud.google.com/text-to-speech/pricing',
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
            // NEU (Audio-Tags): Chirp 3 kennt nur Tempo-/Pausen-Tags über
            // ein eigenes "markup"-Feld, keine Emotions-Tags im normalen
            // Text - ein [flüstert] mitten im "text"-Feld würde buchstäblich
            // vorgelesen. speechText wird deshalb hier NICHT genutzt.
            supportsTags: false,
            // NEU (Birkenbihl-Zielsprache): über den Sprachcode im
            // Stimmennamen, siehe googleCloudSynthesize().
            foreignLanguages: '*',
            synthesize: googleCloudSynthesize
        },
        {
            id: 'elevenlabs',
            label: 'ElevenLabs (beste Vorlese-Qualität)',
            tier: 'Bezahlt',
            costTier: 'expensive',
            neural: true,
            hint: 'Klingt am lebendigsten und hält die Wort-Hervorhebung zeichengenau synchron (wie auch Speechify). Gratis-Konto: 10.000 Zeichen/Monat (ca. 10 Minuten, nur privat). Bezahlt ab ca. 5 US-Dollar/Monat, danach ca. 100 US-Dollar je 1 Mio. Zeichen - der mit Abstand teuerste Anbieter hier. Achtung: der Browser-Zugriff kann vom Anbieter gesperrt sein - der Test-Knopf zeigt es sofort.',
            keySetting: 'elevenLabsKey',
            keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
            pricingUrl: 'https://elevenlabs.io/pricing',
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
            // NEU (Audio-Tags): eleven_v3 (siehe ELEVEN_MODEL oben) versteht
            // Audio-Tags mitten im Satz, seit GA zum selben Preis wie v2.
            supportsTags: true,
            foreignLanguages: '*',
            synthesize: elevenSynthesize
        },
        {
            id: 'openai',
            label: 'OpenAI (günstig, gut steuerbar)',
            tier: 'Bezahlt',
            costTier: 'cheap',
            neural: true,
            hint: 'Kein Gratis-Kontingent, dafür sehr günstig (ca. 1,3 Cent je Minute Audio) und die Erzähler-Persona lässt sich direkt als Sprechanweisung mitgeben.',
            keySetting: 'openAiKey',
            keyUrl: 'https://platform.openai.com/api-keys',
            pricingUrl: 'https://openai.com/api/pricing/',
            // NEU: alle 13 aktuellen gpt-4o-mini-tts-Stimmen (vorher 7) - die
            // bewährten 7 bleiben oben, marin/cedar sind laut OpenAI die
            // neueren, besonders hochwertigen Stimmen.
            voices: [
                { id: 'nova', label: 'Nova - weiblich, freundlich' },
                { id: 'shimmer', label: 'Shimmer - weiblich, sanft' },
                { id: 'coral', label: 'Coral - weiblich, lebhaft' },
                { id: 'fable', label: 'Fable - erzählend' },
                { id: 'alloy', label: 'Alloy - neutral' },
                { id: 'onyx', label: 'Onyx - männlich, tief' },
                { id: 'ballad', label: 'Ballad - männlich, ruhig' },
                { id: 'ash', label: 'Ash - männlich, gelassen' },
                { id: 'echo', label: 'Echo - männlich, klar' },
                { id: 'sage', label: 'Sage - weiblich, weise, ruhig' },
                { id: 'verse', label: 'Verse - neutral, ausdrucksstark' },
                { id: 'marin', label: 'Marin - weiblich, hochwertig, klar' },
                { id: 'cedar', label: 'Cedar - männlich, hochwertig, warm' }
            ],
            defaultVoice: 'nova',
            supportsStyle: true,
            supportsRate: true,
            // NEU (Audio-Tags): OpenAI hat nur das globale "instructions"-Feld
            // für den GANZEN Text (siehe styleHintFor), keine Inline-Tags
            // mitten im Satz.
            supportsTags: false,
            foreignLanguages: '*',
            synthesize: openaiSynthesize
        },
        {
            id: 'speechify',
            label: 'Speechify (günstig, exakte Zeitstempel)',
            tier: 'Bezahlt',
            costTier: 'cheap',
            neural: true,
            // FIX (Nutzer-Screenshot, Stand Sept. 2026): Gratis-Kontingent war
            // veraltet eingetragen (50.000 Zeichen/Monat) - das aktuelle
            // Free-Konto zeigt 500.000 Zeichen Text-zu-Sprache ODER 60
            // Minuten Sprach-Agenten pro Monat (EIN gemeinsames Guthaben,
            // teilbar), danach pausiert es bis zum nächsten Monat statt
            // automatisch kostenpflichtig weiterzulaufen.
            hint: 'Ähnlich günstig wie OpenAI, hält die Wort-Hervorhebung aber zeichengenau synchron (wie ElevenLabs) - 10 US-Dollar je 1 Mio. Zeichen (simba-3.0, für Deutsch) statt ElevenLabs\' ca. 100 US-Dollar. Gratis-Konto: 500.000 Zeichen (oder 60 Minuten Sprach-Agenten, gemeinsames Guthaben) pro Monat. ⚠️ Die unten vorausgewählten Stimmen sprechen Deutsch mit englischem Akzent (englische Standardstimmen, keine deutschen) - auf "🔄 Stimmen aus meinem Konto laden" tippen, das lädt jetzt gezielt echte deutsche Stimmen nach.',
            keySetting: 'speechifyKey',
            keyUrl: 'https://console.speechify.ai/api-keys',
            pricingUrl: 'https://speechify.com/pricing-api/',
            // FIX (Nutzer-Feedback: "redet mit englischem Akzent"): diese 8
            // Stimmen sind laut Anbieter-Doku die bekannten simba-3.2-
            // Standardstimmen (die "_32"-Endung) - simba-3.2 ist rein
            // englisch, die Stimmen selbst sind also englische Muttersprache
            // und behalten ihren Akzent, auch wenn simba-3.0 sie zum
            // Deutschsprechen bringt. Bewusst NICHT durch geratene deutsche
            // Stimmen-IDs ersetzt (ein falscher Name würde die Synthese hart
            // scheitern lassen) - stattdessen liefert fetchSpeechifyVoices()
            // seit demselben Fund gezielt nach "locale=de-DE" gefilterte,
            // wirklich deutsche Stimmen über den Nachlade-Knopf. Diese Liste
            // bleibt nur der Rückfall, falls (noch) kein Key hinterlegt ist.
            voices: [
                { id: 'beatrice_32', label: 'Beatrice - weiblich (englischer Akzent)' },
                { id: 'harper_32', label: 'Harper - weiblich (englischer Akzent)' },
                { id: 'imogen_32', label: 'Imogen - weiblich (englischer Akzent)' },
                { id: 'dominic_32', label: 'Dominic - männlich (englischer Akzent)' },
                { id: 'edmund_32', label: 'Edmund - männlich (englischer Akzent)' },
                { id: 'geffen_32', label: 'Geffen - männlich (englischer Akzent)' },
                { id: 'hugh_32', label: 'Hugh - männlich (englischer Akzent)' },
                { id: 'wyatt_32', label: 'Wyatt - männlich (englischer Akzent)' }
            ],
            defaultVoice: 'beatrice_32',
            supportsStyle: false,
            // NEU (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen - bietet
            // Speechify nicht noch mehr Funktionen durch SSML?"): die
            // Vorlesegeschwindigkeit lief bisher NUR über audio.playbackRate im
            // Browser (Rückfall-Weg für Anbieter ohne eigene Geschwindigkeits-
            // Steuerung, siehe app.ttsNeural) - jetzt nativ über SSML
            // <prosody rate="...%"> (speechifySynthesize()), klingt bei
            // stärkerer Abweichung vom Normaltempo natürlicher. supportsRate:
            // true schaltet den Browser-Rückfall ab (sonst würde doppelt
            // verlangsamt/beschleunigt) UND sorgt dafür, dass der Zwischen-
            // speicher-Schlüssel nach Geschwindigkeit unterscheidet.
            supportsRate: true,
            // NEU (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen"):
            // eigene Emotion-Markierung statt Freitext-Stilhinweis (den
            // versteht Speechify nicht) - siehe emotionHintFor() unten und
            // speechifyEmotion in js/config.js. Bewusst ein ZWEITES Feld statt
            // supportsStyle umzuwidmen: Gemini/OpenAI bekommen einen freien
            // Satz als Sprechanweisung, Speechify nur eine von 13 festen
            // Emotionen über SSML - unterschiedliche Mechanismen, die sich
            // nicht sauber in ein Feld pressen lassen.
            supportsEmotionTag: true,
            // NEU (Zusammenführung): Speechify kam mit dem Anbieter-Paket dazu,
            // die Audio-Tags entstanden parallel auf einem Zweig ohne diesen
            // Anbieter - deshalb fehlte das Feld hier ganz. Bewusst auf false:
            // ob Speechify Sprech-Anweisungen in eckigen Klammern versteht, ist
            // nicht geprüft, und ein Anbieter ohne Tag-Unterstützung bekommt
            // einfach den normalen Text. Wer es testen will, setzt es auf true.
            supportsTags: false,
            supportsVoiceFetch: true,
            // NEU (Nutzerwunsch: "Passe die Calls an die RPM an"): laut
            // eigenem Speechify-Dashboard (Free-Tarif, Nutzer-Screenshot)
            // "TTS rate limit: 1 req/s", "Concurrent TTS requests: 1" - das
            // ist VIEL schneller als der 9-Sekunden-Standard, den die
            // Hintergrund-Vorbereitung für Gemini/Mistral (Tages-
            // Anfragezahl als Engpass) nutzt. js/backgroundPregen.js liest
            // dieses Feld für die eigene Audio-Schleife; 1200ms statt exakt
            // 1000ms lässt etwas Sicherheitsabstand zum dokumentierten
            // Limit. Andere Anbieter unten haben (noch) keinen bestätigten
            // Wert - fallen auf denselben vorsichtigen 9-Sekunden-Standard
            // zurück.
            bgPregenIntervalMs: 1200,
            // NEU (Nutzerwunsch, zweiter Nutzer-Screenshot bestätigt "Concurrent
            // requests: 1"): manuelles Vorlesen und Hintergrund-Vorbereitung
            // laufen unabhängig voneinander und könnten sonst genau
            // gleichzeitig synthetisieren - app.ttsNeural._getAudio() reiht
            // echte Synthese-Aufrufe pro Anbieter-ID hintereinander, sobald
            // dieses Feld gesetzt ist (siehe withProviderLock() dort).
            maxConcurrentRequests: 1,
            // NEU (Birkenbihl-Zielsprache): nur die Sprachen, die die
            // Speechify-Modelle laut Dashboard sprechen - Türkisch und
            // Niederländisch bleiben bei der Gerätestimme.
            foreignLanguages: ['en', 'fr', 'es', 'it', 'pt'],
            synthesize: speechifySynthesize
        }
    ],

    // NEU (KI-Stimme für die Birkenbihl-Zielsprache): kann dieser Anbieter
    // Text in der Sprache "speechLang" (BCP-47, z.B. "en-GB") sprechen?
    supportsForeignLanguage(provider, speechLang) {
        const langs = provider && provider.foreignLanguages;
        if (!langs || !speechLang) return false;
        if (langs === '*') return true;
        return langs.includes(speechLang.split('-')[0].toLowerCase());
    },

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
        // NEU: bevorzugt die eigene Sprech-Anweisung der Persona (ttsStyle
        // in config.js). "Du bist ein lustiger Papa" beschreibt, wie die KI
        // den Text SCHREIBT - fürs Sprechen braucht es eine Anweisung, wie
        // es KLINGEN soll. Fehlt sie, dient die Schreib-Anweisung als
        // Rückfall, damit ältere/eigene Personas weiter funktionieren.
        const style = persona.ttsStyle || persona.instruction;
        return `${style} Lies den folgenden Kinderbuch-Text in genau dieser Art vor - warm, deutlich und nicht gehetzt. Sprich ausschließlich den Text selbst, nicht diese Anweisung:`;
    },

    // NEU (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen"): Gegenstück
    // zu styleHintFor() oben, aber für Anbieter mit supportsEmotionTag
    // (aktuell nur Speechify) - liefert eine der 13 festen Speechify-
    // Emotionen aus der Persona (speechifyEmotion in js/config.js) statt
    // eines Freitext-Satzes, den Speechify nicht verstehen würde. Dieselbe
    // Einstellung "Stimme an Erzähler-Persona anpassen" schaltet beides ab -
    // EIN Schalter für "soll die Persona die Stimme färben", nicht zwei.
    emotionHintFor(personaId) {
        if (!app.settings.ttsPersonaStyle) return null;
        const persona = app.personas.find(p => p.id === personaId);
        return (persona && persona.speechifyEmotion) || null;
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
    },

    // NEU: eigene/geklonte Stimmen aus dem Speechify-Konto nachladen, analog
    // zu fetchElevenVoices() oben.
    // FIX (Nutzer-Feedback: die 8 fest hinterlegten Standardstimmen oben
    // sprechen Deutsch zwar über simba-3.0, aber mit hörbarem englischen
    // Akzent - die "_32"-Namensendung deutet darauf hin, dass diese Stimmen
    // eigentlich fürs englische simba-3.2 gedacht sind, nicht für Deutsch
    // trainiert wurden). Laut Speechify-API-Doku (Sept. 2026) akzeptiert
    // GET /v1/voices jetzt einen "locale"-Filter - hier fest auf "de-DE"
    // gesetzt, damit dieser Knopf nur noch WIRKLICH deutsche Stimmen aus dem
    // riesigen (>1000 Stimmen, 36 Sprachen) Gesamtkatalog liefert, statt der
    // ungefilterten Liste. locale/gender kommen mit in die Beschriftung,
    // damit in der Auswahl sofort erkennbar ist, was man bekommt.
    async fetchSpeechifyVoices() {
        const key = app.settings.speechifyKey;
        if (!key) throw new TtsError('Kein Speechify-API-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });

        let res;
        try {
            res = await fetch('https://api.sws.speechify.com/v1/voices?limit=200&locale=de-DE', {
                headers: { 'Authorization': `Bearer ${key}` }
            });
        } catch (e) {
            throw wrapNetworkError(e, 'Speechify');
        }
        if (!res.ok) throw await describeHttpError(res, 'Speechify');

        const data = await res.json();
        const voices = data.voices || data || [];
        return voices.map(v => {
            const name = v.display_name || v.name || v.id;
            const extra = [v.gender, v.locale].filter(Boolean).join(', ');
            return { id: v.id || v.voice_id, label: extra ? `${name} (${extra})` : name };
        });
    },

    // NEU: Tarif-Lock (siehe CLAUDE.md/ROADMAP.md "Tarif-Lock"). Prüft, ob
    // ein Wechsel von einem Anbieter zum anderen in eine teurere Preisstufe
    // führt - schützt nur vor Versehen, nicht vor Absicht (kein Passwort,
    // keine Sperre), deshalb reicht ein einfacher Bestätigungsdialog.
    isCostUpgrade(fromProvider, toProvider) {
        const fromRank = COST_TIER_ORDER[fromProvider && fromProvider.costTier] ?? 0;
        const toRank = COST_TIER_ORDER[toProvider && toProvider.costTier] ?? 0;
        return toRank > fromRank;
    }
});
