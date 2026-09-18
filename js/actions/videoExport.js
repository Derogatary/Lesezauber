import { app } from '../core.js';

// ============ Video-Export: Weg B (Canvas + WebCodecs + MP4-Muxer) ============
// Teil 2 zum Renderer-Kern aus js/render/cinema.js. Hier wird nichts
// gezeichnet und nichts geplant - hier wird kodiert und in eine Datei
// geschrieben:
//
//   app.cinema.buildTimeline()  ->  was wann im Bild ist (+ Tonspur je Szene)
//   app.cinema.drawFrame()      ->  ein Frame auf den Canvas
//   VideoEncoder/AudioEncoder   ->  H.264/AAC-Päckchen  (dieses Modul)
//   mp4-muxer                   ->  fertige MP4-Datei   (dieses Modul)
//
// Entscheidungslage (docs/KONZEPT-Video.md, Abschnitte 4.3/4.6): Weg A
// (MediaRecorder, Echtzeit-Aufnahme mit sichtbarem Tab) und Weg C
// (ffmpeg.wasm, 25-30 MB Zusatz-Download, braucht auf GitHub Pages einen
// Service-Worker-Trick) sind verworfen. Nicht neu aufrollen.
//
// Der Export gibt es laut Abschnitt 7 NUR für selbst geschriebene Bücher
// (`origin: 'authored'`, siehe app.utils.resolveBookOrigin) - ein
// exportiertes und weitergegebenes Video eines abfotografierten fremden
// Kinderbuchs wäre eine Vervielfältigung. Die Film-Vorschau bleibt für alle
// Bücher offen, die ist wie der Kino-Modus reines Vorlesen zu Hause.

const FPS = 25;
// Schlüsselbild alle 2 Sekunden: ohne regelmäßige Schlüsselbilder kann ein
// Player im Film nicht springen.
const KEYFRAME_SEC = 2;
// Bits pro Bildpunkt und Frame. 0.05 ergibt bei 1080x1920/25fps ca.
// 2,6 Mbit/s - für ein weitgehend stehendes Bild mit langsamem Zoom reichlich.
const BITS_PER_PIXEL_PER_FRAME = 0.05;
const MIN_VIDEO_BITRATE = 1_200_000;
const MAX_VIDEO_BITRATE = 6_000_000;

// Ton: Sprache, mono - Stereo wäre bei einer Vorlesestimme nur doppelte
// Datenmenge ohne Gewinn.
const AUDIO_SAMPLE_RATE = 48000;
const AUDIO_CHANNELS = 1;
const AUDIO_BITRATE = 64_000;
// 0,2 Sekunden je Ton-Päckchen. Klein genug, damit Bild und Ton beim
// Verschachteln nicht weit auseinanderlaufen, groß genug, um den Encoder
// nicht mit Kleinkram zu überschwemmen.
const AUDIO_CHUNK_SAMPLES = AUDIO_SAMPLE_RATE / 5;

// Wie viele Päckchen der Encoder maximal ungefragt aufstauen darf. Ohne
// diese Bremse (Backpressure) füllt die Schleife den Speicher schneller,
// als der Encoder ihn leert - siehe docs/KONZEPT-Video.md 4.5
// ("Arbeitsspeicher").
const MAX_QUEUE = 8;

// Codec-Leiter. NIEMALS fest verdrahten, immer prüfen (Konzept 4.2): erst
// das, was überall abspielbar ist (H.264 + AAC im MP4-Container), dann
// Rückfälle. VP9/AV1 im MP4 läuft auf dem eigenen Gerät und in VLC, aber
// nicht zuverlässig in WhatsApp oder der iOS-Fotomediathek - deshalb wird
// dieser Fall der Nutzerin ausdrücklich gemeldet.
const VIDEO_CANDIDATES = [
    { codec: 'avc1.42E028', muxer: 'avc', label: 'H.264', universal: true },
    { codec: 'avc1.4D0028', muxer: 'avc', label: 'H.264', universal: true },
    { codec: 'avc1.42E01E', muxer: 'avc', label: 'H.264', universal: true },
    { codec: 'vp09.00.10.08', muxer: 'vp9', label: 'VP9', universal: false },
    { codec: 'av01.0.04M.08', muxer: 'av1', label: 'AV1', universal: false }
];
const AUDIO_CANDIDATES = [
    { codec: 'mp4a.40.2', muxer: 'aac', label: 'AAC', universal: true },
    { codec: 'opus', muxer: 'opus', label: 'Opus', universal: false }
];

