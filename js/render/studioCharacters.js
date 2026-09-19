import { app } from '../core.js';

// ================= SchreibZauber: Stufe "Die Figuren" (Wizard-Stufe 4) =================
// Zeigt die Stilkarte (project.style) und die Figuren-Bibel (project.characters[])
// gemeinsam an (Konzept C.3 gruppiert beides). Alle Figuren-Felder werden
// bewusst LEER ins Markup geschrieben und erst danach per .value befüllt
// (siehe fillCharacterCard()) - so landet nie ein Name/Steckbrief-Text
// (von Hand ODER von der KI vorgeschlagen) roh in einem HTML-Attribut, wo
// ein Anführungszeichen das Markup zerschießen könnte. Sicherer als
// app.utils.sanitize() in einem value="..."-Attribut, weil hier gar kein
// String-Interpolieren von Nutzertext in Markup mehr passiert.

function fillStyleForm(project) {
    const st = project.style || {};
    const palette = st.palette || [];
    document.getElementById('studioStyleLook').value = st.look || 'aquarell';
    document.getElementById('studioStyleLineWeight').value = st.lineWeight || 'weich';
    document.getElementById('studioStyleColor1').value = palette[0] || '#fbbf24';
    document.getElementById('studioStyleColor2').value = palette[1] || '#60a5fa';
    document.getElementById('studioStyleColor3').value = palette[2] || '#34d399';
    document.getElementById('studioStyleExtraPrompt').value = st.extraPrompt || '';
}

