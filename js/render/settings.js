import { app } from '../core.js';

Object.assign(app.render, {
    async settings() {
        // Die Persona-Liste kommt aus config.js statt fest im HTML zu
        // stehen. Ergänzt man dort eine Persona, erscheint sie automatisch
        // hier - ohne diese Datei anzufassen.
        const personaSelect = document.getElementById('selectPersona');
        // FIX: als einzige Stelle fehlte hier das sanitize() - die
        // Reader-Auswahl in render/reader.js macht es bereits. Personas
        // stammen zwar aus config.js und sind damit ungefährlich, aber die
        // Regel "vor innerHTML immer sanitize" soll ausnahmslos gelten,
        // damit sie beim nächsten Mal nicht versehentlich reißt.
        personaSelect.innerHTML = app.personas.map(p => `<option value="${p.id}">${app.utils.sanitize(p.label)}</option>`).join('');

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
