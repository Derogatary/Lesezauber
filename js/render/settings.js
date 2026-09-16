import { app } from '../core.js';

Object.assign(app.render, {
    // NEU: Der Bereich "Vorlese-Stimme" baut sich komplett aus
    // app.ttsProviders.list auf. Ein neuer Anbieter dort taucht hier
    // automatisch auf, ohne dass diese Datei angefasst werden muss.
    async ttsProviderCard() {
        const select = document.getElementById('selectTtsProvider');
        if (!select) return;

        const provider = app.ttsProviders.current();

        select.innerHTML = app.ttsProviders.list
            .map(p => `<option value="${p.id}">${app.utils.sanitize(p.label)}</option>`)
            .join('');
        select.value = provider.id;

        const hint = document.getElementById('ttsProviderHint');
        if (hint) hint.innerText = provider.hint || '';

        // Key-Feld nur bei Anbietern mit eigenem Key. Gemini nutzt den
        // Key, der weiter oben ohnehin schon eingetragen ist.
        const keyRow = document.getElementById('ttsKeyRow');
        const keyInput = document.getElementById('inputProviderKey');
        const keyLabel = document.getElementById('ttsKeyLabel');
        const keyLink = document.getElementById('ttsKeyLink');
        const needsOwnKey = !!provider.keySetting && provider.keySetting !== 'apiKey';
        if (keyRow) keyRow.classList.toggle('hidden', !needsOwnKey);
        if (needsOwnKey && keyInput) {
            keyInput.value = app.settings[provider.keySetting] || '';
            if (keyLabel) keyLabel.innerText = `API-Key (${provider.label.split(' (')[0]})`;
        }

        // NEU: Links zum Anbieter (Key-Seite + Preisliste) bei jeder
        // KI-Stimme zeigen - auch bei Gemini, das kein eigenes Key-Feld hat.
        const linkRow = document.getElementById('ttsLinkRow');
        const pricingLink = document.getElementById('ttsPricingLink');
        if (linkRow) linkRow.classList.toggle('hidden', !provider.neural);
        if (keyLink) {
            keyLink.href = provider.keyUrl || '#';
            keyLink.classList.toggle('hidden', !provider.keyUrl);
        }
        if (pricingLink) {
            pricingLink.href = provider.pricingUrl || '#';
            pricingLink.classList.toggle('hidden', !provider.pricingUrl);
        }

        // Stimmen-Auswahl: bei ElevenLabs bevorzugt die aus dem Konto
        // geladenen Stimmen, sonst die fest hinterlegte Auswahl.
        const voiceRow = document.getElementById('ttsVoiceRow');
        const voiceSelect = document.getElementById('selectTtsVoice');
        if (voiceRow) voiceRow.classList.toggle('hidden', !provider.neural);
        if (provider.neural && voiceSelect) {
            const loaded = provider.id === 'elevenlabs' ? (app.settings.elevenVoices || []) : [];
            const voices = loaded.length ? loaded : provider.voices;
            voiceSelect.innerHTML = voices
                .map(v => `<option value="${app.utils.sanitize(v.id)}">${app.utils.sanitize(v.label)}</option>`)
                .join('');
            voiceSelect.value = app.ttsProviders.voiceFor(provider);
            // Steht die gemerkte Stimme nicht (mehr) zur Auswahl, greift
            // wieder die Standardstimme des Anbieters.
            if (!voiceSelect.value) voiceSelect.value = provider.defaultVoice;
        }

        const elevenBtn = document.getElementById('btnLoadElevenVoices');
        if (elevenBtn) elevenBtn.classList.toggle('hidden', !provider.supportsVoiceFetch);

        // Zusatz-Optionen (Persona-Stil, Stimmen-Speicher) sind nur bei
        // einer KI-Stimme sinnvoll.
        const optionsRow = document.getElementById('ttsOptionsRow');
        if (optionsRow) optionsRow.classList.toggle('hidden', !provider.neural);

        const styleRow = document.getElementById('ttsStyleRow');
        if (styleRow) styleRow.classList.toggle('hidden', !provider.supportsStyle);
        const styleToggle = document.getElementById('toggleTtsPersonaStyle');
        if (styleToggle) styleToggle.checked = app.settings.ttsPersonaStyle !== false;

        const cacheToggle = document.getElementById('toggleTtsCache');
        if (cacheToggle) cacheToggle.checked = app.settings.ttsCacheEnabled !== false;

        const cacheInfo = document.getElementById('ttsCacheInfo');
        if (cacheInfo && provider.neural) {
            const stats = await app.dbOps.getTtsCacheStats();
            const mb = (stats.bytes / (1024 * 1024)).toFixed(1);
            cacheInfo.innerText = stats.count
                ? `${stats.count} gespeicherte Aufnahme(n), ${mb} MB`
                : 'Noch nichts gespeichert.';
        }
    },

    async settings() {
        // Die Persona-Liste kommt aus config.js statt fest im HTML zu
        // stehen. Ergänzt man dort eine Persona, erscheint sie automatisch
        // hier - ohne diese Datei anzufassen.
        const personaSelect = document.getElementById('selectPersona');
        personaSelect.innerHTML = app.personas.map(p => `<option value="${p.id}">${p.label}</option>`).join('');

        document.getElementById('inputApiKey').value = app.settings.apiKey;
        document.getElementById('inputMistralKey').value = app.settings.mistralApiKey;
        personaSelect.value = app.settings.persona;

        // NEU: gespeicherte Vorlesegeschwindigkeit anzeigen
        const rateInput = document.getElementById('inputSpeechRate');
        const rateLabel = document.getElementById('speechRateValue');
        if (rateInput) {
            rateInput.value = app.settings.speechRate;
            if (rateLabel) rateLabel.innerText = app.settings.speechRate.toFixed(1) + 'x';
        }

        // NEU: gespeicherte Hervorhebungsfarbe anzeigen
        const colorInput = document.getElementById('inputHighlightColor');
        if (colorInput) colorInput.value = app.settings.highlightColor;

        // NEU: Hintergrund-Vorbereitung - Status + Fortschritt anzeigen
        const bgToggle = document.getElementById('toggleBackgroundPregen');
        if (bgToggle) bgToggle.checked = app.settings.backgroundPregenEnabled;
        const bgStatus = document.getElementById('pregenStatus');
        if (bgStatus) {
            const missing = app.utils.countMissingVariants();
            bgStatus.innerText = missing > 0 ? `${missing} Variante(n) noch offen` : 'Alles vorbereitet ✅';
        }
        app.tts.loadVoices();
        await this.ttsProviderCard();

        // NEU: Speicherplatz-Nutzung anzeigen (grobe Schätzung des Browsers)
        const infoEl = document.getElementById('storageInfo');
        const barEl = document.getElementById('storageBar');
        if (infoEl && navigator.storage && navigator.storage.estimate) {
            try {
                const { usage, quota } = await navigator.storage.estimate();
                const usageMb = (usage / (1024 * 1024)).toFixed(1);
                if (quota) {
                    const quotaMb = (quota / (1024 * 1024)).toFixed(0);
                    const pct = Math.min(100, Math.round((usage / quota) * 100));
                    infoEl.innerText = `${usageMb} MB von ca. ${quotaMb} MB genutzt (${pct}%)`;
                    if (barEl) {
                        barEl.style.width = pct + '%';
                        // NEU: proaktive Warnfarbe ab 80%, statt erst beim
                        // tatsächlichen Fehlschlag zu merken, dass es eng wird.
                        barEl.className = pct >= 80
                            ? 'bg-red-500 h-full transition-all'
                            : 'bg-indigo-500 h-full transition-all';
                    }
                    if (pct >= 80) {
                        infoEl.innerHTML += ' <span class="text-red-600 font-bold">- wird knapp, evtl. Zeit für ein Backup + Aufräumen</span>';
                    }
                } else {
                    infoEl.innerText = `${usageMb} MB genutzt`;
                }
            } catch (e) {
                console.error('Speicherplatz konnte nicht ermittelt werden:', e);
                infoEl.innerText = 'Konnte nicht ermittelt werden.';
            }
        } else if (infoEl) {
            infoEl.innerText = 'Von diesem Browser nicht unterstützt.';
        }
    }
});