// Ordner im Origin Private File System, in den die Datei beim Kodieren
// wächst. Ein 8-Minuten-Film hat laut Konzept 120-240 MB - das als Blob im
// Arbeitsspeicher zu halten ist auf dem Handy riskant.
const OPFS_DIR = 'videoexport';

// mp4-muxer (MIT, js/vendor/mp4muxer/) wird erst beim ersten Export geladen -
// wie PDF.js und JSZip. 69 KB sollen nicht jeden App-Start belasten.
// Vendor-Dateien NIE bearbeiten, nur austauschen.
let muxerLib = null;
async function loadMuxerLib() {
    if (!muxerLib) muxerLib = await import('../vendor/mp4muxer/mp4-muxer.mjs');
    return muxerLib;
}

Object.assign(app.actions, {
    // Warum der Export gerade NICHT geht - als kurzer Satz für die
    // Oberfläche, oder null wenn alles passt. Bewusst synchron, damit
    // app.render.* damit Knöpfe ein-/ausblenden kann; die Codec-Prüfung
    // (asynchron) läuft erst beim Start.
    videoExportBlocker(book) {
        if (!book) return 'Buch nicht gefunden.';
        if (app.utils.resolveBookOrigin(book) !== 'authored') {
            return 'Videodatei nur bei selbst geschriebenen Büchern (SchreibZauber) - bei abfotografierten Büchern wäre die Weitergabe eine Vervielfältigung.';
        }
        if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
            return 'Dieser Browser kann (noch) keine Videos kodieren. Chrome, Edge oder ein neueres Safari können es.';
        }
        if (!app.ttsNeural.isActive()) {
            return 'Der Film braucht eine KI-Stimme (Einstellungen) - die Gerätestimme kann keine Tonspur herausgeben.';
        }
        return null;
    },

    // Grobe Dateigröße in Bytes. Eine Stelle für beide Anzeigen (Knopf in
    // der Vorschau und Rückfrage vor dem Start) - zwei Formeln würden
    // garantiert auseinanderlaufen, und gerade bei einem 200-MB-Film ist
    // eine falsche Zahl das Ärgerlichste.
    estimateVideoBytes(formatId, durationSec) {
        const fmt = app.cinema.format(formatId);
        return Math.round((bitrateFor(fmt) + AUDIO_BITRATE) / 8 * Math.max(0, durationSec || 0));
    },

    // Der ganze Export. Bereich [fromIdx, toIdx]; eine einzelne Seite ist
    // [i, i] und läuft durch genau denselben Code.
    async exportVideo(bookId, { fromIdx = 0, toIdx = null, formatId = null, includeDescription = false, includeQuiz = false } = {}) {
        const book = app.library[bookId];
        const blocker = this.videoExportBlocker(book);
        if (blocker) { app.ui.toast(blocker, '🚫'); return; }

        if (app.state.apiBusy) { app.ui.toast('Es läuft schon etwas - bitte kurz warten.', '⏳'); return; }

        const fmt = app.cinema.format(formatId);
        const support = await probeCodecs(fmt);
        if (!support.video) {
            app.ui.toast('Dieser Browser kann in dieser Auflösung kein Video kodieren.', '🚫');
            return;
        }
        if (!support.audio) {
            app.ui.toast('Dieser Browser kann keine Tonspur kodieren - ein Film ohne Ton wäre sinnlos.', '🔇');
            return;
        }

        // 1. Trockenlauf: Zeitplan mit geschätzten Längen, nur um Dauer und
        // Dateigröße VOR dem Start nennen zu können (kostet nichts).
        let dry;
        try {
            dry = app.cinema.buildTimeline(bookId, { fromIdx, toIdx, formatId: fmt.id, includeDescription, includeQuiz });
        } catch (e) {
            console.error('Zeitplan für den Video-Export fehlgeschlagen:', e);
            app.ui.toast(e.message || 'Export nicht möglich.', '❌');
            return;
        }
        if (!dry.scenes.some(s => s.kind === 'page')) {
            app.ui.toast('Keine ausgelesenen Seiten in diesem Bereich - erst analysieren.', 'ℹ️');
            return;
        }

        const videoBitrate = bitrateFor(fmt);
        const estMb = Math.max(1, Math.round(this.estimateVideoBytes(fmt.id, dry.totalDurationSec) / 1_000_000));
        const single = dry.fromIdx === dry.toIdx;
        const sizeNote = single
            ? 'Das passt zum Verschicken.'
            : 'Ein ganzer Buch-Film ist zu groß für E-Mail oder Messenger - zum Verschicken besser eine einzelne Seite exportieren.';
        const codecNote = support.universal
            ? ''
            : `\n\nAchtung: Dieser Browser kann kein H.264/AAC. Die Datei wird mit ${support.video.label}/${support.audio.label} erzeugt - sie läuft hier und in VLC, aber nicht sicher auf anderen Geräten.`;

        if (!confirm(`Film erstellen?\n\n${dry.pageCount} Seite(n), ca. ${formatDuration(dry.totalDurationSec)} lang, ungefähr ${estMb} MB.\n${sizeNote}${codecNote}`)) return;

        app.state.cancelAnalysis = false;
        // Wie beim Hörbuch-Export: keine Hintergrund-Vorbereitung
        // dazwischenfunken lassen, sonst laufen zwei Ketten von API-Aufrufen
        // gegen dieselben Limits.
        app.state.apiBusy = true;
        app.ui.showLoader('Film wird erstellt...', 'Ton wird vorbereitet');

        let timeline = null;
        try {
            // 2. Ton holen. renderPageSegments() nimmt zuerst den ttsCache -
            // schon vorgelesene Seiten kosten also nichts (bei 120 Seiten
            // wäre alles andere richtig teuer).
            const pages = [...new Set(dry.scenes.filter(s => s.kind === 'page' || s.kind === 'quiz').map(s => s.pageIdx))];
            const { segmentsByPage, failed, titleAudio } = await collectAudio(bookId, pages, dry);
            if (app.state.cancelAnalysis) { app.ui.toast('Film abgebrochen.', '🚫'); return; }

            // 3. Zeitplan neu bauen - jetzt mit echten Längen und
            // Wort-Zeitpunkten, dadurch sitzt die Hervorhebung auf dem Wort.
            // titleAudio: die Metadaten-Ansage für die Titelkarte, falls eine
            // vorliegt (siehe collectAudio unten) - vorher lief sie stumm mit
            // fester Länge (docs/KONZEPT-Video.md, "Noch offen").
            timeline = app.cinema.buildTimeline(bookId, {
                fromIdx, toIdx, formatId: fmt.id, includeDescription, includeQuiz, segmentsByPage, titleAudio
            });
            if (!timeline.scenes.some(s => s.kind === 'page')) {
                app.ui.toast('Kein Ton erzeugt - ist eine KI-Stimme eingerichtet?', '❌');
                return;
            }

            // 4. Schriften abwarten, sonst bricht der Untertitel mit den
            // Maßen einer Ersatzschrift um (lautlos, siehe cinema.js).
            await app.cinema.fontsReady();

            const file = await encodeTimeline(timeline, fmt, support, videoBitrate);
            if (!file) { app.ui.toast('Film abgebrochen.', '🚫'); return; }

            downloadFile(file, buildFileName(book, timeline));
            const notes = [];
            if (failed.length) notes.push(`${failed.length} Seite(n) ohne Ton übersprungen`);
            if (!support.universal) notes.push(`${support.video.label}/${support.audio.label} statt H.264/AAC`);
            app.ui.toast(`Film fertig${notes.length ? ' (' + notes.join(', ') + ')' : ''}`, '🎞️');
        } catch (e) {
            console.error('Video-Export fehlgeschlagen:', e);
            app.ui.toast(e.message || 'Video-Export fehlgeschlagen.', '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
            // Dekodierte Seitenbilder freigeben (mehrere MB je Bild).
            if (timeline) app.cinema.release(timeline);
        }
    }
});

