import { app } from '../core.js';

// ================= SchreibZauber: Die Werkstatt-Stufen =================
// Bildet Stufe 1-6 aus docs/KONZEPT-SchreibZauber.md (C.2) als Ansicht ab:
// 1. Die Idee (Exposé) -> 2. Der Bauplan (Umfangsplanung) -> 3. Die
// Geschichte (Manuskript + Text-Breakdown auf Doppelseiten) -> 4. Die
// Figuren (Stilkarte + Figuren-Bibel) -> 5. Das Daumenkino (Storyboard) ->
// 6. Die Bilder. Dieses Modul bleibt bewusst nur der STUFEN-UMSCHALTER -
// die Füll-Logik der neuen Stufen 4-6 liegt in eigenen Dateien
// (js/render/studioCharacters.js/studioStoryboard.js/studioImages.js),
// gleiches Muster wie Bibliothek/Buch-Ansicht.
//
// WICHTIG (siehe CLAUDE.md, Sanity-Check 2): alle Formularfelder mit fester
// ID stehen STATISCH in index.html, genau wie bei den Einstellungen
// (js/render/settings.js) - dieses Modul blendet nur die passende Stufe
// ein/aus und füllt Werte, statt Formulare per innerHTML neu zu erzeugen.
// Nur die Doppelseiten-Liste ist eine echte dynamische Liste (wie
// libraryList) und braucht deshalb keine festen Einzel-IDs.

// "activeStage" ist bewusst NUR eine lokale, nicht gespeicherte
// Modul-Variable (gleiches Muster wie searchDebounceTimer in
// render/library.js): sie merkt sich nur, welche Stufe GERADE angezeigt
// wird, während project.stage die tatsächlich schon ERREICHTE Stufe ist.
// So kann man jederzeit zu einer früheren Stufe zurückspringen ("Rücksprung
// ist immer erlaubt", Konzept C.2), ohne den Fortschritt zu verlieren.
let openProjectId = null;
let activeStage = 1;

function updateStepper(project) {
    // NEU (Stufe 2): drei weitere Stufen (4 Figuren, 5 Storyboard, 6 Bilder)
    // dazugekommen - Layout & Druck (7) und Fertig (8) bleiben spätere
    // Ausbaustufen, siehe docs/KONZEPT-SchreibZauber.md TEIL E.
    // NEU (Ausbaustufe 3): Stufe 7 "Das Layout" dazugekommen - "Fertig" (8)
    // bleibt weiterhin kein eigener Stufen-Bildschirm, "Ins Regal
    // stellen"/Drucken sind bewusst überall (Stufe 3/6/7) erreichbar.
    [1, 2, 3, 4, 5, 6, 7].forEach(n => {
        const btn = document.getElementById(`studioStep${n}`);
        if (!btn) return;
        const reached = n <= project.stage;
        const active = n === activeStage;
        btn.disabled = !reached;
        btn.className = `flex-1 text-[11px] font-bold py-2 rounded-xl border transition ${
            active ? 'bg-indigo-600 border-indigo-600 text-white'
                : reached ? 'bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50'
                    : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
        }`;
    });
}

// NEU (Ausbaustufe 6 - Politur, Konzept TEIL E "Vorlagen"): feste
// Kurz-Vorlagen für häufige Anlässe - füllen NUR das Stufe-1-Formular
// direkt (wie der Master-Prompt-Knopf, OHNE zu speichern), alles bleibt
// vor dem "Weiter" editierbar. Bewusst als reine Formular-Vorbefüllung
// statt eines eigenen KI-Aufrufs - kostenlos, sofort, und der Nutzer sieht
// genau, was er bekommt, bevor irgendetwas gespeichert wird.
const STUFE1_TEMPLATES = {
    gutenacht: {
        label: '🌙 Gute-Nacht-Geschichte',
        audienceAge: '3-5', readingLevel: 'vorlesen',
        topic: 'Ein kleines Tier, das abends nicht einschlafen kann und nach und nach zur Ruhe kommt',
        tone: 'ruhig, leise, beruhigend',
        message: 'Es ist schön, zur Ruhe zu kommen - morgen ist ein neuer Tag'
    },
    geburtstag: {
        label: '🎂 Geburtstagsbuch',
        audienceAge: '6-7', readingLevel: 'vorlesen',
        topic: 'Eine Geburtstagsfeier mit allen, die dem Geburtstagskind wichtig sind',
        tone: 'fröhlich, herzlich, feierlich',
        message: 'Du bist etwas Besonderes, und wir freuen uns, dass es dich gibt'
    }
};

