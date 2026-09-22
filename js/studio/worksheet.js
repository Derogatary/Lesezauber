import { app } from '../core.js';
import './worksheetCanvas.js';
// NEU: Suchsel-Generator (Aufgabentyp 🔍), siehe dortiger Modul-Kommentar.
import './wordSearch.js';

// ================= SchreibZauber: Arbeitsheft-Werktyp (Ausbaustufe 4) =================
// Siehe docs/KONZEPT-SchreibZauber.md TEIL C.4 + TEIL E ("4 - Arbeitsheft").
// Ersetzt für project.type === 'workbook' die Stufen 3-5 "Geschichte/
// Figuren/Daumenkino" des normalen 8-Stufen-Gerüsts durch einen eigenen
// Dreier-Ablauf:
//   Stufe 3' Lernziel -> Stufe 4' Progression -> Stufe 5' Aufgabenbaukasten
// (in project.stage weiterhin als 1/2/3 gezählt, wie beim Bilderbuch-Pfad -
// die Zahl ist relativ zum jeweiligen Werktyp, nicht absolut zum
// 8-Stufen-Gerüst).
//
// Dieses Modul ist bewusst GETRENNT von studioCore.js (das nur die
// Werkart-Freischaltung bekommt) und von js/actions/workbookGenerator.js
// (anderer Weg zum selben bookType, siehe dortiger Kommentar - NICHT
// wiederverwendet oder dupliziert).
//
// Nur EIN Feld wird hier je Aufgabe dauerhaft als "Wahrheit" gehalten:
// task.instruction/explanation/data/solution = Niveau 2 (Standard). Ein
// abweichendes Niveau (⭐ oder ⭐⭐⭐) landet in task.altLevels[1|3] und wird
// nur bei Bedarf von der KI nachgeneriert (Konzept C.4 "jede Seite in drei
// Niveaus ERZEUGBAR" - nicht "immer alle drei vorab erzeugt", das würde die
// dreifachen Kosten für Niveaus verursachen, die vielleicht nie angesehen
// werden).

// NEU: die neun Aufgabentypen aus Konzept C.4 - "implemented" markiert, was
// diese Ausbaustufe wirklich baut (Auftrag: "lieber 2-3 Typen fertig als
// alle neun halbfertig" - hier sind es fünf geworden, alle rein text-/
// zeichenbasiert, brauchen also kein einziges Bild, siehe worksheetCanvas.js).
// NEU: Suchsel ist inzwischen als sechster Typ dazugekommen (eigener
// Gitter-Generator in js/studio/wordSearch.js, kein Bild nötig).
// Die restlichen drei (Nachspuren, Ausmalen, Schneiden&Kleben)
// brauchen entweder eine Kontur-/Rasterschrift oder ein Ausmalbild - beides
// eine eigene, spätere Ausbaustufe (siehe docs/KONZEPT-Bildquellen.md
// Abschnitt 1.5/5 Punkt 4 zur Clipart-Frage dafür).
const TASK_TYPES = [
    { id: 'zuordnen', icon: '🔗', label: 'Zuordnen', implemented: true },
    { id: 'luecke', icon: '✏️', label: 'Lückentext', implemented: true },
    { id: 'ankreuzen', icon: '☑️', label: 'Ankreuzen', implemented: true },
    { id: 'nachspuren', icon: '〰️', label: 'Nachspuren', implemented: false },
    { id: 'ausmalen', icon: '🎨', label: 'Ausmalen nach Regel', implemented: false },
    { id: 'rechnen', icon: '➕', label: 'Rechnen', implemented: true },
    { id: 'suchsel', icon: '🔍', label: 'Suchsel / Rätsel', implemented: true },
    { id: 'schneiden', icon: '✂️', label: 'Schneiden & Kleben', implemented: false },
    { id: 'frei', icon: '📝', label: 'Frei schreiben', implemented: true }
];
const IMPLEMENTED_TYPES = TASK_TYPES.filter(t => t.implemented).map(t => t.id);

