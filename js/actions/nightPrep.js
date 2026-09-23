import { app } from '../core.js';

// ================= 🌙 Nachtmodus: "Über Nacht vorbereiten" (v0.44.0-beta) =================
// NEU (Nutzerwunsch: Hintergrund-Vorbereitung auch bei minimierter App).
// Das geht in einer PWA grundsätzlich NICHT zuverlässig: Android friert eine
// minimierte Web-App nach kurzer Zeit ein, iOS sofort; einen "Vordergrund-
// Dienst mit Benachrichtigung" wie bei nativen Apps gibt es im Browser nicht
// (Erklärung siehe CHANGELOG.md v0.44.0-beta). Der ehrliche Umweg:
//   - Die App bleibt GEÖFFNET, verhindert aber das Abschalten des Bildschirms
//     (Screen Wake Lock API: Chrome/Android, Safari ab iOS 16.4).
//   - Eine schwarze Vollbild-Anzeige mit gedimmtem Text (auf OLED-Bildschirmen
//     praktisch "aus"); der Text wandert jede Minute ein Stück, damit sich
//     nichts einbrennt.
//   - Die eigentliche Arbeit machen weiter die beiden Schleifen in
//     js/backgroundPregen.js - hier wird nur zugeschaut und gezählt.
//   - Fertig (nichts mehr offen) oder festgefahren (lange kein Fortschritt,
//     meist Tageskontingent aufgebraucht): Wake Lock freigeben - dann schaltet
//     das Gerät den Bildschirm nach seiner normalen Zeit selbst ab -, Anzeige
//     wird ganz schwarz, und in einer installierten App wird versucht, das
//     Fenster zu schließen (klappt nicht überall; Browser erlauben das oft
//     nicht - dann bleibt es eben einfach schwarz).

const POLL_MS = 15000;
// Kein Fortschritt so lange -> vermutlich Tageskontingent aufgebraucht.
const STALL_MS = 20 * 60 * 1000;
const FADE_TO_BLACK_MS = 60 * 1000;

const night = {
    active: false, finished: false, wakeLock: null, pollTimer: null, moveTimer: null, fadeTimer: null,
    startedAt: 0, startOpen: 0, lastOpen: 0, lastProgressAt: 0
};

Object.assign(app.utils, {
    // Reine Funktion (Unit-Test): 'done' | 'stalled' | 'running'
    nightPrepStatus({ open, lastProgressAt, now, stallMs = STALL_MS }) {
        if (open === 0) return 'done';
        if (now - lastProgressAt >= stallMs) return 'stalled';
        return 'running';
    },

    // Alles, was die Hintergrund-Vorbereitung gerade noch abarbeiten würde
    // (gleiche Zählung wie der "⏳ X im Hintergrund offen"-Hinweis).
    async countPregenOpen() {
        let n = app.utils.countMissingScans() + app.utils.countMissingVariants() + app.utils.countMissingBookQuiz()
            + (app.settings.backgroundPregenBirkenbihl ? app.utils.countMissingBirkenbihl() : 0);
        if (app.settings.backgroundPregenAudio) {
            try { n += await app.utils.countMissingAudio(); } catch (e) { console.error('KI-Stimmen-Zählung fehlgeschlagen:', e); }
        }
        return n;
    }
});

async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return false;
    try {
        night.wakeLock = await navigator.wakeLock.request('screen');
        night.wakeLock.addEventListener('release', () => { night.wakeLock = null; });
        return true;
    } catch (e) {
        console.error('Bildschirm kann nicht wach gehalten werden:', e);
        return false;
    }
}

function releaseWakeLock() {
    if (night.wakeLock) {
        night.wakeLock.release().catch(e => console.error('Wake Lock nicht freigegeben:', e));
        night.wakeLock = null;
    }
}

// Der Browser gibt den Wake Lock beim Verlassen der App selbst frei -
// beim Zurückkommen neu anfordern, solange der Nachtmodus noch arbeitet.
function onVisibility() {
    if (document.visibilityState === 'visible' && night.active && !night.finished && !night.wakeLock) {
        requestWakeLock();
        poll();
    }
}

