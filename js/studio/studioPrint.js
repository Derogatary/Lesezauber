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
    'a4-hoch': { w: 210, h: 297 },
    // NEU (v0.39.0-beta): 8,5x8,5 Zoll - das bei KDP-Bilderbüchern
    // gängigste Trimm-Format (docs/KONZEPT-SchreibZauber.md, Nachtrag
    // "KDP-Farbstufen konkretisiert + Seitenlayout-Ideen" Punkt 1).
    'quadrat': { w: 215.9, h: 215.9 }
};

// NEU: Basis-Schriftgröße für den Druck in mm (vor Multiplikation mit
// spread.layout.fontScale) - grob 12-13pt, gut lesbar auf Papier ohne die
// Textzone zu sprengen.
const PRINT_BASE_FONT_MM = 4.4;

// NEU (KDP-Innenteil): die in docs/KONZEPT-SchreibZauber.md, Nachtrag "KDP-
// Druckvorgaben recherchiert" verifizierten Werte - 0,125 Zoll
// Beschnittzugabe (Bleed). Der Sicherheitsabstand für Text ist je nachdem,
// ob die Seite Bleed hat, unterschiedlich groß (per Websuche am 19.09.2026
// gegen kdp.amazon.com nachgeprüft, da die ursprüngliche Sept.-2026-
// Recherche hier pauschal 0,25" angenommen hatte): MIT Bleed (unsere
// Bilderbuch-Seiten, printSpreadsKdp() unten) 0,375", OHNE Bleed (unsere
// Comic-Seiten - siehe kdpComicPageHtml()) weiterhin 0,25". Nur der
// Bleed-Wert ist eine echte physische Vergrößerung der Dokumentseite - der
// "randlos"-Umschalter oben ist rein optisch (object-fit) und WAR nie
// dasselbe wie echter Bleed, siehe dortiger Kommentar.
const KDP_BLEED_MM = 3;
const KDP_SAFE_MM_BLEED = 9.525;    // 0,375 Zoll
const KDP_SAFE_MM_NOBLEED = 6.4;    // 0,25 Zoll

// NEU (KDP-Innenteil): zusätzlicher Bundsteg-Innenrand (courant "gutter"),
// je nach GESAMTER Seitenzahl des fertigen Buchs (project.spec.totalPages,
// inkl. Vor-/Nachsatz - siehe computeSpec() in studioCore.js) - Tabelle
// ebenfalls am 19.09.2026 gegen kdp.amazon.com nachgeprüft. Da diese App
// nicht zwischen linker/rechter (Recto/Verso-)Seite unterscheidet (siehe
// CHANGELOG.md v0.29.0-beta, "Korrektur einer bisherigen Annahme"), kann
// nicht ermittelt werden, welche Seite tatsächlich der Bundsteg ist -
// deshalb wird der größere der beiden Werte (Bundsteg vs. normaler
// Sicherheitsabstand) auf BEIDE Seiten (links UND rechts) angewendet. Das
// verschenkt auf der Nicht-Bundsteg-Seite etwas Fläche, garantiert aber
// Konformität unabhängig von der tatsächlichen Bindungsrichtung.
function kdpGutterMm(totalPages) {
    if (totalPages <= 150) return 9.525;   // 0,375"
    if (totalPages <= 300) return 12.7;    // 0,5"
    if (totalPages <= 500) return 15.875;  // 0,625"
    if (totalPages <= 700) return 19.05;   // 0,75"
    return 22.225;                          // 0,875" (701-828 Seiten)
}

// NEU (KDP-Innenteil): nur Papierformate, die tatsächlich als KDP-eigenes
// Metrik-Trimm-Format geführt werden (A5 hoch = 148x210mm, A4 hoch =
// 210x297mm sind beides gängige ISO-Formate in KDPs Formatliste). "A5 quer"
// (Querformat) ist NICHT geprüft, ob/wie KDP ein Querformat-Bilderbuch
// überhaupt trimmt - deshalb hier bewusst ausgeschlossen statt geraten, statt
// stillschweigend ein evtl. falsches Format anzubieten.
const KDP_ALLOWED_TRIMS = ['a5-hoch', 'a4-hoch', 'quadrat'];

