import { app } from '../core.js';

// ================= KI-Inhalte melden (v0.41.0-beta, Release-Prüfung A4d) =================
// NEU: 🚩-Knopf an jedem KI-Text im Reader (Zwischenruf, Erstleser-Text,
// Bildbeschreibung, Rätselfrage, Antworten des Zauberers). Die App hat keinen
// Server - eine Meldung geht deshalb NICHT an einen Anbieter, sondern:
//   1. der Text wird sofort ausgeblendet (page.aiHidden) - und zwar überall,
//      weil app.utils.resolvePageVariant() gemeldete Felder leert: Reader,
//      Vorlesen, Druck, Hörbuch, Video;
//   2. ein Eintrag landet in einer Liste für die Eltern (Einstellungen,
//      "🚩 Gemeldete KI-Inhalte"), von dort: wieder einblenden, Liste kopieren
//      (z.B. um sie Claude zum Nachschärfen der Prompts zu geben) oder leeren.
// Die Liste liegt in localStorage (nicht in IndexedDB), weil auch Chat-
// Antworten gemeldet werden können, die zu keinem Buch gehören.

const REPORTS_KEY = 'lz_ai_reports';
const MAX_REPORTS = 200;

// Welche Felder einer Seiten-Variante gemeldet werden können. "quiz" steht
// für Frage UND Antwort gemeinsam (eine unpassende Frage macht die Antwort
// mit unbrauchbar).
const FIELD_LABELS = {
    personaComment: 'Zwischenruf des Erzählers',
    erstleserText: 'Erstleser-Text',
    desc: 'Bildbeschreibung',
    quiz: 'Rätselfrage',
    chat: 'Antwort des Zauberers'
};
const FIELD_KEYS = { quiz: ['quizQ', 'quizA'] };

function loadReports() {
    try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]'); } catch (e) { console.error('Meldeliste unlesbar:', e); return []; }
}
function saveReports(list) {
    try { localStorage.setItem(REPORTS_KEY, JSON.stringify(list.slice(-MAX_REPORTS))); } catch (e) { console.error('Meldeliste nicht speicherbar:', e); }
}

function currentPage() {
    const book = app.library[app.state.currentBookId];
    return { book, page: book?.pages[app.state.currentPageIdx] };
}

Object.assign(app.utils, {
    // Ist dieses Feld (für diese Persona) gemeldet/ausgeblendet?
    isAiHidden(page, personaId, field) {
        return !!(page && page.aiHidden && page.aiHidden[`${personaId}:${field}`]);
    },

    // Liefert die Variante OHNE gemeldete Felder - von resolvePageVariant()
    // (js/utils.js) benutzt. Gibt eine KOPIE zurück, das gespeicherte Original
    // bleibt unverändert (sonst ginge der Text beim "wieder einblenden" verloren).
    stripHiddenAiFields(page, personaId, variant) {
        if (!variant || !page || !page.aiHidden) return variant;
        const prefix = `${personaId}:`;
        const hidden = Object.keys(page.aiHidden).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
        if (hidden.length === 0) return variant;
        const copy = { ...variant };
        hidden.forEach(f => (FIELD_KEYS[f] || [f]).forEach(k => {
            // Erstleser-Text fällt auf den gedruckten Text zurück statt zu verschwinden.
            copy[k] = k === 'erstleserText' ? copy.text : null;
        }));
        return copy;
    }
});

