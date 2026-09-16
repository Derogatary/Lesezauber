import { app } from './core.js';
import { TtsError } from './ttsProviders.js';

// ============== Wiedergabe der KI-Stimmen (neuronale TTS) ==============
// Unterschied zur Gerätestimme: Hier kommt eine fertige Audiodatei vom
// Anbieter zurück, die ganz normal abgespielt wird. Dadurch gibt es kein
// "boundary"-Ereignis wie bei SpeechSynthesis - die Wort-Hervorhebung wird
// deshalb hier selbst getaktet (siehe _wordStartTimes).

// Sehr lange Texte (z.B. ein komplettes EPUB-Kapitel auf einer "Seite")
// würden die Anbieter-Limits sprengen und unnötig Kontingent verbrauchen.
// Darüber wird wieder die Gerätestimme genutzt.
const MAX_NEURAL_CHARS = 4000;

// Einfache, schnelle Prüfsumme (FNV-1a) für den Cache-Schlüssel. Muss
// nicht kryptografisch sicher sein - nur "gleicher Text = gleicher
// Schlüssel" zuverlässig erfüllen.
function hashText(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

Object.assign(app.ttsNeural, {
    _audio: null,
    _objectUrl: null,
    // Zähler statt Boolean: jede neue Sprechanforderung erhöht ihn. Eine
    // noch laufende alte Anfrage erkennt daran, dass sie überholt wurde,
    // und spielt nichts mehr ab.
    _token: 0,
    _rafId: null,
    // Nach einem endgültigen Fehler (falscher Key, Limit erreicht) bis zum
    // Neuladen der App nicht weiter versuchen - sonst läuft jede Seite
    // erneut in dieselbe Wartezeit.
    _disabledReason: null,

    isActive() {
        const provider = app.ttsProviders.current();
        return !!(provider.neural && provider.synthesize && !this._disabledReason);
    },

    // Einziges <audio>-Element für die gesamte App: iOS/Safari erlaubt das
    // Abspielen nur bei einem Element, das schon einmal per Fingertipp
    // gestartet wurde. Ein pro Seite neu erzeugtes Element würde beim
    // automatischen Weiterblättern stumm bleiben.
    _getAudioElement() {
        if (!this._audio) {
            this._audio = new Audio();
            this._audio.preload = 'auto';
        }
        return this._audio;
    },

    _cacheKey(text, provider, voice, rate, personaId) {
        const styleKey = (provider.supportsStyle && app.settings.ttsPersonaStyle) ? personaId : 'plain';
        const rateKey = provider.supportsRate ? String(rate) : 'x';
        return `${provider.id}|${voice}|${styleKey}|${rateKey}|${text.length}|${hashText(text)}`;
    },

    // Holt die Sprachaufnahme - erst aus dem Zwischenspeicher, sonst vom
    // Anbieter (und legt sie dann ab).
    async _getAudio(text, { provider, voice, rate, personaId }) {
        const key = this._cacheKey(text, provider, voice, rate, personaId);
        const useCache = app.settings.ttsCacheEnabled !== false;

        if (useCache) {
            const cached = await app.dbOps.getTtsAudio(key);
            if (cached && cached.blob) {
                return { blob: cached.blob, alignment: cached.alignment || null, fromCache: true };
            }
        }

        const styleHint = provider.supportsStyle ? app.ttsProviders.styleHintFor(personaId) : null;
        const result = await provider.synthesize(text, { voice, rate, styleHint });

        if (useCache) {
            await app.dbOps.saveTtsAudio({
                key,
                blob: result.blob,
                alignment: result.alignment || null,
                bytes: result.blob.size,
                created: Date.now()
            });
        }
        return { ...result, fromCache: false };
    },

    // Startpunkt (in Sekunden) je hervorgehobenem Wort.
    // - ElevenLabs liefert echte Zeitstempel pro Buchstabe -> exakt.
    // - Alle anderen: gleichmäßig über die Gesamtdauer verteilt, gewichtet
    //   nach der Zeichenposition im Text. Das ist eine Schätzung, reicht
    //   aber, damit das Kind der Hervorhebung folgen kann.
    _wordStartTimes(spans, duration, alignment, cleanText) {
        const starts = Array.from(spans).map(span => parseInt(span.dataset.start, 10) || 0);

        if (alignment && alignment.starts && alignment.characters
            && alignment.characters.length === cleanText.length) {
            return starts.map(charIndex => alignment.starts[Math.min(charIndex, alignment.starts.length - 1)] || 0);
        }

        const total = cleanText.length || 1;
        return starts.map(charIndex => duration * (charIndex / total));
    },

    _startHighlighting(containerId, alignment, cleanText, token) {
        const container = containerId ? document.getElementById(containerId) : null;
        if (!container) return;

        const spans = container.querySelectorAll('.speech-word');
        if (!spans.length) return;

        const audio = this._getAudioElement();
        const duration = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        if (!duration) return;

        const times = this._wordStartTimes(spans, duration, alignment, cleanText);
        let lastIndex = -1;

        const tick = () => {
            if (token !== this._token) return;

            let current = -1;
            for (let i = 0; i < times.length; i++) {
                if (times[i] <= audio.currentTime) current = i; else break;
            }

            if (current !== lastIndex && current >= 0) {
                lastIndex = current;
                spans.forEach(span => span.classList.remove('speech-highlight'));
                spans[current].classList.add('speech-highlight');
                spans[current].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }

            if (!audio.paused && !audio.ended) this._rafId = requestAnimationFrame(tick);
        };

        this._rafId = requestAnimationFrame(tick);
    },

    stop() {
        this._token++;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._audio) {
            this._audio.pause();
            this._audio.onended = null;
            this._audio.onerror = null;
            // src leeren, damit ein evtl. noch laufender Download abbricht
            this._audio.removeAttribute('src');
            this._audio.load();
        }
        if (this._objectUrl) {
            URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = null;
        }
    },

    // Bei endgültigen Fehlern (Key falsch, Limit erreicht, Anbieter vom
    // Browser aus nicht erreichbar) für den Rest der Sitzung abschalten und
    // mit der Gerätestimme weiterlesen - Hauptsache, es geht weiter.
    _handleFailure(error, text, onEnd, containerId) {
        console.error('KI-Stimme fehlgeschlagen:', error);

        if (error instanceof TtsError && error.fatal) {
            this._disabledReason = error.message;
            app.ui.toast(`${error.message} Es wird mit der Gerätestimme weitergelesen.`, '🔇');
        } else {
            app.ui.toast('KI-Stimme gerade nicht erreichbar - Gerätestimme springt ein.', '🔇');
        }

        app.tts.speakWithDevice(text, onEnd, containerId);
    },

    // Der eigentliche Sprechvorgang. "text" ist bereits emoji-bereinigt und
    // der Hervorhebungs-Container bereits gefüllt (siehe tts.js).
    async speak(text, onEnd, containerId) {
        const provider = app.ttsProviders.current();

        if (text.length > MAX_NEURAL_CHARS) {
            console.warn(`Text mit ${text.length} Zeichen zu lang für die KI-Stimme - Gerätestimme übernimmt.`);
            app.tts.speakWithDevice(text, onEnd, containerId);
            return;
        }

        const token = ++this._token;
        const voice = app.ttsProviders.voiceFor(provider);
        const rate = app.settings.speechRate || 0.9;
        const personaId = app.state.readingPersonaId || app.settings.persona;

        let audioData;
        try {
            audioData = await this._getAudio(text, { provider, voice, rate, personaId });
        } catch (e) {
            if (token !== this._token) return; // zwischenzeitlich gestoppt
            this._handleFailure(e, text, onEnd, containerId);
            return;
        }

        if (token !== this._token) return;

        const audio = this._getAudioElement();
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(audioData.blob);
        audio.src = this._objectUrl;
        // Anbieter ohne eigenen Geschwindigkeitsparameter (Gemini,
        // ElevenLabs) werden über die Abspielgeschwindigkeit geregelt; der
        // Browser hält die Tonhöhe dabei konstant.
        audio.playbackRate = provider.supportsRate ? 1 : rate;

        audio.onloadedmetadata = () => {
            if (token !== this._token) return;
            this._startHighlighting(containerId, audioData.alignment, text, token);
        };

        audio.onended = () => {
            if (token !== this._token) return;
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
            if (onEnd) onEnd();
        };

        audio.onerror = () => {
            if (token !== this._token) return;
            this._handleFailure(new Error('Audiodatei konnte nicht abgespielt werden.'), text, onEnd, containerId);
        };

        try {
            await audio.play();
        } catch (e) {
            if (token !== this._token) return;
            // Typischer Fall auf iOS: Abspielen ohne Fingertipp verboten.
            console.error('Wiedergabe nicht möglich:', e);
            app.ui.toast('Wiedergabe braucht einen Fingertipp - Gerätestimme springt ein.', '👆');
            app.tts.speakWithDevice(text, onEnd, containerId);
        }
    },

    // NEU: Text schon mal im Hintergrund erzeugen lassen (z.B. die nächste
    // Buchseite), damit beim Weiterblättern keine Wartezeit entsteht.
    // Fehler werden hier absichtlich verschluckt - es ist nur Vorarbeit.
    async warmUp(text) {
        if (!this.isActive() || !text) return;
        const clean = app.utils.stripEmojiForSpeech(text);
        if (!clean || clean.length > MAX_NEURAL_CHARS) return;
        if (app.settings.ttsCacheEnabled === false) return;

        try {
            await this._getAudio(clean, {
                provider: app.ttsProviders.current(),
                voice: app.ttsProviders.voiceFor(app.ttsProviders.current()),
                rate: app.settings.speechRate || 0.9,
                personaId: app.state.readingPersonaId || app.settings.persona
            });
        } catch (e) {
            console.warn('Vorbereiten der nächsten Seite übersprungen:', e.message);
        }
    },

    // Probe-Anhören aus den Einstellungen heraus. Meldet Erfolg/Fehler
    // direkt zurück, statt still auf die Gerätestimme umzuschalten - beim
    // Einrichten will man ja genau wissen, ob der Key funktioniert.
    async testVoice() {
        const provider = app.ttsProviders.current();
        if (!provider.neural || !provider.synthesize) {
            app.tts.speak('So klingt die Stimme deines Geräts.', null, null);
            return;
        }

        this._disabledReason = null;
        this.stop();
        const token = ++this._token;
        const satz = 'Es war einmal ein kleiner Drache, der konnte noch nicht fliegen.';
        app.ui.toast('Stimme wird erzeugt...', '⏳');

        try {
            const { blob } = await this._getAudio(satz, {
                provider,
                voice: app.ttsProviders.voiceFor(provider),
                rate: app.settings.speechRate || 0.9,
                personaId: app.settings.persona
            });
            if (token !== this._token) return;

            const audio = this._getAudioElement();
            if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = URL.createObjectURL(blob);
            audio.src = this._objectUrl;
            audio.playbackRate = provider.supportsRate ? 1 : (app.settings.speechRate || 0.9);
            await audio.play();
            app.ui.toast('Klappt! Stimme funktioniert.', '✅');
        } catch (e) {
            console.error('Stimmen-Test fehlgeschlagen:', e);
            app.ui.toast(e.message || 'Test fehlgeschlagen.', '⚠️');
        }
    }
});