// NEU (KDP-Hochauflösend-Umschalter): reine Rechenfunktion Papierbreite ->
// Pixelbreite bei 300dpi, EIN Ort statt doppelt gerechnet - genutzt sowohl
// von app.studio.printTargetWidth() (studioCore.js, für den Umschalter beim
// ERZEUGEN, siehe project.spec.highResPrint) als auch unten in
// printSpreadsKdp() (für das erneute Zusammensetzen einer Comic-Seite direkt
// beim KDP-Druck - das kostet keinen zusätzlichen Bildaufruf, nur einen
// größeren Canvas, deshalb dort IMMER, unabhängig vom Umschalter).
function targetWidthForTrim(trim) {
    const paper = TRIM_PAPER_MM[trim];
    if (!paper) return null;
    return Math.round((paper.w / 25.4) * 300);
}

// NEU (comicfähiger Druck): "randabfallend" (bleed) lässt das Bild die
// ganze Seite füllen (object-fit: cover schneidet dafür ggf. Ränder des
// Bildes ab), "mit Rand" (Standard - sicherer für Heimdrucker, die selten
// randlos drucken können) lässt das ganze Bild unbeschnitten mit 8mm
// Weißrand stehen (object-fit: contain) - für Bilderbuch- UND Comic-Seiten
// identisch, deshalb jetzt ein gemeinsamer Baustein statt Dopplung.
function imgStyleFor(bleed) {
    return bleed
        ? 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover;'
        : 'position:absolute; inset:8mm; width:calc(100% - 16mm); height:calc(100% - 16mm); object-fit:contain;';
}

// NEU (KDP-Seitenlayout-Varianten + Panorama): EIN Baustein für das Bild
// einer Druckseite - berücksichtigt den Bildbereich bei "Bild + Textstreifen"
// (app.studio.layout.imageRegion()) und bei einem Panorama die linke bzw.
// rechte Hälfte des Breitbilds (Bild doppelt so breit wie die Seite,
// verschoben). Ein Panorama läuft IMMER randabfallend (cover) - ein weißer
// Rand am Falz würde das durchgehende Bild zerschneiden.
function pageImageHtml(spread, index, fitStyle, half) {
    if (!spread.imgUrl) return '';
    const alt = `Doppelseite ${index + 1}`;
    if (half) {
        return `<div style="position:absolute; inset:0; overflow:hidden;"><img src="${spread.imgUrl}" style="position:absolute; top:0; height:100%; width:200%; max-width:none; left:${half === 'left' ? '0' : '-100%'}; object-fit:cover;" alt="${alt}"></div>`;
    }
    const region = app.studio.layout.imageRegion(spread.layout);
    const style = region.fit === 'contain'
        ? 'position:absolute; inset:4%; width:92%; height:92%; object-fit:contain;'
        : fitStyle;
    return `<div style="position:absolute; left:0; right:0; top:${region.top}%; bottom:${region.bottom}%;"><img src="${spread.imgUrl}" style="${style}" alt="${alt}"></div>`;
}

// NEU (KDP-Panorama): eine Doppelseite ergibt eine ODER - als Panorama -
// zwei Druckseiten. wrapText(overlayHtml) erlaubt dem KDP-Druck, die
// Textebene zusätzlich in seinen Sicherheitsabstand zu packen.
function spreadPagesHtml(spread, index, project, fitStyle, wrapText = (html) => html) {
    const layout = spread.layout || { textPos: 'unten', fontScale: 1, syllableColors: false };
    const overlay = wrapText(app.studio.layout.buildOverlayHtml(spread.text || '', layout, project.brief.readingLevel, PRINT_BASE_FONT_MM, 'mm'));
    const isPanorama = !!(layout.panorama && app.studio.layout.panoramaAllowed(project));
    if (!isPanorama) {
        return `<div class="sz-print-page">${pageImageHtml(spread, index, fitStyle, null)}${overlay}</div>`;
    }
    const textSide = app.studio.layout.panoramaTextSide(layout);
    return ['left', 'right'].map(half =>
        `<div class="sz-print-page">${pageImageHtml(spread, index, fitStyle, half)}${half === textSide ? overlay : ''}</div>`
    ).join('');
}