function fillBriefStage(project) {
    const b = project.brief;
    const m = project.meta || {};
    document.getElementById('studioTitleInput').value = project.title || '';
    document.getElementById('studioAudienceAge').value = b.audienceAge;
    document.getElementById('studioReadingLevel').value = b.readingLevel;
    document.getElementById('studioTopic').value = b.topic || '';
    document.getElementById('studioTone').value = b.tone || '';
    document.getElementById('studioMessage').value = b.message || '';
    // NEU: optionale Verlags-/Impressum-Felder (siehe studioMetaPages.js)
    document.getElementById('studioAuthorBio').value = m.authorBio || '';
    document.getElementById('studioPublisher').value = m.publisher || '';
    document.getElementById('studioBlurb').value = m.blurb || '';
    // NEU: Reihenname + Vorschlagsliste bereits benutzter Reihen (siehe
    // app.studio.listSeriesNames() in studioCore.js).
    document.getElementById('studioSeriesName').value = project.seriesName || '';
    document.getElementById('studioSeriesList').innerHTML = app.studio.listSeriesNames()
        .map(name => `<option value="${app.utils.sanitize(name)}"></option>`).join('');
}

function fillSpecStage(project) {
    document.getElementById('studioTotalPages').value = project.spec.totalPages;
    document.getElementById('studioTrim').value = project.spec.trim;
    // NEU (KDP-Hochauflösend-Umschalter): siehe studioCollectSpec() unten.
    document.getElementById('studioHighResPrint').checked = !!project.spec.highResPrint;
    app.render.studioSpecPreview();
}

