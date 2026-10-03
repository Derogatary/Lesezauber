import { app } from '../core.js';

// ================= 🌙 Nachtmodus: Anzeige (v0.44.0-beta) =================
// NEU: schwarze Vollbild-Anzeige #nightPrepOverlay. Logik: js/actions/nightPrep.js.
// Nur innerText (kein innerHTML) - Buchtitel kommen hier ungefiltert an.

function el(id) { return document.getElementById(id); }

// NEU: Fehlertext, solange seit dem letzten Fehler nichts mehr geklappt hat
function lastFailure() {
    const act = app.state.pregenActivity || {};
    if (!act.lastErrorAt || act.lastSuccessAt > act.lastErrorAt) return '';
    return String(act.lastError || '').slice(0, 120);
}

Object.assign(app.render, {
    nightPrep({ open, done, wakeLockOk }) {
        const box = el('nightPrepBox');
        if (!box) return;
        box.classList.remove('opacity-0');
        el('nightPrepTitle').innerText = '🌙 Wird vorbereitet …';
        el('nightPrepCount').innerText = `Noch ${open} ${open === 1 ? 'Auftrag' : 'Aufträge'} offen${done ? ` · ${done} erledigt` : ''}`;
        const act = app.state.pregenActivity || {};
        // FIX (Nutzerfrage nach "stillen" Fehlern): hängt es, steht jetzt der
        // Grund da statt nur "gerade: ..." (z.B. Kontingent aufgebraucht)
        el('nightPrepCurrent').innerText = (act.current ? `gerade: ${act.current}` : '')
            + (lastFailure() ? `\nletzter Fehler: ${lastFailure()}` : '')
            // NEU (v0.56.2-beta): Seiten, die dreimal nicht weiterkamen
            + (app.utils.countPregenSkipped() ? `\n${app.utils.countPregenSkipped()} ${app.utils.countPregenSkipped() === 1 ? 'Seite kommt' : 'Seiten kommen'} nicht weiter und ${app.utils.countPregenSkipped() === 1 ? 'wird' : 'werden'} übersprungen.` : '');
        if (wakeLockOk === false) {
            el('nightPrepHint').innerText = 'Hinweis: Dieses Gerät kann den Bildschirm nicht wach halten - bitte die automatische Bildschirmsperre in den Geräte-Einstellungen länger stellen.';
        } else if (wakeLockOk === true) {
            el('nightPrepHint').innerText = 'App geöffnet lassen, am besten am Ladekabel (der Bildschirm bleibt an). Zweimal tippen zum Beenden.';
        }
    },

    nightPrepFinished(reason, { done, open }) {
        el('nightPrepTitle').innerText = reason === 'done' ? '✅ Fertig' : '💤 Pause bis morgen';
        // NEU (v0.56.0-beta): Tageskontingent bekannt leer (js/geminiQuota.js)
        const freeAt = app.geminiQuota.nextFreeAt();
        el('nightPrepCount').innerText = reason === 'done'
            ? `${done} ${done === 1 ? 'Auftrag' : 'Aufträge'} erledigt.`
            : reason === 'quota'
            ? `${done} erledigt, ${open} noch offen - das Gemini-Tageskontingent ist aufgebraucht. Neues gibt es ab ${freeAt ? app.geminiQuota.formatWhen(freeAt) : 'morgen früh'}; danach geht es beim nächsten Öffnen bzw. Nachtmodus weiter.`
            : `${done} erledigt, ${open} noch offen - ${lastFailure() ? `letzter Fehler: ${lastFailure()}` : 'vermutlich ist das Tageskontingent aufgebraucht'}. Beim nächsten Öffnen geht es weiter.`;
        el('nightPrepCurrent').innerText = '';
        el('nightPrepHint').innerText = 'Der Bildschirm geht gleich von selbst aus. Tippen zum Schließen.';
    },

    // NEU: Hinweis nach dem ersten Fingertipp (js/actions/nightPrep.js nightPrepTap)
    nightPrepExitHint(show) {
        const box = el('nightPrepBox');
        if (show) box?.classList.remove('opacity-0');
        el('nightPrepExit')?.classList.toggle('hidden', !show);
    },

    // Nach dem Ende: auch den Text ausblenden -> komplett schwarz.
    nightPrepBlack() {
        el('nightPrepBox')?.classList.add('opacity-0');
    },

    // Gegen Einbrennen: Textblock jede Minute leicht versetzen.
    nightPrepMove() {
        const box = el('nightPrepBox');
        if (!box) return;
        const dx = Math.round((Math.random() - 0.5) * 40);
        const dy = Math.round((Math.random() - 0.5) * 120);
        box.style.transform = `translate(${dx}px, ${dy}px)`;
    }
});
