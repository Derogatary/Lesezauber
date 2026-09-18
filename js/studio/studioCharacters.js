import { app } from '../core.js';

// ================= SchreibZauber: Stilkarte + Figuren-Bibel (Stufe 2, C.3) =================
// Zwei Dinge, die laut Konzept IMMER zusammen gedacht werden: die Stilkarte
// (project.style) gilt fürs ganze Werk, die Figuren-Bibel (project.characters[])
// pro Figur - beide fließen bei JEDER Bildgenerierung mit ein (siehe
// app.studio.buildStyleText()/characterRefsFor() in studioCore.js).
//
// WICHTIG: Das Figurenblatt-BILD läuft (wie jedes Bild in Stufe 2) über
// app.studio.imageSource.request(app.studio.resolveImageSourceId(), ...) -
// solange die echte Bildgenerierung nicht in den Einstellungen bestätigt
// wurde, ist das automatisch 'placeholder' (siehe docs/KONZEPT-Bildquellen.md
// "Platzhalter zuerst").

// NEU: baut aus den Steckbrief-Rohfeldern EINEN zusammenhängenden Text -
// genau das Feld, das laut Konzept D.1 "sheetText" heißt und in JEDEN
// Bild-Prompt einfließt (siehe imageSource.js buildPrompt()). Eine einzige
// Stelle, damit Formular und späterer Prompt nie auseinanderlaufen.
function composeSheetText(c) {
    const bits = [
        c.age ? `${c.age} alt` : '',
        c.kind || '',
        c.look || '',
        c.clothing ? `Kleidung: ${c.clothing}` : '',
        (c.colors || []).filter(Boolean).length ? `Farben: ${c.colors.filter(Boolean).join(', ')}` : '',
        c.quirk ? `Unverwechselbares Erkennungsmerkmal: ${c.quirk}` : ''
    ];
    return bits.filter(Boolean).join('. ');
}

function currentProject() {
    return app.studio.projects[app.state.currentStudioProjectId] || null;
}