function spreadCardHtml(spread, index) {
    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex gap-3 p-3">
        <div class="w-20 flex-shrink-0">
            ${spread.thumbUrl ? `<img src="${spread.thumbUrl}" class="w-full rounded-lg border border-slate-200" alt="Platzhalter Doppelseite ${index + 1}">` : `<div class="w-full aspect-[3/2] bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 text-xl">🖼️</div>`}
        </div>
        <div class="flex-grow min-w-0">
            <div class="flex items-center justify-between mb-1">
                <span class="text-[10px] font-bold text-slate-400 uppercase">Doppelseite ${index + 1}</span>
                <button onclick="app.studio.deleteSpread(${index})" aria-label="Doppelseite löschen" class="text-slate-300 hover:text-red-500 text-xs">🗑️</button>
            </div>
            <textarea rows="3" onchange="app.studio.updateSpreadText(${index}, this.value)" class="w-full text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">${app.utils.sanitize(spread.text)}</textarea>
            ${spread.pageTurnHook ? `<p class="text-[10px] text-amber-700 mt-1 italic">👉 Umblätter-Moment: ${app.utils.sanitize(spread.pageTurnHook)}</p>` : ''}
        </div>
    </div>`;
}

// NEU (Ausbaustufe 5, Panels): Comic-Gegenstück zu spreadCardHtml() oben -
// zeigt die Seite als das, was sie jetzt wirklich ist: 1-4 PANELS, jedes
// mit eigener Bildidee UND eigenen Sprechblasen (Sprecher+Text, editierbar) -
// statt eines einzelnen Fließtext-Felds. CRUD läuft über
// app.studio.addBalloon()/updateBalloon()/deleteBalloon()/addPanel()/
// deletePanel()/updatePanelVisual() aus js/studio/studioBalloons.js -
// dieselben Funktionen, die auch Stufe 7 (render/studioLayout.js) benutzt.
function comicPanelCardHtml(spreadIndex, panel, panelIndex, panelCount) {
    const balloonRows = panel.balloons.map(b => `
        <div class="flex gap-1.5 items-start">
            <input type="text" value="${app.utils.sanitize(b.speaker)}" placeholder="Wer?" oninput="app.studio.updateBalloon(${spreadIndex}, ${panelIndex}, '${b.id}', {speaker: this.value})" class="w-16 flex-shrink-0 text-xs font-bold text-indigo-700 bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-indigo-500">
            <input type="text" value="${app.utils.sanitize(b.text)}" placeholder="Sprechblasentext" oninput="app.studio.updateBalloon(${spreadIndex}, ${panelIndex}, '${b.id}', {text: this.value})" class="flex-grow text-xs text-slate-900 bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-indigo-500">
            <button onclick="app.studio.deleteBalloon(${spreadIndex}, ${panelIndex}, '${b.id}')" aria-label="Sprechblase löschen" class="text-slate-300 hover:text-red-500 text-xs px-1 py-1">🗑️</button>
        </div>`).join('');

    return `
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5">
        <div class="flex gap-2 items-start">
            <div class="w-14 flex-shrink-0">
                ${panel.thumbUrl ? `<img src="${panel.thumbUrl}" class="w-full aspect-[4/3] object-cover rounded-lg border border-slate-200" alt="Panel ${panelIndex + 1}">` : `<div class="w-full aspect-[4/3] bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 text-base">🖼️</div>`}
            </div>
            <div class="flex-grow min-w-0 space-y-1">
                <div class="flex items-center justify-between">
                    <span class="text-[9px] font-bold text-slate-400 uppercase">Panel ${panelIndex + 1}</span>
                    ${panelCount > 1 ? `<button onclick="app.studio.deletePanel(${spreadIndex}, ${panelIndex})" aria-label="Panel löschen" class="text-slate-300 hover:text-red-500 text-xs">🗑️</button>` : ''}
                </div>
                <input type="text" value="${app.utils.sanitize(panel.visual)}" placeholder="Bildidee: wer/was/wo" onchange="app.studio.updatePanelVisual(${spreadIndex}, ${panelIndex}, this.value)" class="w-full text-xs text-slate-900 bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-indigo-500">
                <input type="text" value="${app.utils.sanitize(panel.soundEffect)}" placeholder="💥 Geräuschwort (optional, z.B. BUMM)" onchange="app.studio.updatePanelSoundEffect(${spreadIndex}, ${panelIndex}, this.value)" class="w-full text-xs text-slate-900 bg-white border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:border-indigo-500">
            </div>
        </div>
        ${balloonRows}
        <button onclick="app.studio.addBalloon(${spreadIndex}, ${panelIndex})" class="w-full text-[10px] font-bold text-indigo-600 border border-dashed border-indigo-200 rounded-lg py-1 hover:bg-indigo-100 transition">+ Sprechblase</button>
    </div>`;
}

function comicSpreadCardHtml(spread, index) {
    const panelCards = spread.panels.map((p, pi) => comicPanelCardHtml(index, p, pi, spread.panels.length)).join('');

    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex gap-3 p-3">
        <div class="w-20 flex-shrink-0">
            ${spread.thumbUrl ? `<img src="${spread.thumbUrl}" class="w-full aspect-[3/4] object-cover rounded-lg border border-slate-200" alt="Comic-Seite ${index + 1}">` : `<div class="w-full aspect-[3/4] bg-slate-100 rounded-lg flex items-center justify-center text-slate-300 text-xl">🖼️</div>`}
        </div>
        <div class="flex-grow min-w-0 space-y-1.5">
            <div class="flex items-center justify-between">
                <span class="text-[10px] font-bold text-slate-400 uppercase">Seite ${index + 1} · ${spread.panels.length} Panel${spread.panels.length === 1 ? '' : 's'}</span>
                <button onclick="app.studio.deleteSpread(${index})" aria-label="Seite löschen" class="text-slate-300 hover:text-red-500 text-xs">🗑️</button>
            </div>
            ${panelCards}
            <button onclick="app.studio.addPanel(${index})" class="w-full text-[11px] font-bold text-indigo-600 border border-dashed border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition">+ Panel</button>
            ${spread.pageTurnHook ? `<p class="text-[10px] text-amber-700 italic">👉 Umblätter-Moment: ${app.utils.sanitize(spread.pageTurnHook)}</p>` : ''}
        </div>
    </div>`;
}

