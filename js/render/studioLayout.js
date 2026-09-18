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
                <select onchange="app.studio.updateSpreadLayout(${spread.index}, {textPos: this.value})" class="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">
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

Object.assign(app.render, {
    studioLayout(project) {
        const list = document.getElementById('studioLayoutList');
        if (!list) return;
        list.innerHTML = project.spreads.length
            ? project.spreads.map((s) => layoutCardHtml(s, project)).join('')
            : `<div class="col-span-full text-center py-10 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200"><span class="text-3xl block mb-2">📐</span><p class="text-xs font-semibold px-4">Noch keine Doppelseiten - erst in der Stufe "Geschichte" welche anlegen.</p></div>`;
    }
});
