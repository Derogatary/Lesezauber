import { app } from '../core.js';

// ================= Eigene Stimme: Seiten selbst einsprechen (v0.43.0-beta) =================
// NEU (Nutzerwunsch: "Eine für alle, die Auswahl zwischen Mama und Papa wäre
// okay"): Eltern lesen eine Buchseite selbst ein, das Kind hört beim Vorlesen
// die vertraute Stimme statt der Geräte-/KI-Stimme.
//
// Entscheidungen:
// - EINE Aufnahme pro Seite und Sprecher, gültig für ALLE Profile (nicht pro Kind).
// - Mehrere Sprecher (Standard „Mama“/„Papa“, weitere Namen möglich). Das Kind
//   wählt im Reader, wer vorliest (localStorage lz_voice_speaker, pro Gerät).
//   Hat die Seite den gewählten Sprecher nicht, liest ein anderer vorhandener
//   Sprecher - eine vertraute Stimme ist besser als die Computerstimme.
// - Die Aufnahme ersetzt NUR den Seitentext. Schwierige Wörter, Zwischenruf,
//   Bildbeschreibung und Rätsel spricht weiter die eingestellte Stimme
//   ("Mama liest, der Erzähler kommentiert"). Die Weiche sitzt in js/tts.js
//   (_speakPageText) - alles andere ruft weiter nur app.tts.speak() auf.
// - Gespeichert in IndexedDB (Store "voiceRecordings", js/db.js), NICHT im
//   ttsCache: der räumt automatisch auf, eine eigene Aufnahme darf nie
//   einfach verschwinden. Nicht in der normalen Bibliotheks-Sicherung (die ist
//   JSON und würde riesig), sondern als eigene Sicherungsdatei (Einstellungen).
// - Wort-Hervorhebung: geschätzt über die Textlänge, wie bei KI-Stimmen ohne
//   Zeitstempel (app.ttsNeural._wordStartTimes).
// - Nichts verlässt das Gerät: kein Anbieter, keine Kosten, offline nutzbar.

const SPEAKER_PREF_KEY = 'lz_voice_speaker';
const DEFAULT_SPEAKERS = ['Mama', 'Papa'];
// Sprachaufnahme braucht keine Musikqualität - 48 kbit/s Opus sind gut
// verständlich und kosten nur ca. 0,35 MB pro Minute.
const RECORD_BITRATE = 48000;
const MAX_RECORD_SEC = 600;

// "<bookId>|<pageId>" -> Set der Sprecher, die für diese Seite eine Aufnahme haben.
// Wird beim Start aus den Schlüsseln geladen (loadIndex), damit Reader-Anzeige
// und Vorlese-Weiche ohne Warten auf die Datenbank entscheiden können.
const index = new Map();

function pageKey(bookId, pageId) { return `${bookId}|${pageId}`; }

function addToIndex(bookId, pageId, speaker) {
    const k = pageKey(bookId, pageId);
    if (!index.has(k)) index.set(k, new Set());
    index.get(k).add(speaker);
}

function removeFromIndex(bookId, pageId, speaker) {
    const set = index.get(pageKey(bookId, pageId));
    if (!set) return;
    set.delete(speaker);
    if (set.size === 0) index.delete(pageKey(bookId, pageId));
}

// Laufende Aufnahme (nur eine gleichzeitig)
const rec = { recorder: null, stream: null, chunks: [], startedAt: 0, timer: null, blob: null, durationSec: 0, previewUrl: null, previewAudio: null };

