import { app } from '../core.js';

// ================= SchreibZauber: Ausmalbilder fürs Arbeitsheft (v0.55.0-beta) =================
// NEU (Nutzerwunsch: "können die Arbeitsheft-Aufgaben bei der Bilderzeugung als
// Prompts ausgegeben werden, damit man sie kopieren kann"). Die Aufgabe
// "Ausmalen nach Regel" 🎨 braucht ein Ausmalbild. Statt eine Bild-API
// vorauszusetzen, gilt derselbe kostenlose Weg wie beim manuellen
// Bild-Austausch im Bilderbuch (js/studio/studioManualImages.js):
//   1. Prompt kopieren (fürs gewählte Zielprogramm, js/studio/imageTargets.js -
//      Nano Banana, ChatGPT/Copilot oder Leonardo & Co. englisch + Negativ-Prompt)
//   2. In diesem Programm das Ausmalbild erzeugen lassen
//   3. Bild zurück: Zwischenablage, Datei oder Drag & Drop in der Aufgabe
// Das Bild liegt dann in task.data.imgUrl (volle Größe) / thumbUrl (Vorschau) und
// wird beim Export ins Regal auf das Arbeitsblatt gedruckt
// (js/studio/worksheetCanvas.js). Fehlt es, zeigt das Blatt einen gestrichelten
// Rahmen "Hier kommt das Ausmalbild hin" - nichts geht kaputt, es fällt nur auf.
//
// Die Bildbausteine für Nano Banana/ChatGPT/Leonardo sind auf Kinderbuch-Szenen
// zugeschnitten (Stil, Figuren, Textfläche). Ein Ausmalbild braucht etwas ganz
// anderes (nur Konturen, weißer Grund), deshalb hier eigene Prompt-Texte; wiederverwendet
// werden nur die Zielprogramm-Auswahl, die Übersetzung und das Kopieren.

const ASPECT = '1:1'; // Format "worksheetIllu" (imageFormats.js) - alle Zielprogramme kennen 1:1

const NEGATIVE_COLORING_EN = 'color, colored, grayscale, gray fill, filled areas, shading, hatching, text, letters, numbers, watermark, logo, signature, photorealistic, complex background, tiny details, scary, violence';

function currentProject() {
    return app.studio.projects[app.state.currentStudioProjectId] || null;
}

function taskAt(chapterIdx, pageIdx, taskIdx) {
    const project = currentProject();
    const task = project?.worksheet?.chapters[chapterIdx]?.pages[pageIdx]?.tasks[taskIdx];
    return { project, task };
}

// Ziel für Änderungen: Niveau-Varianten (⭐/⭐⭐⭐) teilen sich das EINE Bild der Aufgabe,
// es wird deshalb immer am Standard-Niveau (task.data) gehalten.
function imageHolder(task) {
    return task.data;
}

function motifOf(task) {
    const active = app.studio.worksheet.resolveTaskContent(task);
    return String(active.data?.motif || '').trim().replace(/[.\s]+$/, '');
}