const GRADE_OPTIONS = [
    { id: 'vorschule', label: 'Vorschule' },
    { id: '1', label: '1. Klasse' },
    { id: '2', label: '2. Klasse' },
    { id: '3', label: '3. Klasse' },
    { id: '4', label: '4. Klasse' }
];
const SUBJECT_OPTIONS = [
    { id: 'deutsch', label: 'Deutsch' },
    { id: 'mathematik', label: 'Mathematik' },
    { id: 'sachunterricht', label: 'Sachunterricht' },
    { id: 'frei', label: 'fächerübergreifend/frei' }
];

function currentProject() {
    return app.studio.projects[app.state.currentStudioProjectId] || null;
}

// Leere Datenstruktur für einen von Hand hinzugefügten Aufgabentyp - siehe
// TASK_SCHEMA_HINT in studioPrompts.js, dieselben Feldnamen.
function blankTaskData(type) {
    switch (type) {
        case 'luecke': return { sentence: '', wordBank: [], correctWord: '' };
        case 'ankreuzen': return { question: '', options: ['', ''], correctIndex: 0 };
        case 'rechnen': return { problems: [''], answers: [0] };
        case 'zuordnen': return { left: [''], right: [''], matches: [0] };
        case 'frei': return { prompt: '', lines: 4 };
        case 'suchsel': return app.studio.wordSearch.buildTaskData([], 1);
        default: return {};
    }
}

// Räumt eine KI-Antwort für EINE Aufgabe in unser festes Datenmodell ein -
// fehlende/falsch geformte Felder fallen auf eine leere, aber gültige
// Struktur zurück statt die ganze Seite scheitern zu lassen (gleiche
// Grundhaltung wie buildPageVariant() in js/utils.js: lieber ein
// nachvollziehbarer Platzhalter als ein kaputtes Objekt).
function sanitizeTaskData(type, raw) {
    const d = raw || {};
    switch (type) {
        case 'luecke':
            return {
                sentence: d.sentence || '',
                wordBank: Array.isArray(d.wordBank) ? d.wordBank.filter(Boolean) : [],
                correctWord: d.correctWord || ''
            };
        case 'ankreuzen':
            return {
                question: d.question || '',
                options: Array.isArray(d.options) && d.options.length ? d.options.filter(Boolean) : ['', ''],
                correctIndex: Number.isInteger(d.correctIndex) ? d.correctIndex : 0
            };
        case 'rechnen':
            return {
                problems: Array.isArray(d.problems) ? d.problems.filter(Boolean) : [],
                answers: Array.isArray(d.answers) ? d.answers : []
            };
        case 'zuordnen':
            return {
                left: Array.isArray(d.left) ? d.left.filter(Boolean) : [],
                right: Array.isArray(d.right) ? d.right.filter(Boolean) : [],
                matches: Array.isArray(d.matches) ? d.matches : []
            };
        case 'frei':
            return {
                prompt: d.prompt || '',
                lines: Number.isInteger(d.lines) ? Math.max(2, Math.min(8, d.lines)) : 4
            };
        case 'suchsel':
            // NEU: Gitter IMMER selbst bauen, nie ein von der KI geliefertes
            // übernehmen - siehe Kommentar in js/studio/wordSearch.js.
            return app.studio.wordSearch.buildTaskData(d.words, Number.isInteger(d.seed) ? d.seed : 1);
        default:
            return {};
    }
}

function normalizeTask(raw) {
    // Unbekannter/nicht umgesetzter Typ -> auf "frei" ausweichen, statt die
    // Aufgabe zu verwerfen (die KI hält sich nicht IMMER exakt an die
    // Vorgabe, siehe TASK_SCHEMA_HINT-Kommentar in studioPrompts.js).
    const type = IMPLEMENTED_TYPES.includes(raw?.type) ? raw.type : 'frei';
    const instruction = raw?.instruction || '';
    const data = sanitizeTaskData(type, raw?.data);
    return {
        id: app.studio.genId('task'),
        type,
        instruction,
        explanation: raw?.explanation || instruction,
        data,
        solution: taskSolution(type, data, raw?.solution),
        activeLevel: 2,
        altLevels: {}
    };
}

// NEU (Suchsel): die Lösung eines Suchsels kennt nur die App (Positionen im
// selbst gebauten Gitter) - die KI-Lösung wird dort deshalb ersetzt.
function taskSolution(type, data, rawSolution) {
    if (type === 'frei') return '';
    if (type === 'suchsel') return app.studio.wordSearch.solutionText(data.placements);
    return rawSolution || '';
}