// ---------------- Codec-Prüfung ----------------
const probeCache = new Map();

async function probeCodecs(fmt) {
    if (probeCache.has(fmt.id)) return probeCache.get(fmt.id);

    const result = { video: null, audio: null, universal: false };
    if (typeof VideoEncoder !== 'undefined') {
        for (const candidate of VIDEO_CANDIDATES) {
            if (await isVideoOk(candidate, fmt)) { result.video = candidate; break; }
        }
    }
    if (typeof AudioEncoder !== 'undefined') {
        for (const candidate of AUDIO_CANDIDATES) {
            if (await isAudioOk(candidate)) { result.audio = candidate; break; }
        }
    }
    result.universal = !!(result.video?.universal && result.audio?.universal);
    probeCache.set(fmt.id, result);
    return result;
}

async function isVideoOk(candidate, fmt) {
    try {
        const support = await VideoEncoder.isConfigSupported(videoConfig(candidate, fmt, bitrateFor(fmt)));
        return !!support.supported;
    } catch (e) {
        // isConfigSupported wirft bei unbekannten Codec-Zeichenketten - das
        // ist hier ein normales "kann er nicht", kein Fehler.
        console.warn(`Video-Codec ${candidate.codec} nicht prüfbar:`, e.message);
        return false;
    }
}

