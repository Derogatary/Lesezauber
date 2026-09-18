import { app } from '../core.js';
import './imageFormats.js';
import './placeholder.js';
import './imageSource.js';

// ================= SchreibZauber: Werkstatt-Fundament (Stufe 1) =================
// Dieses Modul ist laut docs/KONZEPT-SchreibZauber.md (D.2) der EINE
// statische Einstiegspunkt des Bereichs - alles andere unter js/studio/
// bzw. js/render/studio*.js baut nur noch auf app.studio auf.
//
// Ein "Projekt" ist bewusst NICHT dasselbe wie ein Buch (siehe Konzept
// D.1): ein Buch ist das fertige Ergebnis, ein Projekt ist die Werkstatt
// drumherum (Idee, Bauplan, Manuskript, später Figuren/Bilder/Layout).
// Erst app.studio.export (studioExport.js) macht daraus ein normales
// LeseZauber-Buch in app.library.

// NEU: app.studio.projects ist der Datenspeicher (gleiches Muster wie
// app.library) - wird in js/db.js beim Start befüllt. Hier nur ein
// sicherer Default, falls db.js aus irgendeinem Grund vor diesem Modul
// zugreifen würde.
app.studio.projects = app.studio.projects || {};

// NEU: Werktypen der Werkstatt. 'picturebook' (Stufe 1) und jetzt auch
// 'workbook' (Stufe 4, siehe docs/KONZEPT-SchreibZauber.md TEIL C.4/E) sind
// freigeschaltet. 'comic' steht hier weiterhin nur als Zieltyp, weil das
// Datenmodell (spreads[].balloons) ihn schon vorsieht - er kommt erst mit
// der später geplanten Ausbaustufe 5. Der eigentliche Arbeitsheft-Wizard
// (Lernziel -> Progression -> Aufgabenbaukasten) lebt komplett getrennt in
// js/studio/worksheet.js + js/render/studioWorkbookWizard.js - hier wird
// nur der Zugang freigeschaltet.
app.studio.projectTypes = [
    { id: 'picturebook', label: '📕 Bilderbuch', hint: 'Doppelseiten mit Bild und Text, vorlesbar', available: true },
    { id: 'comic', label: '💥 Comic/Heft', hint: 'kommt in einer späteren Ausbaustufe', available: false },
    { id: 'workbook', label: '📝 Arbeitsheft', hint: 'Lernziel, Aufgaben und Lösungsteil - druckfertig', available: true }
];

// NEU: Wortbudget-Richtwerte für ein 32-seitiges Buch (12 Doppelseiten Text,
// siehe Konzept A.1 #4 - "ca. 500-600 Wörter" gilt dort primär für ältere
// Kinder). Für jüngere Zielgruppen (Vorlesealter) ist deutlich weniger Text
// üblich. Wird unten proportional zur tatsächlichen Doppelseitenzahl
// skaliert, damit ein 16-Seiten-Heft nicht denselben Wortumfang bekommt
// wie ein 40-Seiten-Buch.
const WORD_BUDGET_PER_32_PAGES = { '3-5': 200, '6-7': 400, '8-10': 600 };
const REFERENCE_STORY_SPREADS = 12; // = (32 - 8) / 2

// NEU: welches Bildformat (aus imageFormats.js) zu welcher Papierform
// passt - EIN Ort für diese Zuordnung, damit Platzhalter, spätere echte
// Bilder und Druckausgabe (Stufe 3) dieselbe Wahl treffen.
function trimToFormat(trim) {
    return trim === 'a5-quer' ? 'spreadLandscape' : 'pagePortrait';
}

