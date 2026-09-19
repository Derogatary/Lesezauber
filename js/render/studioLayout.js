import { app } from '../core.js';

// ================= SchreibZauber: Stufe "Das Layout" (Wizard-Stufe 7) =================
// Zeigt pro Doppelseite eine Vorschau (Bild + die echte HTML-Textebene aus
// app.studio.layout.buildOverlayHtml - dieselbe Funktion, die auch der
// Druck in studioPrint.js benutzt, damit Vorschau und Ausdruck garantiert
// zusammenpassen) sowie die drei Regler aus Konzept C.2 Stufe 7:
// Textposition, Schriftgröße, Silbenfarben.

// NEU: feste Vorschaubreite, unabhängig vom Tailwind-Grid (1 oder 2
// Spalten je nach Bildschirmbreite) - sonst müsste die Schriftgröße der
// Vorschau ständig neu berechnet werden, nur damit sie zur tatsächlichen
// Kartenbreite passt. Für eine reine Layout-Vorschau (nicht pixelgenau)
// reicht eine feste Referenzbreite.
const PREVIEW_BASE_FONT_PX = 15;

function layoutCardHtml(spread, project) {
    const layout = spread.layout || { textPos: 'unten', fontScale: 1, syllableColors: false };
    const pct = Math.round((layout.fontScale || 1) * 100);
    const aspect = project.spec.trim === 'a5-hoch' || project.spec.trim === 'a4-hoch' ? '3/4' : '3/2';
    const img = spread.imgUrl
        ? `<img src="${spread.imgUrl}" class="absolute inset-0 w-full h-full object-cover" alt="Doppelseite ${spread.index + 1}">`
        : `<div class="absolute inset-0 w-full h-full bg-slate-100 flex items-center justify-center text-slate-300 text-2xl">🖼️</div>`;
    const overlay = app.studio.layout.buildOverlayHtml(spread.text || '', layout, project.brief.readingLevel, PREVIEW_BASE_FONT_PX, 'px');

    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-3 space-y-3">
        <span class="text-[10px] font-bold text-slate-400 uppercase">Doppelseite ${spread.index + 1}</span>
        <div class="relative w-full mx-auto rounded-lg overflow-hidden border border-slate-200 bg-slate-50" style="max-width:420px; aspect-ratio:${aspect};">
            ${img}
            ${overlay}
        </div>
        <div class="grid grid-cols-2 gap-2">
            <div>
                <label class="text-[10px] font-bold text-slate-500 block mb-0.5">Textposition</label>
                <select onchange="app.studio.updateSpreadLayout(${spread.index}, {textPos: this.value})" class="w-full text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">
                    <option value="oben" ${layout.textPos === 'oben' ? 'selected' : ''}>oben</option>
                    <option value="unten" ${layout.textPos === 'unten' || !layout.textPos ? 'selected' : ''}>unten</option>
                    <option value="links" ${layout.textPos === 'links' ? 'selected' : ''}>links</option>
                    <option value="rechts" ${layout.textPos === 'rechts' ? 'selected' : ''}>rechts</option>
                </select>
            </div>
            <div>
                <label class="text-[10px] font-bold text-slate-500 block mb-0.5">Schriftgröße (${pct} %)</label>
                <input type="range" min="${app.studio.layout.FONT_SCALE_MIN}" max="${app.studio.layout.FONT_SCALE_MAX}" step="0.1" value="${layout.fontScale || 1}"
                    onchange="app.studio.updateSpreadLayout(${spread.index}, {fontScale: parseFloat(this.value)})" class="w-full mt-1.5">
            </div>
        </div>
        <label class="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" ${layout.syllableColors ? 'checked' : ''} onchange="app.studio.updateSpreadLayout(${spread.index}, {syllableColors: this.checked})" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
            🎨 Silbenfarben (Erstleser-Hilfe)
        </label>
    </div>`;
}

// NEU (Ausbaustufe 5, Panels): Comic-Gegenstück zu layoutCardHtml() oben -
// zeigt jetzt die ECHTE Panel-Anordnung (app.studio.comicPanels.layoutFor(),
// dieselben Regionen, die auch beim Zusammensetzen/Einbrennen benutzt
// werden - Vorschau und Export zeigen also garantiert dasselbe Layout) mit
// jedem Panel-Bild an seiner Stelle plus seinen Sprechblasen als
// HTML-Ebene (app.studio.balloons.buildBalloonsHtml(), PRO PANEL - die
// Prozent-Koordinaten einer Sprechblase sind relativ zu IHREM Panel, nicht
// zur ganzen Seite). Statt Textposition/Schriftgröße/Silbenfarben (die
// gelten nur für Fließtext) gibt es hier pro Sprechblase X/Y/Breite-Regler
// + Schwänzchen-Richtung.
function balloonControlsHtml(spreadIndex, panelIndex, balloon) {
    return `
    <div class="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1.5">
        <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-indigo-700">${app.utils.sanitize(balloon.speaker || 'Sprechblase')}</span>
            <button onclick="app.studio.deleteBalloon(${spreadIndex}, ${panelIndex}, '${balloon.id}')" aria-label="Sprechblase löschen" class="text-slate-300 hover:text-red-500 text-xs">🗑️</button>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
            <div>
                <label class="text-[9px] font-bold text-slate-500 block">X (${balloon.x}%)</label>
                <input type="range" min="0" max="90" value="${balloon.x}" onchange="app.studio.updateBalloon(${spreadIndex}, ${panelIndex}, '${balloon.id}', {x: parseInt(this.value)})" class="w-full">
            </div>
            <div>
                <label class="text-[9px] font-bold text-slate-500 block">Y (${balloon.y}%)</label>
                <input type="range" min="0" max="90" value="${balloon.y}" onchange="app.studio.updateBalloon(${spreadIndex}, ${panelIndex}, '${balloon.id}', {y: parseInt(this.value)})" class="w-full">
            </div>
            <div>
                <label class="text-[9px] font-bold text-slate-500 block">Breite (${balloon.w}%)</label>
                <input type="range" min="20" max="90" value="${balloon.w}" onchange="app.studio.updateBalloon(${spreadIndex}, ${panelIndex}, '${balloon.id}', {w: parseInt(this.value)})" class="w-full">
            </div>
        </div>
        <select onchange="app.studio.updateBalloon(${spreadIndex}, ${panelIndex}, '${balloon.id}', {tail: this.value})" class="w-full text-[10px] text-slate-900 bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-indigo-500">
            <option value="unten-links" ${balloon.tail === 'unten-links' ? 'selected' : ''}>Schwänzchen unten-links</option>
            <option value="unten-rechts" ${balloon.tail === 'unten-rechts' ? 'selected' : ''}>Schwänzchen unten-rechts</option>
            <option value="oben-links" ${balloon.tail === 'oben-links' ? 'selected' : ''}>Schwänzchen oben-links</option>
            <option value="oben-rechts" ${balloon.tail === 'oben-rechts' ? 'selected' : ''}>Schwänzchen oben-rechts</option>
        </select>
    </div>`;
}

function comicLayoutCardHtml(spread, index) {
    const layout = app.studio.comicPanels.layoutFor(spread.panels.length);

    const panelBoxes = spread.panels.map((panel, pi) => {
        const region = layout[pi];
        if (!region) return '';
        const style = `left:${region.x * 100}%; top:${region.y * 100}%; width:${region.w * 100}%; height:${region.h * 100}%; padding:0.4%;`;
        const img = panel.imgUrl
            ? `<img src="${panel.imgUrl}" class="absolute inset-0 w-full h-full object-cover rounded" alt="Panel ${pi + 1}">`
            : `<div class="absolute inset-0 w-full h-full bg-slate-100 flex items-center justify-center text-slate-300 text-lg rounded">🖼️</div>`;
        return `<div class="absolute" style="${style}"><div class="relative w-full h-full border border-slate-800 rounded overflow-hidden">${img}${app.studio.balloons.buildBalloonsHtml(panel.balloons)}</div></div>`;
    }).join('');

    const controls = spread.panels.map((panel, pi) => `
        <div class="space-y-1.5">
            <p class="text-[10px] font-bold text-slate-500 uppercase">Panel ${pi + 1}</p>
            ${panel.balloons.map(b => balloonControlsHtml(index, pi, b)).join('') || '<p class="text-[11px] text-slate-400 italic">Keine Sprechblasen in diesem Panel.</p>'}
            <button onclick="app.studio.addBalloon(${index}, ${pi})" class="w-full text-[11px] font-bold text-indigo-600 border border-dashed border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition">+ Sprechblase</button>
        </div>`).join('<hr class="border-slate-100">');

    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-3 space-y-3">
        <span class="text-[10px] font-bold text-slate-400 uppercase">Seite ${index + 1}</span>
        <div class="relative w-full mx-auto rounded-lg overflow-hidden bg-slate-50" style="max-width:280px; aspect-ratio:3/4;">
            ${panelBoxes}
        </div>
        <div class="space-y-2">${controls}</div>
    </div>`;
}

Object.assign(app.render, {
    studioLayout(project) {
        const list = document.getElementById('studioLayoutList');
        if (!list) return;
        const isComic = project.type === 'comic';
        list.innerHTML = project.spreads.length
            ? project.spreads.map((s) => isComic ? comicLayoutCardHtml(s, s.index) : layoutCardHtml(s, project)).join('')
            : `<div class="col-span-full text-center py-10 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200"><span class="text-3xl block mb-2">📐</span><p class="text-xs font-semibold px-4">Noch keine Doppelseiten - erst in der Stufe "Geschichte" welche anlegen.</p></div>`;
        // NEU (comicfähiger Druck): der Sprechblasen-Einbrenn-Umschalter im
        // Druckblock ist nur beim Comic relevant (siehe js/studio/studioPrint.js).
        document.getElementById('studioPrintBubbleRow')?.classList.toggle('hidden', !isComic);
    }
});