async function isAudioOk(candidate) {
    try {
        const support = await AudioEncoder.isConfigSupported(audioConfig(candidate));
        return !!support.supported;
    } catch (e) {
        console.warn(`Ton-Codec ${candidate.codec} nicht prüfbar:`, e.message);
        return false;
    }
}

function videoConfig(candidate, fmt, bitrate) {
    const config = {
        codec: candidate.codec,
        width: fmt.width,
        height: fmt.height,
        bitrate,
        framerate: FPS,
        latencyMode: 'quality'
    };
    // Der Muxer erwartet H.264 im AVCC-Format (Länge statt Startcode);
    // andere Codecs kennen diese Option nicht.
    if (candidate.muxer === 'avc') config.avc = { format: 'avc' };
    return config;
}

function audioConfig(candidate) {
    return {
        codec: candidate.codec,
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfChannels: AUDIO_CHANNELS,
        bitrate: AUDIO_BITRATE
    };
}

function bitrateFor(fmt) {
    const raw = Math.round(fmt.width * fmt.height * FPS * BITS_PER_PIXEL_PER_FRAME);
    return Math.max(MIN_VIDEO_BITRATE, Math.min(MAX_VIDEO_BITRATE, raw));
}

// ---------------- Ton einsammeln ----------------
async function collectAudio(bookId, pageIndices, dry) {
    const segmentsByPage = {};
    const failed = [];

    for (let n = 0; n < pageIndices.length; n++) {
        if (app.state.cancelAnalysis) break;
        const pageIdx = pageIndices[n];
        app.ui.showLoader('Film wird erstellt...', `Ton für Seite ${n + 1} von ${pageIndices.length}`);
        try {
            segmentsByPage[pageIdx] = await app.ttsNeural.renderPageSegments(bookId, pageIdx, {
                includeDescription: dry.includeDescription,
                includeQuiz: dry.includeQuiz,
                personaId: dry.personaId
            });
        } catch (e) {
            // Eine einzelne Seite ohne Ton soll den Film nicht abbrechen -
            // sie läuft dann stumm mit geschätzter Länge mit, wird aber
            // gemeldet (gleiche Haltung wie im Hörbuch-Export).
            console.error(`Video-Export: kein Ton für Seite ${pageIdx + 1}:`, e);
            failed.push(pageIdx);
        }
    }

    // NEU: Metadaten-Ansage für die Titelkarte (siehe app.tts._buildBookIntro
    // und docs/KONZEPT-Video.md, "Noch offen") - nur wenn der Buch-Film
    // überhaupt eine Titelkarte hat und ein erkannter Titel vorliegt. Ein
    // Fehlschlag lässt die Karte einfach wie bisher stumm laufen, statt den
    // ganzen Export abzubrechen (dieselbe Haltung wie bei einer einzelnen
    // Seite ohne Ton oben).
    let titleAudio = null;
    if (!app.state.cancelAnalysis && dry.scenes.some(s => s.kind === 'title')) {
        const book = app.library[bookId];
        const intro = book && app.tts._buildBookIntro(book);
        if (intro) {
            app.ui.showLoader('Film wird erstellt...', 'Ansage für die Titelkarte');
            try {
                titleAudio = await app.ttsNeural.renderAudio(intro, { personaId: dry.personaId });
            } catch (e) {
                console.error('Video-Export: Ansage für die Titelkarte fehlgeschlagen:', e);
            }
        }
    }

    return { segmentsByPage, failed, titleAudio };
}

