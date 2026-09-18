import { app } from '../core.js';

// ================= SchreibZauber: Arbeitsheft-Wizard (Ausbaustufe 4) =================
// Eigener Wizard-Zweig analog js/render/studioWizard.js (siehe
// docs/KONZEPT-SchreibZauber.md, "Stand nach Stufe 1"), aber für
// project.type === 'workbook': Stufe 3' Lernziel -> Stufe 4' Progression ->
// Stufe 5' Aufgabenbaukasten (project.stage zählt dabei wieder bei 1 los,
// wie beim Bilderbuch-Pfad - siehe Kommentar in js/studio/worksheet.js).
//
// js/render/studioWizard.js ruft diese Funktion nur weiter, wenn
// project.type === 'workbook' ist - die HTML-Bühne dafür (eigener Stepper +
// eigene <section>-Blöcke, alle mit fester ID wie überall sonst, siehe
// CLAUDE.md-Sanity-Check 2) liegt in index.html unter #studioWorkbookStages,
// direkt neben dem Bilderbuch-Block.

let openProjectId = null;
let activeStage = 1;

function currentProject() {
    return app.studio.projects[app.state.currentStudioProjectId] || null;
}

function updateStepper(project) {
    [1, 2, 3].forEach(n => {
        const btn = document.getElementById(`studioWBStep${n}`);
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

function fillGoalStage(project) {
    const ws = project.worksheet || { goal: '', grade: '1', subject: 'deutsch' };
    document.getElementById('wbTitleInput').value = project.title || '';
    document.getElementById('wbGrade').value = ws.grade || '1';
    document.getElementById('wbSubject').value = ws.subject || 'deutsch';
    document.getElementById('wbGoal').value = ws.goal || '';
}

function pageGoalRowHtml(chapterIdx, page, pageIdx) {
    return `
    <div class="flex items-center gap-2">
        <span class="text-[10px] font-bold text-slate-400 w-5 flex-shrink-0">${pageIdx + 1}.</span>
        <input type="text" value="${app.utils.sanitize(page.goal)}" placeholder="Was übt diese Seite?"
            onchange="app.studio.updatePageField(${chapterIdx}, ${pageIdx}, 'goal', this.value)"
            class="flex-grow text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">
        <label class="flex items-center gap-1 text-[10px] font-semibold text-amber-700 flex-shrink-0">
            <input type="checkbox" ${page.kind === 'wiederholung' ? 'checked' : ''}
                onchange="app.studio.updatePageField(${chapterIdx}, ${pageIdx}, 'kind', this.checked ? 'wiederholung' : 'neu')">
            🔁 Wdh.
        </label>
        <button onclick="app.studio.deletePageGoal(${chapterIdx}, ${pageIdx})" aria-label="Seite löschen" class="text-slate-300 hover:text-red-500 text-xs flex-shrink-0">🗑️</button>
    </div>`;
}

function chapterCardHtml(chapter, chapterIdx) {
    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 space-y-2">
        <div class="flex items-center gap-2">
            <input type="text" value="${app.utils.sanitize(chapter.title)}" placeholder="Kapiteltitel"
                onchange="app.studio.updateChapterField(${chapterIdx}, 'title', this.value)"
                class="flex-grow text-sm font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">
            <button onclick="app.studio.deleteChapter(${chapterIdx})" aria-label="Kapitel löschen" class="text-slate-300 hover:text-red-500 text-xs flex-shrink-0">🗑️</button>
        </div>
        <textarea rows="2" placeholder="Kapitelziel: Das Kind kann ..."
            onchange="app.studio.updateChapterField(${chapterIdx}, 'goal', this.value)"
            class="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">${app.utils.sanitize(chapter.goal)}</textarea>
        <div class="space-y-1.5">
            ${chapter.pages.map((p, i) => pageGoalRowHtml(chapterIdx, p, i)).join('')}
        </div>
        <button onclick="app.studio.addPageGoal(${chapterIdx})" class="w-full text-[11px] font-bold text-indigo-600 border border-dashed border-indigo-200 rounded-lg py-1.5 hover:bg-indigo-50 transition">+ Seite hinzufügen</button>
    </div>`;
}

function fillProgressionStage(project) {
    const chapters = project.worksheet.chapters;
    document.getElementById('wbProgressionEmptyState').classList.toggle('hidden', chapters.length > 0);
    document.getElementById('studioChapterList').innerHTML = chapters.map((c, i) => chapterCardHtml(c, i)).join('');
    document.getElementById('wbGenerateProgressionBtn').innerText = `✨ ${chapters.length > 0 ? 'Neu vorschlagen lassen' : 'Kapitelfolge vorschlagen lassen'}`;
}

// NEU: die 5 in dieser Ausbaustufe umgesetzten Aufgabentypen als Buttons
// zum manuellen Hinzufügen ("die KI ist Vorschlag, nie Zwang", Konzept C.2).
function addTaskButtonsHtml(chapterIdx, pageIdx) {
    return app.studio.worksheet.taskTypes.filter(t => t.implemented).map(t => `
        <button onclick="app.studio.addTaskManual(${chapterIdx}, ${pageIdx}, '${t.id}')"
            class="text-[10px] font-bold px-2 py-1 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition">
            ${t.icon} ${t.label}
        </button>`).join('');
}

function levelButtonsHtml(chapterIdx, pageIdx, taskIdx, activeLevel) {
    const levels = [{ n: 1, star: '⭐' }, { n: 2, star: '⭐⭐' }, { n: 3, star: '⭐⭐⭐' }];
    return levels.map(l => `
        <button onclick="app.studio.setTaskLevel(${chapterIdx}, ${pageIdx}, ${taskIdx}, ${l.n})"
            title="${l.n === 1 ? 'Leichter' : l.n === 3 ? 'Schwerer' : 'Standard'}"
            class="text-xs px-2 py-0.5 rounded-full border transition ${activeLevel === l.n ? 'bg-amber-400 border-amber-400 text-white font-bold' : 'bg-white border-slate-200 text-slate-400 hover:border-amber-300'}">
            ${l.star}
        </button>`).join('');
}

// Baut die editierbaren Datenfelder EINER Aufgabe passend zu ihrem Typ -
// siehe app.studio.updateTaskData() in js/studio/worksheet.js für die
// Gegenseite (parst dieselben Feldnamen zurück).
function taskDataFieldsHtml(chapterIdx, pageIdx, taskIdx, content) {
    const d = content.data || {};
    const onData = (key) => `app.studio.updateTaskData(${chapterIdx}, ${pageIdx}, ${taskIdx}, '${key}', this.value)`;
    const field = (label, value, key, placeholder = '') => `
        <div><label class="text-[10px] font-bold text-slate-400 block mb-0.5">${label}</label>
        <input type="text" value="${app.utils.sanitize(value)}" placeholder="${placeholder}" onchange="${onData(key)}"
            class="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"></div>`;

    if (content.type === 'luecke') {
        return field('Satz mit ___ als Lücke', d.sentence, 'sentence')
            + field('Wortspeicher (Komma-getrennt)', (d.wordBank || []).join(', '), 'wordBank')
            + field('Richtiges Wort', d.correctWord, 'correctWord');
    }
    if (content.type === 'ankreuzen') {
        return field('Frage', d.question, 'question')
            + field('Antworten (Komma-getrennt)', (d.options || []).join(', '), 'options')
            + field('Index der richtigen Antwort (0 = erste)', d.correctIndex, 'correctIndex');
    }
    if (content.type === 'rechnen') {
        return `<div><label class="text-[10px] font-bold text-slate-400 block mb-0.5">Aufgaben (eine pro Zeile)</label>
            <textarea rows="3" onchange="app.studio.updateTaskData(${chapterIdx}, ${pageIdx}, ${taskIdx}, 'problems', this.value)"
                class="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">${app.utils.sanitize((d.problems || []).join('\n'))}</textarea></div>`
            + field('Lösungen (Komma-getrennt, gleiche Reihenfolge)', (d.answers || []).join(', '), 'answers');
    }
    if (content.type === 'zuordnen') {
        return field('Linke Spalte (Komma-getrennt)', (d.left || []).join(', '), 'left')
            + field('Rechte Spalte (Komma-getrennt, gemischt)', (d.right || []).join(', '), 'right')
            + field('Passende Indizes (Komma-getrennt, z.B. 2,0,1)', (d.matches || []).join(', '), 'matches');
    }
    if (content.type === 'frei') {
        return field('Schreibimpuls', d.prompt, 'prompt')
            + field('Anzahl Schreiblinien', d.lines, 'lines');
    }
    return '';
}

function taskCardHtml(chapterIdx, pageIdx, task, taskIdx) {
    const content = app.studio.worksheet.resolveTaskContent(task);
    const typeInfo = app.studio.worksheet.taskTypes.find(t => t.id === task.type);
    return `
    <div class="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
        <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-600">${typeInfo ? typeInfo.icon : '📝'} ${typeInfo ? typeInfo.label : task.type}</span>
            <div class="flex items-center gap-2">
                ${levelButtonsHtml(chapterIdx, pageIdx, taskIdx, content.level)}
                <button onclick="app.studio.deleteTask(${chapterIdx}, ${pageIdx}, ${taskIdx})" aria-label="Aufgabe löschen" class="text-slate-300 hover:text-red-500 text-xs">🗑️</button>
            </div>
        </div>
        <textarea rows="2" placeholder="Aufgabenstellung"
            onchange="app.studio.updateTaskField(${chapterIdx}, ${pageIdx}, ${taskIdx}, 'instruction', this.value)"
            class="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500">${app.utils.sanitize(content.instruction)}</textarea>
        ${taskDataFieldsHtml(chapterIdx, pageIdx, taskIdx, content)}
        ${task.type !== 'frei' ? `
        <div><label class="text-[10px] font-bold text-slate-400 block mb-0.5">Lösung (für den Lösungsteil am Heftende)</label>
            <input type="text" value="${app.utils.sanitize(content.solution)}"
                onchange="app.studio.updateTaskField(${chapterIdx}, ${pageIdx}, ${taskIdx}, 'solution', this.value)"
                class="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"></div>` : ''}
    </div>`;
}

function pageTasksHtml(chapterIdx, page, pageIdx) {
    return `
    <div class="border-t border-slate-100 pt-2 mt-2 space-y-2">
        <p class="text-[10px] font-bold text-slate-500">${pageIdx + 1}. ${app.utils.sanitize(page.goal || 'Seite')} ${page.kind === 'wiederholung' ? '· 🔁 Wiederholung' : ''}</p>
        ${page.tasks.map((t, ti) => taskCardHtml(chapterIdx, pageIdx, t, ti)).join('')}
        ${page.tasks.length < 3 ? `<div class="flex flex-wrap gap-1.5">${addTaskButtonsHtml(chapterIdx, pageIdx)}</div>` : ''}
    </div>`;
}

function taskChapterCardHtml(chapter, chapterIdx) {
    const hasTasks = chapter.pages.some(p => p.tasks.length > 0);
    return `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
        <div class="flex items-center justify-between gap-2 mb-1">
            <h3 class="text-sm font-bold text-slate-900">${app.utils.sanitize(chapter.title)}</h3>
            <button onclick="app.studio.generateChapterTasks(${chapterIdx})" class="flex-shrink-0 text-[11px] font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1.5 rounded-lg shadow-sm hover:opacity-95 transition">✨ ${hasTasks ? 'Neu erzeugen' : 'Aufgaben erzeugen'}</button>
        </div>
        ${chapter.pages.map((p, i) => pageTasksHtml(chapterIdx, p, i)).join('')}
    </div>`;
}

function fillTasksStage(project) {
    const chapters = project.worksheet.chapters;
    document.getElementById('studioTaskChapterList').innerHTML = chapters.map((c, i) => taskChapterCardHtml(c, i)).join('');
    const hasAnyTask = chapters.some(c => c.pages.some(p => p.tasks.length > 0));
    document.getElementById('studioWBExportBtn').classList.toggle('hidden', !hasAnyTask);
}

Object.assign(app.render, {
    // Wird von app.render.studioWizard() aufgerufen, wenn project.type
    // === 'workbook' ist (siehe dortiger Verweis).
    studioWorkbookWizard(forceStage) {
        const project = currentProject();
        if (!project) { app.nav.go('studio'); return; }
        if (!project.worksheet) project.worksheet = { goal: '', grade: '1', subject: 'deutsch', chapters: [] };

        if (openProjectId !== project.id) {
            openProjectId = project.id;
            activeStage = project.stage;
        }
        if (forceStage) activeStage = forceStage;
        if (activeStage > 3) activeStage = 3; // Falls ein Projekt mit dem Bilderbuch-Stufenbereich (bis 8) verwechselt würde

        document.getElementById('studioWizardTitle').innerText = project.title || 'Neues Arbeitsheft';
        updateStepper(project);

        document.getElementById('studioStageGoal').classList.toggle('hidden', activeStage !== 1);
        document.getElementById('studioStageProgression').classList.toggle('hidden', activeStage !== 2);
        document.getElementById('studioStageTasks').classList.toggle('hidden', activeStage !== 3);

        if (activeStage === 1) fillGoalStage(project);
        else if (activeStage === 2) fillProgressionStage(project);
        else fillTasksStage(project);
    },

    // Liest das Lernziel-Formular aus und übergibt es an app.studio.saveWorksheetGoal().
    studioCollectWorksheetGoal() {
        app.studio.saveWorksheetGoal({
            title: document.getElementById('wbTitleInput').value,
            grade: document.getElementById('wbGrade').value,
            subject: document.getElementById('wbSubject').value,
            goal: document.getElementById('wbGoal').value
        });
    }
});