// NEU (KDP-Panorama): Doppelseiten in physischer Reihenfolge inkl.
// eingeschobener Leerseiten (siehe app.studio.layout.planPhysicalPages() -
// ein Panorama muss auf einer linken Buchseite beginnen). Liefert das HTML
// und die Zahl der eingeschobenen Leerseiten für den Hinweis-Toast.
function bookPagesHtml(project, renderSpread) {
    const plan = app.studio.layout.planPhysicalPages(project);
    let blanks = 0;
    const html = project.spreads.map((s, i) => {
        const blank = plan[i]?.blankBefore ? '<div class="sz-print-page"></div>' : '';
        if (blank) blanks++;
        return blank + renderSpread(s, i);
    }).join('');
    return { html, blanks };
}

function blankPagesToast(blanks) {
    if (blanks > 0) {
        app.ui.toast(`${blanks} Leerseite(n) eingefügt, damit jedes Panorama-Bild auf zwei gegenüberliegenden Seiten liegt.`, 'ℹ️');
    }
}

// NEU (comicfähiger Druck): eine Comic-Druckseite zeigt NUR das fertige,
// bereits zusammengesetzte Seitenbild (Panels + Rahmen, siehe
// app.studio.comicPanels) - KEINE zusätzliche HTML-Textebene wie beim
// Bilderbuch. Der Dialog ist entweder schon Teil des Bildes (Sprechblasen/
// Geräuschwörter eingebrannt, siehe printSpreads() unten) oder bewusst
// abwesend (Checkbox "aus" - "saubere" Seiten z.B. für eine eigene
// Übersetzung/eigenes Lettering von Hand).
function comicPageHtml(imgUrl, index, bleed) {
    const img = imgUrl
        ? `<img src="${imgUrl}" style="${imgStyleFor(bleed)}" alt="Comic-Seite ${index + 1}">`
        : '';
    return `<div class="sz-print-page">${img}</div>`;
}

// NEU (KDP-Innenteil): Bild füllt die GESAMTE, um die Bleed-Zugabe
// vergrößerte Seite per object-fit:cover - die äußeren KDP_BLEED_MM sind
// bewusst Überstand, der beim Druck weggeschnitten wird. Die Textebene
// bekommt einen EIGENEN, weiter innen liegenden Container - buildOverlayHtml()s
// Prozent-Positionen (top/bottom/left/right in %, siehe studioLayout.js
// textPosStyle) beziehen sich dadurch auf diese sichere Fläche statt auf die
// volle Bleed-Seite. safe.topBottom/safe.side sind bewusst UNTERSCHIEDLICH
// groß (siehe kdpGutterMm() oben - Bundsteg auf beiden Seiten, da unbekannt,
// welche davon die Buchmitte ist).
function kdpPageHtml(spread, index, project, safe) {
    // NEU (KDP-Seitenlayout-Varianten + Panorama): gemeinsamer Baustein mit
    // dem normalen Druck, nur die Textebene kommt zusätzlich in den
    // Sicherheitsabstand.
    return spreadPagesHtml(spread, index, project,
        'position:absolute; inset:0; width:100%; height:100%; object-fit:cover;',
        (overlay) => overlay ? `<div style="position:absolute; inset:${safe.topBottom}mm ${safe.side}mm;">${overlay}</div>` : '');
}

// NEU (KDP-Innenteil, Comic): bewusst KEIN Bleed/Überstand hier - die
// Sprechblasen sind bereits pixelgenau auf die ursprüngliche Seitenfläche
// gebrannt (app.studio.comicPanels.bakePageWithBalloons), ein Rand-Überstand
// per object-fit:cover könnte sie unkontrolliert anschneiden. Das Bild liegt
// stattdessen per object-fit:contain mit demselben asymmetrischen
// Sicherheits-/Bundsteg-Rand wie beim Bilderbuch (safe, ohne Bleed-Zuschlag
// - Comic-Seiten sind hier nicht vergrößert).
function kdpComicPageHtml(imgUrl, index, safe) {
    const img = imgUrl
        ? `<img src="${imgUrl}" style="position:absolute; inset:${safe.topBottom}mm ${safe.side}mm; width:calc(100% - ${2 * safe.side}mm); height:calc(100% - ${2 * safe.topBottom}mm); object-fit:contain;" alt="Comic-Seite ${index + 1}">`
        : '';
    return `<div class="sz-print-page">${img}</div>`;
}

