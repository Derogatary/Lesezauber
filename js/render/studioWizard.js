import { app } from '../core.js';

// ================= SchreibZauber: Die Werkstatt-Stufen =================
// Bildet Stufe 1-3 aus docs/KONZEPT-SchreibZauber.md (C.2) als Ansicht ab:
// 1. Die Idee (Exposé) -> 2. Der Bauplan (Umfangsplanung) -> 3. Die
// Geschichte (Manuskript + Text-Breakdown auf Doppelseiten).
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
    [1, 2, 3].forEach(n => {
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

function fillBriefStage(project) {
    const b = project.brief;
    document.getElementById('studioTitleInput').value = project.title || '';
    document.getElementById('studioAudienceAge').value = b.audienceAge;
    document.getElementById('studioReadingLevel').value = b.readingLevel;
    document.getElementById('studioTopic').value = b.topic || '';
    document.getElementById('studioTone').value = b.tone || '';
    document.getElementById('studioMessage').value = b.message || '';
}

function fillSpecStage(project) {
    document.getElementById('studioTotalPages').value = project.spec.totalPages;
    document.getElementById('studioTrim').value = project.spec.trim;
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
            <textarea rows="3" onchange="app.studio.updateSpreadText(${index}, this.value)" class="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">${app.utils.sanitize(spread.text)}</textarea>
            ${spread.pageTurnHook ? `<p class="text-[10px] text-amber-700 mt-1 italic">👉 Umblätter-Moment: ${app.utils.sanitize(spread.pageTurnHook)}</p>` : ''}
        </div>
    </div>`;
}

function fillStoryStage(project) {
    const hasStory = project.spreads.length > 0;
    document.getElementById('studioGenerateStoryBtn').innerText = `✨ ${hasStory ? 'Neu von der KI schreiben lassen' : 'Von der KI schreiben lassen'}`;
    document.getElementById('studioSpreadEmptyState').classList.toggle('hidden', hasStory);
    document.getElementById('studioSpreadList').innerHTML = project.spreads.map((s, i) => spreadCardHtml(s, i)).join('');
    document.getElementById('studioExportBtn').classList.toggle('hidden', !hasStory);
}

Object.assign(app.render, {
    // forceStage: optional - springt gezielt zu einer bereits erreichten
    // Stufe (siehe app.studio.saveBrief/saveSpec/generateStory, die nach
    // dem Speichern jeweils zur nächsten Stufe weiterschalten).
    studioWizard(forceStage) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) {
            app.nav.go('studio');
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

        if (activeStage === 1) fillBriefStage(project);
        else if (activeStage === 2) fillSpecStage(project);
        else fillStoryStage(project);
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
            message: document.getElementById('studioMessage').value
        });
    },

    // Liest das Bauplan-Formular aus und übergibt es an app.studio.saveSpec().
    studioCollectSpec() {
        app.studio.saveSpec({
            totalPages: document.getElementById('studioTotalPages').value,
            trim: document.getElementById('studioTrim').value
        });
    }
});
