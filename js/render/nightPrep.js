import { app } from '../core.js';

// ================= 🌙 Nachtmodus: Anzeige (v0.44.0-beta) =================
// NEU: schwarze Vollbild-Anzeige #nightPrepOverlay. Logik: js/actions/nightPrep.js.
// Nur innerText (kein innerHTML) - Buchtitel kommen hier ungefiltert an.

function el(id) { return document.getElementById(id); }

Object.assign(app.render, {
    nightPrep({ open, done, wakeLockOk }) {
        const box = el('nightPrepBox');
        if (!box) return;
        box.classList.remove('opacity-0');
        el('nightPrepTitle').innerText = '🌙 Wird vorbereitet …';
        el('nightPrepCount').innerText = `Noch ${open} ${open === 1 ? 'Auftrag' : 'Aufträge'} offen${done ? ` · ${done} erledigt` : ''}`;
        const act = app.state.pregenActivity || {};
        el('nightPrepCurrent').innerText = act.current ? `gerade: ${act.current}` : '';
        if (wakeLockOk === false) {
            el('nightPrepHint').innerText = 'Hinweis: Dieses Gerät kann den Bildschirm nicht wach halten - bitte die automatische Bildschirmsperre in den Geräte-Einstellungen länger stellen.';
        } else if (wakeLockOk === true) {
            el('nightPrepHint').innerText = 'Gerät am Ladekabel liegen lassen, App geöffnet lassen. Tippen zum Beenden.';
        }
    },

    nightPrepFinished(reason, { done, open }) {
        el('nightPrepTitle').innerText = reason === 'done' ? '✅ Fertig' : '💤 Pause bis morgen';
        el('nightPrepCount').innerText = reason === 'done'
            ? `${done} ${done === 1 ? 'Auftrag' : 'Aufträge'} erledigt.`
            : `${done} erledigt, ${open} noch offen - vermutlich ist das Tageskontingent aufgebraucht. Beim nächsten Öffnen geht es weiter.`;
        el('nightPrepCurrent').innerText = '';
        el('nightPrepHint').innerText = 'Der Bildschirm geht gleich von selbst aus. Tippen zum Schließen.';
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