Object.assign(app.actions, {
    // field: 'personaComment' | 'erstleserText' | 'desc' | 'quiz'
    reportAiContent(field) {
        const { book, page } = currentPage();
        if (!book || !page || !FIELD_LABELS[field]) return;
        const personaId = app.state.readingPersonaId || app.settings.persona;
        const raw = app.utils.resolvePageVariant(page, personaId);
        // Text VOR dem Ausblenden festhalten (für die Liste der Eltern).
        const original = page.variants?.[personaId] || raw || {};
        const text = (FIELD_KEYS[field] || [field]).map(k => original[k]).filter(Boolean).join(' / ');
        if (!confirm(`Diesen Text melden und ausblenden?\n\n„${text.slice(0, 200)}“\n\nEr wird dann nicht mehr angezeigt oder vorgelesen. Eltern finden die Meldung in den Einstellungen und können ihn dort wieder einblenden.`)) return;

        page.aiHidden = { ...(page.aiHidden || {}), [`${personaId}:${field}`]: Date.now() };
        app.dbOps.saveBook(book);
        const list = loadReports();
        list.push({
            id: `r_${Date.now()}`, at: new Date().toISOString(), field,
            bookId: book.id, bookTitle: book.title, pageId: page.id, pageNo: app.state.currentPageIdx + 1,
            personaId, text
        });
        saveReports(list);
        app.tts.stop();
        app.render.reader(app.state.currentPageIdx);
        app.ui.toast('Danke! Der Text ist ausgeblendet.', '🚩');
    },

    // Antwort des Zauberers melden (Index in app.state.chatAnswers).
    reportChatAnswer(idx) {
        const entry = (app.state.chatAnswers || [])[idx];
        if (!entry || entry.reported) return;
        if (!confirm(`Diese Antwort melden und ausblenden?\n\n„${entry.answer.slice(0, 200)}“`)) return;
        entry.reported = true;
        const { book, page } = currentPage();
        const list = loadReports();
        list.push({
            id: `r_${Date.now()}`, at: new Date().toISOString(), field: 'chat',
            bookId: book?.id, bookTitle: book?.title, pageId: page?.id, pageNo: app.state.currentPageIdx + 1,
            text: `Frage: ${entry.question} / Antwort: ${entry.answer}`
        });
        saveReports(list);
        app.tts.stop();
        const el = document.querySelector(`[data-chat-answer="${idx}"]`);
        if (el) el.innerText = '🚩 Gemeldet und ausgeblendet.';
        app.ui.toast('Danke! Die Antwort ist ausgeblendet.', '🚩');
    },

    // Einstellungen: gemeldeten Text wieder einblenden.
    restoreAiReport(reportId) {
        const list = loadReports();
        const r = list.find(x => x.id === reportId);
        if (!r) return;
        const book = app.library[r.bookId];
        const page = book?.pages.find(p => p.id === r.pageId);
        if (page?.aiHidden && r.field !== 'chat') {
            delete page.aiHidden[`${r.personaId}:${r.field}`];
            app.dbOps.saveBook(book);
        }
        saveReports(list.filter(x => x.id !== reportId));
        app.render.aiReports();
        app.ui.toast(r.field === 'chat' ? 'Meldung entfernt.' : 'Text wieder eingeblendet.', '↩️');
    },

    async copyAiReports() {
        const list = loadReports();
        if (!list.length) { app.ui.toast('Keine Meldungen vorhanden.', 'ℹ️'); return; }
        const text = ['Gemeldete KI-Inhalte (LeseZauber Pro)', '',
            ...list.map(r => `[${r.at.slice(0, 10)}] ${FIELD_LABELS[r.field] || r.field} - „${r.bookTitle || '?'}“ Seite ${r.pageNo || '?'}${r.personaId ? ` (${r.personaId})` : ''}:\n${r.text}`)
        ].join('\n');
        try {
            await navigator.clipboard.writeText(text);
            app.ui.toast('Meldungen kopiert.', '📋');
        } catch (e) {
            console.error('Zwischenablage nicht verfügbar:', e);
            window.prompt('Meldungen (markieren und kopieren):', text);
        }
    },

    // NEU (v0.41.0-beta): Hinweis "App für Eltern" in der Bibliothek einmal
    // wegklicken (bleibt pro Gerät gespeichert).
    dismissParentNotice() {
        try { localStorage.setItem('lz_parent_notice_ok', '1'); } catch (e) { console.error('Hinweis-Status nicht speicherbar:', e); }
        document.getElementById('parentNotice')?.classList.add('hidden');
    },

    // Nur die Liste leeren - ausgeblendete Texte bleiben ausgeblendet.
    clearAiReports() {
        if (!confirm('Liste der Meldungen leeren? (Die gemeldeten Texte bleiben ausgeblendet.)')) return;
        saveReports([]);
        app.render.aiReports();
    }
});

Object.assign(app.render, {
    // Liste in den Einstellungen (#aiReportsList), aufgerufen von app.render.settings().
    aiReports() {
        const el = document.getElementById('aiReportsList');
        if (!el) return;
        const list = loadReports().slice().reverse();
        el.innerHTML = list.length
            ? list.map(r => `
                <div class="border border-slate-200 rounded-xl p-2 space-y-1">
                    <p class="text-[10px] font-bold text-slate-500">${app.utils.sanitize(r.at.slice(0, 10))} · ${app.utils.sanitize(FIELD_LABELS[r.field] || r.field)} · „${app.utils.sanitize(r.bookTitle || '?')}“ S. ${app.utils.sanitize(String(r.pageNo || '?'))}</p>
                    <p class="text-xs text-slate-700">${app.utils.sanitize(r.text)}</p>
                    <button onclick="app.actions.restoreAiReport('${app.utils.sanitize(r.id).replace(/[^A-Za-z0-9_]/g, '')}')" class="text-[11px] font-bold text-indigo-600 hover:underline">${r.field === 'chat' ? 'Meldung entfernen' : '↩️ Wieder einblenden'}</button>
                </div>`).join('')
            : '<p class="text-[11px] text-slate-400">Noch nichts gemeldet.</p>';
    }
});
