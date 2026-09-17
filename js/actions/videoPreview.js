import { app } from '../core.js';

// ============ Film-Vorschau (Prüfstand für den Renderer-Kern) ============
// Teil 1 von Weg B, dritter Baustein: zeigt das, was js/render/cinema.js
// zeichnet, in Echtzeit auf einem sichtbaren Canvas - mit Abspielen,
// Springen und Formatwechsel.
//
// WARUM es das gibt und nicht gleich der Export: Der Renderer ist die
// Grundlage für Teil 2 (WebCodecs + MP4-Muxer). Ob Bildeinpassung,
// Zeilenumbruch, Ken-Burns und die Wort-Hervorhebung stimmen, sieht man
// nur, wenn man es anschauen kann - und zwar bevor Encoder und Muxer
// dazukommen. Genau die Empfehlung aus docs/KONZEPT-Video.md (Nachtrag in
// Abschnitt 4.6): "den Renderer sofort mit dem Seitenbereich bauen, aber
// als Erstes an einer einzelnen Seite testen".
//
// WICHTIG - was die Vorschau (noch) NICHT ist:
// - kein Ton. Der Ton kostet echtes Kontingent (jede Synthese wird
//   bezahlt), deshalb wird hier grundsätzlich nichts synthetisiert. Die
//   Zeiten sind aus der Textlänge geschätzt; der Zeitplan nimmt echte
//   Sprach-Segmente aber schon entgegen (siehe videoTimeline.js).
// - keine Datei. Kodieren und Muxen ist Teil 2.

// Anzeige höchstens 10x pro Sekunde aktualisieren - der Zeitbalken muss
// nicht mit 60 Bildern/Sekunde nachziehen, und jede DOM-Änderung im
// Animationsschritt kostet Zeit, die dem Zeichnen fehlt.
const UI_UPDATE_MS = 100;

