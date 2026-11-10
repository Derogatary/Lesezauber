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

const GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';
const GEMINI_TTS_FALLBACK_MODEL = 'gemini-3.8-flash-lite-tts';

// NEU (Audio-Tags, Entscheidung Sept. 2026): eleven_v3 ist seit der
// allgemeinen Verfügbarkeit (März 2026) genauso teuer wie v2, versteht
// aber zusätzlich Audio-Tags mitten im Satz ([flüstert], [lacht], ...) -
// ersetzt v2 komplett, kein Parallelbetrieb. Weiterhin mehrsprachig,
// spricht also sauberes Deutsch.
const ELEVEN_MODEL = 'eleven_v3';

const SPEECHIFY_MODEL = 'simba-3.5';
const SPEECHIFY_LANGUAGE = 'de-DE';

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
async function geminiSynthesize(text, { voice, styleHint, language, signal }) {
    const key = app.settings.apiKey;
    if (!key) {
        throw new TtsError('Kein Gemini-API-Key hinterlegt.', { fatal: true, code: 'NO_KEY' });
    }
    const style = language
        ? `Clear native pronunciation in ${language}, at a calm pace for a child learning the language.`
        : styleHint;
    const content = { type: 'text', text };
    if (style) content.annotations = [{ type: 'speech_metadata', style }];
    const timeout = AbortSignal.timeout(120000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

    async function request(model) {
        return fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                model,
                store: false,
                input: [{ type: 'user_input', content: [content] }],
                response_format: { type: 'audio', mime_type: 'audio/wav' },
                generation_config: { speech_config: [{ voice: voice || 'Kore' }] }
            }),
            signal: requestSignal
        });
    }

    let res;
    try {
        res = await request(GEMINI_TTS_MODEL);
        if (res.status === 404) {
            res = await request(GEMINI_TTS_FALLBACK_MODEL);
        }
    } catch (e) {
        throw wrapNetworkError(e, 'Gemini');
    }
    if (!res.ok) throw await describeHttpError(res, 'Gemini');

    const data = await res.json();
    const audio = (data.steps || []).flatMap(step => step.content || [])
        .filter(part => part.type === 'audio' && part.data).at(-1);
    if (!audio) throw new TtsError('Gemini hat keine Audiodaten zurückgeliefert.', { code: 'EMPTY' });

    const bytes = base64ToBytes(audio.data);
    const mime = audio.mime_type || 'audio/wav';
    const blob = mime.startsWith('audio/l16')
        ? pcmToWavBlob(bytes, audio.sample_rate || sampleRateFromMime(mime))
        : new Blob([bytes], { type: mime });
    return { blob, alignment: null };
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
// NEU (Nutzer-Feedback "Hervorhebung bei Speechify noch nicht ganz
// richtig"): Speechify liefert pro Wort auch das gesprochene Wort selbst
// ("value"). Statt nur über Zeichen-Positionen im SSML zuzuordnen (hängt
// davon ab, wie Speechify Tags/Entities mitzählt - eine kleine Abweichung
// verschiebt die Hervorhebung um ganze Wörter), werden die Wörter jetzt der
// Reihe nach mit den Wörtern des Textes abgeglichen. Reicht das nicht
// (zu wenige Treffer), greift die bisherige Positions-Zuordnung.
function flattenSpeechMarkWords(node, out = []) {
    if (Array.isArray(node)) {
        node.forEach(mark => flattenSpeechMarkWords(mark, out));
        return out;
    }
    if (!node || typeof node !== 'object') return out;
    if (node.type === 'word' && typeof node.start_time === 'number') out.push(node);
    if (Array.isArray(node.chunks)) node.chunks.forEach(c => flattenSpeechMarkWords(c, out));
    return out;
}

const normWord = (w) => String(w || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function alignmentBySpeechMarkValues(marks, text) {
    const words = flattenSpeechMarkWords(marks).filter(w => normWord(w.value));
    if (!words.length) return null;
    // Wörter des Textes wie bei der Hervorhebung (Trennung an Leerraum)
    const tokens = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text))) {
        const n = normWord(m[0]);
        if (n) tokens.push({ start: m.index, n });
    }
    const startSecByCharIndex = new Map();
    let cursor = 0;
    let hits = 0;
    for (const w of words) {
        const v = normWord(w.value);
        // höchstens 4 Wörter vorausschauen (übersprungene/zusammengezogene Wörter)
        for (let k = cursor; k < Math.min(tokens.length, cursor + 5); k++) {
            const t = tokens[k].n;
            if (t === v || (v.length >= 3 && (t.startsWith(v) || v.startsWith(t)))) {
                if (!startSecByCharIndex.has(tokens[k].start)) startSecByCharIndex.set(tokens[k].start, w.start_time / 1000);
                cursor = k + 1;
                hits++;
                break;
            }
        }
    }
    if (hits < Math.max(1, Math.ceil(words.length * 0.6))) return null;
    const characters = Array.from(text);
    const starts = new Array(characters.length).fill(0);
    let current = 0;
    for (let i = 0; i < characters.length; i++) {
        if (startSecByCharIndex.has(i)) current = startSecByCharIndex.get(i);
        starts[i] = current;
    }
    return { characters, starts };
}