// ---------------- Kodieren ----------------
// Liefert die fertige Datei (File/Blob) oder null bei Abbruch.
async function encodeTimeline(timeline, fmt, support, videoBitrate) {
    const { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } = await loadMuxerLib();

    const totalFrames = Math.max(1, Math.ceil(timeline.totalDurationSec * FPS));
    const surface = app.cinema._surface(fmt.width, fmt.height);
    const ctx = app.cinema.prepareCanvas(surface, fmt.id);

    // Ziel: möglichst direkt auf die Platte (OPFS). Nur wenn der Browser das
    // nicht kann, in einen Puffer im Arbeitsspeicher - dann ist der Film
    // durch den verfügbaren Speicher begrenzt.
    const out = await openTarget(fmt, { ArrayBufferTarget, FileSystemWritableFileStreamTarget });

    const muxer = new Muxer({
        target: out.target,
        video: { codec: support.video.muxer, width: fmt.width, height: fmt.height, frameRate: FPS },
        audio: { codec: support.audio.muxer, numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_SAMPLE_RATE },
        // fastStart:false = Verwaltungsdaten ans Dateiende. Braucht am
        // wenigsten Arbeitsspeicher und keine Vorab-Schätzung der
        // Päckchen-Anzahl (die Variante mit reserviertem Platz würde den
        // ganzen Export verlieren, wenn die Schätzung nicht aufgeht).
        // Lokale Player kommen damit klar.
        fastStart: false
    });

    let encoderError = null;
    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { encoderError = e; }
    });
    videoEncoder.configure(videoConfig(support.video, fmt, videoBitrate));

    const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => { encoderError = e; }
    });
    audioEncoder.configure(audioConfig(support.audio));

    const audioState = { cursor: 0, decodeCtx: new OfflineAudioContext(1, 1, AUDIO_SAMPLE_RATE) };
    let cancelled = false;

    try {
        // Szene für Szene: erst deren Ton, dann deren Bilder. So wachsen
        // beide Spuren ungefähr gleichmäßig in die Datei (der Muxer schreibt
        // laufend mit) und es liegt nie mehr als eine Szene im Speicher.
        for (let s = 0; s < timeline.scenes.length; s++) {
            const scene = timeline.scenes[s];
            if (app.state.cancelAnalysis) { cancelled = true; break; }
            if (encoderError) throw encoderError;

            await encodeSceneAudio(audioEncoder, audioState, scene);

            const firstFrame = Math.round(scene.startSec * FPS);
            const lastFrame = Math.min(totalFrames - 1, Math.round(scene.endSec * FPS) - 1);

            // Bilder dieser und der nächsten Szene bereitstellen; der
            // Renderer hält höchstens drei gleichzeitig.
            await app.cinema.ensureBitmap(scene);
            if (timeline.scenes[s + 1]) await app.cinema.ensureBitmap(timeline.scenes[s + 1]);

            for (let i = firstFrame; i <= lastFrame; i++) {
                if (encoderError) throw encoderError;

                const timeSec = i / FPS;
                // FIX: Bild vor JEDEM Frame absichern, nicht nur am
                // Szenenanfang. Der Bild-Zwischenspeicher gehört dem Renderer
                // und kann zwischendurch geräumt werden (z.B. wenn die
                // Vorschau daneben geschlossen wird) - ohne diese Prüfung
                // liefe der Rest der Szene stumm mit "Bild wird geladen..."
                // in die fertige Datei. Ein Map-Zugriff pro Frame kostet nichts.
                if (!app.cinema.bitmapFor(scene)) await app.cinema.ensureBitmap(scene);

                app.cinema.drawFrame(ctx, timeline, timeSec);

                const frame = new VideoFrame(surface, {
                    timestamp: Math.round(timeSec * 1_000_000),
                    duration: Math.round(1_000_000 / FPS)
                });
                videoEncoder.encode(frame, { keyFrame: i % Math.round(FPS * KEYFRAME_SEC) === 0 });
                frame.close();

                // Bremse: der Encoder darf nicht beliebig weit hinterherhängen.
                while (videoEncoder.encodeQueueSize > MAX_QUEUE) await tick();

                if (i % FPS === 0) {
                    // Einmal pro Sekunde Film: Anzeige aktualisieren UND die
                    // Ereigniswarteschlange freigeben, sonst friert die
                    // Oberfläche ein und der Abbruch-Knopf reagiert nicht.
                    const percent = Math.round((i + 1) / totalFrames * 100);
                    app.ui.showLoader('Film wird kodiert...', `${percent} % (Seite ${(scene.pageIdx ?? 0) + 1}, ${formatDuration(timeSec)} von ${formatDuration(timeline.totalDurationSec)})`);
                    await tick();
                    if (app.state.cancelAnalysis) { cancelled = true; break; }
                }
            }
            if (cancelled) break;
        }

        if (cancelled) {
            await out.discard();
            return null;
        }

        app.ui.showLoader('Film wird abgeschlossen...', 'Datei wird geschrieben');
        await videoEncoder.flush();
        await audioEncoder.flush();
        if (encoderError) throw encoderError;
        muxer.finalize();
        return await out.finish();
    } catch (e) {
        await out.discard();
        throw e;
    } finally {
        // close() wirft, wenn der Encoder schon geschlossen ist - hier ist
        // das egal, es geht nur ums Aufräumen.
        try { videoEncoder.close(); } catch (e) { /* schon zu */ }
        try { audioEncoder.close(); } catch (e) { /* schon zu */ }
        try { await audioState.decodeCtx.close?.(); } catch (e) { /* egal */ }
    }
}

