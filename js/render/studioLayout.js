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

// NEU (KDP-Quadratformat): Seitenverhältnis der Vorschau aus den echten
// Papiermaßen (app.studio.TRIM_PAPER_MM, studioPrint.js) statt fest
// "hoch = 3/4, sonst 3/2" - sonst sähe ein quadratisches Buch hier falsch aus.
function pageAspect(project) {
    const paper = app.studio.TRIM_PAPER_MM?.[project.spec.trim];
    return paper ? `${paper.w}/${paper.h}` : '3/2';
}

// NEU (KDP-Seitenlayout-Varianten + Panorama): Vorschau-Bild einer Seite -
// dieselbe Logik wie pageImageHtml() im Druck (studioPrint.js): Bildbereich
// bei Textstreifen, linke/rechte Hälfte beim Panorama.
function previewImageHtml(spread, half) {
    if (!spread.imgUrl) {
        return `<div class="absolute inset-0 w-full h-full bg-slate-100 flex items-center justify-center text-slate-300 text-2xl">🖼️</div>`;
    }
    if (half) {
        return `<div class="absolute inset-0 overflow-hidden"><img src="${spread.imgUrl}" class="absolute top-0 h-full object-cover" style="width:200%; max-width:none; left:${half === 'left' ? '0' : '-100%'};" alt="Doppelseite ${spread.index + 1}"></div>`;
    }
    const region = app.studio.layout.imageRegion(spread.layout);
    const fit = region.fit === 'contain' ? 'object-contain p-[4%]' : 'object-cover';
    return `<div class="absolute left-0 right-0" style="top:${region.top}%; bottom:${region.bottom}%;"><img src="${spread.imgUrl}" class="absolute inset-0 w-full h-full ${fit}" alt="Doppelseite ${spread.index + 1}"></div>`;
}

