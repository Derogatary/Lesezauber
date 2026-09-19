import { app } from '../core.js';

// ================= SchreibZauber: Stufe "Das Daumenkino" (Wizard-Stufe 5) =================
// Miniatur-Raster aller Doppelseiten: Text-Auszug + Bildidee (spread.sketchPrompt)
// als Stichwort, dazu welche Figuren vorkommen - noch OHNE echtes Bild
// (Konzept C.2). Textinhalte landen wie bei spreadCardHtml (studioWizard.js,
// Stufe "Geschichte") als sanitierter Text/Textarea-Inhalt, nie als
// HTML-Attribut - dafür reicht app.utils.sanitize() hier aus.

function characterChipsHtml(project, spread) {
    if (project.characters.length === 0) return '';
    return `<div class="flex flex-wrap gap-1 mt-1">${project.characters.map(c => {
        const active = (spread.characterIds || []).includes(c.id);
        return `<button onclick="app.studio.toggleSpreadCharacter(${spread.index}, '${c.id}')" class="text-[10px] font-bold px-2 py-0.5 rounded-full border transition ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}">${app.utils.sanitize(c.name || 'Figur')}</button>`;
    }).join('')}</div>`;
}

function storyboardCardHtml(spread, project, total) {
    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-3 space-y-2">
        <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-slate-400 uppercase">Doppelseite ${spread.index + 1}</span>
            <div class="flex items-center gap-1">
                <button onclick="app.studio.moveSpreadUp(${spread.index})" ${spread.index === 0 ? 'disabled' : ''} aria-label="Nach oben verschieben" class="text-slate-400 hover:text-indigo-600 disabled:opacity-25 disabled:cursor-not-allowed text-xs px-1">▲</button>
                <button onclick="app.studio.moveSpreadDown(${spread.index})" ${spread.index >= total - 1 ? 'disabled' : ''} aria-label="Nach unten verschieben" class="text-slate-400 hover:text-indigo-600 disabled:opacity-25 disabled:cursor-not-allowed text-xs px-1">▼</button>
                ${spread.index < total - 1 ? `<button onclick="app.studio.mergeSpreadWithNext(${spread.index})" aria-label="Mit nächster zusammenfassen" title="Mit nächster Doppelseite zusammenfassen" class="text-slate-400 hover:text-indigo-600 text-xs px-1">🔗</button>` : ''}
                <button onclick="app.studio.deleteSpread(${spread.index})" aria-label="Doppelseite löschen" class="text-slate-300 hover:text-red-500 text-xs px-1">🗑️</button>
            </div>
        </div>
        <div class="flex gap-2">
            <div class="w-16 flex-shrink-0">
                ${spread.thumbUrl ? `<img src="${spread.thumbUrl}" class="w-full rounded-lg border border-slate-200" alt="Platzhalter Doppelseite ${spread.index + 1}">` : `<div class="w-full aspect-[3/2] bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 text-xl">🖼️</div>`}
            </div>
            <p class="text-[11px] text-slate-500 line-clamp-4 flex-grow">${app.utils.sanitize(spread.text || '(noch kein Text)')}</p>
        </div>
        <div>
            <label class="text-[10px] font-bold text-slate-500 block mb-0.5">💡 Bildidee (Stichwort)</label>
            <textarea rows="2" placeholder="z.B. Der Fuchs rennt durch hohes Gras, Blick von der Seite" onchange="app.studio.updateSketchPrompt(${spread.index}, this.value)" class="w-full text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">${app.utils.sanitize(spread.sketchPrompt)}</textarea>
        </div>
        ${characterChipsHtml(project, spread)}
    </div>`;
}

Object.assign(app.render, {
    studioStoryboard(project) {
        const list = document.getElementById('studioStoryboardList');
        if (!list) return;
        list.innerHTML = project.spreads.length
            ? project.spreads.map(s => storyboardCardHtml(s, project, project.spreads.length)).join('')
            : `<div class="col-span-full text-center py-10 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200"><span class="text-3xl block mb-2">🎬</span><p class="text-xs font-semibold px-4">Noch keine Doppelseiten - erst in der Stufe "Geschichte" welche anlegen.</p></div>`;
    }
});