// Der Ton einer Szene, exakt auf scene.startSec gelegt. Dass die Tonspur
// genau am Szenenanfang beginnt, ist der Grund, warum Bild und Ton
// zusammenpassen, ohne dass irgendwo Pausenlängen doppelt gepflegt werden
// müssen: der Zeitplan bestimmt beides.
async function encodeSceneAudio(encoder, state, scene) {
    const startSample = Math.round(scene.startSec * AUDIO_SAMPLE_RATE);
    const endSample = Math.round(scene.endSec * AUDIO_SAMPLE_RATE);

    if (state.cursor < startSample) await pushSilence(encoder, state, startSample - state.cursor);

    if (scene.audio && scene.audio.blob) {
        try {
            const buffer = await state.decodeCtx.decodeAudioData(await scene.audio.blob.arrayBuffer());
            const mono = toMono(buffer);
            const room = Math.max(0, endSample - state.cursor);
            await pushSamples(encoder, state, room < mono.length ? mono.subarray(0, room) : mono);
        } catch (e) {
            // Lieber eine stumme Szene als ein abgebrochener Film.
            console.error('Tonspur einer Szene nicht dekodierbar:', e);
        }
    }

    if (state.cursor < endSample) await pushSilence(encoder, state, endSample - state.cursor);
}

async function pushSilence(encoder, state, sampleCount) {
    let left = sampleCount;
    while (left > 0) {
        const n = Math.min(AUDIO_CHUNK_SAMPLES, left);
        await pushChunk(encoder, state, new Float32Array(n));
        left -= n;
    }
}