// Card-Skeleton OHNE Nutzertext im Markup - siehe Hinweis oben.
function characterCardSkeleton(characterId) {
    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2" data-character-card="${characterId}">
        <div class="flex gap-3">
            <div class="w-16 flex-shrink-0" data-role="sheetThumb"></div>
            <div class="flex-grow min-w-0 space-y-1.5">
                <div class="flex gap-1.5">
                    <input data-field="name" type="text" placeholder="Name" onchange="app.studio.updateCharacterField('${characterId}','name', this.value)" class="flex-grow text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500">
                    <button onclick="app.studio.deleteCharacter('${characterId}')" aria-label="Figur löschen" class="text-slate-300 hover:text-red-500 text-xs px-1">🗑️</button>
                </div>
                <input data-field="role" type="text" placeholder="Rolle, z.B. Hauptfigur" onchange="app.studio.updateCharacterField('${characterId}','role', this.value)" class="w-full text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500">
            </div>
        </div>
        <div class="grid grid-cols-2 gap-1.5">
            <input data-field="age" type="text" placeholder="Alter" onchange="app.studio.updateCharacterField('${characterId}','age', this.value)" class="text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500">
            <input data-field="kind" type="text" placeholder="Art (Kind/Tier/...)" onchange="app.studio.updateCharacterField('${characterId}','kind', this.value)" class="text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500">
        </div>
        <textarea data-field="look" rows="2" placeholder="Aussehen (Körperbau, Haare/Fell, Gesicht)" onchange="app.studio.updateCharacterField('${characterId}','look', this.value)" class="w-full text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"></textarea>
        <input data-field="clothing" type="text" placeholder="Kleidung" onchange="app.studio.updateCharacterField('${characterId}','clothing', this.value)" class="w-full text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500">
        <div class="flex items-center gap-2">
            <span class="text-[10px] text-slate-500 font-semibold">Farben:</span>
            <input data-color="0" type="color" onchange="app.studio.updateCharacterColor('${characterId}', 0, this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer">
            <input data-color="1" type="color" onchange="app.studio.updateCharacterColor('${characterId}', 1, this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer">
            <input data-color="2" type="color" onchange="app.studio.updateCharacterColor('${characterId}', 2, this.value)" class="w-7 h-7 rounded border border-slate-200 cursor-pointer">
        </div>
        <input data-field="quirk" type="text" placeholder="Unverwechselbare Eigenart" onchange="app.studio.updateCharacterField('${characterId}','quirk', this.value)" class="w-full text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500">
        <button onclick="app.studio.regenerateCharacterSheet('${characterId}')" data-role="sheetBtn" class="w-full text-xs font-bold text-indigo-600 border border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition"></button>
        <p data-role="staleHint" class="text-[10px] text-amber-700 font-semibold hidden"></p>
    </div>`;
}

function fillCharacterCard(c, project) {
    const card = document.querySelector(`[data-character-card="${c.id}"]`);
    if (!card) return;
    card.querySelector('[data-field="name"]').value = c.name || '';
    card.querySelector('[data-field="role"]').value = c.role || '';
    card.querySelector('[data-field="age"]').value = c.age || '';
    card.querySelector('[data-field="kind"]').value = c.kind || '';
    card.querySelector('[data-field="look"]').value = c.look || '';
    card.querySelector('[data-field="clothing"]').value = c.clothing || '';
    card.querySelector('[data-field="quirk"]').value = c.quirk || '';
    const colors = c.colors || [];
    card.querySelector('[data-color="0"]').value = colors[0] || '#cccccc';
    card.querySelector('[data-color="1"]').value = colors[1] || '#cccccc';
    card.querySelector('[data-color="2"]').value = colors[2] || '#cccccc';

    const thumb = card.querySelector('[data-role="sheetThumb"]');
    thumb.innerHTML = c.sheetThumbUrl
        ? `<img src="${c.sheetThumbUrl}" class="w-full aspect-square object-cover rounded-lg border border-slate-200" alt="Figurenblatt">`
        : `<div class="w-full aspect-square bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 text-xl">🧑‍🎨</div>`;

    card.querySelector('[data-role="sheetBtn"]').innerText = c.sheetImgUrl ? '🔄 Figurenblatt neu erzeugen' : '🎨 Figurenblatt erzeugen';

    const staleCount = project.spreads.filter(s => (s.characterIds || []).includes(c.id) && s.imageStale).length;
    const staleHint = card.querySelector('[data-role="staleHint"]');
    staleHint.classList.toggle('hidden', staleCount === 0);
    if (staleCount > 0) staleHint.innerText = `⚠️ ${staleCount} Doppelseite(n) mit alter Figur-Ansicht - im Bilder-Schritt neu zeichnen.`;
}

Object.assign(app.render, {
    studioCharacters(project) {
        fillStyleForm(project);

        const list = document.getElementById('studioCharacterList');
        const emptyState = document.getElementById('studioCharacterEmptyState');
        if (emptyState) emptyState.classList.toggle('hidden', project.characters.length > 0);
        if (!list) return;

        list.innerHTML = project.characters.map(c => characterCardSkeleton(c.id)).join('');
        project.characters.forEach(c => fillCharacterCard(c, project));
    },

    // NEU (Ausbaustufe 6 - Politur): Auswahl-Zeile für "Figur aus anderem
    // Werk übernehmen" ein-/ausblenden, Optionen erst beim Öffnen aufbauen
    // (nicht bei jedem Stufe-4-Rendern - die Liste ändert sich selten und
    // ist sonst unnötige Arbeit).
    toggleImportCharacterRow() {
        const row = document.getElementById('studioImportCharacterRow');
        if (!row) return;
        const willShow = row.classList.contains('hidden');
        row.classList.toggle('hidden');
        if (!willShow) return;

        const project = app.studio.projects[app.state.currentStudioProjectId];
        const options = project ? app.studio.listOtherProjectsCharacters(project) : [];
        const select = document.getElementById('studioImportCharacterSelect');
        select.innerHTML = options.length
            ? options.map(o => `<option value="${o.projectId}::${o.character.id}">${app.utils.sanitize(o.projectTitle)} – ${app.utils.sanitize(o.character.name)}</option>`).join('')
            : '<option value="">(keine Figuren in anderen Werken gefunden)</option>';
    },

    // Liest die getroffene Auswahl aus und übergibt sie an
    // app.studio.importCharacterFromOtherProject().
    studioImportSelectedCharacter() {
        const value = document.getElementById('studioImportCharacterSelect').value;
        if (!value) return;
        const [sourceProjectId, sourceCharacterId] = value.split('::');
        app.studio.importCharacterFromOtherProject(sourceProjectId, sourceCharacterId);
        document.getElementById('studioImportCharacterRow').classList.add('hidden');
    },

    // Liest das Stilkarte-Formular aus und übergibt es an app.studio.saveStyle().
    studioCollectStyle() {
        app.studio.saveStyle({
            look: document.getElementById('studioStyleLook').value,
            lineWeight: document.getElementById('studioStyleLineWeight').value,
            color1: document.getElementById('studioStyleColor1').value,
            color2: document.getElementById('studioStyleColor2').value,
            color3: document.getElementById('studioStyleColor3').value,
            extraPrompt: document.getElementById('studioStyleExtraPrompt').value
        });
    }
});