// NEU: feste, aber pro Doppelseite unterschiedliche Textzone (Bugreport:
// "jede Seite gleich gestaltet", weil textPos immer auf 'unten' stand).
// Bewusst eine Reihenfolge statt reinem Zufall - reproduzierbar, und
// "unten"/"oben" (volle Breite, verzeiht unterschiedlich lange Texte)
// häufiger als die schmaleren Spalten "links"/"rechts". Wird NUR beim
// ERSTEN Anlegen einer Doppelseite verwendet (addSpread()/applyManuscript()
// unten) - einmal gesetzt, bleibt textPos unverändert, bis der Nutzer es in
// Stufe 7 selbst ändert oder ein neues Bild dieselbe Zone erneut anfragt
// (siehe regenerateSpreadPlaceholder/generateSpreadImage).
const AUTO_TEXT_POS_ROTATION = ['unten', 'oben', 'links', 'unten', 'rechts', 'oben'];
function pickAutoTextPos(index) {
    return AUTO_TEXT_POS_ROTATION[index % AUTO_TEXT_POS_ROTATION.length];
}

// ===== Stufe 2 (Bilder): kleine, cross-cutting Hilfsfunktionen =====
// Werden sowohl von studioCharacters.js (Figurenblatt) als auch von
// studioImages.js (Doppelseiten-Bild) gebraucht - deshalb hier zentral
// statt zweimal geschrieben, gleiche Begründung wie bei trimToFormat.

// NEU: Klartext-Label je Stilrichtung (Konzept C.3 "Stilkarte") - fließt
// in JEDEN Bild-Prompt (Figurenblatt UND Doppelseite) ein.
const STYLE_LOOK_LABELS = {
    aquarell: 'Aquarell, weiche Wasserfarben-Optik',
    buntstift: 'Buntstiftzeichnung, sichtbare Strichführung',
    comic: 'flächiger Comic-/Cartoon-Stil, klare Konturen',
    cutout: 'Cut-Out/Papercraft-Optik, wie aus Papier ausgeschnitten'
};

// NEU: baut aus project.style EINEN Textblock für den Bild-Prompt - "als
// wörtlich identischer Textblock in jedem Prompt" (Konzept D.5 #2), daher
// eine einzige Funktion statt an jeder Aufrufstelle neu formuliert.
function buildStyleText(style) {
    if (!style) return '';
    const parts = [
        style.look ? `${STYLE_LOOK_LABELS[style.look] || style.look}.` : '',
        `Linienführung: ${style.lineWeight === 'kraeftig' ? 'kräftige, klare Linien' : 'weiche, sanfte Linien'}.`,
        (style.palette || []).filter(Boolean).length
            ? `Farbpalette (durchgängig einhalten): ${style.palette.filter(Boolean).join(', ')}.`
            : '',
        style.extraPrompt ? style.extraPrompt.trim() : ''
    ];
    return parts.filter(Boolean).join(' ');
}

// NEU: welche Figuren-Referenzen zu einer Doppelseite gehören - liest
// spread.characterIds und schlägt sie in project.characters nach. EIN Ort,
// damit Storyboard-Vorschau, Bildgenerierung und "alle Platzhalter
// ersetzen" garantiert dieselbe Auswahl sehen (Konzept D.5 #4: "nur die
// Figuren referenzieren, die auf der Seite vorkommen").
function characterRefsFor(project, spread) {
    const ids = spread?.characterIds || [];
    return ids.map(id => project.characters.find(c => c.id === id)).filter(Boolean);
}

// NEU: welche Bildquelle gerade tatsächlich benutzt werden soll. Solange
// die echte Bildgenerierung nicht in den Einstellungen ausdrücklich
// bestätigt wurde (siehe app.settingsConfig.toggleStudioImageGen,
// docs/KONZEPT-SchreibZauber.md TEIL G Punkt 1 - Zahlungsmethode am
// Google-Konto noch nicht bestätigt), bleibt es beim kostenlosen
// Platzhalter. EIN Ort für diese Weiche, damit kein Aufrufer versehentlich
// selbst "gemini" fest verdrahtet.
function resolveImageSourceId() {
    if (app.settings.studioImageGenEnabled && app.settings.apiKey) return 'gemini';
    return 'placeholder';
}

