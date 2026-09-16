import { app } from './core.js';

// Wo der Key des jeweiligen Anbieters im Browser abgelegt wird. Muss zu
// den Namen in state.js passen.
const KEY_STORAGE = {
    apiKey: 'lz_api_key',
    googleTtsKey: 'lz_google_tts_key',
    elevenLabsKey: 'lz_eleven_key',
    openAiKey: 'lz_openai_key'
};

// Liest das Feld für den Anbieter-Key aus und speichert es. Wird sowohl
// beim Speichern als auch beim Anbieter-Wechsel gebraucht - sonst wäre ein
// gerade eingetippter Key beim Umschalten wieder weg.
function persistProviderKey(provider) {
    if (!provider || !provider.keySetting) return;
    // Gemini nutzt denselben Key wie die Seitenanalyse - der wird oben im
    // eigenen Feld gepflegt, hier gibt es dafür kein zweites Eingabefeld.
    if (provider.keySetting === 'apiKey') return;

    const input = document.getElementById('inputProviderKey');
    if (!input) return;

    const value = input.value.trim();
    app.settings[provider.keySetting] = value;
    localStorage.setItem(KEY_STORAGE[provider.keySetting], value);
}

Object.assign(app.settingsConfig, {
    // NEU: Hintergrund-Vorbereitung ein-/ausschalten
    toggleBackgroundPregen(enabled) {
        app.settings.backgroundPregenEnabled = enabled;
        localStorage.setItem('lz_bg_pregen', enabled ? '1' : '0');
        app.ui.toast(enabled ? 'Hintergrund-Vorbereitung aktiviert' : 'Hintergrund-Vorbereitung deaktiviert', enabled ? '🔄' : '⏸️');
    },

    // NEU: Anbieter der Vorlese-Stimme wechseln (Gerätestimme <-> KI-Stimme).
    // Wirkt sofort, ohne "Speichern" - so kann man direkt den Test-Knopf
    // benutzen.
    changeTtsProvider(providerId) {
        persistProviderKey(app.ttsProviders.current());

        app.settings.ttsProvider = providerId;
        localStorage.setItem('lz_tts_provider', providerId);
        // Ein neuer Anbieter darf es wieder versuchen, auch wenn der alte
        // wegen eines Fehlers abgeschaltet wurde.
        app.ttsNeural._disabledReason = null;
        app.render.settings();
    },

    // NEU: Stimme des aktuellen Anbieters wählen (pro Anbieter gemerkt).
    changeTtsVoice(voiceId) {
        const provider = app.ttsProviders.current();
        app.settings.ttsVoices = { ...app.settings.ttsVoices, [provider.id]: voiceId };
        localStorage.setItem('lz_tts_voices', JSON.stringify(app.settings.ttsVoices));
    },

    toggleTtsCache(enabled) {
        app.settings.ttsCacheEnabled = enabled;
        localStorage.setItem('lz_tts_cache', enabled ? '1' : '0');
        app.ui.toast(enabled ? 'Stimmen werden gespeichert' : 'Stimmen werden nicht mehr gespeichert', enabled ? '💾' : '🚫');
    },

    toggleTtsPersonaStyle(enabled) {
        app.settings.ttsPersonaStyle = enabled;
        localStorage.setItem('lz_tts_persona_style', enabled ? '1' : '0');
    },

    // NEU: Probe-Anhören. Speichert vorher den eingetippten Key, damit man
    // ihn zum Testen nicht erst separat speichern muss.
    testTtsVoice() {
        persistProviderKey(app.ttsProviders.current());
        app.ttsNeural.testVoice();
    },

    // NEU: eigene/geklonte Stimmen aus dem ElevenLabs-Konto holen, damit
    // man die kryptischen Stimmen-IDs nicht abtippen muss.
    async loadElevenVoices() {
        persistProviderKey(app.ttsProviders.get('elevenlabs'));
        app.ui.toast('Stimmen werden geladen...', '⏳');
        try {
            const voices = await app.ttsProviders.fetchElevenVoices();
            if (!voices.length) {
                app.ui.toast('Keine Stimmen im Konto gefunden.', 'ℹ️');
                return;
            }
            app.settings.elevenVoices = voices;
            localStorage.setItem('lz_eleven_voices', JSON.stringify(voices));
            app.render.settings();
            app.ui.toast(`${voices.length} Stimmen geladen`, '✅');
        } catch (e) {
            console.error('ElevenLabs-Stimmen konnten nicht geladen werden:', e);
            app.ui.toast(e.message || 'Stimmen konnten nicht geladen werden.', '⚠️');
        }
    },

    save() {
        const key = document.getElementById('inputApiKey').value.trim();
        const mistralKey = document.getElementById('inputMistralKey').value.trim();
        const persona = document.getElementById('selectPersona').value;
        const voice = document.getElementById('selectVoice').value;
        const speechRate = parseFloat(document.getElementById('inputSpeechRate').value);
        const highlightColor = document.getElementById('inputHighlightColor').value;

        // NEU: Key des gewählten Stimmen-Anbieters mitspeichern
        persistProviderKey(app.ttsProviders.current());

        app.settings.apiKey = key;
        app.settings.mistralApiKey = mistralKey;
        app.settings.persona = persona;
        app.settings.voiceUri = voice;
        app.settings.speechRate = speechRate;
        app.settings.highlightColor = highlightColor;

        localStorage.setItem('lz_api_key', key);
        localStorage.setItem('lz_mistral_key', mistralKey);
        localStorage.setItem('lz_persona', persona);
        localStorage.setItem('lz_voice', voice);
        localStorage.setItem('lz_speech_rate', String(speechRate));
        localStorage.setItem('lz_highlight_color', highlightColor);
        document.documentElement.style.setProperty('--speech-highlight-color', highlightColor);

        app.ui.toast('Einstellungen gespeichert!', '✅');
        app.nav.go('lib');
    }
});