// NEU: löst auf, welcher Inhalt gerade "aktiv" ist (Standard oder eine
// generierte Niveau-Variante) - der einzige Ort, an dem das entschieden
// wird, damit Anzeige, Canvas-Druck und Export-Text nie auseinanderlaufen.
function resolveTaskContent(task) {
    if (!task.activeLevel || task.activeLevel === 2) {
        return { type: task.type, level: 2, instruction: task.instruction, explanation: task.explanation, data: task.data, solution: task.solution };
    }
    const alt = task.altLevels && task.altLevels[task.activeLevel];
    if (!alt) return { type: task.type, level: 2, instruction: task.instruction, explanation: task.explanation, data: task.data, solution: task.solution };
    return { type: task.type, level: task.activeLevel, instruction: alt.instruction, explanation: alt.explanation, data: alt.data, solution: alt.solution };
}

// Ziel-Objekt für eine Feldänderung von Hand - beim Standard-Niveau (2)
// direkt die Aufgabe, sonst die (bereits erzeugte) Niveau-Variante. Wird nur
// aufgerufen, wenn die Bearbeitungs-UI für genau dieses Niveau sichtbar ist
// (siehe js/render/studioWorkbookWizard.js), altLevels[level] existiert an
// der Stelle also immer schon.
function editableTarget(task) {
    if (!task.activeLevel || task.activeLevel === 2) return task;
    return task.altLevels[task.activeLevel];
}

// NEU: kurzer, kindgerechter Tipp pro Aufgabentyp fürs page.variants.helpSteps
// (Heft-Modus, siehe app.render.workbook / render/workbook.js Hilfe-Karte).
const HELP_STEP = {
    luecke: 'Tipp: Der Wortspeicher enthält das passende Wort - lies den Satz laut vor.',
    ankreuzen: 'Tipp: Lies erst alle Antworten durch, bevor du ankreuzt.',
    rechnen: 'Tipp: Nutze deine Finger oder kleine Striche zum Zählen, wenn du unsicher bist.',
    zuordnen: 'Tipp: Sprich jedes Wort einmal laut - dann findest du leichter das passende Gegenstück.',
    frei: 'Tipp: Schreib einfach drauflos - Rechtschreibfehler sind hier nicht schlimm.',
    suchsel: 'Tipp: Die Wörter verstecken sich nur von links nach rechts oder von oben nach unten. Fahre mit dem Finger Zeile für Zeile entlang.'
};

