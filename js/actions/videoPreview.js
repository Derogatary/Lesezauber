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
// - kein NEUER Ton. Jede Synthese kostet echtes Kontingent, deshalb wird
//   hier NIE synthetisiert. Liegt der nötige Ton (Seiten UND ggf. die
//   Titelkarten-Ansage, siehe _buildBookIntro) aber schon vollständig im
//   ttsCache - weil vorher schon einmal vorgelesen oder exportiert wurde -
//   spielt die Vorschau ihn ab (_collectCachedAudio/_buildPreviewTrack
//   unten). Fehlt auch nur ein Häppchen, bleibt es beim stummen
//   Textlängen-Schätzwert wie bisher (siehe videoTimeline.js).
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
            ctx: null,
            // NEU (Ton in der Vorschau, siehe docs/KONZEPT-Video.md "Noch
            // offen"): nur gesetzt, wenn wirklich Ton läuft - siehe
            // rebuildVideoPreview()/_teardownPreviewAudio() unten.
            audio: null,
            audioUrl: null,
            hasAudio: false
        };
        app.state.videoPreview = state;

        this._fillVideoPreviewFormats();
        overlay.classList.remove('hidden');

        if (!(await this.rebuildVideoPreview())) {
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
    // NEU: async, weil jetzt zusätzlich (kostenlos) im ttsCache nachgesehen
    // wird, ob für den Bereich bereits echter Ton vorliegt (siehe
    // _collectCachedAudio unten und docs/KONZEPT-Video.md "Noch offen").
    async rebuildVideoPreview() {
        const state = app.state.videoPreview;
        if (!state) return false;

        // FIX: rebuildVideoPreview() ist jetzt async und wartet auf echte
        // Dinge (Cache-Lesen, Ton-Zusammenbau) - eine laufende Wiedergabe
        // (eigener rAF-Zeitschritt) würde in der Zwischenzeit ungebremst
        // weiterlaufen und nach dem Umbau mit einer veralteten lastTs einen
        // Sprung im Zeitbalken verursachen. Deshalb hier anhalten und danach
        // über toggleVideoPreviewPlay() sauber neu starten (das synchronisiert
        // auch den Ton neu).
        const wasPlaying = state.playing;
        if (state.playing) {
            state.playing = false;
            if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
            if (state.hasAudio && state.audio) state.audio.pause();
        }

        const includeDescription = !!document.getElementById('videoPreviewDesc')?.checked;
        const includeQuiz = !!document.getElementById('videoPreviewQuiz')?.checked;
        const formatId = document.getElementById('videoPreviewFormat')?.value
            || state.timeline?.formatId
            || app.cinema.defaultFormatId();
        const fromIdx = state.fromIdx === null ? 0 : state.fromIdx;

        // 1. Trockenlauf ohne Ton, nur um zu wissen, welche Seiten/Karten
        // überhaupt im Bereich liegen (für den Cache-Blick unten).
        let dry;
        try {
            dry = app.cinema.buildTimeline(state.bookId, {
                fromIdx, toIdx: state.toIdx, includeDescription, includeQuiz, formatId
            });
        } catch (e) {
            console.error('Zeitplan für die Film-Vorschau fehlgeschlagen:', e);
            app.ui.toast(e.message || 'Vorschau nicht möglich.', '❌');
            return false;
        }

        if (!dry.scenes.some(s => s.kind === 'page')) {
            app.ui.toast('Keine ausgelesenen Seiten in diesem Bereich - erst analysieren.', 'ℹ️');
            return false;
        }

        // 2. NUR aus dem ttsCache lesen (kein neuer Synthese-Aufruf, siehe
        // docs/KONZEPT-Video.md "Noch offen") - liegt schon alles vor, bekommt
        // die Vorschau echten Ton, sonst bleibt sie wie bisher stumm.
        const { segmentsByPage, titleAudio } = await this._collectCachedAudio(dry);

        let timeline;
        try {
            timeline = app.cinema.buildTimeline(state.bookId, {
                fromIdx, toIdx: state.toIdx, includeDescription, includeQuiz, formatId,
                segmentsByPage, titleAudio
            });
        } catch (e) {
            console.error('Zeitplan für die Film-Vorschau fehlgeschlagen:', e);
            app.ui.toast(e.message || 'Vorschau nicht möglich.', '❌');
            return false;
        }

        // Alte Bilder/alten Ton freigeben, bevor der neue Zeitplan eigene lädt.
        if (state.timeline) app.cinema.release(state.timeline);
        this._teardownPreviewAudio(state);
        state.timeline = timeline;
        state.timeSec = 0;
        state.ctx = app.cinema.prepareCanvas(state.canvas, timeline.formatId);

        // NEU: nur bei VOLLSTÄNDIG echtem Ton (timeline.exact) auf
        // Audio-Wiedergabe umschalten - ein Mix aus Ton und Stille innerhalb
        // derselben Seite klänge kaputt, siehe _buildPreviewTrack().
        if (timeline.exact) {
            try {
                const wav = await this._buildPreviewTrack(timeline);
                if (wav) {
                    state.audioUrl = URL.createObjectURL(wav);
                    state.audio = new Audio(state.audioUrl);
                    state.audio.preload = 'auto';
                    state.hasAudio = true;
                }
            } catch (e) {
                console.error('Ton-Spur für die Vorschau konnte nicht gebaut werden:', e);
            }
        }

        this._updateVideoPreviewHint();
        this._updateVideoPreviewExport();
        this._drawVideoPreviewFrame(true);
        this._updateVideoPreviewUi(true);

        // War die Wiedergabe vor dem Umbau aktiv (siehe FIX oben), jetzt
        // sauber neu starten - state.timeSec steht auf 0, das ist also ein
        // normaler Start, kein Sonderfall.
        if (wasPlaying) this.toggleVideoPreviewPlay();

        return true;
    },

    // Sammelt Sprach-Häppchen NUR aus dem ttsCache - ruft absichtlich NIE
    // einen Anbieter auf (siehe cacheOnly-Parameter in js/ttsNeural.js). Ein
    // Fehltreffer bleibt einfach aus (die Seite/Karte läuft dann geschätzt
    // und stumm mit, wie bisher).
    async _collectCachedAudio(dry) {
        const segmentsByPage = {};
        const pages = [...new Set(dry.scenes.filter(s => s.kind === 'page' || s.kind === 'quiz').map(s => s.pageIdx))];

        for (const pageIdx of pages) {
            try {
                segmentsByPage[pageIdx] = await app.ttsNeural.renderPageSegments(dry.bookId, pageIdx, {
                    includeDescription: dry.includeDescription,
                    includeQuiz: dry.includeQuiz,
                    personaId: dry.personaId,
                    cacheOnly: true
                });
            } catch (e) {
                console.warn(`Cache-Blick für Seite ${pageIdx + 1} übersprungen:`, e);
            }
        }

        let titleAudio = null;
        if (dry.scenes.some(s => s.kind === 'title')) {
            const book = app.library[dry.bookId];
            const intro = book && app.tts._buildBookIntro(book);
            if (intro) {
                try {
                    titleAudio = await app.ttsNeural.renderAudio(intro, { personaId: dry.personaId, cacheOnly: true });
                } catch (e) {
                    console.warn('Cache-Blick für die Titelkarten-Ansage übersprungen:', e);
                }
            }
        }

        return { segmentsByPage, titleAudio };
    },

    // Fügt die Ton-Häppchen aller Szenen zu EINER Tonspur zusammen, exakt an
    // ihrer scene.startSec platziert (Stille dazwischen/davor/danach) - genau
    // wie es der fertige Export in js/actions/videoExport.js frameweise tut,
    // hier aber einmalig vorab gerendert. Nur dadurch kann die Wiedergabe
    // an EIN <audio>-Element gehängt werden (siehe docs/KONZEPT-Video.md
    // "Noch offen": "Wiedergabe an audio.currentTime hängen statt an die
    // eigene Uhr") - mit einem Blob pro Szene bräuchte es stattdessen eine
    // eigene Umschaltlogik zwischen den einzelnen Häppchen.
    async _buildPreviewTrack(timeline) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;

        const withAudio = timeline.scenes.filter(s => s.audio && s.audio.blob);
        if (!withAudio.length) return null;

        const ctx = new AudioCtx();
        try {
            const decoded = [];
            for (const scene of withAudio) {
                try {
                    const arrayBuffer = await scene.audio.blob.arrayBuffer();
                    decoded.push({ scene, buffer: await ctx.decodeAudioData(arrayBuffer) });
                } catch (e) {
                    console.warn('Ton einer Szene für die Vorschau nicht dekodierbar:', e);
                }
            }
            if (!decoded.length) return null;

            const sampleRate = ctx.sampleRate;
            const numChannels = decoded.reduce((max, d) => Math.max(max, d.buffer.numberOfChannels), 1);
            const totalSamples = Math.max(1, Math.round(timeline.totalDurationSec * sampleRate));

            const offlineCtx = new OfflineAudioContext(numChannels, totalSamples, sampleRate);
            decoded.forEach(({ scene, buffer }) => {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(offlineCtx.destination);
                source.start(scene.startSec);
            });

            const rendered = await offlineCtx.startRendering();
            // Wiederverwendet statt dupliziert: derselbe kleine PCM16-WAV-
            // Schreiber wie beim Hörbuch-Export (js/actions/audiobookExport.js).
            return this._audioBufferToWav(rendered);
        } finally {
            ctx.close();
        }
    },

    // Räumt eine evtl. vorhandene Ton-Spur weg (neuer Zeitplan, Vorschau
    // geschlossen) - Pflicht, nicht Kosmetik: eine unfreigegebene Object-URL
    // hält den ganzen WAV-Puffer im Speicher fest.
    _teardownPreviewAudio(state) {
        if (!state) return;
        if (state.audio) {
            state.audio.pause();
            state.audio.removeAttribute('src');
            state.audio.load();
            state.audio = null;
        }
        if (state.audioUrl) {
            URL.revokeObjectURL(state.audioUrl);
            state.audioUrl = null;
        }
        state.hasAudio = false;
    },

    // Startet den Video-Export für genau das, was die Vorschau gerade zeigt
    // (Seitenbereich, Format, zugeschaltete Häppchen). Der Export selbst
    // liegt in js/actions/videoExport.js.
    async exportVideoFromPreview() {
        const state = app.state.videoPreview;
        if (!state || !state.timeline) return;

        // Wiedergabe anhalten: das Kodieren braucht die Rechenzeit, und ein
        // im Hintergrund weiterlaufender Animationsschritt würde nur bremsen.
        if (state.playing) this.toggleVideoPreviewPlay();

        const timeline = state.timeline;
        await this.exportVideo(timeline.bookId, {
            fromIdx: timeline.fromIdx,
            toIdx: timeline.toIdx,
            formatId: timeline.formatId,
            includeDescription: timeline.includeDescription,
            includeQuiz: timeline.includeQuiz
        });
    },

    closeVideoPreview() {
        const state = app.state.videoPreview;
        document.getElementById('viewVideoPreview')?.classList.add('hidden');
        if (!state) return;

        if (state.rafId) cancelAnimationFrame(state.rafId);
        this._teardownPreviewAudio(state);
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
            if (state.hasAudio && state.audio) state.audio.pause();
        } else {
            // Am Ende stehend von vorn beginnen - sonst tut der Knopf nichts.
            if (state.timeSec >= state.timeline.totalDurationSec - 0.05) state.timeSec = 0;
            state.playing = true;
            state.lastTs = 0;
            if (state.hasAudio && state.audio) {
                // NEU: Uhr hängt jetzt an audio.currentTime (siehe
                // _videoPreviewTick) - vor dem Start also auf die aktuelle
                // Bildposition synchronisieren, nicht umgekehrt.
                state.audio.currentTime = state.timeSec;
                state.audio.play().catch(e => {
                    // z.B. Autoplay-Sperre - die Vorschau bleibt trotzdem
                    // nutzbar, nur eben wieder stumm mit der eigenen Uhr.
                    console.error('Ton in der Vorschau nicht abspielbar:', e);
                    state.hasAudio = false;
                });
            }
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
        if (state.hasAudio && state.audio) state.audio.currentTime = state.timeSec;
        this._drawVideoPreviewFrame(true);
        this._updateVideoPreviewUi(false);
    },

    setVideoPreviewFormat(formatId) {
        const state = app.state.videoPreview;
        if (!state || !state.timeline) return;
        app.cinema.setTimelineFormat(state.timeline, formatId);
        state.ctx = app.cinema.prepareCanvas(state.canvas, state.timeline.formatId);
        // Die Größenschätzung auf dem Export-Knopf hängt am Format.
        this._updateVideoPreviewExport();
        this._drawVideoPreviewFrame(true);
    },

    // ---------- Innereien ----------
    _videoPreviewTick(ts) {
        const state = app.state.videoPreview;
        if (!state || !state.playing) return;

        if (state.hasAudio && state.audio) {
            // NEU (Ton in der Vorschau): die Uhr hängt an audio.currentTime
            // statt an der eigenen Zeitdifferenz (so im Konzept gefordert) -
            // Bild und Ton laufen dadurch nie auseinander, ganz ohne eigene
            // Drift-Korrektur. audio.ended kommt hier meist etwas VOR dem
            // Timeline-Ende (die letzte Karte/Pause hat keinen eigenen Ton
            // mehr), deshalb bestimmt weiterhin totalDurationSec das Ende.
            state.timeSec = Math.min(state.audio.currentTime, state.timeline.totalDurationSec);
        } else {
            // Echtzeit über die tatsächlich verstrichene Zeit, nicht über
            // eine feste Bildrate: bei einem langsamen Gerät läuft der Film
            // dann ruckeliger, aber nicht in Zeitlupe (und die Hervorhebung
            // bleibt an der richtigen Stelle).
            if (state.lastTs) state.timeSec += (ts - state.lastTs) / 1000;
        }
        state.lastTs = ts;

        if (state.timeSec >= state.timeline.totalDurationSec) {
            state.timeSec = state.timeline.totalDurationSec;
            state.playing = false;
            state.rafId = null;
            if (state.hasAudio && state.audio) state.audio.pause();
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
        // NEU: drei statt zwei Zustände - vollständig echter Ton (aus dem
        // Zwischenspeicher, kostet nichts extra), exakte Zeiten aber ohne
        // Ton (Cache unvollständig), oder geschätzt+stumm wie ursprünglich.
        if (state.hasAudio) {
            parts.push('Ton aus dem Zwischenspeicher - so klingt später auch der fertige Film.');
        } else if (state.timeline.exact) {
            parts.push('Zeiten aus echten Sprachaufnahmen, aber (noch) ohne Ton in der Vorschau.');
        } else {
            parts.push('Vorschau ohne Ton, Längen aus der Textlänge geschätzt - die Videodatei bekommt echten Ton und exakte Zeiten.');
        }
        if (state.timeline.skipped.length) {
            parts.push(`${state.timeline.skipped.length} Seite/n übersprungen (noch nicht ausgelesen).`);
        }
        // Geht der Export gerade nicht (fremdes Buch, kein WebCodecs, keine
        // KI-Stimme), steht der Grund hier - ein Knopf, der einfach fehlt,
        // wäre für den Betreiber nicht erklärbar.
        const blocker = app.actions.videoExportBlocker(app.library[state.bookId]);
        if (blocker) parts.push(`Kein Video-Export: ${blocker}`);
        hint.innerText = parts.join(' ');
    },

    _updateVideoPreviewExport() {
        const state = app.state.videoPreview;
        const btn = document.getElementById('videoPreviewExportBtn');
        if (!state || !btn) return;

        const blocked = !!app.actions.videoExportBlocker(app.library[state.bookId]);
        btn.classList.toggle('hidden', blocked);

        const label = document.getElementById('videoPreviewExportLabel');
        if (label && !blocked) {
            // Die ungefähre Größe gleich auf den Knopf: ein Buch-Film mit
            // 200 MB soll niemanden überraschen (die Rückfrage vor dem Start
            // nennt sie noch einmal, aus derselben Rechnung).
            const bytes = app.actions.estimateVideoBytes(state.timeline.formatId, state.timeline.totalDurationSec);
            const mb = Math.max(1, Math.round(bytes / 1_000_000));
            label.innerText = `Als Videodatei speichern (ca. ${mb} MB)`;
        }
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
