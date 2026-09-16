import { app } from './core.js';

Object.assign(app.settingsConfig, {
    // NEU: Hintergrund-Vorbereitung ein-/ausschalten
    toggleBackgroundPregen(enabled) {
        app.settings.backgroundPregenEnabled = enabled;
        localStorage.setItem('lz_bg_pregen', enabled ? '1' : '0');
        app.ui.toast(enabled ? 'Hintergrund-Vorbereitung aktiviert' : 'Hintergrund-Vorbereitung deaktiviert', enabled ? '🔄' : '⏸️');
    },

    save() {
        const key = document.getElementById('inputApiKey').value.trim();
        const mistralKey = document.getElementById('inputMistralKey').value.trim();
        const persona = document.getElementById('selectPersona').value;
        const voice = document.getElementById('selectVoice').value;
        const speechRate = parseFloat(document.getElementById('inputSpeechRate').value);
        const highlightColor = document.getElementById('inputHighlightColor').value;

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