function kdpTitlePageHtml(project, safe) {
    const author = app.profiles.find((p) => p.id === project.profileId)?.name || 'Ich';
    return `
        <div class="sz-print-page" style="display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center; padding:${safe.topBottom}mm ${safe.side}mm;">
            <h1 style="font-size:9mm; margin:0 0 6mm; font-family:sans-serif;">${app.utils.sanitize(project.title || 'Unbenanntes Werk')}</h1>
            <p style="font-size:4.5mm; color:#475569; font-family:sans-serif;">von ${app.utils.sanitize(author)}</p>
        </div>`;
}

Object.assign(app.studio, {
    // bleed: true = Bild randabfallend, false (Standard) = mit weißem
    // Rand. Wird vom Kontrollkästchen in der Layout-Stufe übergeben (siehe
    // index.html #studioPrintBleed).
    // NEU (comicfähiger Druck): bakeBubbles - NUR beim Comic relevant
    // (#studioPrintBubbles, Standard AN) - AN druckt die fertig geletterte
    // Seite (Sprechblasen + ggf. Geräuschwörter eingebrannt, genau wie ein
    // echter gedruckter Comic), AUS druckt die "saubere" Fassung ohne Text
    // im Bild. Die Funktion ist jetzt async, weil das Zusammensetzen/
    // Einbrennen der Comic-Seiten Canvas-Bilder nachlädt (siehe
    // app.studio.comicPanels) - das Pop-up-Fenster wird deshalb SOFORT,
    // noch synchron zum Klick, geöffnet (sonst blockieren Safari/Chrome ein
    // erst nach einem await geöffnetes Fenster) und danach mit dem
    // fertigen Inhalt befüllt.
    async printSpreads(bleed = false, bakeBubbles = true) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        if (project.spreads.length === 0) {
            app.ui.toast('Noch keine Doppelseiten zum Drucken - erst in der Stufe "Geschichte" welche anlegen.', 'ℹ️');
            return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            app.ui.toast('Pop-up blockiert - bitte für diese Seite erlauben.', '⚠️');
            return;
        }
        printWindow.document.write('<title>Wird vorbereitet …</title><body style="font-family:sans-serif;padding:2rem;color:#475569;">Seiten werden vorbereitet …</body>');

        const isComic = project.type === 'comic';
        let pagesHtml;
        if (isComic) {
            app.ui.showLoader('Comic-Seiten werden vorbereitet...', bakeBubbles ? 'Sprechblasen werden für den Druck eingebrannt' : 'Seiten werden zusammengesetzt');
            try {
                // NEU: fehlende Panel-Bilder (Seite noch nicht fertig
                // generiert) ergeben null statt eines Fehlers - die Seite
                // bleibt dann einfach leer (gleiches, permissives Verhalten
                // wie beim Bilderbuch-Pfad ohne spread.imgUrl).
                const images = await Promise.all(project.spreads.map((spread) => {
                    if (!spread.panels.every((p) => p.imgUrl)) return Promise.resolve(null);
                    return bakeBubbles
                        ? app.studio.comicPanels.bakePageWithBalloons(spread, { showSoundEffects: project.comicShowSoundEffects })
                        : app.studio.comicPanels.compositePage(spread);
                }));
                pagesHtml = project.spreads.map((s, i) => comicPageHtml(images[i]?.full, i, bleed)).join('');
            } finally {
                app.ui.hideLoader();
            }
        } else {
            const built = bookPagesHtml(project, (s, i) => spreadPagesHtml(s, i, project, imgStyleFor(bleed)));
            pagesHtml = built.html;
            blankPagesToast(built.blanks);
        }

        if (printWindow.closed) {
            app.ui.toast('Druckfenster wurde geschlossen.', '⚠️');
            return;
        }

        const paper = TRIM_PAPER_MM[project.spec.trim] || TRIM_PAPER_MM['a5-quer'];
        const author = app.profiles.find((p) => p.id === project.profileId)?.name || 'Ich';

        const coverHtml = `
            <div class="sz-print-page" style="display:flex; align-items:center; justify-content:center; flex-direction:column; text-align:center; padding:12mm;">
                <h1 style="font-size:9mm; margin:0 0 6mm; font-family:sans-serif;">${app.utils.sanitize(project.title || 'Unbenanntes Werk')}</h1>
                <p style="font-size:4.5mm; color:#475569; font-family:sans-serif;">von ${app.utils.sanitize(author)}</p>
            </div>`;

        printWindow.document.open();
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
    },

    // NEU (KDP-Innenteil): liefert - über denselben Browser-Druckdialog wie
    // printSpreads() oben ("Als PDF speichern") - ein Innenteil-PDF, das die
    // recherchierten KDP-Vorgaben tatsächlich einhält (siehe
    // docs/KONZEPT-SchreibZauber.md, Nachtrag "KDP-Druckvorgaben
    // recherchiert"): echte 3mm-Beschnittzugabe (die Dokumentseite ist dafür
    // tatsächlich größer als das Trimm-Format, nicht nur optisch
    // randabfallend wie beim normalen Druck oben), Sicherheitsabstand für
    // Text vom Trimm-Rand (0,375" mit Bleed, 0,25" ohne - siehe
    // KDP_SAFE_MM_BLEED/NOBLEED oben) UND ein zusätzlicher Bundsteg-
    // Innenrand je nach Gesamtseitenzahl (kdpGutterMm()). Bewusst eine EIGENE
    // Funktion statt eines weiteren Parameters an printSpreads(): andere
    // Regeln (immer Bleed bzw. immer "mit Rand" je nach Werktyp, andere
    // Seitengröße, kein Sprechblasen-Umschalter, nur zwei erlaubte
    // Papierformate) - keine sinnvoll gemeinsame Signatur mehr.
    //
    // Liefert NUR das Innenteil, KEINEN Umschlag - der Umschlag (Vorder-/
    // Rückseite + Buchrücken samt ISBN-Barcode-Fläche) gehört in KDPs
    // eigenen, kostenlosen Cover-Ersteller: der berechnet die Rückenbreite
    // korrekt aus der finalen Seitenzahl, das hier ohne echte Testeinreichung
    // nachzubauen wäre reines Raten (siehe Hinweistext in index.html).
    async printSpreadsKdp() {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        if (project.spreads.length === 0) {
            app.ui.toast('Noch keine Doppelseiten zum Drucken - erst in der Stufe "Geschichte" welche anlegen.', 'ℹ️');
            return;
        }
        if (!KDP_ALLOWED_TRIMS.includes(project.spec.trim)) {
            app.ui.toast('KDP-Export gibt es nur für die Papierformate "A5 hoch", "A4 hoch" und "Quadratisch 8,5 Zoll" - im Bauplan (Stufe 2) änderbar.', '⚠️');
            return;
        }
        // NEU: KDP verlangt für Taschenbücher mit Standardfarbe mindestens
        // 72 Seiten, mit Premiumfarbe mindestens 24 (per Websuche am
        // 19.09.2026 gegen kdp.amazon.com geprüft) - project.spec.totalPages
        // erreicht über den Bauplan aktuell maximal 40. Nicht blockierend
        // (die Wahl der Farbstufe passiert erst bei der Einreichung selbst),
        // aber ein klarer Hinweis statt einer stillen Ablehnung bei KDP.
        if (project.spec.totalPages < 72) {
            app.ui.toast(`Achtung: ${project.spec.totalPages} Seiten reichen bei KDP nur mit "Premiumfarbe" (Minimum 24) - bei "Standardfarbe" sind mindestens 72 Seiten nötig.`, 'ℹ️');
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            app.ui.toast('Pop-up blockiert - bitte für diese Seite erlauben.', '⚠️');
            return;
        }
        printWindow.document.write('<title>Wird vorbereitet …</title><body style="font-family:sans-serif;padding:2rem;color:#475569;">KDP-Innenteil wird vorbereitet …</body>');

        const trim = TRIM_PAPER_MM[project.spec.trim];
        const pageW = trim.w + 2 * KDP_BLEED_MM;
        const pageH = trim.h + 2 * KDP_BLEED_MM;
        const gutter = kdpGutterMm(project.spec.totalPages);
        // safeBleed: für die Bilderbuch-Seiten (haben echten Bleed-Bildinhalt
        // bis zum Rand) - safeNoBleed: für die Comic-Seiten (kein Bleed-
        // Bildinhalt, aber die .sz-print-page-Box ist trotzdem einheitlich
        // die um KDP_BLEED_MM vergrößerte Seite, siehe pageW/pageH oben -
        // ALLE Seiten einer KDP-PDF müssen dieselbe physische Größe haben.
        // Der KDP_BLEED_MM-Zuschlag gehört deshalb in BEIDE Fälle, nur der
        // eigentliche Sicherheitsabstand unterscheidet sich). "side" nimmt
        // jeweils den GRÖSSEREN von Sicherheitsabstand/Bundsteg, siehe
        // kdpGutterMm() oben.
        const safeBleed = { topBottom: KDP_BLEED_MM + KDP_SAFE_MM_BLEED, side: KDP_BLEED_MM + Math.max(KDP_SAFE_MM_BLEED, gutter) };
        const safeNoBleed = { topBottom: KDP_BLEED_MM + KDP_SAFE_MM_NOBLEED, side: KDP_BLEED_MM + Math.max(KDP_SAFE_MM_NOBLEED, gutter) };
        const isComic = project.type === 'comic';

        let pagesHtml;
        if (isComic) {
            app.ui.showLoader('Comic-Seiten werden vorbereitet...', 'Sprechblasen werden für den Druck eingebrannt');
            try {
                // NEU: für den KDP-Innenteil IMMER die fertig geletterte
                // Fassung - ein "sauberer" Export ohne Text wäre für eine
                // Veröffentlichung ohnehin kein fertiges Werk.
                const images = await Promise.all(project.spreads.map((spread) => {
                    if (!spread.panels.every((p) => p.imgUrl)) return Promise.resolve(null);
                    // NEU: targetWidth wird HIER immer mitgegeben (unabhängig
                    // von project.spec.highResPrint) - das Zusammensetzen der
                    // Panels zu einer Seite ist ein reiner Canvas-Vorgang,
                    // ein größerer Ziel-Canvas kostet keinen zusätzlichen
                    // Bildaufruf, siehe targetWidthForTrim() oben.
                    return app.studio.comicPanels.bakePageWithBalloons(spread, {
                        showSoundEffects: project.comicShowSoundEffects,
                        targetWidth: targetWidthForTrim(project.spec.trim)
                    });
                }));
                pagesHtml = project.spreads.map((s, i) => kdpComicPageHtml(images[i]?.full, i, safeNoBleed)).join('');
            } finally {
                app.ui.hideLoader();
            }
        } else {
            const built = bookPagesHtml(project, (s, i) => kdpPageHtml(s, i, project, safeBleed));
            pagesHtml = built.html;
            blankPagesToast(built.blanks);
        }

        if (printWindow.closed) {
            app.ui.toast('Druckfenster wurde geschlossen.', '⚠️');
            return;
        }

        printWindow.document.open();
        printWindow.document.write(`
            <html>
            <head>
                <title>${app.utils.sanitize(project.title || 'Unbenanntes Werk')} - KDP-Innenteil</title>
                <style>
                    @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
                    * { box-sizing: border-box; }
                    body { margin: 0; font-family: sans-serif; }
                    .sz-print-page { position: relative; width: ${pageW}mm; height: ${pageH}mm; overflow: hidden; background: #fff; page-break-after: always; }
                    .sz-print-page:last-child { page-break-after: auto; }
                </style>
            </head>
            <body>
                ${kdpTitlePageHtml(project, safeBleed)}
                ${pagesHtml}
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 400);
    }
});

// NEU (KDP-Hochauflösend-Umschalter): beide hier für app.studio.printTargetWidth()
// (studioCore.js) exportiert - EIN Ort für die physischen Papiermaße statt
// einer zweiten, driftenden Kopie in studioCore.js.
app.studio.TRIM_PAPER_MM = TRIM_PAPER_MM;
app.studio.targetWidthForTrim = targetWidthForTrim;
