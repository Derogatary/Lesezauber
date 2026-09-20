import { app } from './core.js';

// Wo der Key des jeweiligen Anbieters im Browser abgelegt wird. Muss zu
// den Namen in state.js passen.
const KEY_STORAGE = {
    apiKey: 'lz_api_key',
    googleTtsKey: 'lz_google_tts_key',
    elevenLabsKey: 'lz_eleven_key',
    openAiKey: 'lz_openai_key',
    speechifyKey: 'lz_speechify_key'
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

    // NEU (Birkenbihl-Hintergrundvorbereitung, Nutzerwunsch): eigener,
    // zusätzlicher Schalter - siehe Begründung bei backgroundPregenBirkenbihl
    // in js/state.js.
    toggleBackgroundPregenBirkenbihl(enabled) {
        app.settings.backgroundPregenBirkenbihl = enabled;
        localStorage.setItem('lz_bg_pregen_birkenbihl', enabled ? '1' : '0');
        app.ui.toast(enabled ? 'Birkenbihl-Hintergrundvorbereitung aktiviert' : 'Birkenbihl-Hintergrundvorbereitung deaktiviert', enabled ? '🌍' : '⏸️');
    },

    // NEU (Nutzerwunsch): eigener Zusatz-Schalter fürs Vorbereiten der
    // KI-Stimmen-Aufnahmen im Hintergrund, analog zu Birkenbihl oben.
    toggleBackgroundPregenAudio(enabled) {
        app.settings.backgroundPregenAudio = enabled;
        localStorage.setItem('lz_bg_pregen_audio', enabled ? '1' : '0');
        app.ui.toast(enabled ? 'KI-Stimme-Hintergrundvorbereitung aktiviert' : 'KI-Stimme-Hintergrundvorbereitung deaktiviert', enabled ? '🎧' : '⏸️');
    },

    // NEU: zweiseitiges Layout (Bild links, Text rechts) ein-/ausschalten -
    // wirkt sich per CSS-Media-Query ohnehin erst ab Tablet-Breite aus,
    // auf dem Handy bleibt es immer wie gewohnt untereinander.
    toggleTwoPageLayout(enabled) {
        app.settings.twoPageLayout = enabled;
        localStorage.setItem('lz_two_page_layout', enabled ? '1' : '0');
        document.getElementById('viewReader')?.classList.toggle('two-page-layout', enabled);
        app.ui.toast(enabled ? 'Zweiseitiges Layout aktiviert' : 'Zweiseitiges Layout deaktiviert', '📖');
    },

    // NEU: Ken-Burns-Effekt/Kreuzblende im Kino-Modus (Vollbild-Vorlesen)
    // ein-/ausschalten - unabhängig davon respektiert der Effekt weiterhin
    // "prefers-reduced-motion" des Betriebssystems (siehe css/style.css).
    toggleFocusEffects(enabled) {
        app.settings.focusEffectsEnabled = enabled;
        localStorage.setItem('lz_focus_effects', enabled ? '1' : '0');
    },

    // NEU: Anbieter der Vorlese-Stimme wechseln (Gerätestimme <-> KI-Stimme).
    // Wirkt sofort, ohne "Speichern" - so kann man direkt den Test-Knopf
    // benutzen. Die Auswahl wird pro Profil gespeichert (app.profileTtsMap,
    // siehe js/profiles.js), nicht mehr global.
    changeTtsProvider(providerId) {
        // FIX: Sicherheitsnetz - das Dropdown ist für Kinderprofile bereits
        // per disabled gesperrt, aber z.B. ein noch offenes altes
        // Einstellungen-Fenster könnte das umgehen. Steht bewusst VOR dem
        // Tarif-Lock: ein Kinderprofil soll gar nicht erst gefragt werden.
        if (app.utils.isSettingsLockedForActiveProfile()) return;

        const current = app.ttsProviders.current();
        const next = app.ttsProviders.get(providerId);

        // NEU: Tarif-Lock - vor einem Wechsel in eine teurere Preisstufe
        // erst bestätigen lassen. Schützt nur vor einem Versehen (z.B. ein
        // Kind tippt sich durch die Auswahl), nicht vor Absicht - kein
        // Passwort, keine Sperre, siehe CLAUDE.md "Tarif-Lock".
        if (app.ttsProviders.isCostUpgrade(current, next)) {
            const ok = confirm(`"${next.label}" ist eine teurere Preisstufe als die aktuelle Auswahl.\n\n${next.hint}\n\nTrotzdem wechseln?`);
            if (!ok) {
                const select = document.getElementById('selectTtsProvider');
                if (select) select.value = current.id;
                return;
            }
        }

        persistProviderKey(current);

        app.settings.ttsProvider = providerId;
        app.utils.setProfileTtsSettings(app.utils.resolveCreationProfileId(), {
            ttsProvider: app.settings.ttsProvider,
            ttsVoices: app.settings.ttsVoices
        });
        // Ein neuer Anbieter darf es wieder versuchen, auch wenn der alte
        // wegen eines Fehlers abgeschaltet wurde.
        app.ttsNeural._disabledReason = null;
        app.render.settings();
    },

    // NEU: Stimme des aktuellen Anbieters wählen (pro Anbieter gemerkt, und
    // das Ganze wiederum pro Profil).
    changeTtsVoice(voiceId) {
        const provider = app.ttsProviders.current();
        app.settings.ttsVoices = { ...app.settings.ttsVoices, [provider.id]: voiceId };
        app.utils.setProfileTtsSettings(app.utils.resolveCreationProfileId(), {
            ttsProvider: app.settings.ttsProvider,
            ttsVoices: app.settings.ttsVoices
        });
    },

    // NEU: Teil der "Stimmen-Speicher-Verwaltung" - für Kinderprofile
    // gesperrt (Kindersicherung, kein Passwortschutz), siehe render/settings.js.
    toggleTtsCache(enabled) {
        if (app.utils.isSettingsLockedForActiveProfile()) return;
        app.settings.ttsCacheEnabled = enabled;
        localStorage.setItem('lz_tts_cache', enabled ? '1' : '0');
        app.ui.toast(enabled ? 'Stimmen werden gespeichert' : 'Stimmen werden nicht mehr gespeichert', enabled ? '💾' : '🚫');
    },

    // NEU: ebenfalls Teil der "Stimmen-Speicher-Verwaltung" - Leeren-Knopf
    // im Reader/Einstellungen ruft bisher direkt app.dbOps.clearTtsCache()
    // auf; dieser Wrapper ergänzt nur die Kindersperre davor.
    clearTtsCache() {
        if (app.utils.isSettingsLockedForActiveProfile()) return;
        app.dbOps.clearTtsCache();
    },

    toggleTtsPersonaStyle(enabled) {
        app.settings.ttsPersonaStyle = enabled;
        localStorage.setItem('lz_tts_persona_style', enabled ? '1' : '0');
    },

    // NEU (SchreibZauber Stufe 2, docs/KONZEPT-SchreibZauber.md TEIL G
    // Punkt 1): echte KI-Bildgenerierung kostet Geld und braucht eine
    // hinterlegte Zahlungsmethode am Google-Konto - deshalb hinter einer
    // ausdrücklichen Bestätigung, nicht automatisch mit dem vorhandenen
    // Gemini-Key aktiv. Gleiche Haltung wie der Tarif-Lock oben: kein
    // Passwort, keine harte Sperre, nur ein bewusstes Ja vor dem ersten
    // kostenpflichtigen Aufruf.
    toggleStudioImageGen(enabled) {
        if (app.utils.isSettingsLockedForActiveProfile()) return;
        if (enabled) {
            const ok = confirm('Echte KI-Bilder in der Werkstatt kosten Geld (grob 0,07 $ pro Bild) und brauchen eine hinterlegte Zahlungsmethode am Google-Konto hinter deinem Gemini-Key - ohne Zahlungsmethode schlägt jeder Versuch mit einer Fehlermeldung fehl (Platzhalter funktionieren immer, kostenlos).\n\nWirklich aktivieren?');
            if (!ok) {
                const toggle = document.getElementById('toggleStudioImageGen');
                if (toggle) toggle.checked = false;
                return;
            }
        }
        app.settings.studioImageGenEnabled = enabled;
        localStorage.setItem('lz_studio_image_gen', enabled ? '1' : '0');
        app.ui.toast(enabled ? 'Echte Bildgenerierung aktiviert' : 'Echte Bildgenerierung wieder ausgeschaltet', enabled ? '🎨' : '⏸️');
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
        if (app.utils.isSettingsLockedForActiveProfile()) return;
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

    // NEU: dasselbe für Speechify (5. Anbieter, siehe ttsProviders.js).
    // FIX (Nutzer-Feedback "redet mit englischem Akzent"): fetchSpeechifyVoices()
    // filtert seither serverseitig auf locale=de-DE, dieser Knopf lädt also
    // gezielt echte deutsche Stimmen statt der akzentbehafteten Vorauswahl.
    async loadSpeechifyVoices() {
        persistProviderKey(app.ttsProviders.get('speechify'));
        app.ui.toast('Deutsche Stimmen werden geladen...', '⏳');
        try {
            const voices = await app.ttsProviders.fetchSpeechifyVoices();
            if (!voices.length) {
                app.ui.toast('Keine deutschen Stimmen im Konto gefunden.', 'ℹ️');
                return;
            }
            app.settings.speechifyVoices = voices;
            localStorage.setItem('lz_speechify_voices', JSON.stringify(voices));
            app.render.settings();
            app.ui.toast(`${voices.length} Stimmen geladen`, '✅');
        } catch (e) {
            console.error('Speechify-Stimmen konnten nicht geladen werden:', e);
            app.ui.toast(e.message || 'Stimmen konnten nicht geladen werden.', '⚠️');
        }
    },

    save() {
        // FIX: Sicherheitsnetz - die Key-Felder sind für Kinderprofile per
        // disabled gesperrt, ihr Wert bleibt dadurch ohnehin unverändert.
        // Hier zusätzlich explizit übersprungen, damit ein gesperrtes Feld
        // nie versehentlich überschrieben wird.
        const locked = app.utils.isSettingsLockedForActiveProfile();

        const persona = document.getElementById('selectPersona').value;
        const voice = document.getElementById('selectVoice').value;
        const speechRate = parseFloat(document.getElementById('inputSpeechRate').value);
        const highlightColor = document.getElementById('inputHighlightColor').value;
        // NEU (Birkenbihl-Methode): Zielsprache für den Interlinear-Modus.
        const birkenbihlLanguage = document.getElementById('selectBirkenbihlLanguage').value;

        if (!locked) {
            const key = document.getElementById('inputApiKey').value.trim();
            const mistralKey = document.getElementById('inputMistralKey').value.trim();
            // NEU: Key des gewählten Stimmen-Anbieters mitspeichern
            persistProviderKey(app.ttsProviders.current());

            app.settings.apiKey = key;
            app.settings.mistralApiKey = mistralKey;
            localStorage.setItem('lz_api_key', key);
            localStorage.setItem('lz_mistral_key', mistralKey);
        }

        app.settings.persona = persona;
        app.settings.voiceUri = voice;
        app.settings.speechRate = speechRate;
        app.settings.highlightColor = highlightColor;
        app.settings.birkenbihlLanguage = birkenbihlLanguage;

        localStorage.setItem('lz_persona', persona);
        localStorage.setItem('lz_voice', voice);
        localStorage.setItem('lz_speech_rate', String(speechRate));
        localStorage.setItem('lz_highlight_color', highlightColor);
        localStorage.setItem('lz_birkenbihl_lang', birkenbihlLanguage);
        document.documentElement.style.setProperty('--speech-highlight-color', highlightColor);

        app.ui.toast('Einstellungen gespeichert!', '✅');
        app.nav.go('lib');
    }
});
