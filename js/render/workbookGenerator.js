import { app } from '../core.js';

// Nur die vier Aufgabenarten, die der Heft-Generator erzeugen kann (siehe
// GENERATOR_TASK_TYPES in js/api.js - Aufgabenarten ohne Bildmaterial).
// Dieselben Labels wie in js/render/workbook.js (TASK_TYPE_LABELS), hier
// bewusst nur für diese vier dupliziert statt die dortige, lokale Liste zu
// exportieren.
const GEN_TASK_TYPE_LABELS = {
    zaehlen: '🔢 Zählen',
    ankreuzen: '☑️ Ankreuzen',
    nachspuren: '✏️ Nachspuren',
    schreiben: '📝 Schreiben'
};

function sheetCardHtml(sheet, index) {
    const typeLabel = GEN_TASK_TYPE_LABELS[sheet.taskType] || sheet.taskType;
    return `
    <div class="bg-white rounded-2xl border ${sheet.selected ? 'border-indigo-200' : 'border-slate-200 opacity-50'} shadow-sm p-3 transition">
        <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" ${sheet.selected ? 'checked' : ''} onchange="app.actions.toggleWorksheetSelected(${index})" class="w-5 h-5 mt-0.5 accent-indigo-600 flex-shrink-0">
            <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                    <span class="text-sm font-bold text-slate-900">${app.utils.sanitize(sheet.heading)}</span>
                    <span class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">${app.utils.sanitize(typeLabel)}</span>
                </div>
                <p class="text-xs text-slate-600">${app.utils.sanitize(sheet.taskText)}</p>
            </div>
        </label>
    </div>`;
}

Object.assign(app.render, {
    // NEU (Auftrag 11): zeigt entweder das leere Formular oder - sobald ein
    // Entwurf existiert (app.state.workbookGeneratorDraft, siehe
    // app.actions.generateWorksheetDraft) - die vorgeschlagenen Blätter zum
    // Abwählen, bevor daraus ein Heft angelegt wird.
    workbookGenerator() {
        const draft = app.state.workbookGeneratorDraft;
        const formSection = document.getElementById('heftGenForm');
        const resultsSection = document.getElementById('heftGenResults');
        if (!formSection || !resultsSection) return;

        formSection.classList.toggle('hidden', !!draft);
        resultsSection.classList.toggle('hidden', !draft);
        if (!draft) return;

        const selectedCount = draft.sheets.filter(s => s.selected).length;
        document.getElementById('heftGenResultTitle').innerText = `${draft.title} (${selectedCount}/${draft.sheets.length} ausgewählt)`;

        const skippedHint = document.getElementById('heftGenSkippedHint');
        if (draft.skipped) {
            skippedHint.classList.remove('hidden');
            skippedHint.innerText = `${draft.skipped} Blatt/Blätter waren unbrauchbar und wurden aussortiert.`;
        } else {
            skippedHint.classList.add('hidden');
        }

        document.getElementById('heftGenSheetList').innerHTML = draft.sheets.map(sheetCardHtml).join('');
    }
});
