import { app } from '../core.js';

Object.assign(app.render, {
    async settings() {
        // Die Persona-Liste kommt aus config.js statt fest im HTML zu
        // stehen. Ergänzt man dort eine Persona, erscheint sie automatisch
        // hier - ohne diese Datei anzufassen.
        const personaSelect = document.getElementById('selectPersona');
        personaSelect.innerHTML = app.personas.map(p => `<option value="${p.id}">${p.label}</option>`).join('');

        document.getElementById('inputApiKey').value = app.settings.apiKey;
        document.getElementById('inputMistralKey').value = app.settings.mistralApiKey;
        personaSelect.value = app.settings.persona;

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
                    if (barEl) barEl.style.width = pct + '%';
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
