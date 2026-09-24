import { app } from '../../core.js';

Object.assign(app.atlas.render, {
    async settings() {
        // FIX (v0.47.0-beta): Hell/Dunkel-Auswahl entfernt - innerhalb von
        // LeseZauber gilt dessen Darstellung, ein zweiter Schalter nur für
        // den Buchatlas wäre verwirrend.

        // Benachrichtigungs-Berechtigung widerspiegeln
        const notifyBtn = document.getElementById('atlasNotifyPermissionBtn');
        if (notifyBtn) {
            if (!('Notification' in window)) {
                notifyBtn.textContent = '🔕 Vom Browser nicht unterstützt';
                notifyBtn.disabled = true;
            } else if (Notification.permission === 'granted') {
                notifyBtn.textContent = '🔔 Aktiviert';
                notifyBtn.disabled = true;
            } else if (Notification.permission === 'denied') {
                notifyBtn.textContent = '🔕 Vom Browser blockiert - in den Browser-Einstellungen erlauben';
                notifyBtn.disabled = true;
            } else {
                notifyBtn.textContent = '🔔 Aktivieren';
                notifyBtn.disabled = false;
            }
        }

        // API-Nutzung anzeigen (reine Rohzahlen, keine Kostenschätzung -
        // siehe Kommentar in api.js für die Begründung)
        const usageEl = document.getElementById('atlasApiUsageInfo');
        if (usageEl) {
            const stats = app.atlas.api.getUsageStats();
            const totalTokens = stats.promptTokens + stats.responseTokens;
            const sinceDate = new Date(stats.since).toLocaleDateString('de-DE');
            usageEl.textContent = stats.calls === 0
                ? `Noch keine Calls seit ${sinceDate}.`
                : `${stats.calls} Call${stats.calls === 1 ? '' : 's'} · ~${totalTokens.toLocaleString('de-DE')} Tokens seit ${sinceDate}`;
        }

        // Speicherplatz-Nutzung anzeigen (grobe Schätzung des Browsers)
        const infoEl = document.getElementById('atlasStorageInfo');
        const barEl = document.getElementById('atlasStorageBar');
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
