import { app } from '../core.js';

// ================= Hörbuch-Export (ganzes Buch als eine Audiodatei) =================
// Baut direkt auf app.ttsNeural.renderAudio()/renderPageSegments() auf (siehe
// docs/KONZEPT-Video.md, Abschnitt 2 + 8, Schritt 3) - Bild, Ton, Länge und
// Wort-Zeitpunkte liegen dort schon fertig vor, hier werden nur die
// Sprach-Segmente aller Seiten der Reihe nach geholt und zu einer Datei
// zusammengefügt.
//
// Pause zwischen zwei Sprach-Segmenten (z.B. Seitentext -> Bildbeschreibung),
// rein zur besseren Hörbarkeit - ohne Pause klingt der Übergang abgehackt.
const SEGMENT_PAUSE_SEC = 0.6;

Object.assign(app.actions, {
    async exportAudiobook(bookId) {
        const book = app.library[bookId];
        if (!book) return;

        if (!app.ttsNeural.isActive()) {
            app.ui.toast('Hörbuch-Export braucht eine KI-Stimme (Einstellungen) - die Gerätestimme kann keine Datei herausgeben.', '🔇');
            return;
        }

        // NEU: Seiten mit excluded=true überspringen, wie überall beim
        // automatischen Vorlesen (js/tts.js) auch.
        const pageIndices = book.pages
            .map((p, i) => i)
            .filter(i => !book.pages[i].excluded);

        if (pageIndices.length === 0) {
            app.ui.toast('Keine vorlesbaren Seiten in diesem Buch.', 'ℹ️');
            return;
        }

        const includeDescription = confirm('Bildbeschreibungen mit ins Hörbuch aufnehmen?');
        const includeQuiz = confirm('Rätselfragen (mit Antwort) mit ins Hörbuch aufnehmen?');

        const personaId = app.state.readingPersonaId || app.settings.persona;
        const segmentBlobs = [];
        let skipped = 0;

        app.state.cancelAnalysis = false;
        // NEU: wie bei Buch-Quiz/Kontrolle - während des Exports keine
        // Hintergrund-Vorbereitung dazwischenfunken lassen, sonst laufen
        // zwei Ketten von API-Aufrufen gleichzeitig gegen dieselben Limits.
        app.state.apiBusy = true;
        app.ui.showLoader('Hörbuch wird erstellt...', `Seite 1 von ${pageIndices.length}`);

        try {
            for (let n = 0; n < pageIndices.length; n++) {
                if (app.state.cancelAnalysis) break;
                app.ui.showLoader('Hörbuch wird erstellt...', `Seite ${n + 1} von ${pageIndices.length}`);

                try {
                    const result = await app.ttsNeural.renderPageSegments(bookId, pageIndices[n], {
                        includeDescription,
                        includeQuiz,
                        personaId,
                        onProgress: (cur, total, kind) => {
                            const sub = document.getElementById('processSub');
                            if (sub) sub.innerText = `Seite ${n + 1} von ${pageIndices.length} (${kindLabel(kind)} ${cur}/${total})`;
                        }
                    });
                    result.segments.forEach(seg => segmentBlobs.push(seg.blob));
                } catch (e) {
                    // Eine einzelne kaputte/unanalysierte Seite soll nicht den
                    // ganzen Export abbrechen - überspringen und weitermachen,
                    // aber sichtbar melden statt stumm zu verschlucken.
                    console.error(`Hörbuch-Export: Seite ${pageIndices[n] + 1} übersprungen:`, e);
                    skipped++;
                }
            }

            if (app.state.cancelAnalysis) {
                app.ui.toast('Hörbuch-Export abgebrochen.', '🚫');
                return;
            }
            if (segmentBlobs.length === 0) {
                app.ui.toast('Kein Ton erzeugt - sind die Seiten schon analysiert?', '❌');
                return;
            }

            app.ui.showLoader('Hörbuch wird zusammengefügt...', 'Einen Moment bitte');
            const finalBlob = await this._concatenateAudio(segmentBlobs);
            this._downloadAudioBlob(finalBlob, book.title);

            const skipNote = skipped > 0 ? ` (${skipped} Seite/n übersprungen)` : '';
            app.ui.toast(`Hörbuch heruntergeladen${skipNote}`, '🎧');
        } catch (e) {
            console.error('Hörbuch-Export fehlgeschlagen:', e);
            app.ui.toast(e.message || 'Hörbuch-Export fehlgeschlagen.', '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    // Fügt mehrere Audio-Blobs zu einer einzigen Datei zusammen.
    // Entscheidung fürs Wie: die Segmente kommen je nach gewähltem
    // KI-Stimmen-Anbieter als WAV, MP3 oder OGG (siehe js/ttsProviders.js),
    // teils mit unterschiedlicher Abtastrate. Ein simples Blob-Concat
    // funktioniert nur zufällig bei manchen Containern (bei WAV gar nicht -
    // jede Datei hat einen eigenen Header mittendrin -, bei MP3 abhängig
    // vom Encoder unsauber). Deshalb der robuste, anbieter-unabhängige Weg:
    // jedes Segment einmal dekodieren und über einen OfflineAudioContext neu
    // zusammenrendern - das funktioniert unabhängig vom Ursprungsformat und
    // braucht keine zusätzliche Bibliothek (kein Muxer nötig). Preis dafür:
    // das Ergebnis ist unkomprimiertes WAV, also deutlich größer als die
    // einzelnen Segmente - für ein Hörbuch zum eigenen Gebrauch akzeptabel.
    async _concatenateAudio(blobs) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        try {
            const buffers = [];
            for (const blob of blobs) {
                const arrayBuffer = await blob.arrayBuffer();
                buffers.push(await ctx.decodeAudioData(arrayBuffer));
            }

            const sampleRate = ctx.sampleRate;
            const numChannels = buffers.reduce((max, b) => Math.max(max, b.numberOfChannels), 1);
            const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0)
                + Math.round(SEGMENT_PAUSE_SEC * sampleRate) * Math.max(0, buffers.length - 1);

            const offlineCtx = new OfflineAudioContext(numChannels, totalSamples, sampleRate);
            let cursor = 0;
            buffers.forEach(buffer => {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(offlineCtx.destination);
                source.start(cursor);
                cursor += buffer.duration + SEGMENT_PAUSE_SEC;
            });

            const rendered = await offlineCtx.startRendering();
            return this._audioBufferToWav(rendered);
        } finally {
            ctx.close();
        }
    },

    // Reines PCM16-WAV, ohne Abhängigkeit - derselbe Aufbau, den
    // js/ttsProviders.js intern schon für Geminis Rohton nutzt (dort nicht
    // exportiert, deshalb hier ein eigenes, kleines Gegenstück).
    _audioBufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const numSamples = buffer.length;
        const blockAlign = numChannels * 2;
        const dataSize = numSamples * blockAlign;

        const arrayBuffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(arrayBuffer);
        const writeText = (offset, text) => {
            for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
        };

        writeText(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeText(8, 'WAVE');
        writeText(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeText(36, 'data');
        view.setUint32(40, dataSize, true);

        const channelData = [];
        for (let c = 0; c < numChannels; c++) {
            channelData.push(c < buffer.numberOfChannels ? buffer.getChannelData(c) : buffer.getChannelData(0));
        }

        let offset = 44;
        for (let i = 0; i < numSamples; i++) {
            for (let c = 0; c < numChannels; c++) {
                const sample = Math.max(-1, Math.min(1, channelData[c][i]));
                view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    },

    _downloadAudioBlob(blob, title) {
        const url = URL.createObjectURL(blob);
        const safeTitle = (title || 'buch')
            .toLowerCase()
            .replace(/[^a-z0-9äöüß]+/gi, '-')
            .replace(/^-+|-+$/g, '') || 'buch';

        const a = document.createElement('a');
        a.href = url;
        a.download = `lesezauber-hoerbuch-${safeTitle}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
});

function kindLabel(kind) {
    if (kind === 'desc') return 'Bildbeschreibung';
    if (kind === 'quizQ') return 'Rätselfrage';
    if (kind === 'quizA') return 'Antwort';
    return 'Text';
}
