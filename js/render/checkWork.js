import { app } from '../core.js';

// Farben und Symbole je Ergebnis. Bewusst KEIN Rot: "nochmal" ist eine
// Einladung, es nochmal zu probieren, keine Fehlermeldung.
const VERDICT_STYLE = {
    richtig: { icon: '🎉', label: 'Richtig gemacht!',      box: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-800' },
    fast:    { icon: '👍', label: 'Fast geschafft!',        box: 'bg-amber-50 border-amber-200',    title: 'text-amber-800' },
    nochmal: { icon: '💪', label: 'Probier es nochmal',     box: 'bg-indigo-50 border-indigo-200',  title: 'text-indigo-800' },
    unklar:  { icon: '🤔', label: 'Das sehe ich nicht gut', box: 'bg-slate-100 border-slate-200',   title: 'text-slate-700' }
};

Object.assign(app.render, {
    // NEU: Kontroll-Bereich im Reader. Nur im Heft-Modus sichtbar - bei
    // einer Geschichte gibt es nichts zu kontrollieren.
    checkWork(page, isWorkbook) {
        const section = document.getElementById('checkWorkSection');
        const resultEl = document.getElementById('checkWorkResult');
        if (!section || !resultEl) return;

        section.classList.toggle('hidden', !isWorkbook);
        if (!isWorkbook) {
            resultEl.innerHTML = '';
            return;
        }

        const check = page ? app.utils.resolvePageCheck(page) : null;
        if (!check) {
            resultEl.innerHTML = '';
            return;
        }

        const style = VERDICT_STYLE[check.verdict] || VERDICT_STYLE.unklar;
        const hintsHtml = (check.hints && check.hints.length > 0)
            ? `<ul class="space-y-1 mt-2">${check.hints.map(h => `<li class="text-sm text-slate-800 leading-relaxed">👉 ${app.utils.sanitize(h)}</li>`).join('')}</ul>`
            : '';

        resultEl.innerHTML = `
            <div class="${style.box} border rounded-2xl p-4 space-y-2">
                <div class="flex justify-between items-start gap-2">
                    <p class="text-sm font-extrabold ${style.title}">${style.icon} ${style.label}</p>
                    <button onclick="app.actions.speakCheckResult()" aria-label="Rückmeldung vorlesen" class="bg-white/80 hover:bg-white text-slate-700 p-2 rounded-full transition text-lg leading-none flex-shrink-0">
                        🔊
                    </button>
                </div>
                ${check.praise ? `<p class="text-sm font-bold text-slate-800">${app.utils.sanitize(check.praise)}</p>` : ''}
                ${check.feedback ? `<p class="text-sm text-slate-700 leading-relaxed">${app.utils.sanitize(check.feedback)}</p>` : ''}
                ${hintsHtml}
                <div class="flex items-center gap-2 pt-1 flex-wrap">
                    ${check.thumbUrl ? `<img src="${check.thumbUrl}" alt="Dein fotografiertes Blatt" class="w-12 h-12 object-cover rounded-lg border border-white shadow-sm">` : ''}
                    <button onclick="app.actions.triggerCheckPhoto()" class="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition">
                        📷 Nochmal fotografieren
                    </button>
                    <button onclick="app.actions.clearCheckResult()" class="text-[11px] font-bold px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-700 transition">
                        Rückmeldung ausblenden
                    </button>
                </div>
            </div>`;
    }
});