async function pushSamples(encoder, state, samples) {
    for (let offset = 0; offset < samples.length; offset += AUDIO_CHUNK_SAMPLES) {
        const slice = samples.subarray(offset, Math.min(samples.length, offset + AUDIO_CHUNK_SAMPLES));
        // Kopie, weil AudioData einen eigenen, zusammenhängenden Puffer
        // erwartet und die Vorlage sonst am Leben gehalten würde.
        await pushChunk(encoder, state, new Float32Array(slice));
    }
}

async function pushChunk(encoder, state, samples) {
    if (!samples.length) return;
    const data = new AudioData({
        format: 'f32-planar',
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfFrames: samples.length,
        numberOfChannels: AUDIO_CHANNELS,
        timestamp: Math.round(state.cursor / AUDIO_SAMPLE_RATE * 1_000_000),
        data: samples
    });
    encoder.encode(data);
    data.close();
    state.cursor += samples.length;
    while (encoder.encodeQueueSize > MAX_QUEUE) await tick();
}

// Vorlesestimmen sind einstimmig; kommt doch Stereo zurück, wird gemittelt
// statt einen Kanal wegzuwerfen.
function toMono(buffer) {
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
    const out = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
        const channel = buffer.getChannelData(c);
        for (let i = 0; i < out.length; i++) out[i] += channel[i];
    }
    for (let i = 0; i < out.length; i++) out[i] /= buffer.numberOfChannels;
    return out;
}

// ---------------- Ziel-Datei ----------------
async function openTarget(fmt, { ArrayBufferTarget, FileSystemWritableFileStreamTarget }) {
    if (navigator.storage && navigator.storage.getDirectory) {
        try {
            const root = await navigator.storage.getDirectory();
            const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
            // Reste eines abgebrochenen Durchlaufs wegräumen, BEVOR neu
            // geschrieben wird - ein halber Film soll keinen Platz belegen.
            await clearDir(dir);

            const name = `film-${Date.now()}.mp4`;
            const handle = await dir.getFileHandle(name, { create: true });
            const writable = await handle.createWritable({ keepExistingData: true });
            return {
                target: new FileSystemWritableFileStreamTarget(writable),
                async finish() {
                    await writable.close();
                    return await handle.getFile();
                },
                async discard() {
                    try { await writable.abort(); } catch (e) { /* evtl. schon zu */ }
                    try { await dir.removeEntry(name); } catch (e) { /* evtl. nie entstanden */ }
                }
            };
        } catch (e) {
            console.warn('OPFS nicht nutzbar, Film entsteht im Arbeitsspeicher:', e);
        }
    }

    const target = new ArrayBufferTarget();
    return {
        target,
        async finish() { return new Blob([target.buffer], { type: 'video/mp4' }); },
        async discard() { /* Der Puffer wird mit dem Ziel selbst verworfen. */ }
    };
}

async function clearDir(dir) {
    try {
        for await (const name of dir.keys()) {
            await dir.removeEntry(name).catch(e => console.warn('Alte Export-Datei blieb liegen:', e));
        }
    } catch (e) {
        console.warn('Export-Ordner nicht aufräumbar:', e);
    }
}

function downloadFile(file, filename) {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // NICHT sofort freigeben: bei 200 MB läuft der Download noch, während
    // diese Zeile schon durch ist - eine zu früh zurückgezogene Adresse
    // bricht ihn ab. Nach 10 Minuten ist jeder Download durch; spätestens
    // beim Schließen des Tabs räumt der Browser ohnehin auf.
    setTimeout(() => URL.revokeObjectURL(url), 600_000);
}

function buildFileName(book, timeline) {
    const slug = (book.title || 'buch')
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'buch';
    const range = timeline.fromIdx === timeline.toIdx ? `-seite-${timeline.fromIdx + 1}` : '';
    return `lesezauber-film-${slug}${range}.mp4`;
}

// ---------------- Kleinigkeiten ----------------
// Gibt die Ereigniswarteschlange frei (Anzeige neu zeichnen, Abbruch-Knopf
// reagiert) und lässt den Encoder arbeiten.
function tick() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function formatDuration(sec) {
    const total = Math.max(0, Math.round(sec || 0));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
