import { app } from '../core.js';

// ================= Eigene Stimme: Anzeige (v0.43.0-beta) =================
// NEU: Sprecher-Auswahl im Reader (#readerVoiceBar), Aufnahme-Fenster
// (#voiceRecordPanel) und die Karte in den Einstellungen (#voiceSettingsInfo).
// Logik: js/actions/voiceRecord.js.
//
// Sprecher-Namen landen NIE direkt in einem onclick-String (CLAUDE.md:
// sanitize() schützt dort nicht) - sie stehen in data-s="..." (sanitize()
// ist in Attributen sicher) und werden per this.dataset.s gelesen.

function chip(label, active, dim, dataS, extraTitle = '') {
    return `<button data-s="${app.utils.sanitize(dataS)}" onclick="app.actions.setVoiceSpeaker(this.dataset.s)" aria-pressed="${active}" title="${app.utils.sanitize(extraTitle)}"
        class="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border-2 transition ${active ? 'border-rose-500 bg-rose-500 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300'} ${dim ? 'opacity-50' : ''}">${app.utils.sanitize(label)}</button>`;
}

Object.assign(app.render, {
    readerVoiceBar() {
        const bar = document.getElementById('readerVoiceBar');
        if (!bar) return;
        const book = app.library[app.state.currentBookId];
        const page = book?.pages[app.state.currentPageIdx];
        if (!book || !page) { bar.classList.add('hidden'); return; }

        const speakers = app.voice.bookSpeakers(book.id);
        const onPage = app.voice.speakersForPage(book.id, page.id);
        const pref = app.voice.preferredSpeaker();
        const reading = app.voice.speakerForPage(book.id, page.id);
        const chips = document.getElementById('readerVoiceChips');
        const label = document.getElementById('readerVoiceLabel');

        // Ohne Aufnahmen im Buch: nur der Einsprechen-Knopf (für Eltern) -
        // im Kinder-Lesemodus ist die Leiste dann ganz weg.
        bar.classList.toggle('hidden', speakers.length === 0 && app.utils.isKidMode?.());
        if (label) label.classList.toggle('hidden', speakers.length === 0);
        if (chips) {
            chips.innerHTML = speakers.length === 0 ? '' : [
                ...speakers.map(s => chip(`🎙️ ${s}`, pref !== 'off' && reading === s, !onPage.includes(s), s,
                    onPage.includes(s) ? '' : 'Für diese Seite gibt es keine Aufnahme')),
                chip('🤖 Vorlesestimme', pref === 'off' || !reading, false, 'off')
            ].join('');
        }
    },

    voiceRecorder() {
        const panel = document.getElementById('voiceRecordPanel');
        if (!panel || panel.classList.contains('hidden')) {
            this.readerVoiceBar();
            return;
        }
        const book = app.library[app.state.currentBookId];
        const page = book?.pages[app.state.currentPageIdx];
        if (!book || !page) return;

        const speakers = app.voice.allSpeakers();
        if (!app.state.voiceRecordSpeaker) app.state.voiceRecordSpeaker = speakers[0];
        if (!speakers.includes(app.state.voiceRecordSpeaker)) speakers.push(app.state.voiceRecordSpeaker);
        const current = app.state.voiceRecordSpeaker;

        const select = document.getElementById('voiceSpeakerSelect');
        select.innerHTML = speakers.map(s => `<option value="${app.utils.sanitize(s)}" ${s === current ? 'selected' : ''}>${app.utils.sanitize(s)}</option>`).join('')
            + '<option value="__new__">➕ Andere Person…</option>';

        document.getElementById('voicePageInfo').innerText = `Seite ${app.state.currentPageIdx + 1} von ${book.pages.length} · „${book.title}“`;
        const variant = app.utils.resolveAnyVariant(page, app.state.readingPersonaId || app.settings.persona);
        const text = variant?.text && variant.text !== 'Kein Text.' ? variant.text : '';
        document.getElementById('voicePrompter').innerText = text || '(Auf dieser Seite wurde kein Text erkannt - du kannst trotzdem etwas dazu erzählen.)';

        const onPage = app.voice.speakersForPage(book.id, page.id);
        const hasSaved = onPage.includes(current);
        const fresh = app.actions._voiceHasFresh();
        const isRec = app.actions._voiceIsRecording();

        const recBtn = document.getElementById('voiceRecBtn');
        recBtn.innerText = isRec ? '⏹ Stopp' : (fresh || hasSaved ? '⏺ Neu aufnehmen' : '⏺ Aufnehmen');
        recBtn.classList.toggle('bg-red-600', !isRec);
        recBtn.classList.toggle('bg-slate-800', isRec);
        select.disabled = isRec;
        document.getElementById('voicePlayBtn').disabled = isRec || !(fresh || hasSaved);
        document.getElementById('voiceSaveBtn').disabled = isRec || !fresh;
        document.getElementById('voiceSaveNextBtn').disabled = isRec || !fresh || app.state.currentPageIdx >= book.pages.length - 1;
        document.getElementById('voiceDeleteBtn').classList.toggle('hidden', !hasSaved || isRec);
        if (!isRec) {
            document.getElementById('voiceRecStatus').innerText = fresh
                ? `Neue Aufnahme (${app.actions._voiceFreshDuration().toFixed(0)} s) - anhören, dann speichern.`
                : hasSaved ? `✅ Für ${current} gibt es schon eine Aufnahme dieser Seite.` : 'Bereit. Tippe auf „Aufnehmen“ und lies den Text vor.';
        }
    },

    voiceRecorderStatus(sec) {
        const el = document.getElementById('voiceRecStatus');
        if (el) el.innerText = `🔴 Aufnahme läuft … ${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    },

    // Einstellungen: Zahl und Größe der Aufnahmen.
    async voiceSettings() {
        const el = document.getElementById('voiceSettingsInfo');
        if (!el) return;
        let all = [];
        try { all = await app.dbOps.getAllVoiceRecordings(); } catch (e) { console.error('Aufnahmen nicht lesbar:', e); }
        if (!all.length) { el.innerText = 'Noch keine Seite selbst eingesprochen. Das geht im Reader über „🎙️ Einsprechen“.'; return; }
        const bytes = all.reduce((sum, e) => sum + (e.blob?.size || 0), 0);
        const minutes = all.reduce((sum, e) => sum + (e.durationSec || 0), 0) / 60;
        const bySpeaker = {};
        all.forEach(e => { bySpeaker[e.speaker] = (bySpeaker[e.speaker] || 0) + 1; });
        el.innerText = `${all.length} Seite(n) eingesprochen (${Object.entries(bySpeaker).map(([s, n]) => `${s}: ${n}`).join(', ')}), zusammen ca. ${minutes.toFixed(1).replace('.', ',')} Minuten, ${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB.`;
    }
});