Object.assign(app.studio, {
    // Nur Anzeige-/Nachschlage-Konstanten, keine onclick-Ziele (Sanity-
    // Check 3 aus CLAUDE.md prüft nur zweistufige app.NAMESPACE.funktion(-
    // Aufrufe - alles hier wird ausschließlich aus JS heraus gelesen).
    worksheet: {
        taskTypes: TASK_TYPES,
        implementedTypes: IMPLEMENTED_TYPES,
        gradeOptions: GRADE_OPTIONS,
        subjectOptions: SUBJECT_OPTIONS,
        resolveTaskContent
    },

    // ===== Stufe 3' – Lernziel =====
    saveWorksheetGoal(fields) {
        const project = currentProject();
        if (!project) return;
        if (!fields.goal || !fields.goal.trim()) {
            app.ui.toast('Bitte das Lernziel eintragen ("Das Kind kann ...").', '⚠️');
            return;
        }
        project.title = (fields.title || '').trim();
        project.worksheet = project.worksheet || { goal: '', grade: '1', subject: 'deutsch', chapters: [] };
        project.worksheet.goal = fields.goal.trim();
        project.worksheet.grade = fields.grade;
        project.worksheet.subject = fields.subject;
        project.stage = Math.max(project.stage, 2);
        delete project._draft;
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(2);
    },

    // ===== Stufe 4' – Progression =====
    async generateProgression() {
        const project = currentProject();
        if (!project || !project.worksheet) return;
        if (project.worksheet.chapters.length > 0 && !confirm('Es gibt bereits eine Kapitelfolge. Von der KI neu vorschlagen lassen und die aktuelle ersetzen?')) {
            return;
        }

        app.ui.showLoader('Kapitelfolge wird vorgeschlagen...', 'Die KI plant die Reihenfolge der Übungen');
        app.state.apiBusy = true;
        try {
            const result = await app.studio.api.generateWorksheetPlan(project.worksheet);
            const rawChapters = Array.isArray(result.chapters) ? result.chapters : [];
            project.worksheet.chapters = rawChapters.map(c => ({
                id: app.studio.genId('chapter'),
                title: c.title || 'Kapitel',
                goal: c.goal || '',
                pages: (Array.isArray(c.pages) ? c.pages : []).map(p => ({
                    id: app.studio.genId('page'),
                    goal: p.goal || '',
                    kind: p.kind === 'wiederholung' ? 'wiederholung' : 'neu',
                    tasks: []
                }))
            }));
            project.costLog.textCalls += 1;
            project.stage = Math.max(project.stage, 2);
            app.dbOps.saveProject(project);
            app.ui.toast('Kapitelfolge steht!', '✨');
            app.render.studioWorkbookWizard(2);
        } catch (e) {
            console.error('Kapitelfolge konnte nicht erzeugt werden:', e);
            const msg = e.message === 'API_KEY_MISSING' ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.' : e.message;
            app.ui.toast(msg, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    addChapterManual() {
        const project = currentProject();
        if (!project || !project.worksheet) return;
        project.worksheet.chapters.push({
            id: app.studio.genId('chapter'), title: 'Neues Kapitel', goal: '',
            pages: [{ id: app.studio.genId('page'), goal: '', kind: 'neu', tasks: [] }]
        });
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(2);
    },

    deleteChapter(chapterIdx) {
        const project = currentProject();
        const chapter = project?.worksheet?.chapters[chapterIdx];
        if (!chapter) return;
        if (!confirm(`Kapitel "${chapter.title}" wirklich löschen?`)) return;
        project.worksheet.chapters.splice(chapterIdx, 1);
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(2);
    },

    updateChapterField(chapterIdx, field, value) {
        const project = currentProject();
        const chapter = project?.worksheet?.chapters[chapterIdx];
        if (!chapter || (field !== 'title' && field !== 'goal')) return;
        chapter[field] = value;
        app.dbOps.saveProject(project);
    },

    addPageGoal(chapterIdx) {
        const project = currentProject();
        const chapter = project?.worksheet?.chapters[chapterIdx];
        if (!chapter) return;
        chapter.pages.push({ id: app.studio.genId('page'), goal: '', kind: 'neu', tasks: [] });
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(2);
    },

    deletePageGoal(chapterIdx, pageIdx) {
        const project = currentProject();
        const chapter = project?.worksheet?.chapters[chapterIdx];
        if (!chapter || !chapter.pages[pageIdx]) return;
        chapter.pages.splice(pageIdx, 1);
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(2);
    },

    updatePageField(chapterIdx, pageIdx, field, value) {
        const project = currentProject();
        const page = project?.worksheet?.chapters[chapterIdx]?.pages[pageIdx];
        if (!page || (field !== 'goal' && field !== 'kind')) return;
        page[field] = value;
        app.dbOps.saveProject(project);
    },

    confirmProgression() {
        const project = currentProject();
        if (!project || !project.worksheet) return;
        const hasPages = project.worksheet.chapters.some(c => c.pages.length > 0);
        if (!hasPages) {
            app.ui.toast('Bitte mindestens ein Kapitel mit einer Seite anlegen.', 'ℹ️');
            return;
        }
        project.stage = Math.max(project.stage, 3);
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(3);
    },

    // ===== Stufe 5' – Aufgabenbaukasten =====
    async generateChapterTasks(chapterIdx) {
        const project = currentProject();
        const chapter = project?.worksheet?.chapters[chapterIdx];
        if (!chapter || chapter.pages.length === 0) return;
        const hasTasks = chapter.pages.some(p => p.tasks.length > 0);
        if (hasTasks && !confirm(`Für Kapitel "${chapter.title}" gibt es bereits Aufgaben. Neu erzeugen und ersetzen?`)) {
            return;
        }

        app.ui.showLoader('Aufgaben werden erzeugt...', `Die KI denkt sich Übungen für "${chapter.title}" aus`);
        app.state.apiBusy = true;
        try {
            const result = await app.studio.api.generateChapterTasks(project.worksheet, chapter);
            const rawPages = Array.isArray(result.pages) ? result.pages : [];
            chapter.pages.forEach((page, i) => {
                const rawTasks = Array.isArray(rawPages[i]?.tasks) ? rawPages[i].tasks : [];
                page.tasks = rawTasks.slice(0, 3).map(normalizeTask);
            });
            project.costLog.textCalls += 1;
            app.dbOps.saveProject(project);
            app.ui.toast(`Aufgaben für "${chapter.title}" fertig!`, '✨');
            app.render.studioWorkbookWizard(3);
        } catch (e) {
            console.error('Aufgaben konnten nicht erzeugt werden:', e);
            const msg = e.message === 'API_KEY_MISSING' ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.' : e.message;
            app.ui.toast(msg, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    addTaskManual(chapterIdx, pageIdx, type) {
        const project = currentProject();
        const page = project?.worksheet?.chapters[chapterIdx]?.pages[pageIdx];
        if (!page) return;
        if (page.tasks.length >= 3) {
            app.ui.toast('Maximal 3 Aufgaben pro Seite.', 'ℹ️');
            return;
        }
        page.tasks.push({
            id: app.studio.genId('task'), type, instruction: '', explanation: '',
            data: blankTaskData(type), solution: '', activeLevel: 2, altLevels: {}
        });
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(3);
    },

    deleteTask(chapterIdx, pageIdx, taskIdx) {
        const project = currentProject();
        const page = project?.worksheet?.chapters[chapterIdx]?.pages[pageIdx];
        if (!page || !page.tasks[taskIdx]) return;
        page.tasks.splice(taskIdx, 1);
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(3);
    },

    updateTaskField(chapterIdx, pageIdx, taskIdx, field, value) {
        const project = currentProject();
        const task = project?.worksheet?.chapters[chapterIdx]?.pages[pageIdx]?.tasks[taskIdx];
        if (!task || !['instruction', 'explanation', 'solution'].includes(field)) return;
        editableTarget(task)[field] = value;
        app.dbOps.saveProject(project);
    },

    // key: eines der Datenfelder aus blankTaskData()/TASK_SCHEMA_HINT.
    // rawValue kommt immer als String aus einem Formularfeld - Listen
    // werden komma- bzw. zeilengetrennt eingegeben, das ist für Eltern/
    // Kinder verständlicher als eine JSON-Eingabe.
    updateTaskData(chapterIdx, pageIdx, taskIdx, key, rawValue) {
        const project = currentProject();
        const task = project?.worksheet?.chapters[chapterIdx]?.pages[pageIdx]?.tasks[taskIdx];
        if (!task) return;
        const data = editableTarget(task).data;
        if (key === 'wordBank' || key === 'options' || key === 'left' || key === 'right') {
            data[key] = rawValue.split(',').map(s => s.trim()).filter(Boolean);
        } else if (key === 'problems') {
            data.problems = rawValue.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (key === 'answers' || key === 'matches') {
            data[key] = rawValue.split(',').map(s => s.trim()).filter(s => s !== '').map(Number);
        } else if (key === 'words') {
            // NEU (Suchsel): neue Wörter = neues Gitter + neue Lösung, sonst
            // stünden im Druck Wörter, die gar nicht im Gitter versteckt sind.
            const target = editableTarget(task);
            target.data = app.studio.wordSearch.buildTaskData(rawValue.split(','), data.seed || 1);
            target.solution = taskSolution('suchsel', target.data);
            if (target.data.skipped.length) {
                app.ui.toast(`Kein Platz im Gitter für: ${target.data.skipped.join(', ')} (max. 10 Buchstaben pro Wort).`, 'ℹ️');
            }
            app.dbOps.saveProject(project);
            app.render.studioWorkbookWizard(3);
            return;
        } else if (key === 'correctIndex' || key === 'lines') {
            data[key] = parseInt(rawValue, 10) || 0;
        } else {
            data[key] = rawValue;
        }
        app.dbOps.saveProject(project);
    },

    // NEU (Suchsel): dieselben Wörter anders im Gitter verteilen - kostet
    // keinen KI-Aufruf, nur einen neuen Seed für den Generator.
    reshuffleWordSearch(chapterIdx, pageIdx, taskIdx) {
        const project = currentProject();
        const task = project?.worksheet?.chapters[chapterIdx]?.pages[pageIdx]?.tasks[taskIdx];
        if (!task || task.type !== 'suchsel') return;
        const target = editableTarget(task);
        const seed = ((target.data && target.data.seed) || 1) + 1;
        target.data = app.studio.wordSearch.buildTaskData(target.data?.words || [], seed);
        target.solution = taskSolution('suchsel', target.data);
        app.dbOps.saveProject(project);
        app.render.studioWorkbookWizard(3);
    },

    // Differenzierung (Konzept C.4): Niveau wechseln, bei Bedarf erst von
    // der KI nachgeneriert (siehe Modul-Kommentar oben).
    async setTaskLevel(chapterIdx, pageIdx, taskIdx, level) {
        const project = currentProject();
        const chapter = project?.worksheet?.chapters[chapterIdx];
        const task = chapter?.pages[pageIdx]?.tasks[taskIdx];
        if (!task) return;
        if (task.activeLevel === level) return;

        if (level === 2 || task.altLevels[level]) {
            task.activeLevel = level;
            app.dbOps.saveProject(project);
            app.render.studioWorkbookWizard(3);
            return;
        }

        app.ui.showLoader('Anderes Niveau wird erzeugt...', 'Die KI passt die Aufgabe an');
        app.state.apiBusy = true;
        try {
            const alt = await app.studio.api.generateTaskLevel(project.worksheet, chapter, task, level);
            const altData = sanitizeTaskData(task.type, alt.data);
            task.altLevels[level] = {
                instruction: alt.instruction || task.instruction,
                explanation: alt.explanation || alt.instruction || task.explanation,
                data: altData,
                solution: taskSolution(task.type, altData, alt.solution)
            };
            task.activeLevel = level;
            project.costLog.textCalls += 1;
            app.dbOps.saveProject(project);
            app.render.studioWorkbookWizard(3);
        } catch (e) {
            console.error('Niveau-Variante konnte nicht erzeugt werden:', e);
            const msg = e.message === 'API_KEY_MISSING' ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.' : e.message;
            app.ui.toast(msg, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    // ===== Stufe 8 (Konzept) – "Ins Regal stellen", Arbeitsheft-Variante =====
    // Eigener Export analog js/studio/studioExport.js, aber mit
    // bookType: 'workbook' und den Übungsheft-Variantenfeldern statt den
    // Bilderbuch-Feldern - siehe CLAUDE.md-Datenmodell und
    // app.utils.buildPageVariant() (dort schon für bookType 'workbook'
    // vorbereitet, hier nur benutzt statt danebengebaut).
    exportWorkbookToLibrary() {
        const project = currentProject();
        if (!project || !project.worksheet) return;

        const contentPages = [];
        project.worksheet.chapters.forEach(chapter => {
            chapter.pages.forEach(page => {
                if (page.tasks.length === 0) return;
                const resolved = page.tasks.map(resolveTaskContent);
                const multi = resolved.length > 1;

                const draw = app.studio.worksheetCanvas.drawArbeitsheftPage({
                    chapterTitle: chapter.title, pageGoal: page.goal,
                    pageNumber: contentPages.length + 1, tasks: resolved
                });
                const { full, thumb } = app.utils.createImageVariants(draw.canvas, draw.canvas.width, draw.canvas.height);

                const result = {
                    taskText: resolved.map((t, i) => multi ? `Aufgabe ${i + 1}: ${t.instruction}` : t.instruction).join('\n\n'),
                    taskExplained: resolved.map((t, i) => multi ? `Aufgabe ${i + 1}: ${t.explanation}` : t.explanation).join('\n\n'),
                    pageDescription: page.goal || null,
                    taskType: multi ? 'gemischt' : resolved[0].type,
                    materials: 'Stift',
                    helpSteps: [...new Set(resolved.map(t => HELP_STEP[t.type]).filter(Boolean))],
                    solution: resolved.map((t, i) => multi ? `Aufgabe ${i + 1}: ${t.solution || '(freies Schreiben)'}` : (t.solution || '(freies Schreiben)')).join('\n')
                };

                contentPages.push({
                    id: Date.now() + contentPages.length,
                    imgUrl: full, thumbUrl: thumb, status: 'done',
                    variants: { [app.settings.persona]: app.utils.buildPageVariant(result, {}, 'workbook') },
                    generatedSheet: { heading: draw.heading, body: draw.body }
                });
            });
        });

        if (contentPages.length === 0) {
            app.ui.toast('Erst Aufgaben erzeugen, dann geht\'s ins Regal.', 'ℹ️');
            return;
        }

        // Selbstkontrolle (Konzept C.4): automatisch erzeugter Lösungsteil
        // am Heftende - KEIN neuer KI-Aufruf, alle Lösungen stehen schon
        // aus der Aufgaben-Erzeugung fest.
        const solutionEntries = [];
        let printedPageNum = 0;
        project.worksheet.chapters.forEach(chapter => {
            chapter.pages.forEach(page => {
                if (page.tasks.length === 0) return;
                printedPageNum++;
                const resolved = page.tasks.map(resolveTaskContent);
                resolved.forEach((t, i) => {
                    const icon = TASK_TYPES.find(tt => tt.id === t.type)?.icon || '📝';
                    const label = resolved.length > 1 ? `Seite ${printedPageNum}, Aufgabe ${i + 1}` : `Seite ${printedPageNum}`;
                    solutionEntries.push({ label: `${icon} ${label} (${chapter.title})`, solution: t.solution });
                });
            });
        });

        const ENTRIES_PER_PAGE = 8;
        const solutionChunks = [];
        for (let i = 0; i < solutionEntries.length; i += ENTRIES_PER_PAGE) {
            solutionChunks.push(solutionEntries.slice(i, i + ENTRIES_PER_PAGE));
        }
        const solutionPages = solutionChunks.map((chunk, i) => {
            const draw = app.studio.worksheetCanvas.drawSolutionPage({ entries: chunk, partNumber: i + 1, totalParts: solutionChunks.length });
            const { full, thumb } = app.utils.createImageVariants(draw.canvas, draw.canvas.width, draw.canvas.height);
            const solutionText = chunk.map(e => `${e.label}: ${e.solution && e.solution.trim() ? e.solution : '(freies Schreiben)'}`).join('\n');
            const result = {
                taskText: solutionText, taskExplained: solutionText, pageDescription: 'Lösungsteil zum Selbstkontrollieren',
                taskType: 'loesung', materials: null, helpSteps: [], solution: null
            };
            return {
                id: Date.now() + contentPages.length + i + 1000,
                imgUrl: full, thumbUrl: thumb, status: 'done',
                variants: { [app.settings.persona]: app.utils.buildPageVariant(result, {}, 'workbook') },
                generatedSheet: { heading: draw.heading, body: draw.body }
            };
        });

        const existing = project.exportedBookId ? app.library[project.exportedBookId] : null;
        const bookId = existing ? existing.id : ('book_' + Date.now());
        const author = app.profiles.find(p => p.id === project.profileId)?.name || 'Ich';
        const allPages = [...contentPages, ...solutionPages];

        const book = existing || {
            id: bookId, created: Date.now(),
            profileId: project.profileId || app.utils.resolveCreationProfileId(), lastReadIdx: 0
        };
        book.title = project.title || 'Unbenanntes Arbeitsheft';
        book.author = author;
        book.bookType = 'workbook';
        // NEU: komplett von der KI aus eigenem Lernziel erzeugt, kein
        // fremdes Werk steckt darin - wie beim Heft-Generator, siehe
        // CLAUDE.md/docs/KONZEPT-Video.md Abschnitt 7.
        book.origin = 'authored';
        book.studioProjectId = project.id;
        book.pages = allPages;
        book.coverPageId = allPages[0]?.id || null;

        app.dbOps.saveBook(book);
        project.exportedBookId = book.id;
        app.dbOps.saveProject(project);

        app.ui.toast(`"${book.title}" steht jetzt im Regal!`, '🎉');
        app.state.currentBookId = book.id;
        app.nav.go('book');
    }
});
