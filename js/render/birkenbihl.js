import { app } from '../core.js';

// ================= Birkenbihl-Tab im Reader =================
// Baut die interlineare Wort-für-Wort-Ansicht: Zielsprache oben, wörtliche
// deutsche Übersetzung darunter, in Zielsprachen-Wortstellung (siehe
// js/actions/birkenbihl.js für die Erzeugung/den Zwischenspeicher auf
// page.birkenbihl). Gleiches Anzeige-Muster wie das Buch-Quiz
// (render/reader.js, bookQuizSection): "Erzeugen"-Knopf vs. fertiges
// Ergebnis mit kleinem "Neu erzeugen"-Link.

// Card-Skeleton OHNE Nutzertext im Markup - dieselbe Vorsicht wie bei den
// Figuren-Karten (js/render/studioCharacters.js): pair.target/pair.gloss
// kommen von der KI und könnten theoretisch ein Anführungszeichen enthalten,
// deshalb hier trotzdem sanitize() statt roher Interpolation in ein Attribut.
function pairChipHtml(pair) {
    return `
    <div class="flex flex-col items-center">
        <span class="text-sm font-bold text-slate-900">${app.utils.sanitize(pair.target)}</span>
        <span class="text-[10px] text-indigo-600 font-semibold">${app.utils.sanitize(pair.gloss || '')}</span>
    </div>`;
}

Object.assign(app.render, {
    birkenbihlTab(page) {
        const langInfo = app.birkenbihlLanguages.find(l => l.id === app.settings.birkenbihlLanguage) || app.birkenbihlLanguages[0];
        const langHint = document.getElementById('birkenbihlLangHint');
        if (langHint) langHint.innerText = `Zielsprache: ${langInfo.label} (in den Einstellungen änderbar)`;

        const hasResult = !!(page?.birkenbihl?.pairs?.length);

        const emptyState = document.getElementById('birkenbihlEmptyState');
        const result = document.getElementById('birkenbihlResult');
        const generateBtn = document.getElementById('birkenbihlGenerateBtn');
        if (emptyState) emptyState.classList.toggle('hidden', hasResult);
        if (result) result.classList.toggle('hidden', !hasResult);
        // FIX (wie beim Buch-Quiz-Knopf): der Haupt-Knopf blieb sonst nach
        // dem Erzeugen stehen - ein zweiter Klick sah aus, als passiere
        // nichts, weil das fertige Ergebnis ja schon aus page.birkenbihl kam.
        if (generateBtn) generateBtn.classList.toggle('hidden', hasResult);

        if (!hasResult) return;

        const wordsEl = document.getElementById('birkenbihlWords');
        if (wordsEl) wordsEl.innerHTML = page.birkenbihl.pairs.map(pairChipHtml).join('');

        // Hinweis, falls die Zielsprache in den Einstellungen seither
        // gewechselt wurde - der Zwischenspeicher gehört noch zur alten
        // Sprache (kein automatisches Neu-Erzeugen, kostet sonst ungefragt
        // einen weiteren API-Aufruf).
        const staleHint = document.getElementById('birkenbihlStaleHint');
        if (staleHint) staleHint.classList.toggle('hidden', page.birkenbihl.lang === app.settings.birkenbihlLanguage);
    }
});