Object.assign(app.actions, {
    // Öffnet die Vorschau für einen Seitenbereich. Ohne Bereich: ganzes
    // Buch. Eine einzelne Seite ist {fromIdx: i, toIdx: i} - gleicher Weg,
    // kein Sonderfall (so entschieden, siehe docs/KONZEPT-Video.md 4.6).
    async openVideoPreview(bookId, { fromIdx = null, toIdx = null } = {}) {
        const book = app.library[bookId];
        if (!book) { app.ui.toast('Buch nicht gefunden.', '❌'); return; }
        if (!book.pages.length) { app.ui.toast('Dieses Buch hat noch keine Seiten.', 'ℹ️'); return; }

        const overlay = document.getElementById('viewVideoPreview');
        const canvas = document.getElementById('videoPreviewCanvas');
        if (!overlay || !canvas) { app.ui.toast('Vorschau-Ansicht fehlt.', '❌'); return; }

        // Eine noch offene Vorschau erst sauber schließen - sonst bleiben
        // ihre dekodierten Bilder und ihr Animationsschritt hängen.
        if (app.state.videoPreview) this.closeVideoPreview();

        // Vorlesen anhalten: sonst redet die Stimme über den stummen Film.
        if (app.state.autoReadActive) app.tts.stopAutoRead();
        app.tts.stop();

        // Schriften abwarten, BEVOR das erste Mal gemessen wird - sonst
        // bricht der Untertitel mit den Maßen einer Ersatzschrift um.
        await app.cinema.fontsReady();

        const state = {
            bookId,
            fromIdx,
            toIdx,
            timeline: null,
            playing: false,
            timeSec: 0,
            rafId: null,
            lastTs: 0,
            lastUiTs: 0,
            canvas,
            ctx: null
        };
        app.state.videoPreview = state;

        this._fillVideoPreviewFormats();
        overlay.classList.remove('hidden');

        if (!this.rebuildVideoPreview()) {
            this.closeVideoPreview();
            return;
        }

        const title = document.getElementById('videoPreviewTitle');
        if (title) {
            const range = state.timeline.fromIdx === state.timeline.toIdx
                ? `Seite ${state.timeline.fromIdx + 1}`
                : `Seiten ${state.timeline.fromIdx + 1}-${state.timeline.toIdx + 1}`;
            title.innerText = `${book.title || 'Ohne Titel'} · ${range}`;
        }
    },

    // Baut den Zeitplan neu (beim Öffnen und bei jeder Umschaltung).
    // Gibt false zurück, wenn nichts Vorlesbares im Bereich liegt.
    rebuildVideoPreview() {
        const state = app.state.videoPreview;
        if (!state) return false;

        const includeDescription = !!document.getElementById('videoPreviewDesc')?.checked;
        const includeQuiz = !!document.getElementById('videoPreviewQuiz')?.checked;
        const formatId = document.getElementById('videoPreviewFormat')?.value
            || state.timeline?.formatId
            || app.cinema.defaultFormatId();

        let timeline;
        try {
            timeline = app.cinema.buildTimeline(state.bookId, {
                fromIdx: state.fromIdx === null ? 0 : state.fromIdx,
                toIdx: state.toIdx,
                includeDescription,
                includeQuiz,
                formatId
            });
        } catch (e) {
            console.error('Zeitplan für die Film-Vorschau fehlgeschlagen:', e);
            app.ui.toast(e.message || 'Vorschau nicht möglich.', '❌');
            return false;
        }

        if (!timeline.scenes.some(s => s.kind === 'page')) {
            app.ui.toast('Keine ausgelesenen Seiten in diesem Bereich - erst analysieren.', 'ℹ️');
            return false;
        }

        // Alte Bilder freigeben, bevor der neue Zeitplan eigene lädt.
        if (state.timeline) app.cinema.release(state.timeline);
        state.timeline = timeline;
        state.timeSec = 0;
        state.ctx = app.cinema.prepareCanvas(state.canvas, timeline.formatId);

        this._updateVideoPreviewHint();
        this._drawVideoPreviewFrame(true);
        this._updateVideoPreviewUi(true);
        return true;
    },

    closeVideoPreview() {
        const state = app.state.videoPreview;
        document.getElementById('viewVideoPreview')?.classList.add('hidden');
        if (!state) return;

        if (state.rafId) cancelAnimationFrame(state.rafId);
        // Freigeben ist hier Pflicht, nicht Kosmetik: dekodierte Seitenbilder
        // belegen mehrere MB und werden nicht abgeräumt, solange der
        // Renderer sie in seinem Zwischenspeicher hält.
        app.cinema.release(state.timeline);
        app.state.videoPreview = null;
    },

    toggleVideoPreviewPlay() {
        const state = app.state.videoPreview;
        if (!state || !state.timeline) return;

        if (state.playing) {
            state.playing = false;
            if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
        } else {
            // Am Ende stehend von vorn beginnen - sonst tut der Knopf nichts.
            if (state.timeSec >= state.timeline.totalDurationSec - 0.05) state.timeSec = 0;
            state.playing = true;
            state.lastTs = 0;
            state.rafId = requestAnimationFrame(ts => this._videoPreviewTick(ts));
        }
        this._updateVideoPreviewUi(true);
    },

    // Springen über den Zeitbalken (Wert 0-1000, siehe index.html).
    seekVideoPreview(value) {
        const state = app.state.videoPreview;
        if (!state || !state.timeline) return;
        const ratio = Math.max(0, Math.min(1, Number(value) / 1000));
        state.timeSec = ratio * state.timeline.totalDurationSec;
        state.lastTs = 0;
        this._drawVideoPreviewFrame(true);
        this._updateVideoPreviewUi(false);
    },

    setVideoPreviewFormat(formatId) {
        const state = app.state.videoPreview;
        if (!state || !state.timeline) return;
        app.cinema.setTimelineFormat(state.timeline, formatId);
        state.ctx = app.cinema.prepareCanvas(state.canvas, state.timeline.formatId);
        this._drawVideoPreviewFrame(true);
    },

    // ---------- Innereien ----------
    _videoPreviewTick(ts) {
        const state = app.state.videoPreview;
        if (!state || !state.playing) return;

        // Echtzeit über die tatsächlich verstrichene Zeit, nicht über eine
        // feste Bildrate: bei einem langsamen Gerät läuft der Film dann
        // ruckeliger, aber nicht in Zeitlupe (und die Hervorhebung bleibt
        // an der richtigen Stelle).
        if (state.lastTs) state.timeSec += (ts - state.lastTs) / 1000;
        state.lastTs = ts;

        if (state.timeSec >= state.timeline.totalDurationSec) {
            state.timeSec = state.timeline.totalDurationSec;
            state.playing = false;
            state.rafId = null;
            this._drawVideoPreviewFrame(false);
            this._updateVideoPreviewUi(true);
            return;
        }

        this._drawVideoPreviewFrame(false);

        if (ts - state.lastUiTs > UI_UPDATE_MS) {
            state.lastUiTs = ts;
            this._updateVideoPreviewUi(false);
        }

        state.rafId = requestAnimationFrame(next => this._videoPreviewTick(next));
    },

    // Zeichnet den Frame zum aktuellen Zeitpunkt. Die Bilder werden dabei
    // nur ANGEFORDERT, nicht abgewartet - ein await im Animationsschritt
    // würde die Wiedergabe anhalten. Bis das Bild da ist, zeigt der
    // Renderer "Bild wird geladen..." und der nächste Frame hat es dann.
    _drawVideoPreviewFrame(force) {
        const state = app.state.videoPreview;
        if (!state || !state.timeline || !state.ctx) return;

        const scene = app.cinema.sceneAt(state.timeline, state.timeSec);
        if (scene && !app.cinema.bitmapFor(scene) && !scene._bitmapFailed && !scene._bitmapPromise) {
            app.cinema.ensureBitmap(scene).then(() => {
                // Steht die Vorschau (pausiert oder gerade gesprungen), muss
                // der fertige Frame einmal nachgezeichnet werden - sonst
                // bleibt "Bild wird geladen..." stehen.
                if (app.state.videoPreview === state && !state.playing) this._drawVideoPreviewFrame(false);
            });
        }

        app.cinema.drawFrame(state.ctx, state.timeline, state.timeSec);

        if (scene !== state._lastScene || force) {
            state._lastScene = scene;
            // Bild der nächsten Szene im Hintergrund vorbereiten.
            app.cinema.prefetchNext(state.timeline, state.timeSec)
                .catch(e => console.warn('Vorbereiten des nächsten Bildes übersprungen:', e));
        }
    },

    _updateVideoPreviewUi(full) {
        const state = app.state.videoPreview;
        if (!state || !state.timeline) return;

        const total = state.timeline.totalDurationSec;
        const timeEl = document.getElementById('videoPreviewTime');
        if (timeEl) timeEl.innerText = `${formatTime(state.timeSec)} / ${formatTime(total)}`;

        const seek = document.getElementById('videoPreviewSeek');
        if (seek) seek.value = String(Math.round((total ? state.timeSec / total : 0) * 1000));

        if (full) {
            const btn = document.getElementById('videoPreviewPlayBtn');
            if (btn) {
                btn.innerText = state.playing ? '⏸️' : '▶️';
                btn.setAttribute('aria-label', state.playing ? 'Vorschau anhalten' : 'Vorschau abspielen');
            }
        }
    },

    _updateVideoPreviewHint() {
        const state = app.state.videoPreview;
        const hint = document.getElementById('videoPreviewHint');
        if (!state || !hint) return;

        const parts = [];
        parts.push(state.timeline.exact
            ? 'Zeiten aus echten Sprachaufnahmen.'
            : 'Stumme Vorschau, Längen aus der Textlänge geschätzt (Ton und Datei kommen mit dem Video-Export).');
        if (state.timeline.skipped.length) {
            parts.push(`${state.timeline.skipped.length} Seite/n übersprungen (noch nicht ausgelesen).`);
        }
        hint.innerText = parts.join(' ');
    },

    _fillVideoPreviewFormats() {
        const select = document.getElementById('videoPreviewFormat');
        if (!select || select.options.length) return;
        select.innerHTML = app.cinema.formats()
            .map(f => `<option value="${f.id}">${app.utils.sanitize(f.label)}</option>`)
            .join('');
        select.value = app.cinema.defaultFormatId();
    }
});

// mm:ss - Filme werden in Minuten gedacht, nicht in Sekunden.
function formatTime(sec) {
    const total = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