Object.assign(app.studio, {
    // Stilkarte speichern (Konzept C.3/D.1 "style"). fields entspricht 1:1
    // project.style - EIN Formular, kein Assistent, weil eine Stilwahl
    // reine Geschmackssache ist und die KI hier nichts zu raten hat.
    saveStyle(fields) {
        const project = currentProject();
        if (!project) return;
        project.style = {
            look: fields.look,
            lineWeight: fields.lineWeight,
            palette: [fields.color1, fields.color2, fields.color3].filter(Boolean),
            extraPrompt: (fields.extraPrompt || '').trim()
        };
        project.stage = Math.max(project.stage, 4);
        project.updated = Date.now();
        app.dbOps.saveProject(project);
        app.render.studioWizard(4);
        app.ui.toast('Stilkarte gespeichert', '🎨');
    },

    // Neue, leere Figur anlegen - "die KI ist Vorschlag, nie Zwang" gilt
    // auch hier: von Hand anlegen geht immer, ohne KI-Aufruf.
    addCharacter() {
        const project = currentProject();
        if (!project) return;
        project.characters.push({
            id: app.studio.genId('char'), name: '', role: '',
            age: '', kind: '', look: '', clothing: '',
            colors: ['', '', ''], quirk: '',
            sheetText: '', sheetImgUrl: null, sheetThumbUrl: null, sheetMeta: null
        });
        project.stage = Math.max(project.stage, 4);
        app.dbOps.saveProject(project);
        app.render.studioWizard(4);
    },

    // NEU (Ausbaustufe 6 - Politur): "projektübergreifende Figuren" - eine
    // Lieblingsfigur soll in mehreren Werken auftauchen können, unabhängig
    // vom Werktyp (ein Comic darf z.B. eine Bilderbuch-Figur übernehmen).
    // Bewusst ALLE anderen Projekte, nicht nur dieselbe Reihe (dafür gibt es
    // bereits die automatische Übernahme in saveBrief(), siehe studioCore.js).
    listOtherProjectsCharacters(project) {
        const result = [];
        Object.values(app.studio.projects).forEach(p => {
            if (p.id === project.id || p._draft) return;
            p.characters.forEach(c => {
                if (c.name) result.push({ projectId: p.id, projectTitle: p.title || 'Unbenanntes Werk', character: c });
            });
        });
        return result;
    },

    // Kopiert eine per listOtherProjectsCharacters() gefundene Figur in
    // DIESES Projekt - mit einer NEUEN ID (sonst würden beide Projekte
    // dieselbe Referenz teilen und eine spätere Änderung im Ursprungswerk
    // hier unbemerkt durchschlagen). Figurenblatt-Bild/Steckbrief werden
    // mitkopiert, sind danach aber komplett unabhängig voneinander.
    importCharacterFromOtherProject(sourceProjectId, sourceCharacterId) {
        const project = currentProject();
        const sourceProject = app.studio.projects[sourceProjectId];
        const sourceCharacter = sourceProject && sourceProject.characters.find(c => c.id === sourceCharacterId);
        if (!project || !sourceCharacter) return;
        project.characters.push({ ...sourceCharacter, id: app.studio.genId('char') });
        project.stage = Math.max(project.stage, 4);
        app.dbOps.saveProject(project);
        app.render.studioWizard(4);
        app.ui.toast(`"${sourceCharacter.name}" übernommen.`, '📚');
    },

    deleteCharacter(characterId) {
        const project = currentProject();
        if (!project) return;
        const character = project.characters.find(c => c.id === characterId);
        if (!character) return;
        if (!confirm(`Figur "${character.name || 'ohne Namen'}" wirklich löschen?`)) return;
        project.characters = project.characters.filter(c => c.id !== characterId);
        // FIX: Doppelseiten, die genau diese Figur referenzieren, dürfen
        // keine tote ID zurückbehalten - sonst würde characterRefsFor()
        // beim nächsten Bild diese Referenz stillschweigend verlieren.
        project.spreads.forEach(s => { s.characterIds = (s.characterIds || []).filter(id => id !== characterId); });
        app.dbOps.saveProject(project);
        app.render.studioWizard(4);
    },

    // Ein einzelnes Steckbrief-Feld ändern - baut sheetText direkt neu
    // zusammen, damit ein späterer Bild-Prompt immer den aktuellen Stand
    // sieht, ohne dass man extra "speichern" drücken müsste.
    updateCharacterField(characterId, field, value) {
        const project = currentProject();
        const character = project && project.characters.find(c => c.id === characterId);
        if (!character) return;
        character[field] = value;
        character.sheetText = composeSheetText(character);
        app.dbOps.saveProject(project);
        // Bewusst KEIN volles studioWizard(4) hier (würde bei jedem
        // Tastendruck-onchange die Karten neu aufbauen und den Fokus
        // verlieren) - reicht, den Prompt-Text im Hintergrund aktuell zu
        // halten. Die Karte selbst zeigt sheetText erst beim nächsten
        // vollen Rendern (z.B. nach dem Figurenblatt-Knopf) an.
    },

    updateCharacterColor(characterId, colorIndex, value) {
        const project = currentProject();
        const character = project && project.characters.find(c => c.id === characterId);
        if (!character) return;
        const colors = character.colors && character.colors.length === 3 ? [...character.colors] : ['', '', ''];
        colors[colorIndex] = value;
        character.colors = colors;
        character.sheetText = composeSheetText(character);
        app.dbOps.saveProject(project);
    },

    // Figurenblatt erzeugen/neu erzeugen (Konzept C.2 Stufe 4, Format
    // "characterSheet" aus imageFormats.js). Läuft über dieselbe
    // Bildquellen-Schicht wie jedes andere Bild - resolveImageSourceId()
    // entscheidet Platzhalter vs. echte KI (siehe studioCore.js).
    async regenerateCharacterSheet(characterId) {
        const project = currentProject();
        const character = project && project.characters.find(c => c.id === characterId);
        if (!character) return;
        if (!character.name || !character.name.trim()) {
            app.ui.toast('Bitte zuerst einen Namen für die Figur eintragen.', '⚠️');
            return;
        }

        const hadPreviousSheet = !!character.sheetImgUrl;
        const sourceId = app.studio.resolveImageSourceId();

        app.ui.showLoader('Figurenblatt wird erzeugt...', sourceId === 'gemini' ? 'Das kann einige Sekunden dauern' : 'Platzhalter wird gezeichnet');
        app.state.apiBusy = true;
        try {
            const result = await app.studio.imageSource.request(sourceId, {
                formatId: 'characterSheet',
                sketch: `Ganzkörper-Referenzbild von ${character.name} in mehreren kleinen Posen/Mimiken auf einem Blatt (Character Sheet). ${character.sheetText}`,
                style: app.studio.buildStyleText(project.style),
                characters: [],
                title: character.name,
                index: project.characters.indexOf(character)
            });
            if (!result) return;

            character.sheetImgUrl = result.full;
            character.sheetThumbUrl = result.thumb;
            character.sheetMeta = result.meta;
            app.studio.trackImageCost(project, result.meta);

            // NEU (Konzept C.3, "Figur veraltet"): ein GEÄNDERTES
            // Figurenblatt lässt bereits fertig generierte Doppelseiten
            // NICHT automatisch neu zeichnen - sie werden nur markiert.
            // Beim allerersten Anlegen (hadPreviousSheet === false) gibt es
            // noch keine betroffenen Seiten, daher die Prüfung davor.
            // Placeholder-Bilder ignorieren wir bewusst: sie sind ohnehin
            // gratis/sofort neu zu erzeugen, eine "veraltet"-Markierung
            // dafür wäre nur Ballast in der Bilder-Übersicht.
            if (hadPreviousSheet) {
                let staleCount = 0;
                project.spreads.forEach(s => {
                    if ((s.characterIds || []).includes(characterId) && s.imageStatus === 'done' && s.imageMeta?.source && s.imageMeta.source !== 'placeholder') {
                        s.imageStale = true;
                        staleCount += 1;
                    }
                });
                if (staleCount > 0) {
                    app.ui.toast(`Figurenblatt aktualisiert - ${staleCount} bereits gezeichnete Doppelseite(n) als "Figur veraltet" markiert.`, 'ℹ️');
                }
            }

            app.dbOps.saveProject(project);
            app.render.studioWizard(4);
        } catch (e) {
            console.error('Figurenblatt konnte nicht erzeugt werden:', e);
            app.ui.toast(`Figurenblatt fehlgeschlagen: ${e.message}`, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    },

    // KI schlägt Figuren aus dem bereits geschriebenen Manuskript vor
    // (Konzept D.4 "suggestCharacters") - reiner Text, KEIN Bildaufruf.
    // Vorschläge werden angehängt, nicht automatisch überschrieben, damit
    // von Hand angelegte Figuren nicht verloren gehen.
    async suggestCharacters() {
        const project = currentProject();
        if (!project) return;
        if (project.spreads.every(s => !s.text || !s.text.trim())) {
            app.ui.toast('Erst eine Geschichte schreiben lassen, dann können Figuren daraus abgeleitet werden.', 'ℹ️');
            return;
        }

        app.ui.showLoader('Figuren werden vorgeschlagen...', 'Die KI liest das Manuskript');
        app.state.apiBusy = true;
        try {
            const result = await app.studio.api.suggestCharacters(project);
            const suggested = Array.isArray(result.characters) ? result.characters : [];
            suggested.forEach(s => {
                const character = {
                    id: app.studio.genId('char'), name: s.name || '', role: s.role || '',
                    age: s.age || '', kind: s.kind || '', look: s.look || '', clothing: s.clothing || '',
                    // FIX: immer genau 3 Einträge, auch wenn die KI weniger
                    // liefert - updateCharacterColor() (unten) verlässt sich
                    // beim Bearbeiten per Farbwähler auf colors.length === 3,
                    // sonst würden 1-2 von der KI gesetzte Farben beim ersten
                    // manuellen Ändern wieder verworfen.
                    colors: Array.isArray(s.colors) ? [...s.colors, '', '', ''].slice(0, 3) : ['', '', ''],
                    quirk: s.quirk || '',
                    sheetText: '', sheetImgUrl: null, sheetThumbUrl: null, sheetMeta: null
                };
                character.sheetText = composeSheetText(character);
                project.characters.push(character);
            });
            project.costLog.textCalls += 1;
            app.dbOps.saveProject(project);
            app.ui.toast(`${suggested.length} Figur(en) vorgeschlagen - Figurenblatt bitte einzeln erzeugen.`, '✨');
            app.render.studioWizard(4);
        } catch (e) {
            console.error('Figuren konnten nicht vorgeschlagen werden:', e);
            const msg = e.message === 'API_KEY_MISSING'
                ? 'Bitte zuerst einen Gemini-API-Key in den Einstellungen eintragen.'
                : e.message;
            app.ui.toast(msg, '❌');
        } finally {
            app.state.apiBusy = false;
            app.ui.hideLoader();
        }
    }
});
