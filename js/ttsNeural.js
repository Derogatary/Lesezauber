import { app } from './core.js';
import { TtsError } from './ttsProviders.js';

// ============== Wiedergabe der KI-Stimmen (neuronale TTS) ==============
// Unterschied zur Gerätestimme: Hier kommt eine fertige Audiodatei vom
// Anbieter zurück, die ganz normal abgespielt wird. Dadurch gibt es kein
// "boundary"-Ereignis wie bei SpeechSynthesis - die Wort-Hervorhebung wird
// deshalb hier selbst getaktet (siehe _wordStartTimes).

// Sehr lange Texte (z.B. ein komplettes EPUB-Kapitel auf einer "Seite")
// würden die Anbieter-Limits sprengen und unnötig Kontingent verbrauchen.
// Darüber wird ab MAX_NEURAL_CHARS gestückelt (siehe _speakChunked) statt
// direkt auf die Gerätestimme umzuschalten - Grenze pro Einzel-Aufruf.
const MAX_NEURAL_CHARS = 4000;

// NEU (Textsegmentierung, siehe docs/ROADMAP.md "Lange Texte stückeln"):
// Zielgröße je Stück beim Zerlegen - an Satzenden getrennt, siehe
// app.utils.splitTextIntoChunks(). Kleiner als MAX_NEURAL_CHARS, damit ein
// einzelnes Stück nie an derselben Grenze scheitert.
const CHUNK_TARGET_CHARS = 800;

// Darüber lohnt sich das Stückeln nicht mehr (zu viele Einzel-Aufrufe, zu
// viel Kontingent für eine einzelne Seite) - dann bleibt es beim bisherigen
// Rückfall auf die Gerätestimme.
const MAX_CHUNKED_CHARS = 20000;

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