Object.assign(app.studio, {
    worksheetImages: {
        // Fürs Zielprogramm fertiger Prompt: { prompt, negative, aspect, needsTranslation }
        // (Englisch braucht vorher EINE Übersetzung des Motivs, siehe translateIfNeeded).
        coloringPromptData(motif, targetId = app.studio.imageTargets.currentId()) {
            const target = app.studio.imageTargets.get(targetId);
            const m = String(motif || '').trim().replace(/[.\s]+$/, '') || 'ein einfaches, freundliches Motiv';
            if (target.lang === 'en') {
                const parts = this.parts(m);
                const t = app.studio.imageTargets.translatedOf(parts);
                return {
                    prompt: [
                        `Children's coloring book page, square format, aspect ratio ${ASPECT}.`,
                        `Motif: ${(t && t.scene) || m}.`,
                        'Only clean, continuous, fairly thick black outlines on a pure white background, large simple shapes that are easy to color in, no gray tones, no filled areas, no hatching, no shading.',
                        'Pure line drawing without any text or numbers. Friendly, child-appropriate, simple shapes.',
                        'Original design, not based on any known character, brand or artwork.'
                    ].join(' '),
                    negative: NEGATIVE_COLORING_EN,
                    aspect: ASPECT,
                    needsTranslation: !t
                };
            }
            return {
                prompt: [
                    `Ausmal-Vorlage für Kinder im Malbuch-Stil, quadratisches Format (${ASPECT}).`,
                    `Motiv: ${m}.`,
                    'Nur klare, durchgehende, ziemlich dicke schwarze Umrisslinien auf rein weißem Hintergrund, große einfache Flächen zum Ausmalen, keine Grau- oder Farbflächen, keine Schraffur, keine Schatten.',
                    'Reine Zeichnung ohne Schrift und ohne Zahlen. Freundlich, kindgerecht, einfache Formen.',
                    app.studio.prompts.imageGuardrailsLine()
                ].filter(Boolean).join(' '),
                negative: '',
                aspect: ASPECT,
                needsTranslation: false
            };
        },

        // Baustein-Form für app.studio.imageTargets.translate()/translatedOf()
        parts(motif) {
            return { scene: motif, style: '', zone: '', characters: [] };
        },

        // Bild in eine Aufgabe einsetzen (Datei/Blob aus Zwischenablage, Dateiwahl oder Drop)
        async applyImage(chapterIdx, pageIdx, taskIdx, file) {
            const { project, task } = taskAt(chapterIdx, pageIdx, taskIdx);
            if (!task) return false;
            if (!file || !/^image\//.test(file.type || '')) {
                app.ui.toast('Das ist kein Bild.', '⚠️');
                return false;
            }
            const result = await app.studio.imageSource.request('upload', { formatId: 'worksheetIllu', file });
            if (!result) return false;
            const holder = imageHolder(task);
            holder.imgUrl = result.full;
            holder.thumbUrl = result.thumb;
            app.dbOps.saveProject(project);
            return true;
        },

        clearImage(chapterIdx, pageIdx, taskIdx) {
            const { project, task } = taskAt(chapterIdx, pageIdx, taskIdx);
            if (!task) return;
            const holder = imageHolder(task);
            delete holder.imgUrl;
            delete holder.thumbUrl;
            app.dbOps.saveProject(project);
        }
    },

    // ---- Knöpfe in der Aufgabenkarte (onclick-Ziele, siehe js/render/studioWorkbookWizard.js) ----

    setColoringTarget(id) {
        app.studio.imageTargets.setCurrent(id);
        app.render.studioWorkbookWizard(3);
    },

    // Prompt kopieren - bei englischen Zielprogrammen erst das Motiv übersetzen (einmal, gemerkt)
    async copyColoringPrompt(chapterIdx, pageIdx, taskIdx) {
        const { task } = taskAt(chapterIdx, pageIdx, taskIdx);
        if (!task) return;
        const motif = motifOf(task);
        if (!motif) {
            app.ui.toast('Bitte erst das Motiv eintragen (was soll ausgemalt werden?).', 'ℹ️');
            return;
        }
        let data = this.worksheetImages.coloringPromptData(motif);
        if (data.needsTranslation) {
            app.ui.showLoader('Prompt wird übersetzt...', 'Einen Moment');
            try { await app.studio.imageTargets.translate(this.worksheetImages.parts(motif)); } finally { app.ui.hideLoader(); }
            data = this.worksheetImages.coloringPromptData(motif);
        }
        if (await app.studio.imageSource.copyPrompt(data.prompt)) {
            app.ui.toast(data.negative ? 'Prompt kopiert - den Negativ-Prompt gibt es als eigenen Knopf.' : 'Prompt kopiert - jetzt im Bild-Programm einfügen.', '📋');
        }
    },

    async copyColoringNegative(chapterIdx, pageIdx, taskIdx) {
        const { task } = taskAt(chapterIdx, pageIdx, taskIdx);
        if (!task) return;
        await app.studio.imageSource.copyPrompt(this.worksheetImages.coloringPromptData(motifOf(task)).negative);
    },

    // Alle Ausmal-Prompts des ganzen Hefts auf einmal (nummeriert), für eine längere Sitzung im KI-Chat
    async copyAllColoringPrompts() {
        const project = currentProject();
        if (!project?.worksheet) return;
        const entries = [];
        project.worksheet.chapters.forEach(chapter => chapter.pages.forEach(page => page.tasks.forEach(task => {
            if (task.type !== 'ausmalen') return;
            const motif = motifOf(task);
            if (motif) entries.push({ where: `${chapter.title} · ${page.goal || 'Seite'}`, motif, hasImage: !!task.data?.imgUrl });
        })));
        const open = entries.filter(e => !e.hasImage);
        if (!open.length) {
            app.ui.toast(entries.length ? 'Alle Ausmalbilder sind schon eingesetzt.' : 'Es gibt keine Ausmal-Aufgaben mit Motiv.', 'ℹ️');
            return;
        }
        const targetId = app.studio.imageTargets.currentId();
        if (app.studio.imageTargets.get(targetId).lang === 'en') {
            app.ui.showLoader('Prompts werden übersetzt...', `${open.length} Stück`);
            try {
                for (const e of open) {
                    if (app.studio.imageTargets.needsTranslation(targetId, this.worksheetImages.parts(e.motif))) {
                        await app.studio.imageTargets.translate(this.worksheetImages.parts(e.motif));
                    }
                }
            } finally { app.ui.hideLoader(); }
        }
        const neg = this.worksheetImages.coloringPromptData('x', targetId).negative;
        const text = open.map((e, n) => `### ${n + 1}. ${e.where}\n\n${this.worksheetImages.coloringPromptData(e.motif, targetId).prompt}`).join('\n\n---\n\n')
            + (neg ? `\n\n---\n\nNEGATIVE PROMPT (für alle):\n${neg}` : '');
        if (await app.studio.imageSource.copyPrompt(text)) app.ui.toast(`${open.length} Prompt${open.length === 1 ? '' : 's'} kopiert.`, '📋');
    },

    async pasteColoringImage(chapterIdx, pageIdx, taskIdx) {
        if (!navigator.clipboard?.read) {
            app.ui.toast('Einfügen per Knopf geht in diesem Browser nicht - bitte „Datei“ wählen.', 'ℹ️');
            return;
        }
        try {
            const entries = await navigator.clipboard.read();
            for (const entry of entries) {
                const type = entry.types.find(t => t.startsWith('image/'));
                if (type) {
                    const blob = await entry.getType(type);
                    await this.setColoringImage(chapterIdx, pageIdx, taskIdx, new File([blob], 'eingefuegt', { type }));
                    return;
                }
            }
            app.ui.toast('In der Zwischenablage ist kein Bild. Im KI-Chat das Bild erst kopieren („Bild kopieren“).', 'ℹ️');
        } catch (e) {
            console.error('Zwischenablage nicht lesbar:', e);
            app.ui.toast('Zugriff auf die Zwischenablage nicht erlaubt - bitte „Datei“ wählen.', 'ℹ️');
        }
    },

    pickColoringImage(chapterIdx, pageIdx, taskIdx) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => { if (input.files[0]) this.setColoringImage(chapterIdx, pageIdx, taskIdx, input.files[0]); };
        input.click();
    },

    dropColoringImage(event, chapterIdx, pageIdx, taskIdx) {
        event.preventDefault();
        const file = [...(event.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
        if (file) this.setColoringImage(chapterIdx, pageIdx, taskIdx, file);
    },

    async setColoringImage(chapterIdx, pageIdx, taskIdx, file) {
        app.ui.showLoader('Bild wird eingesetzt...', 'Einen Moment');
        try {
            if (await this.worksheetImages.applyImage(chapterIdx, pageIdx, taskIdx, file)) {
                app.ui.toast('Ausmalbild eingesetzt.', '✅');
                app.render.studioWorkbookWizard(3);
            }
        } catch (e) {
            console.error('Ausmalbild konnte nicht eingesetzt werden:', e);
            app.ui.toast(`Bild konnte nicht eingesetzt werden: ${e.message}`, '❌');
        } finally {
            app.ui.hideLoader();
        }
    },

    removeColoringImage(chapterIdx, pageIdx, taskIdx) {
        this.worksheetImages.clearImage(chapterIdx, pageIdx, taskIdx);
        app.render.studioWorkbookWizard(3);
    }
});