function clearTimers() {
    clearInterval(night.pollTimer);
    clearInterval(night.moveTimer);
    clearTimeout(night.fadeTimer);
    night.pollTimer = night.moveTimer = night.fadeTimer = null;
}

async function poll() {
    if (!night.active || night.finished) return;
    const open = await app.utils.countPregenOpen();
    const now = Date.now();
    if (open < night.lastOpen) night.lastProgressAt = now;
    night.lastOpen = open;
    const status = app.utils.nightPrepStatus({ open, lastProgressAt: night.lastProgressAt, now });
    app.render.nightPrep({ open, done: Math.max(0, night.startOpen - open) });
    if (status !== 'running') finish(status);
}

function finish(reason) {
    night.finished = true;
    clearTimers();
    releaseWakeLock();
    const done = Math.max(0, night.startOpen - night.lastOpen);
    app.render.nightPrepFinished(reason, { done, open: night.lastOpen });
    // Nach einer Minute auch den Text ausblenden -> komplett schwarz.
    night.fadeTimer = setTimeout(() => app.render.nightPrepBlack(), FADE_TO_BLACK_MS);
    // Installierte App: Fenster schließen versuchen. In einem normalen
    // Browser-Tab (oder wenn der Browser es verweigert) passiert nichts.
    if (window.matchMedia?.('(display-mode: standalone)').matches) {
        setTimeout(() => { try { window.close(); } catch (e) { console.error('Fenster lässt sich nicht schließen:', e); } }, FADE_TO_BLACK_MS + 2000);
    }
}

Object.assign(app.actions, {
    async startNightPrep() {
        if (night.active) return;
        if (!app.settings.backgroundPregenEnabled) {
            if (!confirm('Dafür muss „Im Hintergrund vorbereiten“ eingeschaltet sein. Jetzt einschalten?\n\nEs verbraucht KI-Anfragen deines Tageskontingents.')) return;
            app.settingsConfig.toggleBackgroundPregen(true);
            const t = document.getElementById('toggleBackgroundPregen');
            if (t) t.checked = true;
        }
        const open = await app.utils.countPregenOpen();
        if (open === 0) {
            app.ui.toast('Es ist nichts offen - alles schon vorbereitet.', '✅');
            return;
        }
        Object.assign(night, { active: true, finished: false, startedAt: Date.now(), startOpen: open, lastOpen: open, lastProgressAt: Date.now() });
        app.tts.stop();
        if (app.state.autoReadActive) app.tts.stopAutoRead();

        const overlay = document.getElementById('nightPrepOverlay');
        overlay.classList.remove('hidden');
        // Vollbild blendet Statusleiste/Navigation aus (braucht den Fingertipp,
        // der gerade passiert ist). Nicht schlimm, wenn es nicht klappt.
        overlay.requestFullscreen?.().catch(() => {});
        const locked = await requestWakeLock();
        app.render.nightPrep({ open, done: 0, wakeLockOk: locked });
        document.addEventListener('visibilitychange', onVisibility);
        night.pollTimer = setInterval(poll, POLL_MS);
        night.moveTimer = setInterval(() => app.render.nightPrepMove(), 60000);
    },

    stopNightPrep() {
        if (!night.active) return;
        night.active = false;
        night.finished = false;
        clearTimers();
        releaseWakeLock();
        document.removeEventListener('visibilitychange', onVisibility);
        document.getElementById('nightPrepOverlay')?.classList.add('hidden');
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        if (app.state.currentView === 'lib') app.render.library();
        if (app.state.currentView === 'settings') app.render.settings();
    },

    // Fingertipp auf die schwarze Anzeige: nach dem Ende sofort schließen,
    // währenddessen erst nachfragen (ein versehentlicher Tipp in der Nacht
    // soll nicht alles abbrechen).
    nightPrepTap() {
        if (night.finished || confirm('Vorbereitung über Nacht beenden?')) app.actions.stopNightPrep();
    },

    isNightPrepActive() {
        return night.active;
    }
});