// NEU: geschätzter USD-Preis pro ECHTEM Bildaufruf (docs/KONZEPT-SchreibZauber.md
// C.2 "0,07 $ pro Bild bei 1K-Auflösung"). GESCHÄTZT, keine Anbieter-
// Abrechnung - gleiche Haltung wie der bestehende app.costMeter
// (js/costMeter.js): rein lokal, keine harte Grenze, weil die App ohne
// Server ohnehin keine durchsetzen könnte.
const GEMINI_IMAGE_PRICE_USD = 0.07;

// NEU: zentrale Stelle, die project.costLog nach einem Bildaufruf
// fortschreibt - genutzt von studioCharacters.js (Figurenblatt) UND
// studioImages.js (Doppelseiten-Bild), damit beide garantiert denselben
// Preis und dieselbe Rundung verwenden. Zählt NUR bei source 'gemini' -
// der kostenlose Platzhalter bleibt bei 0, ein Upload sowieso.
function trackImageCost(project, meta) {
    if (!meta || meta.source !== 'gemini') return;
    project.costLog.imageCalls += 1;
    project.costLog.estimatedUsd = Math.round((project.costLog.estimatedUsd + GEMINI_IMAGE_PRICE_USD) * 100) / 100;
}

// NEU: Umfangsplanung (Konzept C.2, Stufe 2 "Der Bauplan"). totalPages
// muss laut Konzept durch 16 bzw. mindestens durch 8 teilbar sein - die
// Auswahl in der Wizard-UI bietet deshalb nur 16/24/32/40 an. 8 Seiten
// gehen für Umschlag/Vorsatz/Titelei/Impressum ab, der Rest verteilt sich
// auf Doppelseiten.
function computeSpec(totalPages, audienceAge) {
    const storySpreads = Math.max(1, Math.round((totalPages - 8) / 2));
    const baseline = WORD_BUDGET_PER_32_PAGES[audienceAge] || WORD_BUDGET_PER_32_PAGES['6-7'];
    const wordBudget = Math.round(baseline * storySpreads / REFERENCE_STORY_SPREADS);
    return { storySpreads, wordBudget };
}

let idCounter = 0;
function genId(prefix) {
    idCounter += 1;
    return `${prefix}_${Date.now()}_${idCounter}`;
}

// NEU: Default-Projektstruktur nach Konzept D.1 - bewusst VOLLSTÄNDIG,
// nicht nur die in Stufe 1 genutzten Felder. Die späteren Werktyp-Pfade
// (Bilderbuch Stufe 2+3, Arbeitsheft Stufe 4) sollen auf demselben
// Datenmodell aufbauen können, ohne dass jede Stufe das Schema erneut
// erweitern/migrieren muss - siehe Abschnitt "Fundament" in
// docs/KONZEPT-SchreibZauber.md.
function createDefaultProject(type) {
    const totalPages = 32;
    const audienceAge = '3-5';
    const { storySpreads, wordBudget } = computeSpec(totalPages, audienceAge);

    return {
        id: genId('proj'),
        type,
        title: '',
        created: Date.now(),
        updated: Date.now(),
        profileId: app.utils.resolveCreationProfileId(),
        stage: 1, // wie weit diese Werkstatt-Sitzung bisher gekommen ist (1-3 in Stufe 1)

        brief: {
            audienceAge, readingLevel: 'vorlesen',
            topic: '', tone: '', message: '', language: 'de'
        },

        // NEU: Verlags-/Impressum-Angaben - alle optional, siehe
        // js/studio/studioMetaPages.js für die Platzhalter, falls leer
        // gelassen (Bugreport: "fehlende Meta-Seiten" - Cover/Autor/
        // Klappentext/Verlag). Bewusst ein eigenes Feld statt Teil von
        // "brief" - das sind Publikations-, keine Geschichte-Angaben.
        meta: { authorBio: '', publisher: '', blurb: '' },

        spec: { totalPages, storySpreads, wordBudget, trim: 'a5-quer' },

        // Reserviert für Stufe 2 (Stilkarte) - bleibt in Stufe 1 leer.
        style: { look: '', palette: [], lineWeight: 'weich', extraPrompt: '' },
        // Reserviert für Stufe 2 (Figuren-Bibel) - bleibt in Stufe 1 leer.
        characters: [],

        spreads: [],

        // Reserviert für den Arbeitsheft-Pfad (Stufe 4) - bleibt bei einem
        // Bilderbuch-Projekt dauerhaft null.
        worksheet: null,

        // NEU (nicht im ursprünglichen Konzept-Schema, aber notwendig): ID
        // des Buches in app.library, sobald einmal "Ins Regal gestellt"
        // wurde. Ermöglicht ein erneutes "Ins Regal stellen" nach
        // Textänderungen als Aktualisierung statt als Dublette.
        exportedBookId: null,

        costLog: { imageCalls: 0, textCalls: 0, estimatedUsd: 0 }
    };
}