function alignmentFromSpeechMarks(marks, text, offsetMap, contentBounds) {
    const byValue = alignmentBySpeechMarkValues(marks, text);
    if (byValue) return byValue;

    const chunks = flattenSpeechMarkWords(marks);
    if (!chunks.length) return null;

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
function buildSpeechifySsml(text, { ratePercent } = {}) {
    let openTags = '<speak>';
    let closeTags = '</speak>';
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

async function speechifySynthesize(text, { voice, signal, rate, language }) {
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
    if (ratePercent !== null) {
        const built = buildSpeechifySsml(text, { ratePercent });
        input = built.ssml;
        offsetMap = built.offsetMap;
        contentBounds = built.contentBounds;
    }

    let res;
    try {
        res = await fetch('https://api.speechify.ai/v1/audio/speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify({
                input,
                voice_id: voice || 'beatrice_32',
                model: SPEECHIFY_MODEL,
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
            // Die gespeicherten eckigen Tags entsprechen nicht der Syntax von 3.8 TTS.
            supportsTags: false,
            // NEU (KI-Stimme für die Birkenbihl-Zielsprache): welche
            // Fremdsprachen (Sprachcode-Anfang, z.B. 'en') der Anbieter
            // sauber aussprechen kann - '*' = alle. Fehlt das Feld oder
            // passt die Sprache nicht, liest weiterhin die Gerätestimme
            // (siehe app.ttsNeural.speakForeign()). Gemini und ElevenLabs sind mehrsprachig und erkennen die Sprache am Text.
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
            id: 'speechify',
            label: 'Speechify (günstig, exakte Zeitstempel)',
            tier: 'Bezahlt',
            costTier: 'cheap',
            neural: true,
            hint: 'Wortgenaue Hervorhebung mit Zeitstempeln. Der Gratis-Tarif braucht keine Kreditkarte: mit Simba 3.5 sind bis 21. November 2026 monatlich 500.000 Zeichen enthalten, danach rund 333.000. Ist das Guthaben leer, pausiert der Gratis-Tarif. Für Deutsch bei Bedarf Stimmen aus dem Konto nachladen.',
            keySetting: 'speechifyKey',
            keyUrl: 'https://platform.speechify.ai/api-keys',
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
            // Simba 3.5 ignoriert Emotion-Tags.
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
            // Hintergrund-Vorbereitung für Gemini (Tages-
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
            // Birkenbihl-Zielsprachen mit Unterstützung in Simba 3.5.
            foreignLanguages: ['en', 'fr', 'es', 'it', 'pt', 'nl', 'tr'],
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

        const voices = new Map();
        const tokens = new Set();
        let pageToken;
        do {
            const url = new URL('https://api.elevenlabs.io/v2/voices');
            url.searchParams.set('page_size', '100');
            url.searchParams.set('include_total_count', 'false');
            if (pageToken) url.searchParams.set('next_page_token', pageToken);
            let res;
            try {
                res = await fetch(url, {
                    headers: { 'xi-api-key': key },
                    signal: AbortSignal.timeout(15000)
                });
            } catch (e) {
                throw wrapNetworkError(e, 'ElevenLabs');
            }
            if (!res.ok) throw await describeHttpError(res, 'ElevenLabs');

            const data = await res.json();
            for (const voice of data.voices || []) {
                if (voice.voice_id) voices.set(voice.voice_id, { id: voice.voice_id, label: voice.name || voice.voice_id });
            }
            if (!data.has_more) break;
            pageToken = data.next_page_token;
            if (!pageToken || tokens.has(pageToken)) {
                throw new TtsError('ElevenLabs hat die Stimmenliste unvollständig geliefert.');
            }
            tokens.add(pageToken);
        } while (pageToken);
        return [...voices.values()];
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
            res = await fetch('https://api.speechify.ai/v1/voices?locale=de-DE', {
                headers: { 'Authorization': `Bearer ${key}` }
            });
        } catch (e) {
            throw wrapNetworkError(e, 'Speechify');
        }
        if (!res.ok) throw await describeHttpError(res, 'Speechify');

        const data = await res.json();
        const voices = data.voices || data || [];
        return voices.filter(v => v.id || v.voice_id).map(v => {
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