Object.assign(app.voice, {
    key(bookId, pageId, speaker) {
        return `${bookId}|${pageId}|${speaker}`;
    },

    // Reine Funktion (Unit-Test): Schlüssel wieder zerlegen. Sprecher-Namen
    // dürfen selbst keinen "|" enthalten (cleanSpeakerName entfernt ihn).
    parseKey(key) {
        const parts = String(key).split('|');
        if (parts.length !== 3) return null;
        return { bookId: parts[0], pageId: parts[1], speaker: parts[2] };
    },

    cleanSpeakerName(name) {
        return String(name || '').replace(/[|<>"'`]/g, '').trim().slice(0, 20);
    },

    // Reine Funktion (Unit-Test): welcher Sprecher liest diese Seite?
    // preferred: gespeicherte Wahl ('' = automatisch, 'off' = nie eigene Aufnahme).
    pickSpeaker(available, preferred) {
        if (preferred === 'off' || !available || available.length === 0) return null;
        if (preferred && available.includes(preferred)) return preferred;
        return [...available].sort((a, b) => {
            const ia = DEFAULT_SPEAKERS.indexOf(a), ib = DEFAULT_SPEAKERS.indexOf(b);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'de');
        })[0];
    },

    async loadIndex() {
        index.clear();
        try {
            const keys = await app.dbOps.getAllVoiceRecordingKeys();
            (keys || []).forEach(k => {
                const p = this.parseKey(k);
                if (p) addToIndex(p.bookId, p.pageId, p.speaker);
            });
        } catch (e) {
            console.error('Eigene Aufnahmen konnten nicht geladen werden:', e);
        }
    },

    speakersForPage(bookId, pageId) {
        return [...(index.get(pageKey(bookId, pageId)) || [])];
    },

    bookSpeakers(bookId) {
        const out = new Set();
        const prefix = `${bookId}|`;
        index.forEach((set, k) => { if (k.startsWith(prefix)) set.forEach(s => out.add(s)); });
        return [...out];
    },

    bookHasRecordings(bookId) {
        return this.bookSpeakers(bookId).length > 0;
    },

    // Alle bekannten Sprecher (Standard + alle, die irgendwo aufgenommen haben)
    allSpeakers() {
        const out = new Set(DEFAULT_SPEAKERS);
        index.forEach(set => set.forEach(s => out.add(s)));
        return [...out];
    },

    preferredSpeaker() {
        try { return localStorage.getItem(SPEAKER_PREF_KEY) || ''; } catch (e) { return ''; }
    },

    speakerForPage(bookId, pageId) {
        return this.pickSpeaker(this.speakersForPage(bookId, pageId), this.preferredSpeaker());
    },

    async getRecording(bookId, pageId, speaker) {
        return app.dbOps.getVoiceRecording(this.key(bookId, pageId, speaker));
    },

    // Spielt eine Aufnahme über das EINE <audio>-Element der App ab (iOS,
    // siehe CLAUDE.md) und nutzt dieselbe _token-Logik wie die KI-Stimmen -
    // app.tts.stop() bricht also auch eine eigene Aufnahme sauber ab.
    // onFail: wird gerufen, wenn die Datei nicht abspielbar ist (dann liest
    // der Aufrufer mit der normalen Stimme - nie ohne Ton enden).
    async play(entry, cleanText, onEnd, containerId, onFail) {
        const neural = app.ttsNeural;
        const token = ++neural._token;
        const audio = neural._getAudioElement();
        if (neural._objectUrl) URL.revokeObjectURL(neural._objectUrl);
        neural._objectUrl = URL.createObjectURL(entry.blob);
        audio.src = neural._objectUrl;
        audio.playbackRate = 1; // die eigene Stimme nicht verfremden
        audio.onloadedmetadata = () => {
            if (token !== neural._token) return;
            // MediaRecorder-Dateien (WebM) melden oft keine Länge (Infinity) -
            // deshalb die beim Aufnehmen gemessene Dauer mitgeben.
            neural._startHighlighting(containerId, null, cleanText, token, entry.durationSec);
        };
        audio.onended = () => {
            if (token !== neural._token) return;
            if (neural._rafId) { cancelAnimationFrame(neural._rafId); neural._rafId = null; }
            if (onEnd) onEnd();
        };
        audio.onerror = () => {
            if (token !== neural._token) return;
            console.error('Eigene Aufnahme konnte nicht abgespielt werden:', entry.key);
            if (onFail) onFail();
        };
        try {
            await audio.play();
        } catch (e) {
            if (token !== neural._token) return;
            console.error('Wiedergabe der eigenen Aufnahme nicht möglich:', e);
            if (onFail) onFail();
        }
    },

    // Für Hörbuch/Video: Seitentext-Segment aus der Aufnahme bauen, im selben
    // Format wie app.ttsNeural.renderAudio(). null = keine Aufnahme.
    async renderSegment(bookId, page, rawText) {
        const speaker = this.speakerForPage(bookId, page.id);
        if (!speaker) return null;
        const entry = await this.getRecording(bookId, page.id, speaker);
        if (!entry) return null;
        const text = app.utils.stripEmojiForSpeech(app.utils.prepareTextForSpeech(rawText || ''));
        const offsets = app.utils.speechWordOffsets(text);
        const starts = app.ttsNeural._wordStartTimes(offsets.map(o => o.start), entry.durationSec, null, text);
        const words = offsets.map((o, i) => ({ word: o.word, start: starts[i], end: i + 1 < starts.length ? starts[i + 1] : entry.durationSec }));
        return { text, blob: entry.blob, mime: entry.mime, durationSec: entry.durationSec, words, exact: false, speaker };
    },

    async deleteForBook(bookId) {
        const prefix = `${bookId}|`;
        const keys = [];
        index.forEach((set, k) => { if (k.startsWith(prefix)) set.forEach(s => keys.push(`${k}|${s}`)); });
        for (const k of keys) {
            try {
                await app.dbOps.deleteVoiceRecording(k);
                const p = this.parseKey(k);
                if (p) removeFromIndex(p.bookId, p.pageId, p.speaker);
            } catch (e) {
                console.error('Aufnahme konnte nicht gelöscht werden:', e);
            }
        }
    }
});

function currentBookPage() {
    const book = app.library[app.state.currentBookId];
    return { book, page: book?.pages[app.state.currentPageIdx] };
}

function pickMimeType() {
    const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function stopStream() {
    if (rec.stream) rec.stream.getTracks().forEach(t => t.stop());
    rec.stream = null;
    clearInterval(rec.timer);
    rec.timer = null;
}

function discardPreview() {
    if (rec.previewAudio) { rec.previewAudio.pause(); rec.previewAudio = null; }
    if (rec.previewUrl) { URL.revokeObjectURL(rec.previewUrl); rec.previewUrl = null; }
    rec.blob = null;
    rec.durationSec = 0;
}

Object.assign(app.actions, {
    // Kleine Abfragen für die Anzeige (js/render/voiceRecord.js).
    _voiceHasFresh() { return !!rec.blob; },
    _voiceIsRecording() { return !!(rec.recorder && rec.recorder.state === 'recording'); },
    _voiceFreshDuration() { return rec.durationSec || 0; },

    // Reader: Wahl, wer vorliest ('' = automatisch, 'off' = keine eigene Aufnahme).
    setVoiceSpeaker(speaker) {
        try { localStorage.setItem(SPEAKER_PREF_KEY, speaker); } catch (e) { console.error('Sprecher-Wahl nicht speicherbar:', e); }
        app.tts.stop();
        app.render.readerVoiceBar();
    },

    // Aufnahme-Fenster für die aktuelle Seite öffnen (nur Eltern).
    openVoiceRecorder() {
        const { book, page } = currentBookPage();
        if (!book || !page) return;
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            app.ui.toast('Dieser Browser kann keine Tonaufnahmen machen.', '⚠️');
            return;
        }
        app.tts.stop();
        if (app.state.autoReadActive) app.tts.stopAutoRead();
        discardPreview();
        document.getElementById('voiceRecordPanel').classList.remove('hidden');
        app.render.voiceRecorder();
    },

    closeVoiceRecorder() {
        if (rec.recorder && rec.recorder.state === 'recording') {
            rec.recorder.onstop = null;
            rec.recorder.stop();
        }
        rec.recorder = null;
        stopStream();
        discardPreview();
        document.getElementById('voiceRecordPanel').classList.add('hidden');
        app.render.readerVoiceBar();
    },

    // Neuer Sprecher-Name aus dem Auswahlfeld ("Andere...")
    chooseVoiceRecordSpeaker(value) {
        if (value === '__new__') {
            const name = app.voice.cleanSpeakerName(prompt('Wer liest vor? (z.B. Oma, Opa, Lena)') || '');
            if (!name) { app.render.voiceRecorder(); return; }
            app.state.voiceRecordSpeaker = name;
        } else {
            app.state.voiceRecordSpeaker = value;
        }
        discardPreview();
        app.render.voiceRecorder();
    },

    async toggleVoiceRecording() {
        if (rec.recorder && rec.recorder.state === 'recording') {
            rec.recorder.stop();
            return;
        }
        discardPreview();
        try {
            rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        } catch (e) {
            console.error('Mikrofon nicht verfügbar:', e);
            app.ui.toast('Kein Zugriff aufs Mikrofon - bitte im Browser erlauben.', '🎙️');
            return;
        }
        const mimeType = pickMimeType();
        try {
            rec.recorder = new MediaRecorder(rec.stream, mimeType ? { mimeType, audioBitsPerSecond: RECORD_BITRATE } : { audioBitsPerSecond: RECORD_BITRATE });
        } catch (e) {
            console.error('Aufnahme konnte nicht starten:', e);
            stopStream();
            app.ui.toast('Aufnahme konnte nicht starten.', '⚠️');
            return;
        }
        rec.chunks = [];
        rec.recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) rec.chunks.push(ev.data); };
        rec.recorder.onstop = () => {
            rec.durationSec = Math.max(0.1, (performance.now() - rec.startedAt) / 1000);
            rec.blob = new Blob(rec.chunks, { type: rec.recorder?.mimeType || mimeType || 'audio/webm' });
            rec.chunks = [];
            stopStream();
            app.render.voiceRecorder();
        };
        rec.startedAt = performance.now();
        rec.recorder.start(1000);
        rec.timer = setInterval(() => {
            const sec = (performance.now() - rec.startedAt) / 1000;
            if (sec >= MAX_RECORD_SEC && rec.recorder?.state === 'recording') {
                rec.recorder.stop();
                app.ui.toast('Aufnahme nach 10 Minuten automatisch beendet.', '⏹');
            }
            app.render.voiceRecorderStatus(sec);
        }, 250);
        app.render.voiceRecorder();
    },

    // Frische (noch nicht gespeicherte) oder vorhandene Aufnahme anhören.
    async previewVoiceRecording() {
        let blob = rec.blob;
        if (!blob) {
            const { book, page } = currentBookPage();
            const entry = book && page ? await app.voice.getRecording(book.id, page.id, app.state.voiceRecordSpeaker) : null;
            blob = entry?.blob;
        }
        if (!blob) return;
        if (rec.previewAudio) { rec.previewAudio.pause(); rec.previewAudio = null; return; }
        if (rec.previewUrl) URL.revokeObjectURL(rec.previewUrl);
        rec.previewUrl = URL.createObjectURL(blob);
        rec.previewAudio = new Audio(rec.previewUrl);
        rec.previewAudio.onended = () => { rec.previewAudio = null; app.render.voiceRecorder(); };
        rec.previewAudio.play().catch(e => { console.error('Vorschau nicht abspielbar:', e); rec.previewAudio = null; });
        app.render.voiceRecorder();
    },

    // Speichern; next=true blättert danach direkt zur nächsten Seite weiter
    // (so lässt sich ein ganzes Buch am Stück einlesen).
    async saveVoiceRecording(next = false) {
        const { book, page } = currentBookPage();
        const speaker = app.state.voiceRecordSpeaker;
        if (!book || !page || !rec.blob || !speaker) return;
        const entry = {
            key: app.voice.key(book.id, page.id, speaker),
            bookId: book.id, pageId: page.id, speaker,
            blob: rec.blob, mime: rec.blob.type, durationSec: rec.durationSec,
            createdAt: Date.now()
        };
        try {
            await app.dbOps.putVoiceRecording(entry);
        } catch (e) {
            console.error('Aufnahme nicht gespeichert:', e);
            app.ui.toast(e.message || 'Aufnahme konnte nicht gespeichert werden.', '⚠️');
            return;
        }
        addToIndex(book.id, page.id, speaker);
        discardPreview();
        app.ui.toast(`Seite ${app.state.currentPageIdx + 1} von ${speaker} gespeichert.`, '🎙️');
        if (next && app.state.currentPageIdx < book.pages.length - 1) {
            app.state.currentPageIdx++;
            app.render.reader(app.state.currentPageIdx);
        }
        app.render.voiceRecorder();
    },

    async deleteVoiceRecordingForPage() {
        const { book, page } = currentBookPage();
        const speaker = app.state.voiceRecordSpeaker;
        if (!book || !page || !speaker) return;
        if (!confirm(`Aufnahme von ${speaker} für diese Seite löschen?`)) return;
        try {
            await app.dbOps.deleteVoiceRecording(app.voice.key(book.id, page.id, speaker));
            removeFromIndex(book.id, page.id, speaker);
            app.ui.toast('Aufnahme gelöscht.', '🗑️');
        } catch (e) {
            console.error('Aufnahme nicht gelöscht:', e);
            app.ui.toast('Aufnahme konnte nicht gelöscht werden.', '⚠️');
        }
        app.render.voiceRecorder();
    },

    // Eigene Sicherungsdatei für alle Aufnahmen (Ton als Base64 in JSON).
    async exportVoiceRecordings() {
        let all;
        try { all = await app.dbOps.getAllVoiceRecordings(); } catch (e) { console.error(e); all = null; }
        if (!all || all.length === 0) { app.ui.toast('Noch keine eigenen Aufnahmen vorhanden.', 'ℹ️'); return; }
        app.ui.showLoader('Aufnahmen werden gesichert...', `${all.length} Aufnahme(n)`);
        try {
            const items = [];
            for (const e of all) {
                const dataUrl = await new Promise((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onload = () => resolve(fr.result);
                    fr.onerror = () => reject(fr.error);
                    fr.readAsDataURL(e.blob);
                });
                items.push({ key: e.key, bookId: e.bookId, pageId: e.pageId, speaker: e.speaker, mime: e.mime, durationSec: e.durationSec, createdAt: e.createdAt, data: dataUrl });
            }
            const blob = new Blob([JSON.stringify({ type: 'lesezauber-voice', version: 1, items })], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lesezauber-aufnahmen-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            app.ui.toast(`${items.length} Aufnahme(n) gesichert.`, '📤');
        } catch (e) {
            console.error('Aufnahmen-Sicherung fehlgeschlagen:', e);
            app.ui.toast('Sicherung der Aufnahmen fehlgeschlagen.', '⚠️');
        } finally {
            app.ui.hideLoader();
        }
    },

    triggerVoiceImport() {
        document.getElementById('voiceImportInput').click();
    },

    async importVoiceRecordings(ev) {
        const file = ev.target.files[0];
        ev.target.value = '';
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            if (!parsed || parsed.type !== 'lesezauber-voice' || !Array.isArray(parsed.items)) throw new Error('Keine Aufnahmen-Sicherung');
            let count = 0;
            for (const it of parsed.items) {
                const speaker = app.voice.cleanSpeakerName(it.speaker);
                // Nur harmlose IDs übernehmen (landen später in Schlüsseln/Anzeige).
                const idOk = v => typeof v === 'string' && /^[A-Za-z0-9_.-]+$/.test(v) || typeof v === 'number';
                const mimeOk = typeof it.data === 'string' && /^data:audio\/[a-z0-9.+-]+(;[^,]*)?;base64,/i.test(it.data);
                if (!speaker || !idOk(it.bookId) || !idOk(it.pageId) || !mimeOk) continue;
                // Base64 selbst dekodieren statt fetch(data:...) - die CSP
                // (connect-src) würde data:-Adressen blockieren.
                const [head, b64] = it.data.split(',');
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const blob = new Blob([bytes], { type: head.slice(5).split(';')[0] });
                const bookId = String(it.bookId), pageId = String(it.pageId);
                await app.dbOps.putVoiceRecording({
                    key: app.voice.key(bookId, pageId, speaker), bookId, pageId, speaker,
                    blob, mime: blob.type, durationSec: Number(it.durationSec) || 0, createdAt: Number(it.createdAt) || Date.now()
                });
                addToIndex(bookId, pageId, speaker);
                count++;
            }
            app.ui.toast(`${count} Aufnahme(n) wiederhergestellt.`, '📥');
            app.render.voiceSettings();
        } catch (e) {
            console.error('Aufnahmen-Import fehlgeschlagen:', e);
            app.ui.toast('Diese Datei ist keine Aufnahmen-Sicherung.', '⚠️');
        }
    }
});