// NEU (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen", laut eigenem
// Dashboard "Concurrent requests: 1"): manche Anbieter erlauben zu jedem
// Zeitpunkt nur EINE gleichzeitige Anfrage. Ein manueller Vorlese-Tipp
// genau in dem Moment, in dem die Hintergrund-Vorbereitung (js/
// backgroundPregen.js) gerade synthetisiert, würde das sonst verletzen -
// beide laufen unabhängig voneinander und wissen nichts voneinander. Diese
// kleine Warteschlange pro Anbieter-ID ist die EINE Stelle, an der sich
// echte Synthese-Aufrufe (Cache-Treffer laufen nie hier durch) zwangsläufig
// treffen, und reiht sie einfach hintereinander statt sie gleichzeitig
// loszuschicken. Nur aktiv, wenn ein Anbieter maxConcurrentRequests setzt
// (js/ttsProviders.js) - für alle anderen ein reiner Durchreicher.
const _providerLocks = {};
function withProviderLock(providerId, maxConcurrent, fn) {
    if (!maxConcurrent) return fn();
    const previous = _providerLocks[providerId] || Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    _providerLocks[providerId] = next.catch(() => {});
    return next;
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

    // FIX (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen"): styleKey
    // prüfte bisher nur supportsStyle - Speechify färbt die Persona aber
    // über eine eigene Emotion-Markierung (supportsEmotionTag,
    // emotionHintFor()), nicht über den Gemini/OpenAI-Stilhinweis. Ohne
    // diese Ergänzung hätten zwei Personas mit unterschiedlicher Emotion
    // denselben Cache-Schlüssel bekommen und sich gegenseitig die falsche
    // (Emotion der zuerst gecachten Persona) Aufnahme untergeschoben.
    // NEU (Birkenbihl-Zielsprache): optionales "language" - fremdsprachige
    // Aufnahmen laufen ohne Persona-Färbung (styleKey 'plain') und bekommen
    // die Sprache als eigenes Schlüssel-Stück, damit sie sich nie mit einer
    // deutschen Aufnahme desselben Textes vermischen. Ohne "language" bleibt
    // der Schlüssel exakt wie bisher - vorhandene Cache-Einträge gelten weiter.
    _cacheKey(text, provider, voice, rate, personaId, language) {
        const styleKey = (!language && (provider.supportsStyle || provider.supportsEmotionTag) && app.settings.ttsPersonaStyle) ? personaId : 'plain';
        const rateKey = provider.supportsRate ? String(rate) : 'x';
        const langKey = language ? `|lang:${language}` : '';
        return `${provider.id}|${voice}|${styleKey}|${rateKey}${langKey}|${text.length}|${hashText(text)}`;
    },

    // NEU: Länge einer Audiodatei bestimmen, ohne sie abzuspielen. Für den
    // Video-Export unverzichtbar (wie lange steht diese Seite im Bild?),
    // beim normalen Vorlesen dagegen unnötig - deshalb nur auf Anforderung.
    _measureDuration(blob) {
        return new Promise(resolve => {
            const url = URL.createObjectURL(blob);
            const probe = new Audio();
            const finish = (value) => {
                URL.revokeObjectURL(url);
                resolve(isFinite(value) && value > 0 ? value : 0);
            };
            probe.onloadedmetadata = () => finish(probe.duration);
            probe.onerror = () => {
                console.error('Länge der Sprachaufnahme konnte nicht ermittelt werden.');
                finish(0);
            };
            probe.src = url;
        });
    },

    // Holt die Sprachaufnahme - erst aus dem Zwischenspeicher, sonst vom
    // Anbieter (und legt sie dann ab).
    // NEU (Ton in der Film-Vorschau): cacheOnly=true erlaubt AUSDRÜCKLICH
    // keinen neuen Synthese-Aufruf - ein Cache-Fehltreffer liefert dann
    // einfach null zurück, statt Kontingent zu verbrauchen. Für die
    // Vorschau darf das bloße Öffnen nichts kosten (siehe
    // docs/KONZEPT-Video.md, "Noch offen").
    async _getAudio(text, { provider, voice, rate, personaId, language = null, needDuration = false, cacheOnly = false }) {
        const key = this._cacheKey(text, provider, voice, rate, personaId, language);
        const useCache = app.settings.ttsCacheEnabled !== false;

        if (useCache) {
            const cached = await app.dbOps.getTtsAudio(key);
            if (cached && cached.blob) {
                let durationSec = cached.durationSec || 0;
                // Ältere Einträge (vor dem Video-Export) kennen ihre Länge
                // noch nicht - dann einmalig nachmessen und ergänzen.
                if (needDuration && !durationSec) {
                    durationSec = await this._measureDuration(cached.blob);
                    await app.dbOps.saveTtsAudio({ ...cached, durationSec });
                }
                return {
                    blob: cached.blob,
                    alignment: cached.alignment || null,
                    durationSec,
                    fromCache: true
                };
            }
        }

        if (cacheOnly) return null;

        // NEU (Birkenbihl-Zielsprache): fremdsprachiger Text bekommt keinen
        // deutschen Persona-Stil und keine Emotion - siehe _cacheKey().
        const styleHint = (!language && provider.supportsStyle) ? app.ttsProviders.styleHintFor(personaId) : null;
        // NEU (Nutzerwunsch: "vollen Umfang von Speechify ausnutzen"):
        // eigene Emotion-Markierung statt Freitext-Stilhinweis - siehe
        // app.ttsProviders.emotionHintFor() und den Kommentar an
        // supportsEmotionTag in js/ttsProviders.js.
        const emotion = (!language && provider.supportsEmotionTag) ? app.ttsProviders.emotionHintFor(personaId) : null;
        const result = await withProviderLock(provider.id, provider.maxConcurrentRequests, () =>
            provider.synthesize(text, language ? { voice, rate, language } : { voice, rate, styleHint, emotion })
        );
        // NEU: Kosten-/Verbrauchsanzeige - zaehlt nur hier, NACH einem
        // Cache-Fehlschlag, weil erst ab hier wirklich synthetisiert (und
        // damit bezahlt) wird. Ein Cache-Treffer weiter oben kostet nichts.
        app.costMeter.trackTts(provider.id, text.length);
        const durationSec = needDuration ? await this._measureDuration(result.blob) : 0;

        if (useCache) {
            await app.dbOps.saveTtsAudio({
                key,
                blob: result.blob,
                alignment: result.alignment || null,
                // NEU: MIME-Typ und Länge mitspeichern - der Video-Export
                // braucht beides, ohne die Datei erneut zu erzeugen.
                mime: result.blob.type,
                durationSec,
                bytes: result.blob.size,
                created: Date.now()
            });
        }
        return { ...result, durationSec, fromCache: false };
    },

    // Startpunkt (in Sekunden) je hervorgehobenem Wort.
    // - ElevenLabs liefert echte Zeitstempel pro Buchstabe -> exakt.
    // - Alle anderen: gleichmäßig über die Gesamtdauer verteilt, gewichtet
    //   nach der Zeichenposition im Text. Das ist eine Schätzung, reicht
    //   aber, damit das Kind der Hervorhebung folgen kann.
    // FIX: nimmt jetzt reine Zeichenpositionen statt DOM-Elemente entgegen -
    // so nutzen Reader-Hervorhebung und der geplante Video-Export
    // (Untertitel) exakt dieselbe Berechnung.
    _wordStartTimes(charStarts, duration, alignment, cleanText) {
        if (alignment && alignment.starts && alignment.characters
            && alignment.characters.length === cleanText.length) {
            return charStarts.map(charIndex => alignment.starts[Math.min(charIndex, alignment.starts.length - 1)] || 0);
        }

        const total = cleanText.length || 1;
        return charStarts.map(charIndex => duration * (charIndex / total));
    },

    _startHighlighting(containerId, alignment, cleanText, token) {
        const container = containerId ? document.getElementById(containerId) : null;
        if (!container) return;

        const spans = container.querySelectorAll('.speech-word');
        if (!spans.length) return;

        const audio = this._getAudioElement();
        const duration = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        if (!duration) return;

        const charStarts = Array.from(spans).map(span => parseInt(span.dataset.start, 10) || 0);
        const times = this._wordStartTimes(charStarts, duration, alignment, cleanText);
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
    // NEU (Audio-Tags): optionales taggedText - die um Sprech-Anweisungen
    // angereicherte Fassung von "text" (variant.speechText), die NUR beim
    // Anbieter tatsächlich zur Synthese geschickt wird, wenn er
    // supportsTags hat. Die Hervorhebung bleibt IMMER auf "text" (ohne
    // Tags) - eckige Klammern zählen nicht als eigene Wörter.
    async speak(text, onEnd, containerId, taggedText) {
        const provider = app.ttsProviders.current();
        // FIX (Zusammenführung Welle 0 + Audio-Tags): "text" kommt schon
        // aufbereitet aus app.tts._prepare(), "taggedText" dagegen roh aus
        // variant.speechText. Ohne diese Zeile liefe die getaggte Fassung als
        // einzige OHNE prepareTextForSpeech() in die Synthese - ausgerechnet
        // bei den Anbietern mit Emotionen wären "z.B." und "Kinder-\nwagen"
        // dann wieder ungeglättet. Die Klammer-Tags überstehen die Aufbereitung
        // unverändert (nachgeprüft), sie fasst nur Leerräume und Abkürzungen an.
        const speakText = (taggedText && provider.supportsTags)
            ? app.utils.stripEmojiForSpeech(app.utils.prepareTextForSpeech(taggedText))
            : text;

        if (speakText.length > MAX_NEURAL_CHARS) {
            // NEU: getaggte Texte (Audio-Tags) werden NICHT gestückelt - eine
            // Emotions-Anweisung bezieht sich auf den ganzen Textfluss, ein
            // Schnitt mitten drin würde sie durcheinanderbringen. Ebenso ein
            // Rückfall bei absurd langen Texten (siehe MAX_CHUNKED_CHARS).
            const isTagged = taggedText && provider.supportsTags;
            if (isTagged || speakText.length > MAX_CHUNKED_CHARS) {
                console.warn(`Text mit ${speakText.length} Zeichen zu lang für die KI-Stimme - Gerätestimme übernimmt.`);
                app.tts.speakWithDevice(text, onEnd, containerId);
                return;
            }
            this._speakChunked(speakText, onEnd, containerId);
            return;
        }

        const token = ++this._token;
        const voice = app.ttsProviders.voiceFor(provider);
        const rate = app.settings.speechRate || 0.9;
        const personaId = app.state.readingPersonaId || app.settings.persona;

        let audioData;
        try {
            // NEU: der Cache-Schlüssel (siehe _cacheKey) hängt am Text -
            // getaggte und ungetaggte Fassung landen dadurch automatisch
            // unter verschiedenen Schlüsseln, eine alte Aufnahme ohne
            // Emotion wird also nie fälschlich für eine getaggte Anfrage
            // wiederverwendet (und umgekehrt).
            audioData = await this._getAudio(speakText, { provider, voice, rate, personaId });
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
            // NEU: "text" (ohne Tags) statt "speakText" - die Wort-Spans im
            // Hervorhebungs-Container sind aus dem tag-freien Text gebaut,
            // die Zeichenpositionen müssen also dazu passen. Bei ElevenLabs
            // enthält audioData.alignment ohnehin nur wirklich gesprochene
            // Zeichen (Tags werden nicht mitgesprochen), passt also zu "text".
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

    // NEU (KI-Stimme für die Birkenbihl-Zielsprache, docs/TODO-GESAMT.md
    // Bereich "Mehrsprachigkeit"): liest einen FREMDSPRACHIGEN Text mit der
    // eingestellten KI-Stimme vor. Eigene, schlanke Route statt speak(): kein
    // Persona-Stil, keine Audio-Tags, keine Hervorhebung, keine deutsche
    // Text-Aufbereitung (prepareTextForSpeech kennt nur deutsche Abkürzungen).
    // Nie ohne Ton: jeder Fall, den die KI-Stimme nicht abdeckt (Gerätestimme
    // eingestellt, Anbieter kann die Sprache nicht, Text zu lang, Fehler),
    // landet bei der Gerätestimme mit passendem Sprachcode - genau dem
    // Verhalten von vorher.
    async speakForeign(rawText, speechLang, onEnd) {
        const text = app.utils.stripEmojiForSpeech(rawText || '').trim();
        const fallback = () => app.tts.speakWithDevice(text, onEnd, null, speechLang);

        const provider = app.ttsProviders.current();
        if (!text || !this.isActive() || text.length > MAX_NEURAL_CHARS
            || !app.ttsProviders.supportsForeignLanguage(provider, speechLang)) {
            fallback();
            return;
        }

        const token = ++this._token;
        const voice = app.ttsProviders.voiceFor(provider);
        const rate = app.settings.speechRate || 0.9;

        let audioData;
        try {
            audioData = await this._getAudio(text, { provider, voice, rate, language: speechLang });
        } catch (e) {
            if (token !== this._token) return;
            console.error('KI-Stimme (Fremdsprache) fehlgeschlagen:', e);
            // Endgültige Fehler (Key falsch, Limit) gelten genauso für die
            // deutsche Stimme - deshalb wie in _handleFailure() abschalten.
            if (e instanceof TtsError && e.fatal) this._disabledReason = e.message;
            app.ui.toast('KI-Stimme kann diese Sprache gerade nicht vorlesen - Gerätestimme springt ein.', '🔇');
            fallback();
            return;
        }
        if (token !== this._token) return;

        const audio = this._getAudioElement();
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(audioData.blob);
        audio.src = this._objectUrl;
        audio.playbackRate = provider.supportsRate ? 1 : rate;
        audio.onloadedmetadata = null;
        audio.onended = () => {
            if (token !== this._token) return;
            if (onEnd) onEnd();
        };
        audio.onerror = () => {
            if (token !== this._token) return;
            console.error('Fremdsprachige Audiodatei konnte nicht abgespielt werden.');
            fallback();
        };
        try {
            await audio.play();
        } catch (e) {
            if (token !== this._token) return;
            console.error('Wiedergabe nicht möglich:', e);
            fallback();
        }
    },

    // NEU (Textsegmentierung): liest einen zu langen Text stückweise vor -
    // an Satzenden getrennt (app.utils.splitTextIntoChunks), nacheinander
    // erzeugt UND abgespielt (nicht parallel vorausgeladen, sonst laufen
    // die Anbieter-Ratenlimits sofort in einen 429er). Jedes Stück landet
    // einzeln im ttsCache - beim erneuten Vorlesen derselben Seite kostet
    // also nur ein neues/verändertes Stück, nicht der ganze Text erneut.
    async _speakChunked(fullText, onEnd, containerId) {
        const token = ++this._token;
        const chunks = app.utils.splitTextIntoChunks(fullText, CHUNK_TARGET_CHARS);
        const provider = app.ttsProviders.current();
        const voice = app.ttsProviders.voiceFor(provider);
        const rate = app.settings.speechRate || 0.9;
        const personaId = app.state.readingPersonaId || app.settings.persona;

        for (let i = 0; i < chunks.length; i++) {
            if (token !== this._token) return; // zwischenzeitlich gestoppt/überholt
            const chunk = chunks[i];

            let audioData;
            try {
                audioData = await this._getAudio(chunk.text, { provider, voice, rate, personaId });
            } catch (e) {
                if (token !== this._token) return;
                this._handleFailure(e, fullText, onEnd, containerId);
                return;
            }
            if (token !== this._token) return;

            try {
                await this._playChunk(audioData, token, containerId, chunk);
            } catch (e) {
                if (token !== this._token) return;
                this._handleFailure(e, fullText, onEnd, containerId);
                return;
            }
        }

        if (token === this._token && onEnd) onEnd();
    },

    // Spielt EIN Text-Stück ab und löst das Versprechen erst nach dessen
    // Ende auf - so wartet die Häppchen-Kette in _speakChunked() sauber
    // Stück für Stück, statt mehrere gleichzeitig loszuschicken.
    _playChunk(audioData, token, containerId, chunk) {
        return new Promise((resolve, reject) => {
            const audio = this._getAudioElement();
            if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
            this._objectUrl = URL.createObjectURL(audioData.blob);
            audio.src = this._objectUrl;
            const provider = app.ttsProviders.current();
            audio.playbackRate = provider.supportsRate ? 1 : (app.settings.speechRate || 0.9);

            audio.onloadedmetadata = () => {
                if (token !== this._token) return;
                this._startHighlightingRange(containerId, audioData.alignment, chunk, token);
            };

            audio.onended = () => {
                if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
                resolve();
            };

            audio.onerror = () => {
                reject(new Error('Audiodatei konnte nicht abgespielt werden.'));
            };

            audio.play().catch(e => {
                console.error('Wiedergabe nicht möglich:', e);
                reject(e);
            });
        });
    },

    // Wie _startHighlighting(), aber beschränkt auf die Wort-Spans EINES
    // Text-Stücks. Die Hervorhebungs-Spans im Container wurden einmal für
    // den GANZEN Text gebaut (app.tts._prepare()) - data-start zählt dort
    // also global durch, während die Audiodatei dieses Stücks bei Zeit 0
    // beginnt. Die Zeichenpositionen werden deshalb um chunk.start
    // zurückgerechnet ("Wort-Offsets der Folgestücke verschoben").
    _startHighlightingRange(containerId, alignment, chunk, token) {
        const container = containerId ? document.getElementById(containerId) : null;
        if (!container) return;

        const rangeEnd = chunk.start + chunk.text.length;
        const spans = Array.from(container.querySelectorAll('.speech-word')).filter(span => {
            const start = parseInt(span.dataset.start, 10) || 0;
            return start >= chunk.start && start < rangeEnd;
        });
        if (!spans.length) return;

        const audio = this._getAudioElement();
        const duration = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        if (!duration) return;

        const charStarts = spans.map(span => (parseInt(span.dataset.start, 10) || 0) - chunk.start);
        const times = this._wordStartTimes(charStarts, duration, alignment, chunk.text);
        let lastIndex = -1;

        const tick = () => {
            if (token !== this._token) return;

            let current = -1;
            for (let i = 0; i < times.length; i++) {
                if (times[i] <= audio.currentTime) current = i; else break;
            }

            if (current !== lastIndex && current >= 0) {
                lastIndex = current;
                container.querySelectorAll('.speech-word').forEach(span => span.classList.remove('speech-highlight'));
                spans[current].classList.add('speech-highlight');
                spans[current].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }

            if (!audio.paused && !audio.ended) this._rafId = requestAnimationFrame(tick);
        };

        this._rafId = requestAnimationFrame(tick);
    },

    // NEU: Mitmachmodus mit KI-Stimme (siehe docs/ROADMAP.md "Mitmachmodus
    // mit KI-Stimme"). Bewusst NICHT wie app.tts.speakMitmach() in viele
    // Kleinst-Häppchen zerlegt (eine KI-Stimme kostet pro Aufruf) - die
    // Emoji-Stellen werden stattdessen durch eine Pausen-Anweisung ersetzt
    // und in EINEM Aufruf mitgesprochen. Setzt voraus, dass der Anbieter
    // Sprech-Anweisungen versteht (supportsTags) - Chirp 3 (nur eigenes
    // markup-Feld) und Anbieter ohne Tags fallen auf die Gerätestimme
    // zurück, keine Mehrkosten durch Zerlegung.
    async speakMitmach(erstleserText, onEnd, containerId) {
        const provider = app.ttsProviders.current();
        if (!this.isActive() || !provider.supportsTags || !erstleserText) {
            app.tts.speakMitmach(erstleserText, onEnd, containerId);
            return;
        }

        app.tts.stop();
        const token = ++this._token;

        const prepared = app.utils.prepareTextForSpeech(erstleserText);
        const parts = app.utils.splitBySpeechEmoji(prepared);
        const { html, plain } = app.utils.buildMitmachSpeechText(parts);
        const container = containerId ? document.getElementById(containerId) : null;
        if (container) container.innerHTML = html;

        // "[pause]" ersetzt die Emoji-Stelle in der an den Anbieter
        // geschickten Fassung - dieselbe eckige-Klammer-Konvention wie bei
        // den Emotions-Anweisungen (variant.speechText), nur als eigene
        // Sprechpause statt eines Gefühls.
        const speakText = parts.map(p => p.type === 'emoji' ? ' [pause] ' : p.value)
            .join('').replace(/\s+/g, ' ').trim();

        if (!speakText || speakText.length > MAX_NEURAL_CHARS) {
            app.tts.speakMitmach(erstleserText, onEnd, containerId);
            return;
        }

        const voice = app.ttsProviders.voiceFor(provider);
        const rate = app.settings.speechRate || 0.9;
        const personaId = app.state.readingPersonaId || app.settings.persona;

        let audioData;
        try {
            audioData = await this._getAudio(speakText, { provider, voice, rate, personaId });
        } catch (e) {
            if (token !== this._token) return;
            console.error('KI-Mitmachmodus fehlgeschlagen:', e);
            if (e instanceof TtsError && e.fatal) {
                this._disabledReason = e.message;
                app.ui.toast(`${e.message} Es wird mit der Gerätestimme weitergelesen.`, '🔇');
            } else {
                app.ui.toast('KI-Stimme gerade nicht erreichbar - Gerätestimme springt ein.', '🔇');
            }
            app.tts.speakMitmach(erstleserText, onEnd, containerId);
            return;
        }
        if (token !== this._token) return;

        const audio = this._getAudioElement();
        if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
        this._objectUrl = URL.createObjectURL(audioData.blob);
        audio.src = this._objectUrl;
        audio.playbackRate = provider.supportsRate ? 1 : rate;

        audio.onloadedmetadata = () => {
            if (token !== this._token) return;
            // NEU: "plain" (ohne Emojis/Pausen-Tag) - die Wort-Spans in
            // buildMitmachSpeechText() zählen ihre Position genau darauf
            // bezogen. Ein evtl. Alignment (ElevenLabs) enthält ohnehin nur
            // wirklich gesprochene Zeichen, Tags zählen dort nicht mit.
            this._startHighlighting(containerId, audioData.alignment, plain, token);
        };

        audio.onended = () => {
            if (token !== this._token) return;
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
            if (onEnd) onEnd();
        };

        audio.onerror = () => {
            if (token !== this._token) return;
            console.error('Wiedergabe (Mitmachmodus) fehlgeschlagen.');
            app.tts.speakMitmach(erstleserText, onEnd, containerId);
        };

        try {
            await audio.play();
        } catch (e) {
            if (token !== this._token) return;
            console.error('Wiedergabe nicht möglich:', e);
            app.ui.toast('Wiedergabe braucht einen Fingertipp - Gerätestimme springt ein.', '👆');
            app.tts.speakMitmach(erstleserText, onEnd, containerId);
        }
    },

    // ============ Bausteine für den geplanten Video-Export ============
    // Der Video-Export (siehe README "Mögliche nächste Schritte") braucht
    // pro Seite dreierlei: das Bild (liegt schon als page.imgUrl vor), die
    // Sprachaufnahme als Datei und die Wort-Zeitpunkte für mitlaufende
    // Untertitel. Die beiden letzten liefern die folgenden Funktionen -
    // bewusst getrennt vom Abspielen, damit der Export später nichts
    // duplizieren muss.
    //
    // WICHTIG: Mit der Gerätestimme geht das NICHT. SpeechSynthesis spricht
    // direkt über die Lautsprecher und gibt keine Datei heraus, die sich
    // in ein Video packen ließe - ein Video-Export setzt zwingend eine
    // KI-Stimme voraus.

    // Erzeugt (oder holt aus dem Zwischenspeicher) die Audiodatei zu einem
    // Text und liefert sie zusammen mit Länge und Wort-Zeitpunkten zurück.
    // NEU (Ton in der Film-Vorschau): cacheOnly=true liefert null statt
    // eines Fehlers, wenn nichts im Zwischenspeicher liegt - siehe
    // _getAudio() oben. Alle Prüfungen unten (keine KI-Stimme, leerer/zu
    // langer Text) geben in diesem Fall ebenfalls einfach null zurück, statt
    // eine Ausnahme zu werfen, die der Aufrufer sonst abfangen müsste.
    async renderAudio(rawText, { personaId, cacheOnly = false } = {}) {
        const provider = app.ttsProviders.current();
        if (!provider.neural || !provider.synthesize) {
            if (cacheOnly) return null;
            throw new TtsError('Dafür muss in den Einstellungen eine KI-Stimme gewählt sein (die Gerätestimme liefert keine Audiodatei).', { fatal: true, code: 'NO_NEURAL' });
        }

        // NEU: erst Trennstriche/Zeilenumbrüche/Abkürzungen glätten (klingt
        // für die exportierte Audiodatei genauso sauber wie beim normalen
        // Vorlesen), dann Emojis raus - gleiche Reihenfolge wie in
        // app.tts._prepare(), damit Wort-Zeitpunkte unten zum tatsächlich
        // synthetisierten Text passen.
        const text = app.utils.stripEmojiForSpeech(app.utils.prepareTextForSpeech(rawText));
        if (!text) {
            if (cacheOnly) return null;
            throw new TtsError('Kein Text zum Vorlesen vorhanden.', { code: 'EMPTY' });
        }
        if (text.length > MAX_NEURAL_CHARS) {
            if (cacheOnly) return null;
            throw new TtsError(`Text ist mit ${text.length} Zeichen zu lang (Grenze: ${MAX_NEURAL_CHARS}).`, { code: 'TOO_LONG' });
        }

        const usedPersona = personaId || app.state.readingPersonaId || app.settings.persona;
        const audioData = await this._getAudio(text, {
            provider,
            voice: app.ttsProviders.voiceFor(provider),
            rate: app.settings.speechRate || 0.9,
            personaId: usedPersona,
            needDuration: true,
            cacheOnly
        });
        if (!audioData) return null; // nur erreichbar mit cacheOnly=true und Cache-Fehltreffer
        const { blob, alignment, durationSec } = audioData;

        // Wort-Zeitpunkte: bei ElevenLabs exakt, sonst über die Textlänge
        // geschätzt - dieselbe Berechnung wie die Hervorhebung im Reader.
        const offsets = app.utils.speechWordOffsets(text);
        const starts = this._wordStartTimes(offsets.map(o => o.start), durationSec, alignment, text);
        const words = offsets.map((entry, i) => ({
            word: entry.word,
            start: starts[i],
            end: i + 1 < starts.length ? starts[i + 1] : durationSec
        }));

        return { text, blob, mime: blob.type, durationSec, words, exact: !!alignment };
    },

    // Alle Sprach-Bausteine einer Seite in Vorlese-Reihenfolge, fertig für
    // eine Videospur. Erzeugt nur, was noch nicht im Zwischenspeicher liegt
    // - trotzdem kostet ein kompletter Buch-Export Kontingent, deshalb
    // nichts davon automatisch aufrufen.
    // NEU (Ton in der Film-Vorschau): cacheOnly=true gibt an renderAudio()
    // durch - ein Häppchen ohne Cache-Treffer fällt dann einfach aus dem
    // Ergebnis raus, statt die ganze Seite mit einem Fehler abzubrechen. Der
    // Aufrufer (js/actions/videoTimeline.js über _findSegment) behandelt ein
    // fehlendes Häppchen ohnehin schon wie "noch nicht vertont" und schätzt
    // dafür die Länge - kein Sonderfall nötig.
    async renderPageSegments(bookId, pageIdx, { includeDescription = true, includeQuiz = false, personaId, onProgress, cacheOnly = false } = {}) {
        const book = app.library[bookId];
        if (!book) throw new TtsError('Buch nicht gefunden.', { code: 'NO_BOOK' });

        const page = book.pages[pageIdx];
        if (!page) throw new TtsError('Seite nicht gefunden.', { code: 'NO_PAGE' });

        const usedPersona = personaId || app.state.readingPersonaId || app.settings.persona;
        const variant = app.utils.resolveAnyVariant(page, usedPersona);
        if (!variant) {
            if (cacheOnly) return { imgUrl: page.imgUrl, totalDurationSec: 0, segments: [] };
            throw new TtsError('Diese Seite ist noch nicht analysiert.', { code: 'NO_VARIANT' });
        }

        const planned = [{ kind: 'text', text: variant.text }];
        if (includeDescription && variant.desc) planned.push({ kind: 'desc', text: variant.desc });
        if (includeQuiz && variant.quizQ) {
            planned.push({ kind: 'quizQ', text: variant.quizQ });
            if (variant.quizA) planned.push({ kind: 'quizA', text: variant.quizA });
        }

        const segments = [];
        // Bewusst nacheinander statt parallel: die Anbieter haben Limits
        // pro Minute, parallele Anfragen laufen sofort in einen 429er.
        for (let i = 0; i < planned.length; i++) {
            const part = planned[i];
            if (onProgress) onProgress(i + 1, planned.length, part.kind);
            const rendered = await this.renderAudio(part.text, { personaId: usedPersona, cacheOnly });
            if (rendered) segments.push({ kind: part.kind, ...rendered });
        }

        return {
            imgUrl: page.imgUrl,
            totalDurationSec: segments.reduce((sum, seg) => sum + seg.durationSec, 0),
            segments
        };
    },

    // NEU: Text schon mal im Hintergrund erzeugen lassen (z.B. die nächste
    // Buchseite), damit beim Weiterblättern keine Wartezeit entsteht.
    // Fehler werden hier absichtlich verschluckt - es ist nur Vorarbeit.
    async warmUp(text) {
        if (!this.isActive() || !text) return;
        // NEU: dieselbe Glättung wie beim eigentlichen Vorlesen (siehe
        // app.tts._prepare()) - sonst würde der Zwischenspeicher unter dem
        // rohen Text abgelegt, aber beim tatsächlichen Vorlesen unter dem
        // geglätteten gesucht, und der Cache-Treffer bliebe aus.
        const clean = app.utils.stripEmojiForSpeech(app.utils.prepareTextForSpeech(text));
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
