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
    startedAt: 0, startOpen: 0, lastOpen: 0, lastProgressAt: 0,
    // NEU (v0.47.0-beta): läuft gerade die Buchatlas-Schleife? LeseZauber-
    // Teil (Hintergrund-Vorbereitung) mitzählen? (nein, wenn die Eltern das
    // Einschalten abgelehnt haben und nur Buchatlas-Aufträge laufen sollen)
    atlasLoopRunning: false, includeLz: true
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
    },

    // NEU (v0.47.0-beta): Reihenfolge "erst LeseZauber, dann Buchatlas" -
    // reine Entscheidung (Unit-Test). Buchatlas darf ran, sobald LeseZaubers
    // TEXT-Aufgaben (Gemini, gleiches Kontingent) erledigt sind. Offene
    // KI-Stimmen-Aufnahmen halten Buchatlas NICHT auf: die gehen an einen
    // anderen Anbieter und laufen in der eigenen Schleife parallel.
    atlasNightMayRun({ lzTextOpen, atlasOpen }) {
        return lzTextOpen === 0 && atlasOpen > 0;
    }
});

// NEU (v0.47.0-beta): nur LeseZaubers Gemini-Text-Aufgaben (ohne KI-Stimmen)
function countLzTextOpen() {
    return app.utils.countMissingScans() + app.utils.countMissingVariants() + app.utils.countMissingBookQuiz()
        + (app.settings.backgroundPregenBirkenbihl ? app.utils.countMissingBirkenbihl() : 0);
}

// NEU (v0.47.0-beta): alles, was der Nachtmodus abarbeitet - LeseZauber
// (falls einbezogen) plus vorgemerkte Buchatlas-Aufträge.
async function countNightOpen() {
    const lz = night.includeLz ? await app.utils.countPregenOpen() : 0;
    const lzText = night.includeLz ? countLzTextOpen() : 0;
    const atlas = app.atlas.utils.countNightOpen?.() || 0;
    return { total: lz + atlas, lzText, atlas };
}

// NEU (v0.47.0-beta): Buchatlas-Schleife - ein Schritt (Wiki-Block oder
// Seite) nach dem anderen, mit derselben Pause wie im Buchatlas selbst.
// Endet, wenn nichts mehr offen ist oder der Nachtmodus vorbei ist; poll()
// startet sie bei Bedarf neu.
async function runAtlasLoop() {
    if (night.atlasLoopRunning) return;
    night.atlasLoopRunning = true;
    const stillRunning = () => night.active && !night.finished;
    try {
        while (stillRunning()) {
            // Läuft gerade noch ein LeseZauber-Hintergrundschritt, abwarten
            if (app.state.apiBusy) {
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            let step = null;
            try {
                step = await app.atlas.night.runNext(() => !stillRunning());
            } catch (e) {
                // Kontingent/Netz: nicht abbrechen - die Stillstand-Erkennung
                // (STALL_MS) beendet die Nacht, wenn gar nichts mehr geht.
                console.warn('Nachtmodus/Buchatlas: Schritt fehlgeschlagen, neuer Versuch später.', e);
                app.state.pregenActivity = { ...(app.state.pregenActivity || {}), lastErrorAt: Date.now(), lastError: e?.message || String(e) };
                await new Promise(r => setTimeout(r, 60000));
                continue;
            }
            if (!step) break;
            if (step.usedApi && stillRunning()) {
                await new Promise(r => setTimeout(r, app.atlas.api.getPacingDelayMs()));
            }
        }
    } finally {
        night.atlasLoopRunning = false;
    }
}

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
    // NEU (v0.47.0-beta): inkl. Buchatlas; der startet erst nach LeseZauber
    const { total: open, lzText, atlas } = await countNightOpen();
    if (app.utils.atlasNightMayRun({ lzTextOpen: lzText, atlasOpen: atlas })) runAtlasLoop();
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
        // NEU (v0.47.0-beta): Buchatlas-Bibliothek muss geladen sein, bevor
        // ihre vorgemerkten Aufträge gezählt werden
        await app.atlas.dbOps.ready?.catch(() => {});
        const atlasOpen = app.atlas.utils.countNightOpen?.() || 0;
        night.includeLz = true;
        if (!app.settings.backgroundPregenEnabled) {
            // NEU (v0.47.0-beta): nur fragen, wenn in LeseZauber auch etwas
            // offen ist - reine Buchatlas-Nächte brauchen den Schalter nicht.
            const lzOpen = await app.utils.countPregenOpen();
            if (lzOpen > 0 && confirm('Für die LeseZauber-Aufgaben muss „Im Hintergrund vorbereiten“ eingeschaltet sein. Jetzt einschalten?\n\nEs verbraucht KI-Anfragen deines Tageskontingents.')) {
                app.settingsConfig.toggleBackgroundPregen(true);
                const t = document.getElementById('toggleBackgroundPregen');
                if (t) t.checked = true;
            } else if (atlasOpen > 0) {
                night.includeLz = false; // nur die Buchatlas-Aufträge
            } else {
                if (lzOpen === 0) app.ui.toast('Es ist nichts offen - alles schon vorbereitet.', '✅');
                return;
            }
        }
        const { total: open } = await countNightOpen();
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
        // NEU (v0.47.0-beta): sofort einmal prüfen, damit Buchatlas nicht
        // erst nach 15 s loslegt, wenn LeseZauber nichts offen hat
        poll();
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
        // NEU (v0.47.0-beta): Buchatlas-Ansichten auf den neuen Stand bringen
        if (app.state.currentView?.startsWith('atlas')) app.atlas.nav.show(app.state.currentView);
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