Object.assign(app.studio, {
    genId,
    computeSpec,
    trimToFormat,
    buildStyleText,
    characterRefsFor,
    resolveImageSourceId,
    trackImageCost,
    GEMINI_IMAGE_PRICE_USD,

    // ===== Projekt-CRUD (die onclick-Ebene - bewusst FLACH auf app.studio,
    // nicht app.studio.actions.xyz: der Sanity-Check 3 aus CLAUDE.md prüft
    // nur zweistufige app.NAMESPACE.funktion(-Aufrufe aus dem HTML). =====

    newProject(typeId = 'picturebook') {
        const type = app.studio.projectTypes.find(t => t.id === typeId);
        if (!type || !type.available) {
            app.ui.toast('Diese Werkart ist noch nicht verfügbar.', 'ℹ️');
            return;
        }
        const project = createDefaultProject(typeId);
        // NEU: NOCH NICHT in die Datenbank schreiben (Bugreport: eine leere
        // Karteikarte blieb bisher auch nach "Zurück"/Abbrechen dauerhaft in
        // der Werkstatt-Übersicht liegen, weil sie sofort gespeichert wurde).
        // Erst im Speicher anlegen - der erste echte Speichervorgang ist
        // saveBrief() bzw. saveWorksheetGoal() beim ersten "Weiter". Verlässt
        // man den Wizard vorher wieder, räumt app.nav.go() diesen Entwurf
        // automatisch weg (siehe dort, "_draft").
        project._draft = true;
        app.studio.projects[project.id] = project;
        app.state.currentStudioProjectId = project.id;
        app.nav.go('studioWizard');
    },

    openProject(projectId) {
        if (!app.studio.projects[projectId]) return;
        app.state.currentStudioProjectId = projectId;
        app.nav.go('studioWizard');
    },

    backToLibrary() {
        app.nav.go('studio');
    },

    // NEU (Stufe 2): "Weiter"-Knöpfe der Stufen 4/5/6 haben - anders als
    // Idee/Bauplan - kein Pflichtfeld, das vorher validiert werden müsste
    // (Stilkarte/Figuren/Storyboard dürfen leer bleiben, "die KI ist
    // Vorschlag, nie Zwang"). Deshalb reicht ein generischer Weiterschalter
    // statt je einer eigenen saveXyz()-Funktion wie bei saveBrief/saveSpec.
    advanceStage(n) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        project.stage = Math.max(project.stage, n);
        app.dbOps.saveProject(project);
        app.render.studioWizard(n);
    },

    deleteProject(projectId) {
        const project = app.studio.projects[projectId];
        if (!project) return;
        if (!confirm(`"${project.title || 'Unbenanntes Werk'}" wirklich löschen? Ein bereits ins Regal gestelltes Buch bleibt davon unberührt.`)) return;
        app.dbOps.deleteProject(projectId);
        app.ui.toast('Werk gelöscht', '🗑️');
        app.render.studioLibrary();
    },

    // Stufe 1 – Idee: Exposé speichern. fields entspricht 1:1 project.brief,
    // plus die drei optionalen Verlags-/Impressum-Felder (project.meta).
    saveBrief(fields) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        if (!fields.topic || !fields.topic.trim()) {
            app.ui.toast('Worum es gehen soll darf nicht leer sein.', '⚠️');
            return;
        }
        project.title = (fields.title || '').trim();
        project.brief = {
            audienceAge: fields.audienceAge,
            readingLevel: fields.readingLevel,
            topic: fields.topic.trim(),
            tone: (fields.tone || '').trim(),
            message: (fields.message || '').trim(),
            language: 'de'
        };
        // NEU: alle drei optional, komplett leer lassen ist ausdrücklich
        // erlaubt (siehe studioMetaPages.js für die Platzhalter dafür).
        project.meta = {
            authorBio: (fields.authorBio || '').trim(),
            publisher: (fields.publisher || '').trim(),
            blurb: (fields.blurb || '').trim()
        };
        // Bauplan neu berechnen, falls sich die Zielgruppe geändert hat -
        // aber nur, wenn noch keine Geschichte existiert (sonst würde ein
        // späteres Ändern der Idee stillschweigend das Wortbudget unter dem
        // bereits geschriebenen Text wegziehen).
        if (project.spreads.length === 0) {
            const { storySpreads, wordBudget } = computeSpec(project.spec.totalPages, project.brief.audienceAge);
            project.spec.storySpreads = storySpreads;
            project.spec.wordBudget = wordBudget;
        }
        project.stage = Math.max(project.stage, 2);
        delete project._draft;
        app.dbOps.saveProject(project);
        app.render.studioWizard(2);
    },

    // Stufe 2 – Bauplan speichern.
    saveSpec(fields) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        const totalPages = parseInt(fields.totalPages, 10);
        const { storySpreads, wordBudget } = computeSpec(totalPages, project.brief.audienceAge);
        project.spec = { totalPages, storySpreads, wordBudget, trim: fields.trim };
        project.stage = Math.max(project.stage, 3);
        app.dbOps.saveProject(project);
        app.render.studioWizard(3);
    },

    // Stufe 2 -> 3: reine Live-Vorschau beim Ändern der Auswahl, OHNE zu
    // speichern - die Zahlen im Bauplan-Formular sollen sich sofort
    // aktualisieren, während man noch auswählt.
    previewSpec(totalPages, audienceAge) {
        return computeSpec(parseInt(totalPages, 10), audienceAge);
    },

    // Ein leeres Doppelseiten-Feld anhängen - für Fälle, in denen von Hand
    // statt per KI weitergeschrieben wird (siehe Konzept: "die KI ist
    // Vorschlag, nie Zwang").
    addSpread() {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        project.spreads.push({
            id: genId('spread'), index: project.spreads.length,
            text: '', pageTurnHook: '', sketchPrompt: '', imagePrompt: '',
            imgUrl: null, thumbUrl: null, imageMeta: null, imageStatus: 'idle',
            // NEU (Stufe 2): true, wenn ein bereits generiertes Bild dieser
            // Doppelseite nach einer Figurenblatt-Änderung nicht mehr zur
            // aktuellen Figur passt (Konzept C.3 - "Figur veraltet", NIE
            // automatisch neu gezeichnet, siehe studioCharacters.js).
            imageStale: false,
            characterIds: [], layout: { textPos: pickAutoTextPos(project.spreads.length), fontScale: 1, syllableColors: project.brief.readingLevel === 'erstleser' },
            balloons: []
        });
        app.dbOps.saveProject(project);
        app.render.studioWizard(3);
    },

    deleteSpread(spreadIndex) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project || !project.spreads[spreadIndex]) return;
        if (!confirm(`Doppelseite ${spreadIndex + 1} wirklich löschen?`)) return;
        project.spreads.splice(spreadIndex, 1);
        project.spreads.forEach((s, i) => { s.index = i; });
        app.dbOps.saveProject(project);
        // NEU (Stufe 2): diese Aktion wird jetzt sowohl von der Stufe
        // "Geschichte" (3) als auch vom Storyboard (5) aus aufgerufen - KEIN
        // fester Stufenwechsel mehr, sondern einfach die gerade sichtbare
        // Stufe neu zeichnen (studioWizard() ohne Parameter behält
        // activeStage bei, siehe render/studioWizard.js).
        app.render.studioWizard();
    },

    // Manuskripttext einer Doppelseite von Hand ändern - erneuert dabei den
    // Platzhalter, damit die im Bild eingezeichnete Bildidee (=Manuskript-
    // Auszug) zum aktuellen Text passt (siehe applyManuscript()/
    // regenerateSpreadPlaceholder() weiter unten). Der Umblätter-Moment
    // (pageTurnHook) bleibt unangetastet - er ist eine reine KI-Notiz und
    // in Stufe 1 nicht von Hand editierbar.
    async updateSpreadText(spreadIndex, text) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;
        spread.text = text;
        app.dbOps.saveProject(project);
        await app.studio.regenerateSpreadPlaceholder(spreadIndex);
    },

    // Erzeugt (bzw. erneuert) den Platzhalter einer Doppelseite über die
    // bereits vorhandene Bildquellen-Schicht (js/studio/imageSource.js).
    // WICHTIG: das ist der einzige Bildaufruf in ganz Stufe 1 - und der ist
    // lokal/kostenlos (Canvas), kein API-Call. Der dabei erzeugte Prompt
    // wird trotzdem gespeichert (imageSource tut das automatisch), damit
    // ein späteres "durch echtes Bild ersetzen" ohne neuen Prompt auskommt.
    async regenerateSpreadPlaceholder(spreadIndex) {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        const spread = project && project.spreads[spreadIndex];
        if (!spread) return;

        const result = await app.studio.imageSource.request('placeholder', {
            formatId: trimToFormat(project.spec.trim),
            // NEU (Stufe 2): sobald das Storyboard eine eigene Bildidee
            // (sketchPrompt) hat, ist DIE das eigentlich gewollte Bildmotiv -
            // vorher (Stufe 1, ohne Storyboard) war der Manuskripttext der
            // einzige verfügbare Anhaltspunkt.
            sketch: spread.sketchPrompt || spread.text,
            style: buildStyleText(project.style),
            characters: characterRefsFor(project, spread),
            title: `Doppelseite ${spreadIndex + 1}`,
            index: spreadIndex,
            // NEU: die beim Anlegen (addSpread/applyManuscript) gewürfelte
            // bzw. später vom Nutzer in Stufe 7 gesetzte Zone erneut anfragen,
            // damit ein erneuertes Bild (Textänderung) nicht plötzlich eine
            // andere Fläche freihält als das Layout gerade benutzt.
            textPos: spread.layout?.textPos
        });
        if (!result) return;

        spread.imgUrl = result.full;
        spread.thumbUrl = result.thumb;
        spread.imageMeta = result.meta;
        // NEU (Stufe 2): der bereits beim Platzhalter mitgelieferte Prompt
        // (siehe imageSource.js) wandert zusätzlich ins Konzept-Feld
        // spread.imagePrompt - genau der Prompt, den "alle Platzhalter
        // ersetzen" (studioImages.js) später wiederverwendet, ohne ihn neu
        // zu erfinden.
        spread.imagePrompt = result.meta.prompt || '';
        app.dbOps.saveProject(project);
        // FIX (Stufe 2): früher fest "app.render.studioWizard(3)" - seit
        // diese Funktion auch vom Storyboard (Stufe 5, z.B.
        // updateSketchPrompt()) und beim Zusammenfassen aufgerufen wird,
        // würde ein fester Stufenwechsel die Person unerwartet zurück zur
        // Geschichte springen lassen. Ohne Parameter bleibt die gerade
        // sichtbare Stufe erhalten (siehe render/studioWizard.js).
        app.render.studioWizard();
    },

    // Stufe 3 – Geschichte von der KI schreiben lassen. Ruft studioApi.js
    // (eigener Gemini/Mistral-Aufruf, siehe Konzept D.4) und verteilt das
    // Ergebnis über applyManuscript() auf die Doppelseiten.
    async generateStory() {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;

        if (project.spreads.length > 0 && !confirm('Es gibt bereits eine Geschichte für dieses Werk. Von der KI neu schreiben lassen und die aktuelle ersetzen?')) {
            return;
        }

        app.ui.showLoader('Schreibe die Geschichte...', 'Die KI denkt sich gerade etwas aus');
        app.state.apiBusy = true;
        try {
            const result = await app.studio.api.generateManuscript(project.brief, project.spec);
            await app.studio.applyManuscript(project, result);
            app.ui.toast('Geschichte fertig geschrieben!', '✨');
        } catch (e) {
            console.error('Manuskript konnte nicht erzeugt werden:', e);
            const msg = e.message === 'API_KEY_MISSING'
                ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.'
                : e.message;
            app.ui.toast(msg, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    // Baut aus der KI-Antwort { title, spreads: [{text, pageTurnHook}] }
    // die Doppelseiten des Projekts, inkl. eines Platzhalter-Bilds pro
    // Doppelseite (siehe regenerateSpreadPlaceholder). Eigene Funktion statt
    // Inline-Code in generateStory(), damit ein späteres "Doppelseite
    // manuell hinzufügen/ändern" dieselbe Umrechnung nutzen kann.
    async applyManuscript(project, result) {
        if (!project.title && result.title) project.title = result.title;

        const rawSpreads = Array.isArray(result.spreads) ? result.spreads : [];
        project.spreads = rawSpreads.map((s, i) => ({
            id: genId('spread'), index: i,
            text: s.text || '', pageTurnHook: s.pageTurnHook || '',
            sketchPrompt: '', imagePrompt: '',
            imgUrl: null, thumbUrl: null, imageMeta: null, imageStatus: 'idle',
            imageStale: false, // siehe addSpread() weiter oben
            characterIds: [], layout: { textPos: pickAutoTextPos(i), fontScale: 1, syllableColors: project.brief.readingLevel === 'erstleser' },
            balloons: []
        }));

        project.costLog.textCalls += 1;
        project.stage = Math.max(project.stage, 3);
        app.dbOps.saveProject(project);

        // Platzhalter für jede Doppelseite erzeugen - nacheinander, damit
        // die Canvas-Arbeit die Oberfläche nicht kurz einfrieren lässt.
        for (let i = 0; i < project.spreads.length; i++) {
            await app.studio.regenerateSpreadPlaceholder(i);
        }
        app.render.studioWizard(3);
    },

    // Stufe 8 (Konzept) – "Ins Regal stellen". Die eigentliche Umwandlung
    // steckt in studioExport.js (JS-interne Logik, kein onclick-Ziel).
    exportToLibraryBook() {
        const project = app.studio.projects[app.state.currentStudioProjectId];
        if (!project) return;
        if (project.spreads.length === 0) {
            app.ui.toast('Erst eine Geschichte schreiben, dann geht\'s ins Regal.', 'ℹ️');
            return;
        }
        const missingText = project.spreads.some(s => !s.text || !s.text.trim());
        if (missingText && !confirm('Mindestens eine Doppelseite hat noch keinen Text. Trotzdem ins Regal stellen?')) {
            return;
        }

        const book = app.studio.export.toLibraryBook(project);
        project.exportedBookId = book.id;
        app.dbOps.saveProject(project);

        app.ui.toast(`"${book.title}" steht jetzt im Regal!`, '🎉');
        app.state.currentBookId = book.id;
        app.nav.go('book');
    }
});
