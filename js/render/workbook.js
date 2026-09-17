import { app } from '../core.js';

// Kurze, kindgerechte Überschrift je Aufgabenart - die KI liefert dafür
// den Wert "taskType". Unbekannte/neue Werte landen bei "sonstiges".
const TASK_TYPE_LABELS = {
    ausmalen:  '🖍️ Ausmalen',
    verbinden: '🔗 Verbinden',
    zaehlen:   '🔢 Zählen',
    nachspuren:'✏️ Nachspuren',
    ankreuzen: '☑️ Ankreuzen',
    schreiben: '📝 Schreiben',
    zuordnen:  '🧩 Zuordnen',
    suchen:    '🔍 Suchen',
    sonstiges: '📋 Aufgabe'
};

Object.assign(app.render, {
    // NEU: Auswahl, als was das nächste neue Buch angelegt wird
    // (Bibliotheks-Ansicht, direkt über den Anlege-Knöpfen).
    newBookTypeButtons() {
        const container = document.getElementById('newBookTypeButtons');
        if (!container) return;

        container.innerHTML = app.bookTypes.map(t => {
            const active = app.state.newBookType === t.id;
            const cls = active
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50';
            return `<button onclick="app.actions.setNewBookType('${t.id}')" title="${app.utils.sanitize(t.hint)}" class="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${cls}">${t.icon} ${app.utils.sanitize(t.label)}</button>`;
        }).join('');
    },

    // NEU: Art-Anzeige und -Umschalter in der Buchansicht.
    bookTypeBar(book) {
        const container = document.getElementById('bookTypeBar');
        if (!container || !book) return;

        const currentType = app.utils.resolveBookType(book);
        const buttons = app.bookTypes.map(t => {
            const active = currentType === t.id;
            const cls = active
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50';
            return `<button onclick="app.actions.setBookType('${t.id}')" class="text-[11px] font-bold px-2.5 py-1 rounded-lg border transition ${cls}">${t.icon} ${app.utils.sanitize(t.label)}</button>`;
        }).join('');

        container.innerHTML = `
            <div class="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-2xl border border-slate-200 shadow-sm">
                <span class="text-[11px] font-bold text-slate-500 flex-shrink-0">Art:</span>
                <div class="flex gap-1 flex-wrap justify-end">${buttons}</div>
            </div>`;
    },

    // NEU: Hilfe-Karte im Reader (nur bei Übungsheften): Aufgabenart,
    // benötigtes Material, Schritt-für-Schritt-Hilfe und - erst auf
    // Wunsch - die Lösung.
    workbookHelp(variant) {
        const card = document.getElementById('workbookHelpCard');
        if (!card) return;

        if (!variant) {
            card.classList.add('hidden');
            return;
        }
        card.classList.remove('hidden');

        const typeEl = document.getElementById('workbookTaskType');
        if (typeEl) typeEl.innerText = TASK_TYPE_LABELS[variant.taskType] || TASK_TYPE_LABELS.sonstiges;

        const materialsRow = document.getElementById('workbookMaterialsRow');
        const materialsEl = document.getElementById('workbookMaterials');
        if (materialsRow && materialsEl) {
            materialsRow.classList.toggle('hidden', !variant.materials);
            materialsEl.innerText = variant.materials || '';
        }

        const steps = Array.isArray(variant.helpSteps) ? variant.helpSteps : [];
        const stepsList = document.getElementById('workbookSteps');
        const stepsCard = document.getElementById('workbookStepsCard');
        if (stepsCard) stepsCard.classList.toggle('hidden', steps.length === 0);
        if (stepsList) {
            stepsList.innerHTML = steps.map((step, i) => `
                <li class="flex gap-2 items-start">
                    <span class="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center mt-0.5">${i + 1}</span>
                    <span class="text-sm text-slate-800 leading-relaxed">${app.utils.sanitize(step)}</span>
                </li>`).join('');
        }

        // Lösung beim Seitenwechsel immer wieder zuklappen - sonst sieht
        // das Kind auf der nächsten Aufgabe sofort die Antwort.
        const solutionCard = document.getElementById('workbookSolutionCard');
        const solutionEl = document.getElementById('workbookSolution');
        const solutionBtn = document.getElementById('workbookSolutionBtn');
        if (solutionCard) solutionCard.classList.toggle('hidden', !variant.solution);
        if (solutionEl) {
            solutionEl.innerText = variant.solution || '';
            solutionEl.classList.add('hidden');
        }
        if (solutionBtn) solutionBtn.innerText = 'Lösung zeigen';
    }
});
