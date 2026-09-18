import { app } from '../core.js';

// ================= SchreibZauber: Doppelseiten-Druck (Ausbaustufe 3) =================
// docs/KONZEPT-SchreibZauber.md, TEIL C.2 Stufe 8 / TEIL E Ausbaustufe 3
// "Doppelseiten-Druck". Orientiert sich an den KONVENTIONEN von
// app.actions.printBook() (js/actions/backup.js: window.open() ->
// document.write() -> setTimeout(print)), ist aber bewusst eine EIGENE
// Funktion - ein anderer Inhaltstyp (Bild+Text-Layout einer Doppelseite
// statt reinem Vorlese-/Übungsheft-Text) mit eigenen Druckregeln (Bild
// randabfallend ODER mit Rand, Textzone über app.studio.layout.buildOverlayHtml
// freigehalten). printBook() selbst bleibt unangetastet.
//
// WICHTIG - bewusst KEIN KDP-fertiger Export: siehe
// docs/KONZEPT-SchreibZauber.md "Stand nach Stufe 3" für den recherchierten,
// aber hier noch NICHT umgesetzten Kenntnisstand (300dpi/3mm-Bleed als
// echter Übermaß-Zuschlag, Aufteilung einer Doppelseite in zwei
// KDP-Einzelseiten, ISBN-Platzierung). Dieser Druck ist für den eigenen
// Drucker bzw. "als PDF speichern" über den Browser-Druckdialog gedacht.

// NEU: physische Papiermaße je Bauplan-Format (project.spec.trim, siehe
// Konzept D.1) in mm - EIN Ort, analog zu app.studio.trimToFormat()
// (studioCore.js), das dieselben drei Werte auf ein BILD-Seitenverhältnis
// statt ein PAPIER-Format abbildet. A5/A4 sind die in Deutschland
// gängigsten Heimdrucker-Formate, deshalb keine weiteren Papiergrößen.
const TRIM_PAPER_MM = {
    'a5-quer': { w: 210, h: 148 },
    'a5-hoch': { w: 148, h: 210 },
    'a4-hoch': { w: 210, h: 297 }
};

// NEU: Basis-Schriftgröße für den Druck in mm (vor Multiplikation mit
// spread.layout.fontScale) - grob 12-13pt, gut lesbar auf Papier ohne die
// Textzone zu sprengen.
const PRINT_BASE_FONT_MM = 4.4;

function pageHtml(spread, index, project, bleed) {
    const layout = spread.layout || { textPos: 'unten', fontScale: 1, syllableColors: false };
    // NEU: "randabfallend" (bleed) lässt das Bild die ganze Seite füllen
    // (object-fit: cover schneidet dafür ggf. Ränder des Bildes ab),
    // "mit Rand" (Standard - sicherer für Heimdrucker, die selten randlos
    // drucken können) lässt das ganze Bild unbeschnitten mit 8mm Weißrand
    // stehen (object-fit: contain).
    const imgStyle = bleed
        ? 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover;'
        : 'position:absolute; inset:8mm; width:calc(100% - 16mm); height:calc(100% - 16mm); object-fit:contain;';
    const img = spread.imgUrl
        ? `<img src="${spread.imgUrl}" style="${imgStyle}" alt="Doppelseite ${index + 1}">`
        : '';
    const overlay = app.studio.layout.buildOverlayHtml(spread.text || '', layout, project.brief.readingLevel, PRINT_BASE_FONT_MM, 'mm');
    return `<div class="sz-print-page">${img}${overlay}</div>`;
}

Object.assign(app.studio, {
    // bleed: true = Bild randabfallend, false (Standard) = mit weißem
    // Rand. Wird vom Kontrollkästchen in der Layout-Stufe übergeben (siehe
    // index.html #studioPrintBleed).
    printSpreads(bleed = false) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        if (project.spreads.length === 0) {
            app.ui.toast('Noch keine Doppelseiten zum Drucken - erst in der Stufe "Geschichte" welche anlegen.', 'ℹ️');
            return;
        }

        const paper = TRIM_PAPER_MM[project.spec.trim] || TRIM_PAPER_MM['a5-quer'];
        const author = app.profiles.find((p) => p.id === project.profileId)?.name || 'Ich';

        const coverHtml = `
            <div class="sz-print-page" style="display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center; padding:12mm;">
                <h1 style="font-size:9mm; margin:0 0 6mm; font-family:sans-serif;">${app.utils.sanitize(project.title || 'Unbenanntes Werk')}</h1>
                <p style="font-size:4.5mm; color:#475569; font-family:sans-serif;">von ${app.utils.sanitize(author)}</p>
            </div>`;
        const pagesHtml = project.spreads.map((s, i) => pageHtml(s, i, project, bleed)).join('');

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            app.ui.toast('Pop-up blockiert - bitte für diese Seite erlauben.', '⚠️');
            return;
        }

        printWindow.document.write(`
            <html>
            <head>
                <title>${app.utils.sanitize(project.title || 'Unbenanntes Werk')}</title>
                <style>
                    @page { size: ${paper.w}mm ${paper.h}mm; margin: 0; }
                    * { box-sizing: border-box; }
                    body { margin: 0; font-family: sans-serif; }
                    .sz-print-page { position: relative; width: ${paper.w}mm; height: ${paper.h}mm; overflow: hidden; background: #fff; page-break-after: always; }
                    .sz-print-page:last-child { page-break-after: auto; }
                </style>
            </head>
            <body>
                ${coverHtml}
                ${pagesHtml}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 400);
    }
});
