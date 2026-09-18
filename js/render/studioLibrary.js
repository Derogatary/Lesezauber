import { app } from '../core.js';

// ================= SchreibZauber: Werkstatt-Übersicht =================
// Gleiches Muster wie js/render/library.js, nur für Projekte statt Bücher.
// Zeigt ausschließlich die Werke des aktuellen Profils (bzw. alle bei
// "Alle Profile"), genau wie die Bibliothek.

// NEU (Stufe 2): drei weitere Stufen dazugekommen (Konzept C.2/TEIL E).
const STAGE_LABEL = { 1: '💡 Idee', 2: '📐 Bauplan', 3: '✍️ Geschichte', 4: '🧑‍🎨 Figuren', 5: '🎬 Daumenkino', 6: '🎨 Bilder' };
// NEU (Ausbaustufe 4 - Arbeitsheft): eigene Stufen-Beschriftung, project.stage
// zählt beim Arbeitsheft-Pfad wieder bei 1 los (siehe js/studio/worksheet.js).
const WORKBOOK_STAGE_LABEL = { 1: '🎯 Lernziel', 2: '📐 Progression', 3: '🧩 Aufgaben' };
function stageLabel(project) {
    return project.type === 'workbook' ? WORKBOOK_STAGE_LABEL[project.stage] : STAGE_LABEL[project.stage];
}

Object.assign(app.render, {
    studioLibrary() {
        const container = document.getElementById('studioProjectList');
        if (!container) return;

        // NEU: Werkart-Buttons für "Neues Werk" - nur verfügbare Typen
        // anbieten (siehe app.studio.projectTypes in studioCore.js).
        const typeButtons = document.getElementById('studioNewProjectButtons');
        if (typeButtons) {
            typeButtons.innerHTML = app.studio.projectTypes.map(t => `
                <button onclick="app.studio.newProject('${t.id}')" title="${app.utils.sanitize(t.hint)}" ${t.available ? '' : 'disabled'}
                    class="text-xs font-bold px-3 py-2 rounded-xl border transition ${t.available ? 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 active:scale-95' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'}">
                    ${t.label}
                </button>`).join('');
        }

        const projects = Object.values(app.studio.projects).filter(p =>
            app.state.currentProfileId === '__all__' || (p.profileId || 'default') === app.state.currentProfileId
        ).sort((a, b) => (b.updated || 0) - (a.updated || 0));

        if (projects.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200">
                    <span class="text-4xl block mb-2">🪄</span>
                    <p class="text-xs font-semibold">Noch kein eigenes Werk begonnen.<br>Oben eine Werkart wählen und loslegen!</p>
                </div>`;
            return;
        }

        container.innerHTML = projects.map(project => {
            const type = app.studio.projectTypes.find(t => t.id === project.type);
            const exported = project.exportedBookId && app.library[project.exportedBookId];
            // NEU (Stufe 2): Kostenzähler sichtbar machen - rein lokal
            // geschätzt, gleiche Haltung wie app.costMeter (js/costMeter.js).
            const log = project.costLog || { imageCalls: 0, estimatedUsd: 0 };
            return `
                <div onclick="app.studio.openProject('${project.id}')" class="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer active:scale-95 flex flex-col p-4 relative">
                    <button onclick="event.stopPropagation(); app.studio.deleteProject('${project.id}')" aria-label="Werk löschen" title="Werk löschen" class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition">🗑️</button>
                    <span class="text-2xl mb-1">${type ? type.label.split(' ')[0] : '📕'}</span>
                    <h3 class="font-bold text-slate-900 text-sm line-clamp-1 pr-6">${app.utils.sanitize(project.title || 'Unbenanntes Werk')}</h3>
                    <p class="text-[10px] text-slate-500 font-semibold mt-0.5">${stageLabel(project) || ''}</p>
                    ${log.imageCalls > 0 ? `<p class="text-[10px] text-purple-600 font-semibold mt-0.5">💰 ${log.imageCalls} Bild(er) · ca. ${log.estimatedUsd.toFixed(2)} $</p>` : ''}
                    ${exported ? `<p class="text-[10px] text-emerald-600 font-bold mt-1">📖 Im Regal</p>` : ''}
                </div>`;
        }).join('');
    }
});