function fillStoryStage(project) {
    const isComic = project.type === 'comic';
    const hasStory = project.spreads.length > 0;
    document.getElementById('studioGenerateStoryBtn').innerText = `✨ ${hasStory ? 'Neu von der KI schreiben lassen' : 'Von der KI schreiben lassen'}`;
    document.getElementById('studioSpreadEmptyState').classList.toggle('hidden', hasStory);
    document.getElementById('studioSpreadList').innerHTML = project.spreads
        .map((s, i) => isComic ? comicSpreadCardHtml(s, i) : spreadCardHtml(s, i)).join('');
    document.getElementById('studioExportBtn').classList.toggle('hidden', !hasStory);
    // NEU (Ausbaustufe 5, Panels): Geräuschwörter-Umschalter - nur beim Comic sichtbar.
    document.getElementById('studioComicSoundEffectsRow').classList.toggle('hidden', !isComic);
    document.getElementById('studioComicSoundEffects').checked = !!project.comicShowSoundEffects;
}

Object.assign(app.render, {
    // forceStage: optional - springt gezielt zu einer bereits erreichten
    // Stufe (siehe app.studio.saveBrief/saveSpec/generateStory/advanceStage,
    // die nach dem Speichern jeweils zur nächsten Stufe weiterschalten).
    //
    // NEU (Ausbaustufe 4 - Arbeitsheft): dieses Modul zeichnet NUR noch den
    // Bilderbuch-Pfad (Stufe 1-3 Idee/Bauplan/Geschichte, Stufe 4-6 Figuren/
    // Storyboard/Bilder aus Ausbaustufe 2). Ein Arbeitsheft-Projekt hat einen
    // komplett eigenen Stufenablauf (Lernziel/Progression/Aufgabenbaukasten,
    // siehe js/render/studioWorkbookWizard.js) - die Weiche sitzt hier ganz
    // vorne, damit index.html EINE gemeinsame Kopfzeile (Titel, Zurück-Knopf)
    // für beide Werktypen benutzen kann, aber jeder Werktyp seine eigenen,
    // unabhängig gebauten <section>-Blöcke ein-/ausblendet (siehe
    // #studioPicturebookStages/#studioWorkbookStages in index.html).
    studioWizard(forceStage) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) {
            app.nav.go('studio');
            return;
        }

        const isWorkbook = project.type === 'workbook';
        document.getElementById('studioPicturebookStages')?.classList.toggle('hidden', isWorkbook);
        document.getElementById('studioWorkbookStages')?.classList.toggle('hidden', !isWorkbook);
        if (isWorkbook) {
            app.render.studioWorkbookWizard(forceStage);
            return;
        }

        if (openProjectId !== project.id) {
            openProjectId = project.id;
            activeStage = project.stage;
        }
        if (forceStage) activeStage = forceStage;

        document.getElementById('studioWizardTitle').innerText = project.title || 'Neues Werk';
        updateStepper(project);

        document.getElementById('studioStageBrief').classList.toggle('hidden', activeStage !== 1);
        document.getElementById('studioStageSpec').classList.toggle('hidden', activeStage !== 2);
        document.getElementById('studioStageStory').classList.toggle('hidden', activeStage !== 3);
        // NEU (Stufe 2): drei weitere Stufen-Abschnitte, ihre Füll-Logik
        // liegt (wie Bibliothek/Buch-Ansicht sonst auch) in eigenen
        // Render-Dateien statt hier - dieses Modul bleibt der reine
        // Stufen-Umschalter.
        document.getElementById('studioStageCharacters').classList.toggle('hidden', activeStage !== 4);
        document.getElementById('studioStageStoryboard').classList.toggle('hidden', activeStage !== 5);
        document.getElementById('studioStageImages').classList.toggle('hidden', activeStage !== 6);
        // NEU (Ausbaustufe 3): Stufe 7 "Das Layout" - siehe render/studioLayout.js
        document.getElementById('studioStageLayout').classList.toggle('hidden', activeStage !== 7);

        if (activeStage === 1) fillBriefStage(project);
        else if (activeStage === 2) fillSpecStage(project);
        else if (activeStage === 3) fillStoryStage(project);
        else if (activeStage === 4) app.render.studioCharacters(project);
        else if (activeStage === 5) app.render.studioStoryboard(project);
        else if (activeStage === 6) app.render.studioImages(project);
        else app.render.studioLayout(project);
    },

    // Liest das Bauplan-Formular aus und aktualisiert NUR die Vorschau
    // (Doppelseitenzahl/Wortbudget), OHNE zu speichern - siehe
    // app.studio.previewSpec() in studioCore.js.
    studioSpecPreview() {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        const totalPages = document.getElementById('studioTotalPages').value;
        const preview = app.studio.previewSpec(totalPages, project.brief.audienceAge);
        document.getElementById('studioSpecPreviewText').innerText = `${preview.storySpreads} Doppelseiten Geschichte · ca. ${preview.wordBudget} Wörter insgesamt`;
    },

    // Liest das Idee-Formular aus und übergibt es an app.studio.saveBrief().
    studioCollectBrief() {
        app.studio.saveBrief({
            title: document.getElementById('studioTitleInput').value,
            audienceAge: document.getElementById('studioAudienceAge').value,
            readingLevel: document.getElementById('studioReadingLevel').value,
            topic: document.getElementById('studioTopic').value,
            tone: document.getElementById('studioTone').value,
            message: document.getElementById('studioMessage').value,
            // NEU: optionale Verlags-/Impressum-Felder (siehe studioMetaPages.js)
            authorBio: document.getElementById('studioAuthorBio').value,
            publisher: document.getElementById('studioPublisher').value,
            blurb: document.getElementById('studioBlurb').value,
            seriesName: document.getElementById('studioSeriesName').value
        });
    },

    // NEU: "Master-Prompt" kopieren (siehe app.studio.prompts.buildMasterSetupPrompt()
    // in studioPrompts.js für den Hintergrund). Liest die AKTUELL im
    // Formular stehenden Werte direkt aus dem DOM statt aus dem Projekt -
    // damit auch ein noch nicht per "Weiter" gespeicherter Anfang (z.B. nur
    // das Thema schon eingetippt) in den Prompt einfließt.
    studioCopyMasterPrompt() {
        const draft = {
            title: document.getElementById('studioTitleInput').value.trim(),
            seriesName: document.getElementById('studioSeriesName').value.trim(),
            brief: {
                audienceAge: document.getElementById('studioAudienceAge').value,
                readingLevel: document.getElementById('studioReadingLevel').value,
                topic: document.getElementById('studioTopic').value.trim(),
                tone: document.getElementById('studioTone').value.trim(),
                message: document.getElementById('studioMessage').value.trim()
            }
        };
        const prompt = app.studio.prompts.buildMasterSetupPrompt(draft);
        app.studio.imageSource.copyPrompt(prompt);
    },

    studioTemplates: STUFE1_TEMPLATES,

    // NEU (Ausbaustufe 6 - Politur): Vorlage einsetzen - füllt NUR die
    // Formularfelder, speichert nichts. Der Nutzer sieht das Ergebnis
    // sofort und kann jedes Feld vor "Weiter" noch anpassen.
    studioApplyTemplate(templateId) {
        const tpl = STUFE1_TEMPLATES[templateId];
        if (!tpl) return;
        document.getElementById('studioAudienceAge').value = tpl.audienceAge;
        document.getElementById('studioReadingLevel').value = tpl.readingLevel;
        document.getElementById('studioTopic').value = tpl.topic;
        document.getElementById('studioTone').value = tpl.tone;
        document.getElementById('studioMessage').value = tpl.message;
        app.ui.toast(`Vorlage "${tpl.label}" eingesetzt - vor "Weiter" gern noch anpassen.`, '📝');
    },

    // Liest das Bauplan-Formular aus und übergibt es an app.studio.saveSpec().
    studioCollectSpec() {
        app.studio.saveSpec({
            totalPages: document.getElementById('studioTotalPages').value,
            trim: document.getElementById('studioTrim').value,
            // NEU (KDP-Hochauflösend-Umschalter): siehe app.studio.printTargetWidth().
            highResPrint: document.getElementById('studioHighResPrint').checked
        });
    }
});