function layoutCardHtml(spread, project, planEntry) {
    const layout = spread.layout || { textPos: 'unten', fontScale: 1, syllableColors: false };
    const pct = Math.round((layout.fontScale || 1) * 100);
    const overlay = app.studio.layout.buildOverlayHtml(spread.text || '', layout, project.brief.readingLevel, PREVIEW_BASE_FONT_PX, 'px');
    const panoramaOk = app.studio.layout.panoramaAllowed(project);
    const isPanorama = !!(layout.panorama && panoramaOk);

    // Vorschau: eine Seite - oder beim Panorama zwei nebeneinander mit
    // gestrichelter Falz-Linie, Text auf der Seite, auf der er auch gedruckt wird.
    let preview;
    if (isPanorama) {
        const textSide = app.studio.layout.panoramaTextSide(layout);
        const half = (side) => `<div class="relative overflow-hidden bg-white" style="aspect-ratio:${pageAspect(project)};">${previewImageHtml(spread, side)}${side === textSide ? overlay : ''}</div>`;
        preview = `
        <div class="relative w-full mx-auto rounded-lg overflow-hidden border border-slate-200 grid grid-cols-2" style="max-width:520px;">
            ${half('left')}${half('right')}
            <div class="absolute top-0 bottom-0 left-1/2 border-l-2 border-dashed border-white/80 pointer-events-none"></div>
        </div>`;
    } else {
        preview = `
        <div class="relative w-full mx-auto rounded-lg overflow-hidden border border-slate-200 bg-white" style="max-width:420px; aspect-ratio:${pageAspect(project)};">
            ${previewImageHtml(spread, null)}
            ${overlay}
        </div>`;
    }

    const options = app.studio.layout.TEXT_POS_OPTIONS
        .filter(o => !(isPanorama && (o.id === 'band-oben' || o.id === 'band-unten')))
        .map(o => `<option value="${o.id}" ${(layout.textPos || 'unten') === o.id ? 'selected' : ''}>${o.label}</option>`).join('');

    // Seitenzahl im gedruckten Buch (Seite 1 = Titelseite) - macht sichtbar,
    // wo ein Panorama liegt und ob davor eine Leerseite nötig wird.
    const pageInfo = planEntry
        ? (planEntry.panorama ? `Buchseiten ${planEntry.startPage}-${planEntry.startPage + 1}` : `Buchseite ${planEntry.startPage}`)
        : '';
    const hints = [];
    if (planEntry?.blankBefore) hints.push('⚠️ Davor wird im Druck eine Leerseite eingefügt, damit das Panorama auf zwei gegenüberliegenden Seiten liegt.');
    if (layout.textPos === 'ohne' && (spread.text || '').trim()) hints.push('ℹ️ Der Text dieser Doppelseite erscheint nicht im Druck (im Reader wird er weiter vorgelesen).');
    if (spread.imageStale) hints.push('🖼️ Das Bild passt nicht mehr zum Layout - in Stufe 6 "Bilder" neu erzeugen.');

    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-3 space-y-3">
        <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-slate-400 uppercase">Doppelseite ${spread.index + 1}</span>
            <span class="text-[10px] text-slate-400">${pageInfo}</span>
        </div>
        ${preview}
        ${hints.map(h => `<p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">${h}</p>`).join('')}
        <div class="grid grid-cols-2 gap-2">
            <div>
                <label class="text-[10px] font-bold text-slate-500 block mb-0.5">Seitenaufbau</label>
                <select onchange="app.studio.updateSpreadLayout(${spread.index}, {textPos: this.value})" class="w-full text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">
                    ${options}
                </select>
            </div>
            <div>
                <label class="text-[10px] font-bold text-slate-500 block mb-0.5">Schriftgröße (${pct} %)</label>
                <input type="range" min="${app.studio.layout.FONT_SCALE_MIN}" max="${app.studio.layout.FONT_SCALE_MAX}" step="0.1" value="${layout.fontScale || 1}"
                    onchange="app.studio.updateSpreadLayout(${spread.index}, {fontScale: parseFloat(this.value)})" class="w-full mt-1.5">
            </div>
        </div>
        ${panoramaOk ? `
        <label class="flex items-start gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" ${isPanorama ? 'checked' : ''} onchange="app.studio.toggleSpreadPanorama(${spread.index}, this.checked)" class="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
            <span>🌄 Panorama über zwei Buchseiten<br><span class="font-normal text-slate-400">Ein breites Bild läuft über den Falz hinweg auf beide Seiten. Braucht ein neues Bild im Breitformat.</span></span>
        </label>` : ''}
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
        // NEU (KDP-Panorama): physische Seitenfolge einmal für alle Karten.
        const plan = isComic ? [] : app.studio.layout.planPhysicalPages(project);
        list.innerHTML = project.spreads.length
            ? project.spreads.map((s, i) => isComic ? comicLayoutCardHtml(s, s.index) : layoutCardHtml(s, project, plan[i])).join('')
            : `<div class="col-span-full text-center py-10 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200"><span class="text-3xl block mb-2">📐</span><p class="text-xs font-semibold px-4">Noch keine Doppelseiten - erst in der Stufe "Geschichte" welche anlegen.</p></div>`;
        // NEU (comicfähiger Druck): der Sprechblasen-Einbrenn-Umschalter im
        // Druckblock ist nur beim Comic relevant (siehe js/studio/studioPrint.js).
        document.getElementById('studioPrintBubbleRow')?.classList.toggle('hidden', !isComic);

        // NEU: EIN Silbenfarben-Umschalter fürs ganze Buch statt vorher pro
        // Doppelseite (Nutzer-Feedback - siehe app.studio.setBookSyllableColors()).
        // Bei Comics ausgeblendet (dort läuft Text über Sprechblasen, keine
        // Silbenfärbung). Anzeige: "an", wenn IRGENDEINE Doppelseite es schon
        // aktiv hat - so geht beim ersten Öffnen keine bereits gewählte
        // Einstellung unsichtbar verloren.
        const syllableRow = document.getElementById('studioSyllableColorsRow');
        const syllableCheckbox = document.getElementById('studioSyllableColors');
        if (syllableRow) syllableRow.classList.toggle('hidden', isComic);
        if (syllableCheckbox && !isComic) {
            syllableCheckbox.checked = project.spreads.some(s => s.layout?.syllableColors);
        }
    }
});
