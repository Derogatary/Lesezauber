import { app } from '../core.js';

// ================= SchreibZauber: Stufe "Die Bilder" (Wizard-Stufe 6) =================
// Zeigt pro Doppelseite das aktuelle Bild (Platzhalter oder echt), erlaubt
// die Einzelgenerierung (Konzept: NIE automatisch fürs ganze Buch) und den
// Kostenzähler (project.costLog). Ob "echt" überhaupt möglich ist,
// entscheidet einzig app.studio.resolveImageSourceId() (studioCore.js).

const SOURCE_LABEL = { placeholder: '🖼️ Platzhalter', upload: '📷 eigenes Bild', gemini: '✨ KI-Bild', pollinations: '🎨 KI-Bild (kostenlos)' };

function imageCardHtml(spread) {
    const source = spread.imageMeta?.source;
    const isError = spread.imageStatus === 'error';
    return `
    <div class="bg-white rounded-2xl border ${spread.imageStale ? 'border-amber-300' : 'border-slate-200'} shadow-sm overflow-hidden p-3 space-y-2">
        <div class="flex items-center justify-between">
            <span class="text-[10px] font-bold text-slate-400 uppercase">Doppelseite ${spread.index + 1}</span>
            <span class="text-[10px] font-semibold text-slate-500">${source ? (SOURCE_LABEL[source] || source) : ''}</span>
        </div>
        ${spread.imgUrl ? `<img src="${spread.imgUrl}" class="w-full rounded-lg border border-slate-200" alt="Bild Doppelseite ${spread.index + 1}">` : `<div class="w-full aspect-[3/2] bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 text-2xl">🖼️</div>`}
        ${spread.imageStale ? `<p class="text-[10px] text-amber-700 font-semibold">⚠️ Figur veraltet (Figurenblatt wurde seitdem geändert)</p>` : ''}
        ${isError ? `<p class="text-[10px] text-red-600 font-semibold">❌ Zuletzt fehlgeschlagen</p>` : ''}
        <button onclick="app.studio.generateSpreadImage(${spread.index})" class="w-full text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg py-2 transition">
            ${spread.imageStale ? '🔄 Neu zeichnen' : (spread.imgUrl ? '🔄 Neu erzeugen' : '🎨 Bild generieren')}
        </button>
        <!-- NEU (v0.45.0-beta): Handweg für genau dieses Bild -->
        <div class="grid grid-cols-2 gap-2">
            <button onclick="app.actions.manualCopyPrompt('${spread.panels?.length ? `p:${spread.index}:0` : `s:${spread.index}`}')" class="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-lg py-1.5 transition">📋 Prompt kopieren</button>
            <button onclick="app.actions.openStudioManualImages('${spread.panels?.length ? `p:${spread.index}:0` : `s:${spread.index}`}')" class="text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg py-1.5 transition">✍️ Austauschen</button>
        </div>
    </div>`;
}

Object.assign(app.render, {
    studioImages(project) {
        const list = document.getElementById('studioImageList');
        if (list) {
            list.innerHTML = project.spreads.length
                ? project.spreads.map(imageCardHtml).join('')
                : `<div class="col-span-full text-center py-10 text-slate-500 bg-white rounded-2xl border border-dashed border-slate-200"><span class="text-3xl block mb-2">🎨</span><p class="text-xs font-semibold px-4">Noch keine Doppelseiten - erst in der Stufe "Geschichte" welche anlegen.</p></div>`;
        }

        const sourceId = app.studio.resolveImageSourceId();
        const replaceBtn = document.getElementById('studioReplacePlaceholdersBtn');
        if (replaceBtn) {
            const placeholderCount = project.spreads.filter(s => s.imageMeta?.source === 'placeholder').length;
            // NEU (Pollinations-Quelle): "alle Platzhalter ersetzen" ist jetzt
            // bei JEDER echten Quelle möglich, nicht mehr nur bei Gemini.
            replaceBtn.classList.toggle('hidden', sourceId === 'placeholder' || placeholderCount === 0);
        }
        const hint = document.getElementById('studioImageSourceHint');
        if (hint) {
            hint.innerText = sourceId === 'gemini'
                ? '✨ Echte KI-Bildgenerierung (Gemini) ist aktiv (Einstellungen → Werkstatt).'
                : sourceId === 'pollinations'
                    ? '🎨 Kostenlose KI-Bildgenerierung (Pollinations) ist aktiv - ohne Referenzbilder, Figuren bleiben nur ähnlich (Einstellungen → Werkstatt).'
                    : '🖼️ Es werden Platzhalter erzeugt. Echte KI-Bilder lassen sich in den Einstellungen bestätigen (Gemini kostenpflichtig mit Zahlungsmethode am Google-Konto, oder Pollinations kostenlos ohne Key).';
        }

        const costEl = document.getElementById('studioCostDisplay');
        if (costEl) {
            const log = project.costLog || { imageCalls: 0, estimatedUsd: 0 };
            costEl.innerText = log.imageCalls > 0
                ? `💰 Bilder erzeugt: ${log.imageCalls} · geschätzt ca. ${log.estimatedUsd.toFixed(2)} $`
                : '💰 Bisher keine kostenpflichtigen Bilder erzeugt.';
        }
    }
});
